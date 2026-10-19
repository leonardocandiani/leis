#!/usr/bin/env node
// Stop: confere a última resposta da sessão contra T.O.P. e S.I.M. Regra barata primeiro, JEV só quando ela dispara.
// Quebra confirmada sempre devolve block: a sessão volta ao trabalho e se corrige no mesmo turno. Os modos
// observar e bloquear valem para as ações de risco (fiscal-acao), onde negar tem custo; aqui o custo é um turno.
import { nomeDoProjeto, principal, projetoTem } from './entrada.mjs';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { carregarConfig, leiPorPapel, nomeCompleto } from './leis.mjs';
import { lerRegistro, registrar } from './registro.mjs';

const PAPEL_DA_ESCOLHA = { top: 'pronto', sim: 'sim' };
const CONFIANCA_MINIMA = 0.6;
const JANELA_REINCIDENCIA_MS = 7 * 24 * 3600 * 1000;
const TETO_BLOQUEIOS = 3;
const OFERTA = /\bse (quiser|preferir)\b[^.\n]*\b(eu|já|posso|faço|subo|sigo)\b|\baguardo (o |seu |sua |a )?(ok|aval|confirma|retorno|resposta|decis|sinal)|\bfico no aguardo\b|(?:^|\s)é só (me )?(falar|avisar|dizer|confirmar)\b|\bme (avisa|avise|fala|diga|diz|confirma)\b[^.\n]*\b(se|qual|quando|o que|pra eu|para eu)\b/i;
const CARDAPIO = /\bquer que eu\b|\bposso (seguir|continuar|prosseguir|avançar)\b|\bdeseja que eu\b|\bop[cç][aã]o\s*[a-d1-4]\b|\bprefere\s+(a|b|c|1|2)\b|\bqual (você )?prefere\b|\bme diga qual\b/i;

export function regraBarata(texto) {
  const corpo = String(texto ?? '').trim();
  if (!corpo) return null;
  const ultima = corpo.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
  if (CARDAPIO.test(corpo.slice(-1200))) return 'cardapio';
  if (/\?[\s*_)"'`]*$/.test(ultima)) return 'pergunta_final';
  if (OFERTA.test(corpo.slice(-600))) return 'oferta';
  return null;
}

function passar(evento) {
  registrar(evento);
  return null;
}

const leisDoFiscal = (config) => ({ top: leiPorPapel(config, PAPEL_DA_ESCOLHA.top), sim: leiPorPapel(config, PAPEL_DA_ESCOLHA.sim) });

async function julgar(config, entrada, texto, sinal, deps) {
  const { perguntar, escolha } = await import('./jev.mjs');
  const { montarEstado } = await import('./contexto.mjs');
  const { top, sim } = leisDoFiscal(config);
  const criterios = { nenhuma: 'a resposta entrega o resultado ou faz uma pergunta que só o dono pode responder' };
  if (top) criterios.top = `${top.sigla}: ${top.regra} Quebra quando a resposta termina pedindo decisão ou escolha que a sessão resolvia sozinha, ou entrega cardápio em vez de executar.`;
  if (sim) criterios.sim = `${sim.sigla}: ${sim.regra} Quebra quando a resposta repete uma pergunta que o dono já respondeu antes na conversa.`;
  const perguntas = { quebra: { type: 'choice', instructions: 'Confira a última resposta da sessão (campo resposta_final) contra as leis. Escolha "nenhuma" na dúvida.', criteria: criterios } };
  const estado = montarEstado({ entrada, leis: [top, sim].filter(Boolean), extra: { resposta_final: texto.slice(-1500), sinal_da_regra_barata: sinal } });
  const inicio = Date.now();
  const respostas = await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] });
  return { veredito: escolha(respostas, 'quebra', criterios), duracao: Date.now() - inicio };
}

