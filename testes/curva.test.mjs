import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curva } from '../scripts/curva.mjs';
import { curvaParaToon, paraToon } from '../scripts/validar.mjs';

const H = 3600 * 1000;
const T0 = Date.parse('2026-10-01T00:00:00Z');
const ev = (horas, extra = {}) => ({ ts: new Date(T0 + horas * H).toISOString(), sessao: 's', hook: 'fiscal-resposta', decisao: 'passou', versao: '0.2.3', ...extra });
const quebra = (horas, extra = {}) => ev(horas, { lei: 'T.O.P.', decisao: 'bloqueada', ...extra });

test('sem registro a curva não existe e o validar diz isso em vez de linha vazia', () => {
  assert.equal(curva([]), null);
  assert.match(curvaParaToon(null), /sem registro ainda/);
});

test('hora a hora nas primeiras 24 h, depois dia a dia, contando a mesma quebra repetida uma vez só', () => {
  const eventos = [ev(0), quebra(0.1), quebra(0.2), quebra(1.5, { sessao: 'b' }), quebra(30), ev(49)];
  const c = curva(eventos, T0 + 50 * H);
  const horas = c.linhas.filter((l) => l.janela.endsWith('h'));
  assert.equal(horas.length, 24);
  assert.equal(horas[0].quebras, 1, 'duas quebras da mesma lei e sessão em 6 min contam uma');
  assert.equal(horas[1].quebras, 1);
  const dias = c.linhas.filter((l) => !l.janela.endsWith('h'));
  assert.deepEqual(dias.map((d) => d.janela), ['2026-10-02', '2026-10-03']);
  assert.equal(dias[0].quebras, 1);
  assert.equal(c.total, 3);
});

test('decisão que não é quebra (passou, liberada, citada) fica fora da contagem', () => {
  const c = curva([ev(0), ev(1, { lei: 'S.I.M.', decisao: 'passou' }), ev(2, { hook: 'relato', lei: 'J.Á.', decisao: 'citada' })], T0 + 3 * H);
  assert.equal(c.total, 0);
});

test('tendência compara as últimas 24 h com a taxa de antes, e marca a troca de versão', () => {
  const antes = Array.from({ length: 24 }, (_, i) => quebra(i * 2, { sessao: `s${i}` }));
  const depois = [quebra(50, { versao: '0.3.0' }), ev(60, { versao: '0.3.0' })];
  const c = curva([...antes, ...depois], T0 + 72 * H);
  assert.equal(c.tendencia, 'caindo');
  assert.equal(c.ultimas24, 1);
  const troca = c.linhas.find((l) => l.troca === 'sim');
  assert.equal(troca.versao, '0.3.0');
  assert.equal(curva(antes, T0 + 30 * H).tendencia, 'sem base (menos de 48 h)');
});

test('o TOON do validar traz a curva só quando ela é pedida', () => {
  const itens = [{ item: 'x', estado: 'ok', detalhe: 'y' }];
  assert.doesNotMatch(paraToon(itens), /curva/);
  const c = curva([ev(0), quebra(1)], T0 + 2 * H);
  assert.match(paraToon(itens, c), /curva: 1 quebras distintas .*tendência sem base[\s\S]*curva\[2\]\{janela,quebras,por_hora,versao,troca\}:/);
});
