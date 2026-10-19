import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executar } from '../scripts/relato.mjs';
import { isolar, restaurar, configCom, jevFalso, jevProibido, registro } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

const prompt = (texto) => ({ prompt: texto, session_id: 's1', cwd: '/x/projeto-a' });
const contexto = (saida) => saida?.hookSpecificOutput?.additionalContext;

test('prompt sem sinal de correção sai sem rede e sem registro', async () => {
  for (const texto of ['oi, tudo bem?', 'cria o arquivo README com a instalação', 'o top de linha é o modelo B']) {
    assert.equal(await executar(prompt(texto), { config: configCom({}), jev: jevProibido }), null);
  }
  assert.equal(registro().length, 0);
});

test('citação explícita de uma lei resolve sem JEV e injeta a correção', async () => {
  const saida = await executar(prompt('você infringiu a Lei 2 de novo'), { config: configCom({}), jev: jevProibido });
  assert.match(contexto(saida), /Você quebrou a Lei 2 \(J\.Á\.\): .*Corrija o padrão, não só esta resposta\./);
  const [ev] = registro();
  assert.equal(ev.natureza, 'relato');
  assert.equal(ev.decisao, 'citada');
  assert.equal(ev.lei, 'J.Á.');
  assert.equal(ev.projeto, 'projeto-a');
});

test('correção sem lei citada pergunta ao JEV e usa a lei escolhida', async () => {
  const jev = jevFalso('lei', 'lei_5');
  const saida = await executar(prompt('já te falei isso, de novo me pergunta o mesmo'), { config: configCom({}), jev });
  assert.match(contexto(saida), /Lei 5 \(S\.I\.M\.\)/);
  assert.equal(jev.chamadas.length, 1);
  assert.ok(Object.keys(jev.chamadas[0].perguntas.lei.criteria).includes('nenhuma'));
  assert.equal(registro()[0].decisao, 'jev');
});

test('JEV responde nenhuma ou com confiança baixa: não injeta nada', async () => {
  assert.equal(await executar(prompt('tenta de novo'), { config: configCom({}), jev: jevFalso('lei', 'nenhuma') }), null);
  assert.equal(await executar(prompt('tenta de novo'), { config: configCom({}), jev: jevFalso('lei', 'lei_1', 0.2) }), null);
  assert.deepEqual(registro().map((e) => e.decisao), ['sem_lei', 'sem_lei']);
});

test('JEV fora do ar registra e injeta o aviso genérico (fail-open)', async () => {
  const saida = await executar(prompt('já te falei'), { config: configCom({}), jev: jevFalso('lei', null) });
  assert.match(contexto(saida), /apontou que você quebrou uma lei/);
  assert.equal(registro()[0].decisao, 'jev_indisponivel');
});

test('o trecho registrado sai mascarado', async () => {
  await executar(prompt('quebrou a L1, token=abcdef1234567890 de novo'), { config: configCom({}), jev: jevProibido });
  assert.doesNotMatch(registro()[0].trecho, /abcdef1234567890/);
});
