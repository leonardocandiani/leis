import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirPr, candidatos, conferirHigiene, nomeDoCaso, paraToon, textoDoCaso } from '../scripts/contribuir.mjs';
import { modelo } from './ajuda.mjs';

const H = 3600 * 1000;
const T0 = Date.parse('2026-10-01T00:00:00Z');
const quebra = (horas, extra = {}) => ({ ts: new Date(T0 + horas * H).toISOString(), sessao: `s${horas}`, projeto: 'a', hook: 'fiscal-resposta', lei: 'T.O.P.', decisao: 'bloqueada', sinal: 'cardapio', versao: '0.3.0', trecho: 'texto do dono', ...extra });

test('vira caso só a quebra com 3+ vezes em 2+ projetos, pelo papel da lei e nunca pela sigla', () => {
  const eventos = [quebra(0), quebra(1), quebra(2, { projeto: 'b' }), quebra(3, { lei: 'S.I.M.', projeto: 'b' }), quebra(4, { lei: 'S.I.M.' }), quebra(5, { decisao: 'passou', projeto: 'c' })];
  const lista = candidatos(eventos, modelo());
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], { papel: 'pronto', sinal: 'cardapio', hook: 'fiscal-resposta', vezes: 3, projetos: 2, versoes: '0.3.0', primeira: '2026-10-01', ultima: '2026-10-01' });
});

test('evento sem projeto não conta como segundo projeto', () => {
  assert.equal(candidatos([quebra(0), quebra(1), quebra(2, { projeto: undefined })], modelo()).length, 0);
});

test('sinal fora do formato seguro e lei desconhecida não saem', () => {
  const lista = candidatos([quebra(0, { sinal: 'cat /x/y' }), quebra(1, { sinal: 'cat /x/y', projeto: 'b' }), quebra(2, { sinal: 'cat /x/y' }), quebra(3, { lei: 'X.Y.' }), quebra(4, { lei: 'X.Y.', projeto: 'b' }), quebra(5, { lei: 'X.Y.' })], modelo());
  assert.deepEqual(lista.map((c) => c.sinal), ['sem_sinal']);
});

test('o texto do caso não leva trecho, projeto nem sessão, e passa na higiene', () => {
  const c = candidatos([quebra(0), quebra(1, { projeto: 'cliente-x' }), quebra(2)], modelo())[0];
  const texto = textoDoCaso(c);
  assert.doesNotMatch(texto, /texto do dono|cliente-x|s1/);
  assert.deepEqual(conferirHigiene(texto), []);
  assert.equal(nomeDoCaso(c), 'pronto-cardapio-fiscal-resposta.md');
  assert.equal(conferirHigiene('ver /home/fulano e 5544999998888 e a@b.com').length, 3);
});

test('seco mostra os casos e o comando do PR; vazio diz que não há nada', () => {
  assert.match(paraToon([], 'seco'), /^count: 0[\s\S]*nada a contribuir/);
  const c = candidatos([quebra(0), quebra(1, { projeto: 'b' }), quebra(2)], modelo());
  assert.match(paraToon(c, 'seco'), /casos\[1\]\{papel,sinal,hook,vezes,projetos,versoes\}:\n {2}pronto,cardapio,fiscal-resposta,3,2,0\.3\.0[\s\S]*--abrir-pr --repo/);
});

test('abrir PR: recusa pasta que não é o repositório e grava só os casos no ramo novo', () => {
  const lista = candidatos([quebra(0), quebra(1, { projeto: 'b' }), quebra(2)], modelo());
  const fora = mkdtempSync(join(tmpdir(), 'leis-contrib-'));
  assert.equal(abrirPr(lista, fora).code, 'REPO');
  mkdirSync(join(fora, '.claude-plugin'));
  writeFileSync(join(fora, '.claude-plugin', 'plugin.json'), '{}');
  const chamadas = [];
  const sujo = { git: (_r, cmd) => (cmd === 'status' ? ' M README.md' : ''), gh: () => assert.fail('não devia abrir PR') };
  assert.equal(abrirPr(lista, fora, sujo).code, 'SUJO');
  const r = abrirPr(lista, fora, { git: (_r, ...a) => (chamadas.push(['git', ...a]), ''), gh: (a) => (chamadas.push(['gh', ...a]), 'https://exemplo/pr/1') });
  assert.equal(r.url, 'https://exemplo/pr/1');
  assert.deepEqual(chamadas.map((c) => c[1]), ['status', 'checkout', 'add', 'commit', 'push', 'pr']);
  assert.deepEqual(chamadas[3].slice(-2), ['--', join('docs', 'casos', 'pronto-cardapio-fiscal-resposta.md')]);
  assert.match(readFileSync(join(fora, 'docs', 'casos', 'pronto-cardapio-fiscal-resposta.md'), 'utf8'), /quebras distintas: 3, em 2 projetos/);
});
