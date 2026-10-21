import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ehFalaDoDono, lerAceites, padraoDaCategoria, registrarAceite } from '../scripts/aceite.mjs';
import { executar as stop } from '../scripts/fiscal-resposta.mjs';
import { executar as relato } from '../scripts/relato.mjs';
import { lerEstado } from '../scripts/estado.mjs';
import { isolar, restaurar, configCom, jevProibido, registro } from './ajuda.mjs';

beforeEach(isolar);
afterEach(restaurar);

const config = () => configCom({});
const historico = (categoria, respostas) => respostas.forEach((resposta) => registrarAceite({ categoria, resposta, sessao: 'antiga' }));
const vezes = (n, r) => Array(n).fill(r);

// JEV falso que responde várias perguntas de uma vez: { quebra: 'nenhuma', categoria: 'tecnica' }.
const jevCom = (escolhas) => async () => Object.fromEntries(Object.entries(escolhas).map(([id, choice]) => [id, { type: 'choice', choice, confidence: 0.9 }]));
const fim = (texto, extra = {}) => ({ session_id: 's1', cwd: '/x/p', last_assistant_message: texto, ...extra });
const fala = (prompt, extra = {}) => ({ session_id: 's1', cwd: '/x/p', prompt, ...extra });

test('padrão da categoria: aprendendo, sempre aceita, mantém perguntando, misto e janela recente', () => {
  const c = config().config;
  historico('tecnica', vezes(4, 'aceitou'));
  assert.equal(padraoDaCategoria(c, 'tecnica').padrao, 'aprendendo');
  historico('tecnica', ['aceitou']);
  assert.equal(padraoDaCategoria(c, 'tecnica').padrao, 'sempre_aceita');
  historico('design', [...vezes(3, 'recusou'), ...vezes(2, 'ajustou'), 'aceitou']);
  assert.equal(padraoDaCategoria(c, 'design').padrao, 'mantem_perguntando');
  historico('conteudo', [...vezes(4, 'aceitou'), ...vezes(2, 'ajustou')]);
  assert.equal(padraoDaCategoria(c, 'conteudo').padrao, 'misto');
  // Dez aceites antigos não seguram a categoria quando as últimas dez viram recusa.
  historico('comercial', [...vezes(10, 'aceitou'), ...vezes(10, 'recusou')]);
  assert.equal(padraoDaCategoria(c, 'comercial').padrao, 'mantem_perguntando');
});

test('categoria reservada nunca vira sempre aceita, mesmo com todos os aceites', () => {
  historico('pagamento', vezes(10, 'aceitou'));
  const p = padraoDaCategoria(config().config, 'pagamento');
  assert.equal(p.padrao, 'reservada');
  assert.equal(p.aceitas, 10);
});

test('aceites.jsonl guarda só categoria, resposta, sessão e projeto, nunca o texto', () => {
  assert.equal(registrarAceite({ categoria: 'tecnica', resposta: 'aceitou', sessao: 's', projeto: 'p', trecho: 'segredo' }), true);
  assert.equal(registrarAceite({ categoria: 'tecnica', resposta: 'outra' }), false);
  const linha = readFileSync(join(process.env.LEIS_HOME, 'aceites.jsonl'), 'utf8');
  assert.doesNotMatch(linha, /segredo/);
  assert.deepEqual(Object.keys(lerAceites()[0]).sort(), ['categoria', 'projeto', 'resposta', 'sessao', 'ts']);
});

test('só a fala do dono ensina: mensagem de sessão, aviso de tarefa e lembrete do sistema ficam fora', () => {
  assert.equal(ehFalaDoDono('pode seguir'), true);
  assert.equal(ehFalaDoDono('<cross-session-message from="CENTRAL">faz</cross-session-message>'), false);
  assert.equal(ehFalaDoDono('<task-notification>\n<task-id>x</task-id>'), false);
  assert.equal(ehFalaDoDono('<command-name>/leis</command-name>'), false);
  assert.equal(ehFalaDoDono('[SYSTEM NOTIFICATION] algo'), false);
  assert.equal(ehFalaDoDono('   '), false);
});

test('pergunta que chega ao dono fica aberta e a resposta dele vira aceite', async () => {
  const c = config();
  assert.equal(await stop(fim('Ajustei o teste. Quer que eu suba o deploy?'), { config: c, jev: jevCom({ quebra: 'nenhuma', categoria: 'tecnica' }) }), null);
  assert.equal(lerEstado('s1').pergunta_aberta.categoria, 'tecnica');
  // Aviso de tarefa no meio não consome a pergunta.
  await relato(fala('<task-notification>ok</task-notification>'), { config: c, jev: jevProibido });
  assert.equal(lerEstado('s1').pergunta_aberta.categoria, 'tecnica');
  await relato(fala('manda ver'), { config: c, jev: jevCom({ resposta: 'aceitou' }) });
  assert.deepEqual(lerAceites().map((a) => [a.categoria, a.resposta]), [['tecnica', 'aceitou']]);
  assert.equal(lerEstado('s1').pergunta_aberta, undefined);
});

test('categoria que o dono sempre aceita: perguntar quebra a S.I.M. mesmo com o JEV dizendo nenhuma', async () => {
  historico('tecnica', vezes(6, 'aceitou'));
  const saida = await stop(fim('Teste verde. Posso seguir com o merge?'), { config: config(), jev: jevCom({ quebra: 'nenhuma', categoria: 'tecnica' }) });
  assert.equal(saida.decision, 'block');
  assert.match(saida.reason, /S\.I\.M\..*aceitou 6 dos últimos 6 pedidos desta categoria \(tecnica\): faça e avise/);
  const [e] = registro().filter((x) => x.hook === 'fiscal-resposta');
  assert.equal(e.lei, 'S.I.M.');
  assert.equal(e.sinal, 'aceite_sempre');
});

test('categoria que o dono recusa mantém a pergunta, mesmo com o JEV apontando quebra', async () => {
  historico('design', vezes(6, 'recusou'));
  const saida = await stop(fim('Fiz o layout. Prefere a versão escura ou a clara?'), { config: config(), jev: jevCom({ quebra: 'top', categoria: 'design' }) });
  assert.equal(saida, null);
  assert.match(registro()[0].sinal, /mantem_perguntando/);
});

test('categoria recusada não libera a pergunta repetida (S.I.M.)', async () => {
  historico('design', vezes(6, 'recusou'));
  const saida = await stop(fim('Já te perguntei: prefere escuro ou claro?'), { config: config(), jev: jevCom({ quebra: 'sim', categoria: 'design' }) });
  assert.equal(saida.decision, 'block');
});

test('aceite com mínimo acima da janela reprova a config', async () => {
  const { validarEsquema } = await import('../scripts/leis.mjs');
  const c = config().config;
  c.aceite = { janela: 5, minimo: 10 };
  assert.ok(validarEsquema(c).some((e) => /aceite.minimo não pode passar/.test(e)));
  c.aceite = { minimo: 3 };
  assert.ok(!validarEsquema(c).some((e) => /aceite/.test(e)));
});

test('reservada e sem histórico seguem o veredito do JEV', async () => {
  historico('pagamento', vezes(10, 'aceitou'));
  assert.equal(await stop(fim('O boleto está pronto. Posso pagar?'), { config: config(), jev: jevCom({ quebra: 'nenhuma', categoria: 'pagamento' }) }), null);
  const saida = await stop(fim('Fiz o post. Quer que eu publique?', { session_id: 's2' }), { config: config(), jev: jevCom({ quebra: 'top', categoria: 'conteudo' }) });
  assert.equal(saida.decision, 'block');
});
