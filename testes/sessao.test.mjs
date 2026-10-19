import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executar } from '../scripts/sessao.mjs';
import { configCom } from './ajuda.mjs';

test('o início da sessão injeta uma linha com as seis siglas e os testes', () => {
  const saida = executar({}, { config: configCom({}) });
  const texto = saida.hookSpecificOutput.additionalContext;
  assert.equal(saida.hookSpecificOutput.hookEventName, 'SessionStart');
  for (const s of ['T.O.P.', 'J.Á.', 'T.R.O.C.A.', 'L.I.D.A.', 'S.I.M.', 'A.V.A.L.']) assert.ok(texto.includes(s), s);
  assert.ok(!texto.includes('\n'));
});

test('o aviso de config ausente entra na linha', () => {
  const texto = executar({}, { config: { ...configCom({}), aviso: 'sem config' } }).hookSpecificOutput.additionalContext;
  assert.match(texto, /\[sem config\]/);
});
