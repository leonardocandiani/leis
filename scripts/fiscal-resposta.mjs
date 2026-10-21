#!/usr/bin/env node
// Stop: confere a última resposta da sessão contra T.O.P. e S.I.M. Regra barata primeiro, JEV só quando ela dispara.
// Quebra confirmada sempre devolve block: a sessão volta ao trabalho e se corrige no mesmo turno. Os modos
// observar e bloquear valem para as ações de risco (fiscal-acao), onde negar tem custo; aqui o custo é um turno.
// A omissão da L.I.D.A. (leu conversa de terceiro, trouxe fato novo e não registrou contexto) só registra por enquanto.
import { nomeDoProjeto, principal, projetoTem } from './entrada.mjs';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { carregarConfig, leiPorPapel, nomeCompleto } from './leis.mjs';
import { comandosBash, leitorRegex, regexSeguro, turnoAtual } from './leitura.mjs';
import { categoriasDe, padraoDaCategoria } from './aceite.mjs';
import { escalar } from './escalada.mjs';
import { lerRegistro, registrar } from './registro.mjs';

const PAPEL_DA_ESCOLHA = { top: 'pronto', sim: 'sim' };
const CONFIANCA_MINIMA = 0.6;
const JANELA_REINCIDENCIA_MS = 7 * 24 * 3600 * 1000;
const TETO_BLOQUEIOS = 3;
// Falso positivo da omissão de leitura ainda não foi medido: troque por 'bloqueada' (e devolva block) depois de medir.
const DECISAO_OMISSAO_DE_LEITURA = 'observada';
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
  const categorias = categoriasDe(config);
  const perguntas = {
    quebra: { type: 'choice', instructions: 'Confira a última resposta da sessão (campo resposta_final) contra as leis. Escolha "nenhuma" na dúvida.', criteria: criterios },
    categoria: { type: 'choice', instructions: 'De que categoria é o que a sessão pergunta ou pede ao dono no fim da resposta?', criteria: categorias },
  };
  const estado = montarEstado({ entrada, leis: [top, sim].filter(Boolean), extra: { resposta_final: texto.slice(-1500), sinal_da_regra_barata: sinal } });
  const inicio = Date.now();
  const respostas = await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] });
  const categoria = escolha(respostas, 'categoria', categorias);
  return { veredito: escolha(respostas, 'quebra', criterios), categoria: (categoria?.confianca ?? 1) >= CONFIANCA_MINIMA ? categoria?.escolha : undefined, duracao: Date.now() - inicio };
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
    linhas.push(`É a ${vezes + 1}ª quebra desta lei neste projeto em 7 dias. Antes de encerrar, grave o aprendizado na memória ou nas regras do projeto${lei3}, dizendo o que você fará diferente da próxima vez. Se a mesma quebra se repete em outros projetos, o comando /leis-contribuir mostra se ela é erro do plugin.`);
  }
  return linhas.join(' ');
}

// O histórico de aceite do dono decide antes do JEV: categoria que ele recusa mantém a pergunta, categoria que ele
// sempre aceita faz da pergunta uma quebra da S.I.M. Reservada (voz a terceiro, pagamento, credencial, dado de cliente)
// nunca vira quebra por aceite. Sem histórico suficiente, vale o veredito do JEV.
function leiPeloAceite(config, veredito, categoria, leis) {
  const aceite = padraoDaCategoria(config, categoria);
  // Recusar a categoria libera a pergunta (T.O.P.), nunca a pergunta repetida que ele já respondeu (S.I.M.).
  if (aceite.padrao === 'mantem_perguntando' && veredito.escolha !== 'sim') return { lei: null, aceite };
  if (aceite.padrao === 'sempre_aceita' && leis.sim) return { lei: leis.sim, aceite };
  const lei = leis[veredito.escolha];
  return { lei: lei && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA ? lei : null, aceite };
}

const notaDoAceite = (categoria, aceite) => (aceite.padrao === 'sempre_aceita'
  ? `O dono aceitou ${aceite.aceitas} dos últimos ${aceite.total} pedidos desta categoria (${categoria}): faça e avise depois, sem perguntar.`
  : null);

