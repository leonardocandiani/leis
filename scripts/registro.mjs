// Registro de eventos das leis: uma linha JSON por evento, escrita por append.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { casaDoUsuario } from './leis.mjs';
import { trecho } from './mascarar.mjs';

export const caminhoRegistro = () => join(casaDoUsuario(), 'registro.jsonl');

const CAMPOS = ['sessao', 'projeto', 'hook', 'lei', 'natureza', 'decisao', 'prob', 'duracao_ms'];

export function montarLinha(evento, agora = new Date()) {
  const linha = { ts: agora.toISOString(), maquina: process.env.LEIS_MAQUINA || hostname() };
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
