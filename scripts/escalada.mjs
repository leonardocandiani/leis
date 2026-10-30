// Dupla quebra: duas leis diferentes quebradas no mesmo turno são "o crime do crime". Nasce em observar (só registra);
// em `escalada.modo: "pausar"` o hook encerra o turno (continue: false) e roda o comando de aviso da config.
// Nunca desliga a sessão: a próxima mensagem do dono retoma o trabalho.
import { execFile } from 'node:child_process';
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { casaDoUsuario } from './leis.mjs';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { turnoAtual } from './leitura.mjs';
import { trecho } from './mascarar.mjs';
import { registrar } from './registro.mjs';

const TETO_AVISO_MS = 3000;

const modoDaEscalada = (config) => (config.escalada?.modo === 'pausar' ? 'pausar' : 'observar');

export function avisar(config, mensagem) {
  const [programa, ...args] = (config.escalada?.aviso ?? []).map((a) => String(a).replaceAll('{mensagem}', mensagem));
  if (!programa) return;
  try {
    execFile(programa, args, { timeout: TETO_AVISO_MS, killSignal: 'SIGKILL' }, () => {});
  } catch {
    // o aviso nunca derruba o hook
  }
}

const JANELA_AVISO_MS = 60 * 60 * 1000;
const PODA_AVISO_MS = 24 * JANELA_AVISO_MS;

const arquivoDeAvisos = () => join(casaDoUsuario(), 'avisos.json');

function lerAvisos() {
  try {
    const avisos = JSON.parse(readFileSync(arquivoDeAvisos(), 'utf8'));
    return avisos && typeof avisos === 'object' && !Array.isArray(avisos) ? avisos : {};
  } catch {
    return {};
  }
}

function gravarAvisos(avisos) {
  try {
    mkdirSync(casaDoUsuario(), { recursive: true });
    const temporario = `${arquivoDeAvisos()}.${process.pid}.tmp`;
    writeFileSync(temporario, JSON.stringify(avisos));
    renameSync(temporario, arquivoDeAvisos());
  } catch {
    // sem estado gravável o próximo aviso sai de novo: defeito nosso libera
  }
}

// Só para aviso informativo (nada pausado). Pausa nunca passa por aqui: cada uma precisa chegar à CENTRAL.
// Aviso igual da mesma sessão (chave = sessão + regra) sai no máximo 1 vez por hora; as repetições só são contadas
// e a contagem vai junto do primeiro aviso depois da hora. Estado ilegível deixa o aviso sair.
export function avisarAgrupado(config, { sessao, regra }, mensagem, deps = {}) {
  const enviar = deps.avisar ?? avisar;
  let texto = mensagem;
  try {
    const agora = (deps.agora ?? Date.now)();
    const chave = `${sessao}|${regra}`;
    const avisos = Object.fromEntries(Object.entries(lerAvisos()).filter(([, v]) => agora - v?.em < PODA_AVISO_MS));
    const anterior = avisos[chave];
    if (anterior && agora - anterior.em < JANELA_AVISO_MS) {
      avisos[chave] = { ...anterior, repeticoes: (anterior.repeticoes ?? 0) + 1 };
      gravarAvisos(avisos);
      return;
    }
    const repeticoes = anterior?.repeticoes ?? 0;
    if (repeticoes > 0) texto = `${mensagem} (mais ${repeticoes} ${repeticoes === 1 ? 'vez' : 'vezes'} na última hora)`;
    avisos[chave] = { em: agora, repeticoes: 0 };
    gravarAvisos(avisos);
  } catch {
    // estado ilegível: o aviso sai sem agrupar
  }
  enviar(config, texto);
}

const TETO_TRECHO = 80;
const BYTES_DO_FIM = 1024 * 1024;

// O nome da sessão só existe no transcript, numa linha custom-title. Lê só o último 1 MB: o arquivo passa de 80 mil linhas.
export function nomeDaSessao(entrada) {
  const idCurto = String(entrada.session_id).slice(0, 8);
  let fd;
  try {
    fd = openSync(entrada.transcript_path, 'r');
    const tamanho = fstatSync(fd).size;
    const inicio = Math.max(0, tamanho - BYTES_DO_FIM);
    const buffer = Buffer.alloc(tamanho - inicio);
    readSync(fd, buffer, 0, buffer.length, inicio);
    const linhas = buffer.toString('utf8').split('\n');
    for (let i = linhas.length - 1; i >= 0; i--) {
      if (!linhas[i].includes('"custom-title"')) continue;
      const evento = JSON.parse(linhas[i]);
      if (evento.type === 'custom-title' && evento.sessionId === entrada.session_id && evento.customTitle) return trecho(evento.customTitle, 60);
    }
  } catch {
    // sem nome legível, vale o id curto
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return idCurto;
}

// Estado gravado pela versão anterior guardava só as siglas em `leis`.
const quebrasGravadas = (anterior) => anterior.quebras ?? (anterior.leis ?? []).map((sigla) => ({ sigla, sinal: 'sem_sinal', trecho: '' }));

// Acrescenta a quebra às do turno e devolve a lista só quando a lei é nova (a mesma lei de novo não conta).
// Sem sessão ou sem transcript não há como saber o turno: juntar tudo daria dupla quebra falsa entre turnos.
function quebrasDoTurno(entrada, quebra, deps) {
  const sessao = entrada.session_id;
  const turno = sessao && entrada.transcript_path ? (deps.turnoAtual ?? turnoAtual)(entrada.transcript_path)?.id : null;
  if (!turno) return null;
  const anterior = lerEstado(sessao).quebras_turno;
  const quebras = anterior?.turno === turno ? quebrasGravadas(anterior) : [];
  if (quebras.some((q) => q.sigla === quebra.sigla)) return null;
  const nova = { ...quebra, trecho: trecho(quebra.trecho, TETO_TRECHO) };
  atualizarEstado(sessao, { quebras_turno: { turno, quebras: [...quebras, nova] } });
  return [...quebras, nova];
}

const descrever = (q) => `${q.sigla} (${q.sinal}: ${q.trecho})`;

function mensagemDaEscalada(entrada, projeto, quebras, pausar) {
  const desfecho = pausar ? 'a sessão foi pausada' : 'em modo pausar, a sessão seria pausada';
  return `Dupla quebra no mesmo turno na sessão "${nomeDaSessao(entrada)}" (projeto ${projeto ?? 'sem projeto'}): ${quebras.map(descrever).join(' e ')}; ${desfecho}.`;
}

// Chamado depois de o hook registrar uma quebra. Devolve a saída do hook, com continue: false quando a escalada pausa.
export function escalar(saida, { entrada, config, lei, projeto, sinal = 'sem_sinal', trecho: texto = '' }, deps = {}) {
  try {
    const quebras = quebrasDoTurno(entrada, { sigla: lei.sigla, sinal, trecho: texto }, deps);
    if (quebras?.length !== 2) return saida;
    const pausar = modoDaEscalada(config) === 'pausar';
    const mensagem = mensagemDaEscalada(entrada, projeto, quebras, pausar);
    registrar({ sessao: entrada.session_id, projeto, hook: 'escalada', lei: quebras.map((q) => q.sigla).join('+'), natureza: 'acao', decisao: pausar ? 'pausada' : 'observada', trecho: mensagem });
    if (!pausar) return saida;
    (deps.avisar ?? avisar)(config, mensagem);
    return { ...saida, continue: false, stopReason: `[leis] ${mensagem} Corrija as duas antes de seguir; a próxima mensagem do dono retoma.` };
  } catch {
    return saida;
  }
}
