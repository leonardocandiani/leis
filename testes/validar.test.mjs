import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hooksAtivos, hooksDoPluginExistem, paraToon, validar } from '../scripts/validar.mjs';
import { isolar, restaurar, modelo, escreverConfig } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const estado = (itens, nome) => itens.find((i) => i.item === nome).estado;
const jevOk = async () => ({ v: { type: 'choice', choice: 'sim' } });

function ligarPlugin() {
  mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'settings.json'), JSON.stringify({ enabledPlugins: { 'leis@leis': true } }));
}

test('tudo ligado: sem falha', async () => {
  ligarPlugin();
  escreverConfig(modelo());
  process.env.TYPESAFE_API_KEY = 'k';
  const itens = await validar({ jev: jevOk });
  assert.deepEqual(itens.filter((i) => i.estado === 'falha'), []);
  assert.match(paraToon(itens), /^resultado: pass/);
});

test('sem plugin, sem chave e sem config: falhas e avisos claros', async () => {
  const itens = await validar({});
  assert.equal(estado(itens, 'hooks_ativos'), 'falha');
  assert.equal(estado(itens, 'chave_jev'), 'falha');
  assert.equal(estado(itens, 'jev_responde'), 'aviso');
  assert.equal(estado(itens, 'config_esquema'), 'aviso');
  assert.match(paraToon(itens), /^resultado: fail/);
});

test('config do usuário inválida é falha', async () => {
  const c = modelo();
  c.leis[0].sigla = 'x';
  escreverConfig(c);
  assert.equal(estado(await validar({}), 'config_esquema'), 'falha');
});

test('JEV sem resposta ou lento falha', async () => {
  process.env.TYPESAFE_API_KEY = 'k';
  assert.equal(estado(await validar({ jev: async () => null }), 'jev_responde'), 'falha');
  const lento = async () => { await new Promise((r) => setTimeout(r, 30)); return { v: { choice: 'sim' } }; };
  assert.equal(estado(await validar({ jev: lento }), 'jev_responde'), 'ok');
});

test('hooks_ativos distingue habilitado, instalado sem habilitar e hooks diretos', () => {
  const dir = join(raiz, 'c');
  mkdirSync(join(dir, 'plugins'), { recursive: true });
  assert.equal(hooksAtivos(dir).estado, 'falha');
  writeFileSync(join(dir, 'plugins', 'installed_plugins.json'), '{"plugins":{"leis@leis":[{}]}}');
  assert.match(hooksAtivos(dir).detalhe, /não habilitado/);
  writeFileSync(join(dir, 'settings.json'), '{"hooks":{"Stop":[{"hooks":[{"command":"node /p/leis/scripts/fiscal-resposta.mjs"}]}]}}');
  assert.equal(hooksAtivos(dir).estado, 'ok');
});

test('os hooks do plugin apontam para scripts que existem', () => {
  assert.equal(hooksDoPluginExistem().estado, 'ok');
});

test('o registro gravável aparece e a sonda não deixa lixo', async () => {
  const itens = await validar({});
  assert.equal(estado(itens, 'registro_gravavel'), 'ok');
});
