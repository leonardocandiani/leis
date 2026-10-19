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
  assert.match(md, /## Lei 1, T\.O\.P\., Tudo Ordenado e Pronto\n\*\*Regra\.\*\* .*\n\*\*Teste\.\*\* .*\n\*\*Como se aplica\.\*\*\n- Abra pelo resultado/);
  assert.match(md, /\*\*Erro\.\*\* .*\n\*\*Correção\.\*\* /);
  assert.ok(md.indexOf('| Lei | Sigla') < md.indexOf('## Lei 1'));
  assert.ok(!md.includes('Fontes:'));
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

test('fontes viram uma linha no topo; lei sem aplicacao não ganha a seção Como se aplica', () => {
  const c = modelo();
  c.fontes = [{ rotulo: 'Texto vivo', caminho_ou_url: 'docs/leis.md' }, { rotulo: 'Site', caminho_ou_url: 'https://exemplo.org/leis' }];
  delete c.leis[2].aplicacao;
  const md = gerarRegra(c);
  assert.match(md, /^Fontes: Texto vivo \(docs\/leis\.md\); Site \(https:\/\/exemplo\.org\/leis\)$/m);
  const lei3 = md.slice(md.indexOf('## Lei 3'), md.indexOf('## Lei 4'));
  assert.ok(!lei3.includes('Como se aplica'));
});

test('--help e --seco não escrevem nada; flag desconhecida sai com 2 sem escrever', () => {
  const script = new URL('../scripts/gerar-rule.mjs', import.meta.url).pathname;
  const c = modelo();
  c.dono = 'Ana';
  escreverConfig(c);
  const saida = join(raiz, 'nao-pode-existir.md');
  const rodar = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8', env: process.env });
  const ajuda = rodar('--help', '--saida', saida);
  assert.equal(ajuda.status, 0);
  assert.match(ajuda.stdout, /Exemplos \(examples\)/);
  const seco = rodar('--seco', '--saida', saida);
  assert.equal(seco.status, 0);
  assert.match(seco.stdout, /nada foi escrito/);
  assert.match(seco.stdout, /# Leis do Ana/);
  for (const ruim of [['--forca', '--saida', saida], ['qualquer'], ['--saida']]) {
    const r = rodar(...ruim);
    assert.equal(r.status, 2, ruim.join(' '));
    assert.match(r.stdout, /^error: .*\ncode: USO/);
  }
  assert.equal(existsSync(saida), false);
  assert.equal(existsSync(join(process.env.CLAUDE_CONFIG_DIR, 'rules', 'leis.md')), false);
});
