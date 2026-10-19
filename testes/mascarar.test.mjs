import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mascarar, trecho } from '../scripts/mascarar.mjs';

test('mascara Bearer, chave com prefixo, atribuição e string opaca longa', () => {
  const opaco = `a1${'b'.repeat(40)}9`;
  const saida = mascarar(`Authorization: Bearer abcdefgh12345678 sk-${'x'.repeat(20)} password=hunter2hunter ${opaco}`);
  assert.doesNotMatch(saida, /abcdefgh12345678|hunter2hunter|xxxxxxxxxx|bbbbbbbbbb/);
  assert.match(saida, /\[segredo\]/);
});

test('mascara e-mail e telefone brasileiro', () => {
  const saida = mascarar('fale com ana@exemplo.com.br ou (44) 99999-1234 ou +55 44 98888 7777');
  assert.equal(saida, 'fale com [email] ou [telefone] ou [telefone]');
});

test('não mascara data, caminho comprido nem palavra comum', () => {
  const t = 'em 2026-10-19 editei scripts/fiscal-resposta-observar-teste.mjs com 120 linhas';
  assert.equal(mascarar(t), t);
});

test('trecho limita a 200 caracteres e junta espaços', () => {
  const t = trecho(`linha um\n\n${'palavra '.repeat(80)}`);
  assert.ok(t.length <= 200);
  assert.ok(!t.includes('\n'));
  assert.ok(t.endsWith('…'));
});
