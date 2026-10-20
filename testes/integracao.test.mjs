// Roda os hooks como processo, do jeito que o Claude Code roda: stdin JSON, stdout JSON, exit 0 sempre.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isolar, restaurar, registro } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

const raiz = new URL('..', import.meta.url).pathname;
const rodar = (script, entrada) => spawnSync('node', [`${raiz}scripts/${script}.mjs`], { input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada), encoding: 'utf8', env: process.env });

test('hook com entrada que não casa sai com 0 e sem saída', () => {
  const casos = [
    ['relato', { prompt: 'cria a landing page' }],
    ['fiscal-resposta', { last_assistant_message: 'Pronto. 14 testes passam.', session_id: 's' }],
    ['fiscal-acao', { tool_name: 'Bash', tool_input: { command: 'ls' } }],
    ['fiscal-leitura', { tool_name: 'Bash', tool_input: { command: 'ls' } }],
  ];
  for (const [script, entrada] of casos) {
    const r = rodar(script, entrada);
    assert.equal(r.status, 0, script);
    assert.equal(r.stdout, '', script);
  }
});

test('entrada corrompida ou vazia nunca derruba o hook (fail-open)', () => {
  for (const script of ['sessao', 'relato', 'fiscal-resposta', 'fiscal-acao', 'fiscal-leitura']) {
    for (const lixo of ['', '{quebrado', 'null']) assert.equal(rodar(script, lixo).status, 0, `${script} com "${lixo}"`);
  }
});

test('SessionStart devolve JSON válido de contexto', () => {
  const r = rodar('sessao', {});
  const saida = JSON.parse(r.stdout);
  assert.equal(saida.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(saida.hookSpecificOutput.additionalContext, /T\.O\.P\./);
});

test('relato com lei citada funciona de ponta a ponta, sem rede', () => {
  const r = rodar('relato', { prompt: 'você quebrou a L4', session_id: 's', cwd: '/x/p' });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Lei 4 \(L\.I\.D\.A\.\)/);
  assert.equal(registro().length, 1);
});

test('hooks.json: todo comando usa o ponteiro do plugin e aponta para um script que existe', () => {
  const { hooks } = JSON.parse(readFileSync(`${raiz}hooks/hooks.json`, 'utf8'));
  const comandos = Object.values(hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.equal(comandos.length, 5);
  for (const c of comandos) {
    assert.match(c, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[\w-]+\.mjs"$/);
    const arquivo = /scripts\/([\w-]+\.mjs)/.exec(c)[1];
    assert.doesNotThrow(() => readFileSync(`${raiz}scripts/${arquivo}`));
  }
});

test('validar e medir: --help sai com 0 e flag desconhecida com 2, sem efeito', () => {
  for (const script of ['validar', 'medir']) {
    const ajuda = spawnSync('node', [`${raiz}scripts/${script}.mjs`, '--help'], { encoding: 'utf8', env: process.env });
    assert.equal(ajuda.status, 0, script);
    const ruim = spawnSync('node', [`${raiz}scripts/${script}.mjs`, '--xyz'], { encoding: 'utf8', env: process.env });
    assert.equal(ruim.status, 2, script);
    assert.match(ruim.stdout, /code: USO/);
  }
  assert.equal(registro().length, 0);
});
