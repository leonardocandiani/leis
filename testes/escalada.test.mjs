import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executar } from '../scripts/fiscal-acao.mjs';
import { validarEsquema } from '../scripts/leis.mjs';
import { lerEstado, atualizarEstado } from '../scripts/estado.mjs';
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
  assert.match(saida.stopReason, /S\.I\.M\. \(.*e J\.Á\. \(.*próxima mensagem do dono retoma/);
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

test('o aviso diz a sessão pausada e o que cada quebra fez', () => {
  const raiz = process.env.HOME;
  const transcript = join(raiz, 'sessao.jsonl');
  writeFileSync(transcript, [
    JSON.stringify({ type: 'custom-title', customTitle: 'Antiga', sessionId: 's1' }),
    JSON.stringify({ type: 'user', message: 'x' }),
    JSON.stringify({ type: 'custom-title', customTitle: 'Sessão Sintética', sessionId: 's1' }),
    JSON.stringify({ type: 'custom-title', customTitle: 'Outra', sessionId: 's2' }),
    '',
  ].join('\n'));
  const avisos = [];
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: (_c, m) => avisos.push(m) };
  executar(pergunta({ transcript_path: transcript }), deps);
  const saida = executar(laco({ transcript_path: transcript }), deps);
  const esperada = /Dupla quebra no mesmo turno na sessão "Sessão Sintética" \(projeto [^)]+\): S\.I\.M\. \([^:)]+: .+\) e J\.Á\. \(laco_com_sleep: while true; do sleep 5; done\); a sessão foi pausada\./;
  assert.match(avisos[0], esperada);
  assert.match(saida.stopReason, esperada);
});

test('sem nome no transcript, a sessão é identificada pelos 8 primeiros caracteres do id', () => {
  const avisos = [];
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: (_c, m) => avisos.push(m) };
  executar(pergunta({ session_id: 'abcdef1234567890' }), deps);
  executar(laco({ session_id: 'abcdef1234567890' }), deps);
  assert.match(avisos[0], /na sessão "abcdef12"/);
});

test('o trecho de cada quebra é mascarado e cortado em cerca de 80 caracteres', () => {
  const avisos = [];
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: (_c, m) => avisos.push(m) };
  executar(pergunta(), deps);
  executar(laco({ tool_input: { command: `while true; do sleep 5; echo contato@exemplo.com ${'x'.repeat(200)}; done` } }), deps);
  assert.doesNotMatch(avisos[0], /contato@exemplo\.com/);
  assert.ok(avisos[0].length < 400);
});

test('o estado do turno guarda o trecho já mascarado e cortado', () => {
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: () => {} };
  executar(laco({ tool_input: { command: `while true; do sleep 5; echo contato@exemplo.com ${'x'.repeat(5000)}; done` } }), deps);
  const gravado = JSON.stringify(lerEstado('s1').quebras_turno);
  assert.doesNotMatch(gravado, /contato@exemplo\.com/);
  assert.ok(gravado.length < 400);
});

test('estado do formato antigo (só siglas) no mesmo turno ainda escala', () => {
  atualizarEstado('s1', { quebras_turno: { turno: 't1', leis: ['S.I.M.'] } });
  const avisos = [];
  const deps = { config: cfg({ modo: 'pausar', aviso: ['avisar', '{mensagem}'] }), turnoAtual: noTurno('t1'), avisar: (_c, m) => avisos.push(m) };
  const saida = executar(laco(), deps);
  assert.equal(saida.continue, false);
  assert.match(avisos[0], /S\.I\.M\. \(sem_sinal: \) e J\.Á\./);
});
