import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CABECALHO, gerarRegra, gravarRegra } from '../scripts/gerar-rule.mjs';
import { isolar, restaurar, modelo, escreverConfig } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

test('a rule gerada traz cabeçalho, tabela das seis leis, equilíbrio e vedações', () => {
  const md = gerarRegra(modelo());
  assert.ok(md.startsWith(CABECALHO));
  assert.match(CABECALHO, /Gerado de ~\/\.claude\/leis\/leis\.json por \/leis-implantar; edite o json/);
  for (const sigla of ['T.O.P.', 'J.Á.', 'T.R.O.C.A.', 'L.I.D.A.', 'S.I.M.', 'A.V.A.L.']) assert.ok(md.includes(`| ${sigla} |`), sigla);
  assert.match(md, /## Equilíbrio\n- Invariante vence lei/);
  assert.match(md, /## O que nunca fazer\n- Entregar ao dono/);
});

test('barra dentro de célula é escapada e a geração é idempotente', () => {
  const c = modelo();
  c.leis[0].teste = 'a | b?';
  assert.match(gerarRegra(c), /a \\\| b\?/);
  assert.equal(gerarRegra(modelo()), gerarRegra(modelo()));
});

test('rule antiga escrita à mão vira .antes; rule já gerada é só regravada', () => {
  const destino = join(raiz, 'rules', 'leis.md');
  gravarRegra(modelo(), destino);
  assert.equal(existsSync(`${destino}.antes`), false);
  writeFileSync(destino, 'texto à mão');
  const r = gravarRegra(modelo(), destino);
  assert.equal(readFileSync(r.backup, 'utf8'), 'texto à mão');
  assert.ok(readFileSync(destino, 'utf8').startsWith(CABECALHO));
  gravarRegra(modelo(), destino);
  assert.equal(readFileSync(`${destino}.antes`, 'utf8'), 'texto à mão');
});

test('a CLI gera a partir do leis.json do usuário e recusa o modelo padrão', () => {
  const script = new URL('../scripts/gerar-rule.mjs', import.meta.url).pathname;
  const saida = join(raiz, 'out.md');
  const sem = spawnSync('node', [script, '--saida', saida], { encoding: 'utf8', env: process.env });
  assert.equal(sem.status, 1);
  const c = modelo();
  c.dono = 'Ana';
  escreverConfig(c);
  const com = spawnSync('node', [script, '--saida', saida], { encoding: 'utf8', env: process.env });
  assert.equal(com.status, 0);
  assert.match(readFileSync(saida, 'utf8'), /# Leis do Ana/);
});
