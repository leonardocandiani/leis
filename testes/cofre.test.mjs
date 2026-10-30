import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noCofre } from '../scripts/cofre.mjs';

const vault = { fingerprints: () => ({ salt: 's', list: [{ fp: 'h:valor-guardado' }] }), fingerprint: (sal, v) => `h:${v}` };

test('valor guardado no cofre é reconhecido pela impressão digital, e o outro não', () => {
  assert.equal(noCofre('valor-guardado', { vault }), true);
  assert.equal(noCofre('outro-valor', { vault }), false);
});

test('sem keyfence ou com erro, a resposta é não (nunca pausa)', () => {
  assert.equal(noCofre('x', { vault: { fingerprints: () => { throw new Error('sem cofre'); } } }), false);
  assert.equal(noCofre('x', { vault: { fingerprints: () => ({ salt: '', list: [] }), fingerprint: () => 'h' } }), false);
});
