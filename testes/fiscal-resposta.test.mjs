import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executar, regraBarata } from '../scripts/fiscal-resposta.mjs';
import { isolar, restaurar, configCom, jevFalso, jevProibido, registro } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

const stop = (texto, extra = {}) => ({ session_id: 's1', cwd: '/x/p', last_assistant_message: texto, ...extra });

test('regra barata acha pergunta final e cardápio, e deixa passar resposta normal', () => {
  assert.equal(regraBarata('Feito. Quer que eu continue com o outro módulo?'), 'cardapio');
  assert.equal(regraBarata('Posso seguir com a migração?'), 'cardapio');
  assert.equal(regraBarata('Opção A: refatorar. Opção B: reescrever.'), 'cardapio');
  assert.equal(regraBarata('Terminei o ajuste.\n\nQual o nome da empresa?'), 'pergunta_final');
  assert.equal(regraBarata('Pronto, 14 testes passam. O PR é o #12.'), null);
  assert.equal(regraBarata('Por que isso importa? Porque o teste falhava.\nResolvi e rodei de novo.'), null);
  assert.equal(regraBarata(''), null);
});

test('resposta sem sinal da regra barata nunca chama o JEV nem registra', async () => {
  assert.equal(await executar(stop('Pronto. Os 14 testes passam.'), { config: configCom({}), jev: jevProibido }), null);
  assert.equal(registro().length, 0);
});

test('modo observar: quebra vira aviso e registro, sem bloquear', async () => {
  const jev = jevFalso('quebra', 'top');
  const saida = await executar(stop('Feito. Quer que eu siga com o deploy?'), { config: configCom({}), jev });
  assert.equal(saida.decision, undefined);
  assert.match(saida.systemMessage, /Lei 1 \(T\.O\.P\.\)/);
  const [ev] = registro();
  assert.deepEqual([ev.hook, ev.lei, ev.decisao, ev.natureza], ['fiscal-resposta', 'T.O.P.', 'observada', 'acao']);
  assert.equal(typeof ev.duracao_ms, 'number');
});

test('modo bloquear: bloqueia uma vez e depois respeita o teto na mesma sessão', async () => {
  const config = configCom({ 1: 'bloquear' });
  const jev = jevFalso('quebra', 'top');
  const texto = 'Pronto. Posso seguir com o deploy?';
  const primeira = await executar(stop(texto), { config, jev });
  assert.equal(primeira.decision, 'block');
  assert.match(primeira.reason, /T\.O\.P\./);
  const segunda = await executar(stop(texto, { stop_hook_active: true }), { config, jev });
  assert.equal(segunda.decision, undefined);
  assert.deepEqual(registro().map((e) => e.decisao), ['bloqueada', 'teto']);
});

test('turno novo zera o teto', async () => {
  const config = configCom({ 5: 'bloquear' });
  const jev = jevFalso('quebra', 'sim');
  const texto = 'Quer que eu pergunte de novo?';
  assert.equal((await executar(stop(texto), { config, jev })).decision, 'block');
  assert.equal((await executar(stop(texto, { stop_hook_active: true }), { config, jev })).decision, undefined);
  assert.equal((await executar(stop(texto, { stop_hook_active: false }), { config, jev })).decision, 'block');
});

test('lei em modo observar não bloqueia mesmo com outra em bloquear', async () => {
  const saida = await executar(stop('Posso seguir?'), { config: configCom({ 5: 'bloquear' }), jev: jevFalso('quebra', 'top') });
  assert.equal(saida.decision, undefined);
});

test('JEV indisponível passa e registra', async () => {
  const saida = await executar(stop('Quer que eu siga?'), { config: configCom({ 1: 'bloquear' }), jev: jevFalso('quebra', null) });
  assert.equal(saida, null);
  assert.equal(registro()[0].decisao, 'jev_indisponivel');
});

test('JEV diz nenhuma ou confiança baixa: passa e registra passou', async () => {
  assert.equal(await executar(stop('Qual o CNPJ da empresa?'), { config: configCom({}), jev: jevFalso('quebra', 'nenhuma') }), null);
  assert.equal(await executar(stop('Quer que eu siga?'), { config: configCom({}), jev: jevFalso('quebra', 'top', 0.3) }), null);
  assert.deepEqual(registro().map((e) => e.decisao), ['passou', 'passou']);
});