// stop_hook_active diz se o turno já foi devolvido por um Stop; o estado conta quantas vezes. Turno novo zera.
function decidir({ estado, entrada }) {
  const contado = estado.bloqueios_seguidos ?? 0;
  const usado = entrada.stop_hook_active === true ? Math.max(1, contado) : entrada.stop_hook_active === false ? 0 : contado;
  if (usado >= TETO_BLOQUEIOS) return { decisao: 'teto', bloqueios: usado };
  return { decisao: 'bloqueada', bloqueios: usado + 1 };
}

export function reincidencias(projeto, sigla, agora = Date.now()) {
  return lerRegistro(agora - JANELA_REINCIDENCIA_MS)
    .filter((e) => e.hook === 'fiscal-resposta' && e.projeto === projeto && e.lei === sigla && ['bloqueada', 'teto', 'observada'].includes(e.decisao))
    .length;
}

export function instrucaoDeCorrecao(config, lei, vezes, seguidas = 1) {
  const troca = leiPorPapel(config, 'troca');
  const linhas = [
    `Você quebrou a ${nomeCompleto(lei)} na última resposta: ${lei.regra}`,
    `Teste: ${lei.teste}`,
    `Corrija agora, neste turno: ${lei.correcao} Não repita a pergunta nem peça licença; escolha o padrão, execute e entregue o resultado com a prova.`,
  ];
  if (seguidas > 1) linhas.push(`É a ${seguidas}ª volta seguida neste turno e você ainda terminou pedindo. Não termine com pergunta, oferta nem pedido de aval: decida pelo padrão mais seguro e reversível, faça, e só pare com o resultado. Sobe ao dono apenas o que é dele (voz a terceiros, pagamento, credencial, dado de cliente), como uma única pergunta de sim ou não com o trabalho já pronto.`);
  if (vezes > 0) {
    const lei3 = troca ? ` (${nomeCompleto(troca)}: substitua a regra velha, não acumule)` : '';
    linhas.push(`É a ${vezes + 1}ª quebra desta lei neste projeto em 7 dias. Antes de encerrar, grave o aprendizado na memória ou nas regras do projeto${lei3}, dizendo o que você fará diferente da próxima vez.`);
  }
  return linhas.join(' ');
}

export async function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'parada.ts')) return null;
  const sessao = entrada.session_id ?? 'sem-sessao';
  const texto = entrada.last_assistant_message
    ?? (entrada.transcript_path ? (await import('./contexto.mjs')).ultimaRespostaDaSessao(entrada.transcript_path) : '');
  const sinal = regraBarata(texto);
  if (!sinal) return null;

  const { config } = deps.config ?? carregarConfig();
  const { top, sim } = leisDoFiscal(config);
  if (!top && !sim) return null;
  const base = { sessao, projeto: nomeDoProjeto(entrada), hook: 'fiscal-resposta', natureza: 'acao', trecho: texto.slice(-300) };
  const { veredito, duracao } = await julgar(config, entrada, texto, sinal, deps);
  if (!veredito) return passar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });

  const lei = { top, sim }[veredito.escolha];
  const quebrou = lei && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA;
  if (!quebrou) {
    atualizarEstado(sessao, { bloqueios_seguidos: 0 });
    return passar({ ...base, decisao: 'passou', prob: veredito.confianca, duracao_ms: duracao });
  }
  const vezes = reincidencias(base.projeto, lei.sigla);
  let { decisao, bloqueios } = decidir({ estado: lerEstado(sessao), entrada });
  const gravou = atualizarEstado(sessao, { bloqueios_seguidos: bloqueios, pendente: decisao === 'bloqueada' ? null : lei.numero });
  // Sem contagem gravada, stop_hook_active nunca passaria de 1 e o bloqueio viraria laço.
  if (!gravou && entrada.stop_hook_active === true) decisao = 'teto';
  registrar({ ...base, lei: lei.sigla, decisao, prob: veredito.confianca, duracao_ms: duracao });
  const aviso = instrucaoDeCorrecao(config, lei, vezes, bloqueios);
  return decisao === 'bloqueada' ? { decision: 'block', reason: aviso } : { systemMessage: `[leis] ${aviso}` };
}

await principal(import.meta.url, executar);
