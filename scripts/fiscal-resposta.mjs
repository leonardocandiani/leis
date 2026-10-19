#!/usr/bin/env node
// Stop: confere a última resposta da sessão contra T.O.P. e S.I.M. Regra barata primeiro, JEV só quando ela dispara.
import { nomeDoProjeto, principal, projetoTem } from './entrada.mjs';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto } from './leis.mjs';
import { registrar } from './registro.mjs';

const PAPEL_DA_ESCOLHA = { top: 'pronto', sim: 'sim' };
const CONFIANCA_MINIMA = 0.6;
const CARDAPIO = /\bquer que eu\b|\bposso (seguir|continuar|prosseguir|avançar)\b|\bdeseja que eu\b|\bop[cç][aã]o\s*[a-d1-4]\b|\bprefere\s+(a|b|c|1|2)\b|\bqual (você )?prefere\b|\bme diga qual\b/i;

export function regraBarata(texto) {
  const corpo = String(texto ?? '').trim();
  if (!corpo) return null;
  const ultima = corpo.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
  if (CARDAPIO.test(corpo.slice(-1200))) return 'cardapio';
  if (/\?[\s*_)"'`]*$/.test(ultima)) return 'pergunta_final';
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

function decidir({ config, lei, estado, entrada }) {
  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  const usado = entrada.stop_hook_active === true ? 1 : entrada.stop_hook_active === false ? 0 : estado.bloqueios_seguidos;
  if (!bloquear) return { decisao: 'observada', bloqueios: 0 };
  if (usado >= 1) return { decisao: 'teto', bloqueios: usado };
  return { decisao: 'bloqueada', bloqueios: usado + 1 };
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
  const { decisao, bloqueios } = decidir({ config, lei, estado: lerEstado(sessao), entrada });
  atualizarEstado(sessao, { bloqueios_seguidos: bloqueios, pendente: decisao === 'bloqueada' ? null : lei.numero });
  registrar({ ...base, lei: lei.sigla, decisao, prob: veredito.confianca, duracao_ms: duracao });
  const aviso = `Você quebrou a ${nomeCompleto(lei)} na última resposta: ${lei.regra} Teste: ${lei.teste} Corrija: ${lei.correcao}`;
  return decisao === 'bloqueada' ? { decision: 'block', reason: aviso } : { systemMessage: `[leis] ${aviso}` };
}

await principal(import.meta.url, executar);
