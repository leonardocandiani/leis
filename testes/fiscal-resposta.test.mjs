import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { executar, regraBarata } from '../scripts/fiscal-resposta.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolar, restaurar, configCom, jevFalso, jevProibido, registro } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
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

test('regra barata acha oferta e espera de aval sem ponto de interrogação', () => {
  assert.equal(regraBarata('Corrigi o bug do login. Se quiser, eu já subo o deploy também.'), 'oferta');
  assert.equal(regraBarata('O PR está pronto. Aguardo seu ok para mergear.'), 'oferta');
  assert.equal(regraBarata('Tudo pronto, é só me falar que eu publico.'), 'oferta');
  assert.notEqual(regraBarata('Me avisa se prefere a versão curta.'), null);
  assert.equal(regraBarata('Se quiser revisar depois, o diff está no PR #12. Mergeei com CI verde.'), null);
  assert.equal(regraBarata('Aguardo o CI terminar e mergeio sozinho.'), null);
});

test('resposta sem sinal da regra barata nunca chama o JEV nem registra', async () => {
  assert.equal(await executar(stop('Pronto. Os 14 testes passam.'), { config: configCom({}), jev: jevProibido }), null);
  assert.equal(registro().length, 0);
});

test('quebra confirmada devolve block mesmo com a lei em observar: a sessão se corrige no mesmo turno', async () => {
  const jev = jevFalso('quebra', 'top');
  const saida = await executar(stop('Feito. Quer que eu siga com o deploy?'), { config: configCom({}), jev });
  assert.equal(saida.decision, 'block');
  assert.match(saida.reason, /Lei 1 \(T\.O\.P\.\)/);
  assert.match(saida.reason, /Corrija agora, neste turno/);
  assert.doesNotMatch(saida.reason, /memória/);
  const [ev] = registro();
  assert.deepEqual([ev.hook, ev.lei, ev.decisao, ev.natureza], ['fiscal-resposta', 'T.O.P.', 'bloqueada', 'acao']);
  assert.equal(typeof ev.duracao_ms, 'number');
});

test('reincidência no mesmo projeto manda gravar o aprendizado, citando a lei de troca', async () => {
  const jev = jevFalso('quebra', 'top');
  await executar(stop('Quer que eu siga?', { session_id: 'a' }), { config: configCom({}), jev });
  const saida = await executar(stop('Posso seguir?', { session_id: 'b' }), { config: configCom({}), jev });
  assert.equal(saida.decision, 'block');
  assert.match(saida.reason, /2ª quebra desta lei neste projeto/);
  assert.match(saida.reason, /T\.R\.O\.C\.A\./);
  const outro = await executar(stop('Posso seguir?', { session_id: 'c', cwd: '/x/outro' }), { config: configCom({}), jev });
  assert.doesNotMatch(outro.reason, /quebra desta lei neste projeto/);
});

test('reincidência no mesmo turno: bloqueia três vezes, apertando a instrução, e depois respeita o teto', async () => {
  const config = configCom({});
  const jev = jevFalso('quebra', 'top');
  const texto = 'Pronto. Posso seguir com o deploy?';
  const primeira = await executar(stop(texto), { config, jev });
  assert.equal(primeira.decision, 'block');
  assert.doesNotMatch(primeira.reason, /volta seguida/);
  const segunda = await executar(stop(texto, { stop_hook_active: true }), { config, jev });
  assert.equal(segunda.decision, 'block');
  assert.match(segunda.reason, /2ª volta seguida neste turno/);
  const terceira = await executar(stop(texto, { stop_hook_active: true }), { config, jev });
  assert.match(terceira.reason, /3ª volta seguida/);
  const quarta = await executar(stop(texto, { stop_hook_active: true }), { config, jev });
  assert.equal(quarta.decision, undefined);
  assert.match(quarta.systemMessage, /\[leis\]/);
  assert.deepEqual(registro().map((e) => e.decisao), ['bloqueada', 'bloqueada', 'bloqueada', 'teto']);
});

test('turno novo zera o teto', async () => {
  const config = configCom({ 5: 'bloquear' });
  const jev = jevFalso('quebra', 'sim');
  const texto = 'Quer que eu pergunte de novo?';
  assert.equal((await executar(stop(texto), { config, jev })).decision, 'block');
  for (let i = 0; i < 3; i++) await executar(stop(texto, { stop_hook_active: true }), { config, jev });
  assert.equal(registro().at(-1).decisao, 'teto');
  assert.equal((await executar(stop(texto, { stop_hook_active: false }), { config, jev })).decision, 'block');
});

test('stop_hook_active sem contagem em disco conta como uma volta: ainda bloqueia', async () => {
  const saida = await executar(stop('Posso seguir?', { stop_hook_active: true }), { config: configCom({}), jev: jevFalso('quebra', 'top') });
  assert.equal(saida.decision, 'block');
  assert.match(saida.reason, /2ª volta seguida/);
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

test('estado em disco que não grava não vira laço: stop_hook_active segura em uma volta extra', async () => {
  const arquivo = join(raiz, 'arquivo-comum');
  writeFileSync(arquivo, 'x');
  process.env.LEIS_HOME = join(arquivo, 'impossivel');
  const config = configCom({ 1: 'bloquear' });
  const saida = await executar(stop('Posso seguir?', { stop_hook_active: true }), { config, jev: jevFalso('quebra', 'top') });
  assert.equal(saida.decision, undefined);
});

test('projeto com parada própria: sai sem fazer nada', async () => {
  mkdirSync(join(raiz, 'p', 'scripts', 'central', 'hooks'), { recursive: true });
  writeFileSync(join(raiz, 'p', 'scripts', 'central', 'hooks', 'parada.ts'), '');
  process.env.CLAUDE_PROJECT_DIR = join(raiz, 'p');
  assert.equal(await executar(stop('Posso seguir?'), { config: configCom({ 1: 'bloquear' }), jev: jevProibido }), null);
});

test('config renumerada: o fiscal da resposta acha T.O.P. pelo papel', async () => {
  const c = configCom({});
  c.config.leis.reverse().forEach((l, i) => { l.numero = i + 1; });
  c.config.modos = { 6: 'bloquear' };
  const saida = await executar(stop('Posso seguir?'), { config: c, jev: jevFalso('quebra', 'top') });
  assert.equal(saida.decision, 'block');
  assert.match(saida.reason, /T\.O\.P\./);
});

test('sem lei de papel pronto ou sim: não fiscaliza e não chama o JEV', async () => {
  const c = configCom({});
  for (const l of c.config.leis) delete l.papel;
  assert.equal(await executar(stop('Posso seguir?'), { config: c, jev: jevProibido }), null);
});

test('o teto grava a pendência para o próximo prompt; o bloqueio não', async () => {
  const { lerEstado } = await import('../scripts/estado.mjs');
  for (let i = 0; i < 3; i++) await executar(stop('Posso seguir?', { session_id: 'p1', stop_hook_active: true }), { config: configCom({}), jev: jevFalso('quebra', 'top') });
  assert.equal(lerEstado('p1').pendente, 1);
  await executar(stop('Posso seguir?', { session_id: 'p2' }), { config: configCom({}), jev: jevFalso('quebra', 'top') });
  assert.equal(lerEstado('p2').pendente ?? null, null);
});
