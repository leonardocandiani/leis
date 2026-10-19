import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chave, chaveDisponivel, escolha, perguntar } from '../scripts/jev.mjs';
import { isolar, restaurar } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const respostaOk = (answers) => async () => ({ ok: true, json: async () => ({ answers }) });
const perguntas = { q: { type: 'choice', instructions: 'x', criteria: { a: 'a', b: 'b' } } };

test('sem chave nenhuma devolve null e nem tenta a rede', async () => {
  assert.equal(chaveDisponivel(), false);
  const r = await perguntar({}, perguntas, { fetchFn: async () => { throw new Error('rede'); } });
  assert.equal(r, null);
});

test('chave direta: usa a URL direta, o Bearer e o modelo, e devolve answers', async () => {
  process.env.TYPESAFE_API_KEY = 'chave-direta-de-teste';
  let visto;
  const fetchFn = async (url, init) => { visto = { url, init }; return { ok: true, json: async () => ({ answers: { q: { choice: 'a' } } }) }; };
  const r = await perguntar({ x: 1 }, perguntas, { fetchFn });
  assert.deepEqual(r, { q: { choice: 'a' } });
  assert.equal(visto.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(visto.init.headers.Authorization, 'Bearer chave-direta-de-teste');
  const corpo = JSON.parse(visto.init.body);
  assert.equal(corpo.model, 'jev-1.13.0');
  assert.equal(corpo.state, '{"x":1}');
});

test('chave do gateway tem prioridade e muda cabeçalhos e corpo', async () => {
  process.env.AI_GATEWAY_API_KEY = 'chave-gw';
  process.env.TYPESAFE_API_KEY = 'chave-direta';
  let visto;
  await perguntar({}, perguntas, { fetchFn: async (url, init) => { visto = { url, init }; return { ok: true, json: async () => ({ answers: {} }) }; } });
  assert.match(visto.url, /ai-gateway\.vercel\.sh/);
  assert.equal(visto.init.headers['ai-model-id'], 'typesafe-ai/jev');
  assert.equal(JSON.parse(visto.init.body).model, undefined);
});

test('HTTP de erro, exceção e timeout viram null (fail-open)', async () => {
  process.env.TYPESAFE_API_KEY = 'k';
  assert.equal(await perguntar({}, perguntas, { fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await perguntar({}, perguntas, { fetchFn: async () => { throw new Error('x'); } }), null);
  const pendurado = (_url, init) => new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(new Error('abortado'))));
  const inicio = Date.now();
  assert.equal(await perguntar({}, perguntas, { fetchFn: pendurado, timeoutMs: 40 }), null);
  assert.ok(Date.now() - inicio < 500);
});

test('a chave é lida de settings.local.json, do arquivo de chaves e de arquivo extra', () => {
  mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'settings.local.json'), JSON.stringify({ env: { TYPESAFE_API_KEY: 'do-settings' } }));
  assert.equal(chave('TYPESAFE_API_KEY'), 'do-settings');
  rmEnvSettings();
  mkdirSync(join(raiz, '.config', 'jev'), { recursive: true });
  writeFileSync(join(raiz, '.config', 'jev', 'chaves.env'), '# c\nexport TYPESAFE_API_KEY="do-arquivo"\n');
  assert.equal(chave('TYPESAFE_API_KEY'), 'do-arquivo');
  const extra = join(raiz, 'extra.env');
  writeFileSync(extra, 'AI_GATEWAY_API_KEY=do-extra\n');
  assert.equal(chave('AI_GATEWAY_API_KEY', [extra]), 'do-extra');
  assert.equal(chave('AI_GATEWAY_API_KEY'), '');
});

function rmEnvSettings() {
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'settings.local.json'), '{}');
}

test('escolha só aceita opção que está na lista', () => {
  const criterios = { a: 'x', b: 'y' };
  assert.deepEqual(escolha({ q: { choice: 'a', confidence: 0.8 } }, 'q', criterios), { escolha: 'a', confianca: 0.8 });
  assert.equal(escolha({ q: { choice: 'inventada' } }, 'q', criterios), null);
  assert.equal(escolha(null, 'q', criterios), null);
});
