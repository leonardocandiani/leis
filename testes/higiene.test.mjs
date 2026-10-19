// O repositório é público: sem travessão, sem caminho de máquina e sem nome de terceiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;
const arquivos = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);
const lidos = arquivos.map((a) => [a, readFileSync(`${raiz}${a}`, 'utf8')]);

const travessoLongo = String.fromCharCode(0x2014);
const travessoMedio = String.fromCharCode(0x2013);
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const caminhoDeMaquina = new RegExp(['/Us', 'ers/'].join(''));

test('nenhum arquivo tem travessão', () => {
  const ruins = lidos.filter(([, t]) => t.includes(travessoLongo) || t.includes(travessoMedio)).map(([a]) => a);
  assert.deepEqual(ruins, []);
});

test('nenhum arquivo tem emoji', () => {
  assert.deepEqual(lidos.filter(([, t]) => emoji.test(t)).map(([a]) => a), []);
});

test('nenhum arquivo tem caminho absoluto de máquina', () => {
  assert.deepEqual(lidos.filter(([, t]) => caminhoDeMaquina.test(t)).map(([a]) => a), []);
});

test('os scripts usam só a biblioteca padrão do Node', () => {
  const externos = lidos
    .filter(([a]) => a.startsWith('scripts/') || a.startsWith('testes/'))
    .flatMap(([a, t]) => [...t.matchAll(/^import[^\n]*from '([^']+)'/gm)].map((m) => [a, m[1]]))
    .filter(([, m]) => !m.startsWith('node:') && !m.startsWith('.'));
  assert.deepEqual(externos, []);
});
