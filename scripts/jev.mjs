// Cliente mínimo do JEV (TypeSafe): uma tentativa, timeout curto, null quando falha (fail-open).
// URLs e modelo seguem o cliente de referência do autor: o gateway termina o TLS mais perto do Brasil e,
// medido, baixa a mediana de 1,4 s para 0,7 s; sem chave do gateway, vai direto.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const TIMEOUT_JEV_MS = 2500;
const GATEWAY = 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model';
const DIRETO = 'https://api.typesafe.ai/v1/systemone';
const MODELO_DIRETO = 'jev-1.13.0';
const CHAVES = ['AI_GATEWAY_API_KEY', 'TYPESAFE_API_KEY'];

const expandir = (c) => (c.startsWith('~/') ? join(homedir(), c.slice(2)) : c);

function doSettings(nome) {
  try {
    const p = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.local.json');
    return JSON.parse(readFileSync(p, 'utf8')).env?.[nome] || '';
  } catch {
    return '';
  }
}

function doArquivoEnv(caminho, nome) {
  try {
    for (const linha of readFileSync(expandir(caminho), 'utf8').split('\n')) {
      const m = linha.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
      if (m && m[1] === nome) return m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  } catch {
    // arquivo ausente: sem chave por ali
  }
  return '';
}

// O ambiente congela quando o processo do Claude sobe; os arquivos são relidos a cada execução.
export function chave(nome, extras = []) {
  if (process.env[nome]) return process.env[nome];
  const arquivos = ['~/.config/jev/chaves.env', ...extras];
  return doSettings(nome) || arquivos.map((a) => doArquivoEnv(a, nome)).find(Boolean) || '';
}

export const chaveDisponivel = (extras = []) => CHAVES.some((n) => chave(n, extras));

async function postar(url, headers, corpo, timeoutMs, fetchFn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(corpo), signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function destino(extras) {
  const gw = chave('AI_GATEWAY_API_KEY', extras);
  if (gw) {
    const cabecalhos = { Authorization: `Bearer ${gw}`, 'Content-Type': 'application/json', 'ai-gateway-protocol-version': '0.0.1', 'ai-gateway-auth-method': 'api-key', 'ai-model-id': 'typesafe-ai/jev' };
    return { url: GATEWAY, cabecalhos, corpo: (s, q) => ({ state: s, questions: q }) };
  }
  const ts = chave('TYPESAFE_API_KEY', extras);
  if (!ts) return null;
  return { url: DIRETO, cabecalhos: { Authorization: `Bearer ${ts}`, 'Content-Type': 'application/json' }, corpo: (s, q) => ({ model: MODELO_DIRETO, state: s, questions: q }) };
}

// Devolve `answers` ou null (sem chave, timeout, HTTP de erro). Nunca lança.
export async function perguntar(estado, perguntas, opcoes = {}) {
  const { timeoutMs = TIMEOUT_JEV_MS, extras = [], fetchFn = globalThis.fetch } = opcoes;
  const alvo = destino(extras);
  if (!alvo) return null;
  const j = await postar(alvo.url, alvo.cabecalhos, alvo.corpo(JSON.stringify(estado), perguntas), timeoutMs, fetchFn);
  return j?.answers ?? null;
}

// Select never generate: escolha fora da lista vira null.
export function escolha(respostas, id, criterios) {
  const r = respostas?.[id];
  if (!r || typeof r.choice !== 'string' || !Object.hasOwn(criterios, r.choice)) return null;
  const p = r.probabilities?.[r.choice];
  const confianca = typeof r.confidence === 'number' ? r.confidence : typeof p === 'number' ? p : null;
  return { escolha: r.choice, confianca };
}
