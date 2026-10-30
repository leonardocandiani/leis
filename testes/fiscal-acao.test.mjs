import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executar, classificar } from '../scripts/fiscal-acao.mjs';
import { isolar, restaurar, configCom, registro } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const bash = (command, extra = {}) => ({ tool_name: 'Bash', session_id: 's1', cwd: '/x/p', tool_input: { command, ...extra } });
const segredoLongo = 'a1B2'.repeat(8);

test('classifica laço com sleep em primeiro plano e deixa passar o resto', () => {
  assert.equal(classificar(bash('while true; do sleep 5; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('for i in 1 2 3; do curl x; sleep 2; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('until test -f pronto; do sleep 1; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('while true; do sleep 5; done', { run_in_background: true })), null);
  assert.equal(classificar(bash('sleep 1 && echo ok')), null);
  assert.equal(classificar(bash('ls -la && git status')), null);
});

test('classifica segredo literal e aceita variável', () => {
  assert.equal(classificar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" https://x`)), 'segredo_literal');
  assert.equal(classificar(bash(`curl "https://x?access_token=${segredoLongo}"`)), 'segredo_literal');
  assert.equal(classificar(bash('SSHPASS=hunter2 sshpass -e ssh host')), 'segredo_literal');
  assert.equal(classificar(bash('curl -H "Authorization: Bearer $TOKEN" https://x')), null);
  assert.equal(classificar(bash('SSHPASS=$SENHA sshpass -e ssh host')), null);
});

test('valor de teste ou de exemplo não conta como segredo literal', () => {
  const esquema = ['Bear', 'er'].join('');
  const campo = ['access', 'token'].join('_');
  const var_ = ['SSH', 'PASS'].join('');
  for (const valor of ['token-de-teste', 'token-de-teste-do-crm-sync', 'abcdefghij-EXEMPLO-klmnop', 'your_api_token_goes_here', 'seu_token_aqui_1234567', 'fake-token-0123456789abcdef', '<TOKEN_DO_CLIENTE_AQUI>', '${TOKEN_DO_CLIENTE_AQUI}', '$TOKEN_DO_CLIENTE_AQUI']) {
    assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${valor}" https://x`)), null, valor);
    assert.equal(classificar(bash(`curl "https://x?${campo}=${valor}"`)), null, valor);
    assert.equal(classificar(bash(`${var_}=${valor} sshpass -e ssh host`)), null, valor);
  }
});

test('valor real de 32 caracteres sem palavra de teste segue negado', () => {
  const esquema = ['Bear', 'er'].join('');
  const real = 'Zk9QwR3vLm7XcB2nHs5TyU8eJd4GfA6p';
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${real}" https://x`)), 'segredo_literal');
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} token-de-teste" -H "X: ${esquema} ${real}" https://x`)), 'segredo_literal');
});

test('AskUserQuestion é classificada; outras ferramentas, não', () => {
  assert.equal(classificar({ tool_name: 'AskUserQuestion', tool_input: {} }), 'pergunta_ao_dono');
  assert.equal(classificar({ tool_name: 'Read', tool_input: { file_path: 'a' } }), null);
});

test('modo observar registra e não nega', () => {
  assert.equal(executar({ tool_name: 'AskUserQuestion', session_id: 's1', cwd: '/x/p', tool_input: {} }, { config: configCom({}) }), null);
  const [ev] = registro();
  assert.deepEqual([ev.hook, ev.lei, ev.decisao], ['fiscal-acao', 'S.I.M.', 'observada']);
});

test('modo bloquear nega com a lei e a correção', () => {
  const config = configCom({ 5: 'bloquear', 2: 'bloquear', 6: 'bloquear' });
  const pergunta = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config });
  assert.equal(pergunta.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(pergunta.hookSpecificOutput.permissionDecisionReason, /Lei 5 \(S\.I\.M\.\)/);
  const laco = executar(bash('while true; do sleep 5; done'), { config });
  assert.match(laco.hookSpecificOutput.permissionDecisionReason, /Lei 2 \(J\.Á\.\).*segundo plano/);
  const segredo = executar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" x`), { config });
  assert.match(segredo.hookSpecificOutput.permissionDecisionReason, /Lei 6/);
  assert.deepEqual(registro().map((e) => e.decisao), ['negada', 'negada', 'negada']);
});

test('o trecho do segredo é mascarado no registro', () => {
  executar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" x`), { config: configCom({}) });
  assert.doesNotMatch(registro()[0].trecho, new RegExp(segredoLongo));
});

test('comando que não casa não registra nada', () => {
  assert.equal(executar(bash('npm test'), { config: configCom({ 2: 'bloquear' }) }), null);
  assert.equal(registro().length, 0);
});

test('projeto com portão próprio: sai sem fazer nada', () => {
  const projeto = join(raiz, 'projeto');
  mkdirSync(join(projeto, 'scripts', 'central', 'hooks'), { recursive: true });
  writeFileSync(join(projeto, 'scripts', 'central', 'hooks', 'portao.ts'), '');
  process.env.CLAUDE_PROJECT_DIR = projeto;
  const saida = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: configCom({ 5: 'bloquear' }) });
  assert.equal(saida, null);
  assert.equal(registro().length, 0);
});

test('os fiscais acham a lei pelo papel, não pelo número (config renumerada)', () => {
  const c = configCom({});
  c.config.leis.reverse().forEach((l, i) => { l.numero = i + 1; });
  c.config.modos = { 1: 'bloquear', 2: 'bloquear', 3: 'bloquear', 4: 'bloquear', 5: 'bloquear', 6: 'bloquear' };
  const saida = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: c });
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /S\.I\.M\./);
  assert.equal(registro()[0].lei, 'S.I.M.');
});

test('lei sem o papel do fiscal: nada é fiscalizado por hook', () => {
  const c = configCom({ 5: 'bloquear' });
  for (const l of c.config.leis) delete l.papel;
  assert.equal(executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: c }), null);
  assert.equal(registro().length, 0);
});
