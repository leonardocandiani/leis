// Ambiente isolado dos testes: casa do usuário temporária, nenhuma chave real, JEV sempre falso.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { lerRegistro } from '../scripts/registro.mjs';

const VARIAVEIS = ['LEIS_HOME', 'HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_PROJECT_DIR', 'AI_GATEWAY_API_KEY', 'TYPESAFE_API_KEY'];
const original = Object.fromEntries(VARIAVEIS.map((v) => [v, process.env[v]]));

export function isolar() {
  const raiz = mkdtempSync(join(tmpdir(), 'leis-teste-'));
  for (const v of VARIAVEIS) delete process.env[v];
  process.env.HOME = raiz;
  process.env.CLAUDE_CONFIG_DIR = join(raiz, 'claude');
  process.env.LEIS_HOME = join(raiz, 'leis');
  mkdirSync(process.env.LEIS_HOME, { recursive: true });
  return raiz;
}

export function restaurar() {
  for (const v of VARIAVEIS) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
}

export const modelo = () => JSON.parse(readFileSync(new URL('../leis/modelo.json', import.meta.url), 'utf8'));

export function configCom(modos) {
  const c = modelo();
  c.modos = { ...c.modos, ...modos };
  return { config: c, aviso: null };
}

export const escreverConfig = (config) => writeFileSync(join(process.env.LEIS_HOME, 'leis.json'), JSON.stringify(config));
export const registro = () => lerRegistro(0);

// JEV falso: devolve a escolha pedida para a pergunta de id dado, ou null (fora do ar).
export function jevFalso(id, escolha, confidence = 0.9) {
  const chamadas = [];
  const fn = async (estado, perguntas) => {
    chamadas.push({ estado, perguntas });
    return escolha === null ? null : { [id]: { type: 'choice', choice: escolha, confidence } };
  };
  fn.chamadas = chamadas;
  return fn;
}

export const jevProibido = async () => {
  throw new Error('o JEV não devia ser chamado');
};
