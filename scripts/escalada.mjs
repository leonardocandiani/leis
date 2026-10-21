// Dupla quebra: duas leis diferentes quebradas no mesmo turno são "o crime do crime". Nasce em observar (só registra);
// em `escalada.modo: "pausar"` o hook encerra o turno (continue: false) e roda o comando de aviso da config.
// Nunca desliga a sessão: a próxima mensagem do dono retoma o trabalho.
import { execFile } from 'node:child_process';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { turnoAtual } from './leitura.mjs';
import { registrar } from './registro.mjs';

const TETO_AVISO_MS = 3000;

const modoDaEscalada = (config) => (config.escalada?.modo === 'pausar' ? 'pausar' : 'observar');

function avisar(config, mensagem) {
  const [programa, ...args] = (config.escalada?.aviso ?? []).map((a) => String(a).replaceAll('{mensagem}', mensagem));
  if (!programa) return;
  try {
    execFile(programa, args, { timeout: TETO_AVISO_MS, killSignal: 'SIGKILL' }, () => {});
  } catch {
    // o aviso nunca derruba o hook
  }
}

// Acrescenta a lei às quebras do turno e devolve a lista só quando ela mudou (a mesma lei de novo não conta).
// Sem sessão ou sem transcript não há como saber o turno: juntar tudo daria dupla quebra falsa entre turnos.
function leisDoTurno(entrada, sigla, deps) {
  const sessao = entrada.session_id;
  const turno = sessao && entrada.transcript_path ? (deps.turnoAtual ?? turnoAtual)(entrada.transcript_path)?.id : null;
  if (!turno) return null;
  const anterior = lerEstado(sessao).quebras_turno;
  const leis = anterior?.turno === turno ? anterior.leis : [];
  if (leis.includes(sigla)) return null;
  atualizarEstado(sessao, { quebras_turno: { turno, leis: [...leis, sigla] } });
  return [...leis, sigla];
}

// Chamado depois de o hook registrar uma quebra. Devolve a saída do hook, com continue: false quando a escalada pausa.
export function escalar(saida, { entrada, config, lei, projeto }, deps = {}) {
  try {
    const leis = leisDoTurno(entrada, lei.sigla, deps);
    if (leis?.length !== 2) return saida;
    const pausar = modoDaEscalada(config) === 'pausar';
    const mensagem = `Dupla quebra no mesmo turno (${leis.join(' e ')}) no projeto ${projeto ?? 'sem projeto'}: ${pausar ? 'a sessão foi pausada' : 'em modo pausar, a sessão seria pausada'}.`;
    registrar({ sessao: entrada.session_id, projeto, hook: 'escalada', lei: leis.join('+'), natureza: 'acao', decisao: pausar ? 'pausada' : 'observada', trecho: mensagem });
    if (!pausar) return saida;
    (deps.avisar ?? avisar)(config, mensagem);
    return { ...saida, continue: false, stopReason: `[leis] ${mensagem} Corrija as duas antes de seguir; a próxima mensagem do dono retoma.` };
  } catch {
    return saida;
  }
}
