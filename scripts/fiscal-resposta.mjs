#!/usr/bin/env node
// Stop: confere a última resposta da sessão contra T.O.P. e S.I.M. Regra barata primeiro, JEV só quando ela dispara.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nomeDoProjeto, principal, projetoTem } from './entrada.mjs';
import { carregarConfig, casaDoUsuario, leiPorNumero, modoDaLei, nomeCompleto } from './leis.mjs';
import { registrar } from './registro.mjs';

const LEI_TOP = 1;
const LEI_SIM = 5;
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

const arquivoDeEstado = (sessao) => join(casaDoUsuario(), 'estado', `${String(sessao).replace(/[^\w-]/g, '_')}.json`);

function lerEstado(sessao) {
  try {
    return JSON.parse(readFileSync(arquivoDeEstado(sessao), 'utf8'));
  } catch {
    return { bloqueios_seguidos: 0 };
  }
}

function gravarEstado(sessao, estado) {
  try {
    mkdirSync(join(casaDoUsuario(), 'estado'), { recursive: true });
    writeFileSync(arquivoDeEstado(sessao), JSON.stringify(estado));
  } catch {
    // segunda camada do teto; a primeira é stop_hook_active, que não depende de escrita em disco
  }
}

function passar(evento) {
  registrar(evento);
  return null;
}

async function julgar(config, entrada, texto, sinal, deps) {
  const { perguntar, escolha } = await import('./jev.mjs');
  const { montarEstado } = await import('./contexto.mjs');
  const top = leiPorNumero(config, LEI_TOP);
  const sim = leiPorNumero(config, LEI_SIM);
  const criterios = {
    nenhuma: 'a resposta entrega o resultado ou faz uma pergunta que só o dono pode responder',
    top: `${top.sigla}: ${top.regra} Quebra quando a resposta termina pedindo decisão ou escolha que a sessão resolvia sozinha, ou entrega cardápio em vez de executar.`,
    sim: `${sim.sigla}: ${sim.regra} Quebra quando a resposta repete uma pergunta que o dono já respondeu antes na conversa.`,
  };
  const perguntas = { quebra: { type: 'choice', instructions: 'Confira a última resposta da sessão (campo resposta_final) contra as leis. Escolha "nenhuma" na dúvida.', criteria: criterios } };
  const estado = montarEstado({ entrada, leis: [top, sim], extra: { resposta_final: texto.slice(-1500), sinal_da_regra_barata: sinal } });
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
  const base = { sessao, projeto: nomeDoProjeto(entrada), hook: 'fiscal-resposta', natureza: 'acao', trecho: texto.slice(-300) };
  const { veredito, duracao } = await julgar(config, entrada, texto, sinal, deps);
  if (!veredito) return passar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });

  const numero = { top: LEI_TOP, sim: LEI_SIM }[veredito.escolha];
  const quebrou = numero && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA;
  if (!quebrou) {
    gravarEstado(sessao, { bloqueios_seguidos: 0 });
    return passar({ ...base, decisao: 'passou', prob: veredito.confianca, duracao_ms: duracao });
  }
  const lei = leiPorNumero(config, numero);
  const { decisao, bloqueios } = decidir({ config, lei, estado: lerEstado(sessao), entrada });
  gravarEstado(sessao, { bloqueios_seguidos: bloqueios });
  registrar({ ...base, lei: lei.sigla, decisao, prob: veredito.confianca, duracao_ms: duracao });
  const aviso = `Você quebrou a ${nomeCompleto(lei)} na última resposta: ${lei.regra} Teste: ${lei.teste} Corrija: ${lei.correcao}`;
  return decisao === 'bloqueada' ? { decision: 'block', reason: aviso } : { systemMessage: `[leis] ${aviso}` };
}

await principal(import.meta.url, executar);
