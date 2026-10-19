import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig, leisCitadas, modoDaLei, validarEsquema, resumoSessao } from '../scripts/leis.mjs';
import { isolar, restaurar, modelo, escreverConfig } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

test('o modelo padrão passa no esquema', () => {
  assert.deepEqual(validarEsquema(modelo()), []);
});

test('o esquema reprova sigla sem pontos, número repetido, modo e chave de modo inválidos', () => {
  const c = modelo();
  c.leis[0].sigla = 'TOP';
  c.leis[1].numero = 1;
  c.modos = { 1: 'talvez', 9: 'observar' };
  const erros = validarEsquema(c).join('\n');
  assert.match(erros, /sigla "TOP"/);
  assert.match(erros, /numero 1 repetido/);
  assert.match(erros, /modos\.1 deve ser/);
  assert.match(erros, /modos\.9 não corresponde/);
});

test('o esquema reprova campo de texto vazio e config que não é objeto', () => {
  const c = modelo();
  c.leis[2].teste = '  ';
  assert.match(validarEsquema(c).join(), /leis\[2\]\.teste ausente/);
  assert.deepEqual(validarEsquema([]), ['a config deve ser um objeto']);
  assert.match(validarEsquema({ versao: 1, dono: 'x', leis: [] }).join(), /ao menos uma lei/);
});

test('sem leis.json usa o modelo e avisa', () => {
  const r = carregarConfig();
  assert.equal(r.origem, 'modelo');
  assert.match(r.aviso, /\/leis:leis-implantar/);
});

test('leis.json válido do usuário vale, e o inválido cai no modelo com aviso', () => {
  const c = modelo();
  c.dono = 'Ana';
  escreverConfig(c);
  assert.equal(carregarConfig().config.dono, 'Ana');
  c.leis[0].regra = '';
  escreverConfig(c);
  const r = carregarConfig();
  assert.equal(r.origem, 'modelo');
  assert.match(r.aviso, /inválida/);
});

test('leisCitadas acha por sigla, número, apelido e ignora palavra comum', () => {
  const { config } = carregarConfig();
  const siglas = (t) => leisCitadas(config, t).map((l) => l.sigla);
  assert.deepEqual(siglas('você infringiu a J.A. de novo'), ['J.Á.']);
  assert.deepEqual(siglas('isso quebra a L3'), ['T.R.O.C.A.']);
  assert.deepEqual(siglas('lei 5, bro'), ['S.I.M.']);
  config.leis[0].apelidos = ['P1'];
  assert.deepEqual(siglas('a P1 mandou'), ['T.O.P.']);
  assert.deepEqual(siglas('a P10 mandou'), []);
  assert.deepEqual(siglas('o top da lista de tarefas, sim, lei de Murphy'), []);
});

test('modoDaLei é observar por padrão e bloquear só quando configurado', () => {
  const { config } = carregarConfig();
  assert.equal(modoDaLei(config, 1), 'observar');
  config.modos['1'] = 'bloquear';
  assert.equal(modoDaLei(config, 1), 'bloquear');
  assert.equal(modoDaLei({ ...config, modos: undefined }, 1), 'observar');
});

test('resumoSessao traz as seis siglas e o aviso', () => {
  const { config } = carregarConfig();
  const r = resumoSessao(config, 'aviso x');
  for (const l of config.leis) assert.ok(r.includes(l.sigla));
  assert.ok(r.endsWith('[aviso x]'));
});

test('o esquema valida papel e jev.arquivos_chave', () => {
  const c = modelo();
  c.leis[1].papel = c.leis[0].papel;
  c.jev = { arquivos_chave: [1] };
  const erros = validarEsquema(c).join('\n');
  assert.match(erros, /papel "pronto" repetido/);
  assert.match(erros, /jev\.arquivos_chave/);
  const sem = modelo();
  delete sem.leis[2].papel;
  delete sem.jev;
  assert.deepEqual(validarEsquema(sem), []);
});
