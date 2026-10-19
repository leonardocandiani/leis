import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caminhoRegistro, lerRegistro, registrar } from '../scripts/registro.mjs';
import { agrupar, medir, paraToon, percentil } from '../scripts/medir.mjs';
import { isolar, restaurar } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

test('registrar acrescenta linhas completas, com trecho mascarado e limitado', () => {
  assert.equal(registrar({ sessao: 's', hook: 'h', lei: 'T.O.P.', natureza: 'acao', decisao: 'observada', trecho: `ligue para ana@x.com ${'z '.repeat(200)}` }), true);
  assert.equal(registrar({ hook: 'h2', natureza: 'relato', decisao: 'citada', prob: 1, duracao_ms: 12 }), true);
  const [a, b] = lerRegistro(0);
  assert.match(a.trecho, /^ligue para \[email\]/);
  assert.ok(a.trecho.length <= 200);
  assert.ok(a.ts && a.maquina);
  assert.deepEqual([b.prob, b.duracao_ms], [1, 12]);
  assert.equal(Object.hasOwn(b, 'trecho'), false);
});

test('registrar nunca lança: pasta impossível devolve false', () => {
  const arquivo = join(raiz, 'arquivo-comum');
  writeFileSync(arquivo, 'x');
  process.env.LEIS_HOME = join(arquivo, 'dentro');
  assert.equal(registrar({ hook: 'x' }), false);
});

test('lerRegistro pula linha corrompida e filtra pelo início', () => {
  registrar({ hook: 'a' }, new Date('2026-01-01T00:00:00Z'));
  registrar({ hook: 'b' }, new Date('2026-06-01T00:00:00Z'));
  writeFileSync(caminhoRegistro(), `${'{quebrado\n'}`, { flag: 'a' });
  assert.equal(lerRegistro(0).length, 2);
  assert.deepEqual(lerRegistro(Date.parse('2026-03-01T00:00:00Z')).map((e) => e.hook), ['b']);
});

test('percentil por posto mais próximo', () => {
  assert.equal(percentil([], 50), null);
  assert.equal(percentil([10, 20, 30, 40], 50), 20);
  assert.equal(percentil([10, 20, 30, 40], 95), 40);
  assert.equal(percentil([7], 95), 7);
});

test('agrupar conta registradas, bloqueadas, observadas e JEV fora, com mediana e p95', () => {
  const ev = (decisao, d) => ({ ts: new Date().toISOString(), lei: 'S.I.M.', natureza: 'acao', decisao, duracao_ms: d });
  const [linha] = agrupar([ev('negada'), ev('observada', 100), ev('observada', 300), ev('jev_indisponivel', 2500), ev('passou', 200)]);
  assert.deepEqual([linha.registradas, linha.bloqueadas, linha.observadas, linha.jev_fora], [5, 1, 2, 1]);
  assert.equal(linha.mediana_ms, 200);
  assert.equal(linha.p95_ms, 2500);
});

test('medir separa as janelas de 24 h e 7 d', () => {
  const agora = Date.parse('2026-10-19T12:00:00Z');
  const dentro = { ts: '2026-10-19T08:00:00Z', lei: 'J.Á.', natureza: 'relato', decisao: 'citada' };
  const semana = { ts: '2026-10-15T08:00:00Z', lei: 'J.Á.', natureza: 'relato', decisao: 'citada' };
  const velho = { ts: '2026-09-01T08:00:00Z', lei: 'J.Á.', natureza: 'relato', decisao: 'citada' };
  const [d, s] = medir([dentro, semana, velho], agora);
  assert.deepEqual([d.janela, d.eventos, s.janela, s.eventos], ['24h', 1, '7d', 2]);
});

test('a saída TOON traz cabeçalho tabular e ajuda; sem eventos diz isso', () => {
  const vazio = paraToon(medir([], Date.now()));
  assert.match(vazio, /por_lei\[0\]\{lei,natureza,registradas,bloqueadas,observadas,jev_fora,mediana_ms,p95_ms\}:/);
  assert.match(vazio, /sem eventos ainda/);
  const cheio = paraToon(medir([{ ts: new Date().toISOString(), lei: 'T.O.P.', natureza: 'acao', decisao: 'negada', duracao_ms: 5 }]));
  assert.match(cheio, /T\.O\.P\.,acao,1,1,0,0,5,5/);
});
