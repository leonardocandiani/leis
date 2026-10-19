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

test('JEV fora do ar registra e, só com sinal forte de correção, injeta o aviso genérico (fail-open)', async () => {
  const saida = await executar(prompt('já te falei'), { config: configCom({}), jev: jevFalso('lei', null) });
  assert.match(contexto(saida), /apontou que você quebrou uma lei/);
  assert.equal(await executar(prompt('tenta de novo'), { config: configCom({}), jev: jevFalso('lei', null) }), null);
  assert.equal(await executar(prompt('explica a lei 4'), { config: configCom({}), jev: jevFalso('lei', null) }), null);
  assert.deepEqual(registro().map((e) => e.decisao), ['jev_indisponivel', 'jev_indisponivel', 'jev_indisponivel']);
});

test('citar a lei sem dizer que foi quebrada vai ao JEV e não injeta acusação', async () => {
  for (const texto of ['isso é L1, o usuário viu acontecer', 'explica a lei 4', 'aplica a T.O.P. neste texto', 'a lei 3 serve para o quê?']) {
    const jev = jevFalso('lei', 'nenhuma');
    assert.equal(await executar(prompt(texto), { config: configCom({}), jev }), null, texto);
    assert.equal(jev.chamadas.length, 1, texto);
  }
  assert.ok(registro().every((e) => e.decisao === 'sem_lei'));
});

test('o trecho registrado sai mascarado', async () => {
  await executar(prompt('quebrou a L1, token=abcdef1234567890 de novo'), { config: configCom({}), jev: jevProibido });
  assert.doesNotMatch(registro()[0].trecho, /abcdef1234567890/);
});

test('a pendência do fiscal da resposta é injetada no prompt seguinte, uma vez só', async () => {
  const { atualizarEstado, lerEstado } = await import('../scripts/estado.mjs');
  atualizarEstado('s1', { pendente: 5 });
  const primeira = await executar(prompt('cria o README'), { config: configCom({}), jev: jevProibido });
  assert.match(contexto(primeira), /^Na resposta anterior você quebrou a Lei 5 \(S\.I\.M\.\) e parou mesmo depois dos avisos: .*grave na memória.*só então siga\.$/);
  assert.equal(lerEstado('s1').pendente, undefined);
  assert.equal(await executar(prompt('agora o CSS'), { config: configCom({}), jev: jevProibido }), null);
});

test('pendência e correção do dono no mesmo prompt saem juntas', async () => {
  const { atualizarEstado } = await import('../scripts/estado.mjs');
  atualizarEstado('s1', { pendente: 1 });
  const texto = contexto(await executar(prompt('você infringiu a Lei 2'), { config: configCom({}), jev: jevProibido }));
  assert.match(texto, /Lei 1 \(T\.O\.P\.\)[\s\S]*\nVocê quebrou a Lei 2/);
});