async function conferirEscolha(entrada, texto, deps) {
  const sessao = entrada.session_id ?? 'sem-sessao';
  const sinal = regraBarata(texto);
  if (!sinal) return null;

  const { config } = deps.config ?? carregarConfig();
  const { top, sim } = leisDoFiscal(config);
  if (!top && !sim) return null;
  const base = { sessao, projeto: nomeDoProjeto(entrada), hook: 'fiscal-resposta', natureza: 'acao', trecho: texto.slice(-300) };
  const { veredito, categoria, duracao } = await julgar(config, entrada, texto, sinal, deps);
  if (!veredito) return passar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });

  const { lei, aceite } = leiPeloAceite(config, veredito, categoria, { top, sim });
  // A pergunta que chega ao dono fica aberta com a categoria: a fala seguinte dele ensina o padrão (aceite.mjs).
  const aberta = categoria ? { categoria, trecho: texto.slice(-600) } : null;
  if (!lei) {
    atualizarEstado(sessao, { bloqueios_seguidos: 0, pergunta_aberta: aberta });
    return passar({ ...base, decisao: 'passou', sinal: `${sinal}+${aceite.padrao}`, prob: veredito.confianca, duracao_ms: duracao });
  }
  const vezes = reincidencias(base.projeto, lei.sigla);
  let { decisao, bloqueios } = decidir({ estado: lerEstado(sessao), entrada });
  const bloqueada = decisao === 'bloqueada';
  const gravou = atualizarEstado(sessao, { bloqueios_seguidos: bloqueios, pendente: bloqueada ? null : lei.numero, pergunta_aberta: bloqueada ? null : aberta });
  // Sem contagem gravada, stop_hook_active nunca passaria de 1 e o bloqueio viraria laço.
  if (!gravou && entrada.stop_hook_active === true) decisao = 'teto';
  const sinalDaQuebra = aceite.padrao === 'sempre_aceita' ? 'aceite_sempre' : sinal;
  registrar({ ...base, lei: lei.sigla, decisao, sinal: sinalDaQuebra, prob: veredito.confianca, duracao_ms: duracao });
  const aviso = [instrucaoDeCorrecao(config, lei, vezes, bloqueios), notaDoAceite(categoria, aceite)].filter(Boolean).join(' ');
  const saida = decisao === 'bloqueada' ? { decision: 'block', reason: aviso } : { systemMessage: `[leis] ${aviso}` };
  return escalar(saida, { entrada, config, lei, projeto: base.projeto }, deps);
}

async function julgarOmissaoDeLeitura(config, lei, entrada, texto, deps) {
  const { perguntar, escolha } = await import('./jev.mjs');
  const { montarEstado } = await import('./contexto.mjs');
  const criterios = {
    nenhuma: 'a resposta não traz fato novo de terceiro, ou o fato já foi registrado no contexto',
    leitura: `${lei.sigla}: ${lei.regra} Quebra quando a resposta traz fato novo de terceiro (combinado, prazo, valor, decisão, material enviado) que devia ir ao contexto e não foi registrado.`,
  };
  const perguntas = { quebra: { type: 'choice', instructions: 'A sessão leu uma conversa de terceiro neste turno e não registrou contexto. Confira a resposta final (campo resposta_final). Escolha "nenhuma" na dúvida.', criteria: criterios } };
  const estado = montarEstado({ entrada, leis: [lei], extra: { resposta_final: texto.slice(-1500) } });
  const inicio = Date.now();
  const respostas = await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] });
  return { veredito: escolha(respostas, 'quebra', criterios), duracao: Date.now() - inicio };
}

// Nunca altera a saída do Stop e nunca lança: é observação, e o turno só é julgado uma vez.
async function observarOmissaoDeLeitura(entrada, texto, deps) {
  try {
    if (!entrada.transcript_path || !texto) return;
    const { config } = deps.config ?? carregarConfig();
    const lei = leiPorPapel(config, 'leitura');
    const { leitores = [], registro_de_fato: registroDeFato } = config.leitura ?? {};
    if (!lei || !leitores.length || !registroDeFato) return;
    const turno = (deps.turnoAtual ?? turnoAtual)(entrada.transcript_path);
    const sessao = entrada.session_id ?? 'sem-sessao';
    if (!turno || lerEstado(sessao).leitura_turno === turno.id) return;
    const comandos = comandosBash(turno.usos);
    const registrou = regexSeguro(registroDeFato);
    if (!comandos.some((c) => leitores.some((p) => leitorRegex(p)?.test(c))) || comandos.some((c) => registrou?.test(c))) return;
    atualizarEstado(sessao, { leitura_turno: turno.id });
    const base = { sessao, projeto: nomeDoProjeto(entrada), hook: 'fiscal-resposta', lei: lei.sigla, natureza: 'omissao', trecho: texto.slice(-300) };
    const { veredito, duracao } = await julgarOmissaoDeLeitura(config, lei, entrada, texto, deps);
    if (!veredito) return registrar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });
    const quebrou = veredito.escolha === 'leitura' && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA;
    registrar({ ...base, decisao: quebrou ? DECISAO_OMISSAO_DE_LEITURA : 'passou', prob: veredito.confianca, duracao_ms: duracao });
  } catch {
    // observação nunca derruba o Stop
  }
}

export async function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'parada.ts')) return null;
  const texto = entrada.last_assistant_message
    ?? (entrada.transcript_path ? (await import('./contexto.mjs')).ultimaRespostaDaSessao(entrada.transcript_path) : '');
  const saida = await conferirEscolha(entrada, texto, deps);
  await observarOmissaoDeLeitura(entrada, texto, deps);
  return saida;
}

await principal(import.meta.url, executar);
