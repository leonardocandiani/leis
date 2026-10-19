import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caudaDaConversa, mensagensDoTranscript, montarEstado, projetoDe, textoDe, ultimaRespostaDaSessao } from '../scripts/contexto.mjs';
import { isolar, restaurar, modelo } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const linha = (type, content, extra = {}) => JSON.stringify({ type, message: { content }, ...extra });
function transcript(linhas) {
  const caminho = join(raiz, 't.jsonl');
  writeFileSync(caminho, `${linhas.join('\n')}\n`);
  return caminho;
}

test('textoDe junta só blocos de texto', () => {
  assert.equal(textoDe([{ type: 'text', text: 'a' }, { type: 'tool_use', name: 'x' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(textoDe('puro'), 'puro');
  assert.equal(textoDe(undefined), '');
});

test('mensagens ignoram tool_result, meta e subagente, e mantêm a ordem', () => {
  const c = transcript([
    linha('user', 'faça X'),
    linha('assistant', [{ type: 'text', text: 'feito X' }, { type: 'tool_use', name: 'Bash' }]),
    linha('user', [{ type: 'tool_result', content: 'saída' }]),
    linha('user', 'lembrete', { isMeta: true }),
    linha('assistant', [{ type: 'text', text: 'do subagente' }], { isSidechain: true }),
    linha('assistant', [{ type: 'text', text: 'resposta final?' }]),
  ]);
  assert.deepEqual(mensagensDoTranscript(c).map((m) => `${m.papel}:${m.texto}`), ['dono:faça X', 'sessao:feito X', 'sessao:resposta final?']);
  assert.equal(ultimaRespostaDaSessao(c), 'resposta final?');
});

test('lê só o final de arquivo grande e descarta a linha cortada', () => {
  const lixo = linha('user', 'x'.repeat(2000));
  const c = transcript([...Array(300).fill(lixo), linha('user', 'pedido recente'), linha('assistant', [{ type: 'text', text: 'ok' }])]);
  const m = mensagensDoTranscript(c, 4096);
  assert.ok(m.length < 10);
  assert.deepEqual(m.slice(-2).map((x) => x.texto), ['pedido recente', 'ok']);
});

test('a cauda respeita o limite e mascara segredo', () => {
  const c = transcript([linha('user', 'a'.repeat(3000)), linha('assistant', [{ type: 'text', text: 'b'.repeat(3000) }]), linha('user', 'minha senha: password=segredo12345')]);
  const cauda = caudaDaConversa(c, 4096);
  const total = cauda.reduce((s, m) => s + m.texto.length, 0);
  assert.ok(total <= 4096 + 1500);
  assert.doesNotMatch(JSON.stringify(cauda), /segredo12345/);
  assert.equal(cauda.at(-1).papel, 'dono');
});

test('transcript ausente vira lista vazia, sem lançar', () => {
  assert.deepEqual(mensagensDoTranscript(join(raiz, 'nao-existe.jsonl')), []);
  assert.equal(ultimaRespostaDaSessao(join(raiz, 'nao-existe.jsonl')), '');
});

test('projetoDe devolve o nome da pasta e remove credencial do remote', () => {
  assert.equal(projetoDe('/x/y/meu-projeto').nome, 'meu-projeto');
  assert.equal(projetoDe('/x/y/meu-projeto').remote, undefined);
});

test('montarEstado leva as leis (sigla, regra, teste), o projeto e a conversa', () => {
  const c = transcript([linha('user', 'oi')]);
  const e = montarEstado({ entrada: { cwd: raiz, transcript_path: c }, leis: modelo().leis, extra: { fala: 'x' } });
  assert.equal(e.leis.length, 6);
  assert.deepEqual(Object.keys(e.leis[0]), ['sigla', 'regra', 'teste']);
  assert.equal(e.conversa[0].texto, 'oi');
  assert.equal(e.fala, 'x');
});
