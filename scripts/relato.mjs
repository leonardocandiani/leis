#!/usr/bin/env node
// UserPromptSubmit: quando o dono corrige citando lei, descobre qual foi quebrada, registra e injeta a correção.
import { saidaContexto, nomeDoProjeto, principal } from './entrada.mjs';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { carregarConfig, leiPorNumero, leisCitadas, nomeCompleto, normalizar } from './leis.mjs';
import { registrar } from './registro.mjs';

const LIMITE_PROMPT = 4000;
const CONFIANCA_MINIMA = 0.5;
// Texto já normalizado (sem acento, minúsculo). Forte: só pode ser correção. Fraco: pode ser conversa comum.
const FORTE = /infring|violou (a )?lei|quebrou (a |as )?lei|ja (te )?(falei|disse)/;
const SINAIS = new RegExp(`${FORTE.source}|(?<![a-z0-9])l[1-9](?![a-z0-9])|\\blei \\d|\\blei de\\b|de novo`);
const VERBO_DE_CORRECAO = /infring|viol(ou|aste)|quebr(ou|aste)|de novo|ja (te )?(falei|disse)/;

const mensagem = (lei) => `Você quebrou a ${nomeCompleto(lei)}: ${lei.regra} Corrija o padrão, não só esta resposta.`;
const mensagemGenerica = 'O dono apontou que você quebrou uma lei de trabalho. Releia as leis do início da sessão, ache qual foi e corrija o padrão, não só esta resposta.';

async function perguntarAoJev(config, entrada, prompt, deps) {
  const { perguntar, escolha } = await import('./jev.mjs');
  const { montarEstado } = await import('./contexto.mjs');
  const criterios = { nenhuma: 'o dono não aponta quebra de lei, ou não dá para saber qual', ...Object.fromEntries(config.leis.map((l) => [`lei_${l.numero}`, `${l.sigla}: ${l.regra}`])) };
  const perguntas = { lei: { type: 'choice', instructions: 'O dono acabou de corrigir a sessão. Qual destas leis ele diz que foi quebrada? Citar uma lei sem dizer que a sessão a quebrou (explicar, aplicar, perguntar sobre ela) é "nenhuma". Escolha "nenhuma" também se não dá para saber.', criteria: criterios } };
  const estado = montarEstado({ entrada, leis: config.leis, extra: { fala_do_dono: prompt } });
  const inicio = Date.now();
  const respostas = await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] });
  const veredito = escolha(respostas, 'lei', criterios);
  return { veredito, duracao: Date.now() - inicio };
}

function porCitacao(lei, base) {
  registrar({ ...base, lei: lei.sigla, decisao: 'citada', prob: 1 });
  return saidaContexto('UserPromptSubmit', mensagem(lei));
}

function semJev(base, duracao, aviso, textoNormalizado) {
  registrar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });
  if (!FORTE.test(textoNormalizado)) return null;
  return saidaContexto('UserPromptSubmit', aviso ? `${mensagemGenerica} (${aviso})` : mensagemGenerica);
}

async function porJev({ config, entrada, prompt, aviso, base, deps }) {
  const { veredito, duracao } = await perguntarAoJev(config, entrada, prompt, deps);
  if (!veredito) return semJev(base, duracao, aviso, normalizar(prompt));
  const lei = config.leis.find((l) => `lei_${l.numero}` === veredito.escolha);
  const aceita = lei && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA;
  registrar({ ...base, lei: aceita ? lei.sigla : undefined, decisao: aceita ? 'jev' : 'sem_lei', prob: veredito.confianca, duracao_ms: duracao });
  return aceita ? saidaContexto('UserPromptSubmit', mensagem(lei)) : null;
}

async function analisar(entrada, config, aviso, deps) {
  const prompt = String(entrada.prompt ?? '').slice(0, LIMITE_PROMPT);
  const citadas = leisCitadas(config, prompt);
  const texto = normalizar(prompt);
  if (citadas.length === 0 && !SINAIS.test(texto)) return null;
  const base = { sessao: entrada.session_id, projeto: nomeDoProjeto(entrada), hook: 'relato', natureza: 'relato', trecho: prompt };
  return citadas.length === 1 && VERBO_DE_CORRECAO.test(texto) ? porCitacao(citadas[0], base) : porJev({ config, entrada, prompt, aviso, base, deps });
}

// A quebra que o fiscal da resposta só observou chega ao modelo aqui, uma vez.
function consumirPendencia(config, sessao) {
  const { pendente } = lerEstado(sessao);
  if (pendente === undefined) return null;
  atualizarEstado(sessao, { pendente: null });
  const lei = leiPorNumero(config, pendente);
  return lei ? `Na resposta anterior você quebrou a ${nomeCompleto(lei)} e parou mesmo depois dos avisos: ${lei.regra} Antes de responder a esta mensagem, grave na memória ou nas regras do projeto o que você fará diferente (substitua a regra velha, não acumule) e só então siga.` : null;
}

export async function executar(entrada, deps = {}) {
  const { config, aviso } = deps.config ?? carregarConfig();
  const nota = consumirPendencia(config, entrada.session_id ?? 'sem-sessao');
  const saida = await analisar(entrada, config, aviso, deps);
  const corpo = [nota, saida?.hookSpecificOutput.additionalContext].filter(Boolean).join('\n');
  return corpo ? saidaContexto('UserPromptSubmit', corpo) : null;
}

await principal(import.meta.url, executar);
