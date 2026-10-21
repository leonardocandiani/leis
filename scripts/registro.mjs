// Registro de eventos das leis: uma linha JSON por evento, escrita por append.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { casaDoUsuario } from './leis.mjs';
import { trecho } from './mascarar.mjs';

export const caminhoRegistro = () => join(casaDoUsuario(), 'registro.jsonl');

const CAMPOS = ['sessao', 'projeto', 'hook', 'lei', 'natureza', 'decisao', 'sinal', 'prob', 'duracao_ms'];

// A versão vai em cada linha: a curva separa a queda que veio de tirar falso positivo da que veio de a sessão aprender.
const VERSAO = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
  } catch {
    return undefined;
  }
})();

// Uma definição só de quebra para a escalada e para a curva. Fica de fora o que ainda não foi medido como confiável:
// o fiscal da leitura em observar, aviso, passou e JEV fora do ar.
const QUEBRAS = { 'fiscal-resposta': ['bloqueada', 'teto'], 'fiscal-acao': ['negada', 'observada'], 'fiscal-leitura': ['negada'] };
export const ehQuebra = (e) => !!e?.lei && (QUEBRAS[e.hook] ?? []).includes(e.decisao);

// O Stop devolve o turno até 3 vezes e registra cada volta: a mesma lei na mesma sessão em menos de 15 min é uma quebra só.
const MESMA_QUEBRA_MS = 15 * 60 * 1000;
export function quebrasDistintas(eventos) {
  const ultima = new Map();
  return eventos.filter(ehQuebra).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).filter((e) => {
    const chave = `${e.sessao}|${e.lei}`;
    const antes = ultima.get(chave);
    if (antes !== undefined && Date.parse(e.ts) - antes < MESMA_QUEBRA_MS) return false;
    ultima.set(chave, Date.parse(e.ts));
    return true;
  });
}

export function montarLinha(evento, agora = new Date()) {
  const linha = { ts: agora.toISOString(), maquina: process.env.LEIS_MAQUINA || hostname(), ...(VERSAO ? { versao: VERSAO } : {}) };
  for (const campo of CAMPOS) if (evento[campo] !== undefined && evento[campo] !== null) linha[campo] = evento[campo];
  if (evento.trecho) linha.trecho = trecho(evento.trecho);
  return linha;
}

export function registrar(evento, agora = new Date()) {
  try {
    mkdirSync(casaDoUsuario(), { recursive: true });
    appendFileSync(caminhoRegistro(), `${JSON.stringify(montarLinha(evento, agora))}\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function lerRegistro(desdeMs = 0) {
  let texto = '';
  try {
    texto = readFileSync(caminhoRegistro(), 'utf8');
  } catch {
    return [];
  }
  return texto.split('\n').flatMap((l) => {
    try {
      const ev = JSON.parse(l);
      return Date.parse(ev.ts) >= desdeMs ? [ev] : [];
    } catch {
      return [];
    }
  });
}
