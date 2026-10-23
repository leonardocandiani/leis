// Prova de leitura da L.I.D.A.: o que a sessão leu, tirado da cauda do transcript. Compartilhado pelo PreToolUse e pelo Stop.
import { lerFinal, textoDe } from './contexto.mjs';

const LIMITE_LEITURA = 1024 * 1024;
const LIMITE_SAIDA = 64 * 1024;
const LEITOR_NO_INICIO = /^(?:sudo\s+|\w+=\S*\s+)*(?:cat|head|tail|sed|grep|rg|less|awk|wc)\b/;
const SEPARADORES_DE_SHELL = /\|\|?|&&|;/;

export const escapar = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function regexSeguro(padrao, flags = 'i') {
  try {
    return new RegExp(padrao, flags);
  } catch {
    return null;
  }
}

// O marcador {fonte} do leitor vira a fonte escapada (ou o curinga dado, quando só interessa saber se houve leitura).
export const leitorRegex = (padrao, fonte) => regexSeguro(String(padrao).replaceAll('{fonte}', fonte === undefined ? '\\S+' : escapar(fonte)));

function eventosDoTranscript(caminho) {
  let linhas;
  try {
    linhas = lerFinal(caminho, LIMITE_LEITURA);
  } catch {
    return null;
  }
  return linhas.flatMap((l) => {
    try {
      const e = JSON.parse(l);
      return e && !e.isSidechain ? [e] : [];
    } catch {
      return [];
    }
  });
}

// Só conta o uso que tem tool_result do mesmo id sem is_error: leitura negada, falha ou ainda em curso não prova nada.
// A saída fica junto (cortada) porque a conversa lida pelo nome traz o identificador que o envio usa depois.
function usosDe(eventos) {
  const resultados = new Map(eventos.flatMap((e) => (e.type === 'user' && Array.isArray(e.message?.content)
    ? e.message.content.filter((b) => b?.type === 'tool_result' && b.tool_use_id).map((b) => [b.tool_use_id, b])
    : [])));
  return eventos.flatMap((e) => (e.type === 'assistant' && Array.isArray(e.message?.content)
    ? e.message.content.filter((b) => b?.type === 'tool_use' && resultados.has(b.id) && resultados.get(b.id).is_error !== true)
      .map((b) => ({ ts: Date.parse(e.timestamp), nome: b.name, entrada: b.input ?? {}, saida: textoDe(resultados.get(b.id).content).slice(0, LIMITE_SAIDA) }))
    : []));
}

const ehPromptDoDono = (e) => e.type === 'user' && !e.isMeta && textoDe(e.message?.content).trim() !== '';

// Linha sem timestamp legível conta como recente: na dúvida, não acusar.
export function usosRecentes(caminho, agora = Date.now(), janelaMs = 30 * 60 * 1000) {
  const eventos = eventosDoTranscript(caminho);
  return eventos && usosDe(eventos).filter((u) => Number.isNaN(u.ts) || u.ts >= agora - janelaMs);
}

export function turnoAtual(caminho) {
  const eventos = eventosDoTranscript(caminho);
  if (!eventos) return null;
  const inicio = eventos.findLastIndex(ehPromptDoDono);
  const prompt = eventos[inicio];
  return { id: prompt?.uuid ?? prompt?.timestamp ?? 'inicio', usos: usosDe(eventos.slice(inicio + 1)) };
}

// A última mensagem que a sessão recebeu, inclusive a de outra sessão (que chega como isMeta): é ali que mora a ordem.
export function ultimaMensagem(caminho) {
  const eventos = eventosDoTranscript(caminho) ?? [];
  const e = eventos.findLast((x) => x.type === 'user' && textoDe(x.message?.content).trim() !== '');
  return e ? textoDe(e.message.content) : '';
}

export const comandosBash = (usos) => usos.filter((u) => u.nome === 'Bash').map((u) => String(u.entrada.command ?? ''));

// Quem escreveu o arquivo inteiro na sessão conhece o conteúdo: o Write vale como leitura do mesmo caminho. Edit não, porque
// mexe só num trecho e o resto do arquivo segue não lido.

function leuArquivo(uso, fonte) {
  const alvo = uso.entrada.file_path ?? uso.entrada.notebook_path ?? uso.entrada.path;
  if (typeof alvo !== 'string') return false;
  if (uso.nome === 'Write') return alvo === fonte;
  if (!['Read', 'Grep'].includes(uso.nome)) return false;
  return alvo === fonte || fonte.startsWith(alvo.endsWith('/') ? alvo : `${alvo}/`);
}

// No Bash, só o heredoc que escreve o arquivo inteiro deixa o conteúdo no transcript: `cat > arquivo <<FIM` ou `cat <<FIM > arquivo`.
// Redirecionar a saída de outro programa (curl > x) ou acrescentar (>>, tee -a) não mostra o que o arquivo tem.
const escreveuNoBash = (comando, fonte) => {
  const alvo = `["']?${escapar(fonte)}["']?`;
  return new RegExp(`\\bcat\\s*>\\s*${alvo}\\s*<<|\\bcat\\s*<<-?\\s*["']?\\w+["']?\\s*>\\s*${alvo}(?=$|[\\s;|&)])`, 'm').test(comando);
};

// A saída do leitor só prova o destino pela linha de identidade que o próprio leitor escreve (padrões de `identidades`,
// com {fonte} exato e casados linha a linha): texto de mensagem que cita o identificador não conta.
const provaIdentidade = (saida, fonte, identidades) => identidades.some((p) => regexSeguro(String(p).replaceAll('{fonte}', escapar(fonte)), 'm')?.test(saida));

export function leuFonte(usos, { fonte, tipo }, leitores = [], identidades = []) {
  return usos.some((u) => {
    if (tipo === 'arquivo' && leuArquivo(u, fonte)) return true;
    if (u.nome !== 'Bash') return false;
    const comando = String(u.entrada.command ?? '');
    if (tipo === 'arquivo' && escreveuNoBash(comando, fonte)) return true;
    if (tipo === 'arquivo' && comando.split(SEPARADORES_DE_SHELL).some((seg) => LEITOR_NO_INICIO.test(seg.trim()) && seg.includes(fonte))) return true;
    if (leitores.some((p) => leitorRegex(p, fonte)?.test(comando))) return true;
    // Destino lido por outro nome (a conversa pelo nome, o envio pelo JID): vale se a saída do leitor se identifica com ele.
    return tipo === 'destino' && provaIdentidade(String(u.saida ?? ''), fonte, identidades) && leitores.some((p) => leitorRegex(p)?.test(comando));
  });
}
