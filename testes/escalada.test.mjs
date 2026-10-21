import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executar } from '../scripts/fiscal-acao.mjs';
import { validarEsquema } from '../scripts/leis.mjs';
import { isolar, restaurar, configCom, registro } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

const pergunta = (extra = {}) => ({ session_id: 's1', tool_name: 'AskUserQuestion', tool_input: {}, transcript_path: '/t.jsonl', ...extra });
const laco = (extra = {}) => ({ session_id: 's1', tool_name: 'Bash', tool_input: { command: 'while true; do sleep 5; done' }, transcript_path: '/t.jsonl', ...extra });
const noTurno = (id) => () => ({ id, usos: [] });

function cfg(escalada) {
  const c = configCom({});
  if (escalada) c.config.escalada = escalada;
  return c;
}

const escaladas = () => registro().filter((e) => e.hook === 'escalada');

test('duas leis no mesmo turno registram a dupla quebra; em observar a saída não muda', () => {
  const deps = { config: cfg(), turnoAtual: noTurno('t1') };
  assert.equal(executar(pergunta(), deps), null);
  assert.equal(executar(laco(), deps), null);
  const [e] = escaladas();
  assert.equal(e.decisao, 'observada');
  assert.equal(e.lei, 'S.I.M.+J.Á.');
  assert.match(e.trecho, /Dupla quebra no mesmo turno/);
});

test('em pausar, a segunda lei encerra o turno com stopReason e roda o aviso', () => {
  const avisos = [];
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: (_c, m) => avisos.push(m) };
  assert.equal(executar(pergunta(), deps), null);
  const saida = executar(laco(), deps);
  assert.equal(saida.continue, false);
  assert.match(saida.stopReason, /S\.I\.M\. e J\.Á\..*próxima mensagem do dono retoma/);
  assert.equal(avisos.length, 1);
  assert.equal(escaladas()[0].decisao, 'pausada');
});

test('a mesma lei duas vezes, turnos diferentes ou sem transcript não escalam', () => {
  const t1 = { config: cfg({ modo: 'pausar' }), turnoAtual: noTurno('t1'), avisar: () => {} };
  executar(laco(), t1);
  assert.equal(executar(laco(), t1), null);
  executar(pergunta(), { ...t1, turnoAtual: noTurno('t2') });
  executar(pergunta({ transcript_path: undefined }), t1);
  executar(laco({ transcript_path: undefined }), t1);
  assert.equal(escaladas().length, 0);
});

test('config da escalada é conferida', () => {
  const c = cfg({ modo: 'desligar', aviso: 'x' }).config;
  const erros = validarEsquema(c);
  assert.ok(erros.some((e) => /escalada.modo/.test(e)));
  assert.ok(erros.some((e) => /escalada.aviso/.test(e)));
});
