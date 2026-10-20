import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executar, extrairFontes, linhasCandidatas, termosDe, textoLivre } from '../scripts/fiscal-leitura.mjs';
import { executar as executarStop } from '../scripts/fiscal-resposta.mjs';
import { validarEsquema } from '../scripts/leis.mjs';
import { isolar, restaurar, configCom, jevFalso, jevProibido, registro } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const LEITURA = {
  saidas: ['\\bmeu-envio\\s+texto\\b'],
  leitores: ['\\bmeu-cli msgs\\s+[\'"]?{fonte}'],
  flags_de_destino: ['--para'],
  nomes: [],
  consultas: [],
  registro_de_fato: '\\bmeu-cli contexto add\\b',
};

function cfg(modo, leitura = {}) {
  const c = configCom({ 4: modo });
  c.config.leitura = { ...LEITURA, ...leitura };
  return c;
}

const quando = (minutosAtras) => new Date(Date.now() - minutosAtras * 60000).toISOString();
let contadorDeUso = 0;
// `res` descreve o tool_result que o transcript() grava logo depois: 'ok' (padrão), 'erro' (is_error) ou 'nenhum' (leitura em curso).
const uso = (nome, input, minutosAtras = 1, res = 'ok') => ({ type: 'assistant', timestamp: quando(minutosAtras), _res: res, message: { content: [{ type: 'tool_use', id: `tu${++contadorDeUso}`, name: nome, input }] } });
const prompt = (minutosAtras = 2) => ({ type: 'user', uuid: 'p1', timestamp: quando(minutosAtras), message: { content: 'faça isso' } });

function transcript(...linhas) {
  const caminho = join(raiz, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  const eventos = linhas.flatMap(({ _res, ...evento }) => {
    if (!_res || _res === 'nenhum') return [evento];
    const resultado = { type: 'tool_result', tool_use_id: evento.message.content[0].id, ...(_res === 'erro' ? { is_error: true } : {}) };
    return [evento, { type: 'user', timestamp: evento.timestamp, message: { content: [resultado] } }];
  });
  writeFileSync(caminho, `${eventos.map((l) => JSON.stringify(l)).join('\n')}\n`);
  return caminho;
}

function arquivoReal(nome = 'nota.md') {
  mkdirSync(join(raiz, 'docs'), { recursive: true });
  const caminho = join(raiz, 'docs', nome);
  writeFileSync(caminho, 'conteúdo');
  return caminho;
}

const enviar = (message, extra = {}) => ({ session_id: 's1', cwd: '/x/p', tool_name: 'SendMessage', tool_input: { message }, ...extra });
const bash = (command, extra = {}) => ({ session_id: 's1', cwd: '/x/p', tool_name: 'Bash', tool_input: { command }, ...extra });
const negou = (saida) => saida?.hookSpecificOutput?.permissionDecision === 'deny';

test('arquivo citado e nunca lido: nega em bloquear, só observa em observar', async () => {
  const arq = arquivoReal();
  const t = transcript(prompt(), uso('Read', { file_path: '/outro/arquivo.md' }));
  const saida = await executar(enviar(`siga o plano de ${arq}`, { transcript_path: t }), { config: cfg('bloquear') });
  assert.ok(negou(saida));
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /Lei 4 \(L\.I\.D\.A\.\)/);
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /Read /);
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /LIDO:/);
  assert.deepEqual([registro()[0].hook, registro()[0].decisao, registro()[0].natureza], ['fiscal-leitura', 'negada', 'acao']);

  const obs = await executar(enviar(`siga o plano de ${arq}`, { transcript_path: t }), { config: cfg('observar') });
  assert.equal(obs, null);
  assert.equal(registro().at(-1).decisao, 'observada');
});

test('arquivo lido há 10 min passa; leitura há 40 min não conta', async () => {
  const arq = arquivoReal();
  const recente = transcript(prompt(), uso('Read', { file_path: arq }, 10));
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: recente }), { config: cfg('bloquear') }), null);
  assert.equal(registro().length, 0);
  const velha = transcript(prompt(), uso('Read', { file_path: arq }, 40));
  assert.ok(negou(await executar(enviar(`veja ${arq}`, { transcript_path: velha }), { config: cfg('bloquear') })));
});

test('Grep na pasta do arquivo e cat no Bash contam como leitura', async () => {
  const arq = arquivoReal();
  const viaGrep = transcript(uso('Grep', { pattern: 'x', path: join(raiz, 'docs') }));
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: viaGrep }), { config: cfg('bloquear') }), null);
  const viaCat = transcript(uso('Bash', { command: `cat ${arq}` }));
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: viaCat }), { config: cfg('bloquear') }), null);
});

test('Bash de saída com --para X sem leitor de X nega e sugere o leitor; com leitor passa', async () => {
  const sem = transcript(prompt(), uso('Bash', { command: 'ls' }));
  const saida = await executar(bash('meu-envio texto --para Fulano --mensagem "oi"', { transcript_path: sem }), { config: cfg('bloquear') });
  assert.ok(negou(saida));
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /meu-cli msgs Fulano/);
  const com = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano" --desde 6h' }));
  assert.equal(await executar(bash('meu-envio texto --para "Fulano" --mensagem "oi"', { transcript_path: com }), { config: cfg('bloquear') }), null);
});

test('nomes configurados contam como fonte', async () => {
  const t = transcript(prompt(), uso('Bash', { command: 'ls' }));
  const c = cfg('bloquear', { nomes: ['Beltrano'] });
  assert.ok(negou(await executar(enviar('avise o beltrano do prazo', { transcript_path: t }), { config: c })));
});

const consultaDe = (saida, extra = {}) => ({ nome: 'abertos', comando: [process.execPath, '-e', `console.log(${JSON.stringify(saida)})`], ...extra });
const ENVIO = 'meu-envio texto --para Fulano --origem whatsapp --mensagem "Podemos marcar às 15h?"';

test('JEV ja_aberto com 0,8 nega citando a linha, mascarada', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('oferta de 15h para Fulano, contato dev@exemplo.com', { quando: 'com_destino' })] });
  const jev = jevFalso('achado', 'ja_aberto', 0.8);
  const saida = await executar(bash(ENVIO), { config: c, jev });
  assert.ok(negou(saida));
  const motivo = saida.hookSpecificOutput.permissionDecisionReason;
  assert.match(motivo, /consulta "abertos"/);
  assert.match(motivo, /oferta de 15h para Fulano/);
  assert.doesNotMatch(motivo, /dev@exemplo/);
  assert.equal(jev.chamadas[0].estado.evidencias.length, 1);
});

test('JEV ja_feito com confiança alta também nega', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('enviado ontem para Fulano')] });
  assert.ok(negou(await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', 'ja_feito', 0.9) })));
});

test('JEV nenhum não nega mesmo com candidatas; confiança 0,5 não nega', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('oferta de 15h para Fulano')] });
  assert.equal(await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', 'nenhum', 0.95) }), null);
  const emDuvida = await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', 'ja_aberto', 0.5) });
  assert.ok(!negou(emDuvida) && /pode já ter sido feito/.test(emDuvida.hookSpecificOutput.additionalContext));
  assert.deepEqual(registro().map((e) => e.decisao), ['avisada']);
});

test('JEV indisponível registra jev_indisponivel e não nega', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('oferta de 15h para Fulano')] });
  assert.equal(await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', null) }), null);
  assert.deepEqual(registro().map((e) => e.decisao), ['jev_indisponivel']);
});

test('sem candidatas o JEV nem é chamado', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('nada relacionado aqui')] });
  assert.equal(await executar(bash('meu-envio texto --para Fulano --mensagem "x"'), { config: c, jev: jevProibido }), null);
});

test('o eco da busca na saída da consulta é descartado', async () => {
  const consulta = { nome: 'busca', comando: ['meu-cli', 'buscar', '{termos}'] };
  const vars = { termos: ['15h', 'Beltrano'], destino: 'Fulano' };
  const saida = ['busca: "15h Beltrano"', 'count: 1', 'resultados[1]{id,texto}:', '  7,reunião às 15h com Beltrano', 'help: refine'].join('\n');
  assert.deepEqual(linhasCandidatas(saida, vars, ['15h Beltrano']), ['7,reunião às 15h com Beltrano']);
  assert.deepEqual(linhasCandidatas('destino: Fulano\nitens[0]{a}:\n', vars, ['Fulano']), []);
  assert.ok(consulta);
});

test('termos vêm do texto livre, sem --origem, com horário primeiro e no máximo 8', () => {
  const cmd = 'meu-envio texto --para Fulano --origem whatsapp --contexto "reunião sobre proposta" --mensagem "Podemos às 15h ou 10h, Beltrano confirma o contrato na sexta 20/10?"';
  const termos = termosDe(textoLivre('Bash', cmd, {}));
  assert.deepEqual(termos.slice(0, 3), ['15h', '10h', 'Beltrano'], 'no máximo 2 termos de tempo antes dos nomes');
  assert.ok(termos.includes('Beltrano'));
  assert.ok(!termos.includes('whatsapp') && !termos.includes('Fulano'));
  assert.ok(termos.length <= 8);
  assert.ok(!termosDe(textoLivre('Bash', cmd, { flags_ignoradas: ['--contexto'] })).includes('reuniao'));
  assert.equal(textoLivre('Bash', 'ls --origem x', {}), '');
});

test('consulta com stdout só de cabeçalho ou vazio não acha', async () => {
  const cab = { nome: 'vazia', comando: [process.execPath, '-e', 'console.log("count: 0"); console.log("itens[0]{id,nome}:"); console.log("0 resultados para Fulano"); console.log("help: tente outra busca por Fulano")'] };
  assert.equal(await executar(bash('meu-envio texto --para Fulano'), { config: cfg('bloquear', { consultas: [cab] }) }), null);
  const nada = { nome: 'nada', comando: [process.execPath, '-e', ''] };
  assert.equal(await executar(bash('meu-envio texto --para Fulano'), { config: cfg('bloquear', { consultas: [nada] }) }), null);
  assert.equal(registro().length, 0);
});

test('consulta que estoura o teto vira consulta_indisponivel, registrada e sem negar', async () => {
  const lenta = { nome: 'lenta', comando: [process.execPath, '-e', 'setTimeout(() => console.log("Fulano"), 5000)'] };
  const inicio = Date.now();
  const saida = await executar(bash('meu-envio texto --para Fulano'), { config: cfg('bloquear', { consultas: [lenta] }), tetoMs: 150 });
  assert.equal(saida, null);
  assert.ok(Date.now() - inicio < 2000);
  assert.deepEqual(registro().map((e) => [e.decisao, e.trecho]), [['consulta_indisponivel', 'lenta']]);
});

test('programa de consulta inexistente também é indisponível, sem negar', async () => {
  const c = cfg('bloquear', { consultas: [{ nome: 'fantasma', comando: ['programa-que-nao-existe-xyz'] }] });
  assert.equal(await executar(bash('meu-envio texto --para Fulano'), { config: c }), null);
  assert.equal(registro()[0].decisao, 'consulta_indisponivel');
});

test('Bash que não casa com saidas não lê transcript nem roda consulta', async () => {
  const espiao = () => { throw new Error('não devia ler o transcript'); };
  const consulta = { nome: 'c', comando: [process.execPath, '-e', 'console.log("Fulano")'] };
  const c = cfg('bloquear', { consultas: [consulta] });
  assert.equal(await executar(bash('npm test --para Fulano', { transcript_path: join(raiz, 'nao-existe.jsonl') }), { config: c, usosRecentes: espiao }), null);
  assert.equal(await executar({ tool_name: 'Read', tool_input: { file_path: '/x' } }, { config: c, usosRecentes: espiao }), null);
  assert.equal(registro().length, 0);
});

test('LIDO: com ao menos 10 caracteres libera tudo e registra; curto não libera', async () => {
  const arq = arquivoReal();
  const t = transcript(prompt());
  const texto = `siga ${arq}\nLIDO: li o arquivo inteiro e confirmei o plano`;
  assert.equal(await executar(enviar(texto, { transcript_path: t }), { config: cfg('bloquear') }), null);
  const [ev] = registro();
  assert.equal(ev.decisao, 'liberada');
  assert.match(ev.trecho, /LIDO: li o arquivo/);
  assert.ok(negou(await executar(enviar(`siga ${arq}\nLIDO: ok`, { transcript_path: t }), { config: cfg('bloquear') })));
});

test('sem achado não registra nada; sem transcript legível não acusa leitura', async () => {
  assert.equal(await executar(enviar('bom dia, tudo certo por aqui'), { config: cfg('bloquear') }), null);
  const arq = arquivoReal();
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: join(raiz, 'nao-existe.jsonl') }), { config: cfg('bloquear') }), null);
  assert.equal(registro().length, 0);
});

test('projeto com portão próprio e config sem a lei de leitura: sai sem fazer nada', async () => {
  const arq = arquivoReal();
  const projeto = join(raiz, 'projeto');
  mkdirSync(join(projeto, 'scripts', 'central', 'hooks'), { recursive: true });
  writeFileSync(join(projeto, 'scripts', 'central', 'hooks', 'portao.ts'), '');
  process.env.CLAUDE_PROJECT_DIR = projeto;
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: transcript(prompt()) }), { config: cfg('bloquear') }), null);
  delete process.env.CLAUDE_PROJECT_DIR;
  const c = cfg('bloquear');
  for (const l of c.config.leis) delete l.papel;
  assert.equal(await executar(enviar(`veja ${arq}`, { transcript_path: transcript(prompt()) }), { config: c }), null);
  assert.equal(registro().length, 0);
});

test('o caso sem gatilho custa menos de 100 ms', async () => {
  await executar(bash('ls'));
  const inicio = performance.now();
  assert.equal(await executar(bash('ls -la')), null);
  assert.equal(await executar({ tool_name: 'Read', tool_input: {} }), null);
  assert.ok(performance.now() - inicio < 100, `levou ${performance.now() - inicio} ms`);
});

test('config leitura: tipos errados reprovam em validarEsquema', () => {
  const com = (leitura) => { const c = configCom({}).config; c.leitura = leitura; return validarEsquema(c); };
  assert.deepEqual(com(LEITURA), []);
  assert.deepEqual(com({}), []);
  assert.match(com('x')[0], /leitura deve ser objeto/);
  assert.match(com({ saidas: 'x' })[0], /leitura\.saidas deve ser lista de textos/);
  assert.match(com({ saidas: ['('] })[0], /saidas\[0\] não é uma regex válida/);
  assert.match(com({ leitores: ['meu-cli msgs'] })[0], /marcador \{fonte\}/);
  assert.match(com({ flags_de_destino: [1] })[0], /flags_de_destino/);
  assert.match(com({ registro_de_fato: '[' })[0], /registro_de_fato/);
  assert.match(com({ consultas: [{ nome: 'a', comando: [] }] })[0], /comando/);
  assert.match(com({ consultas: [{ nome: 'a', comando: ['x'], quando: 'nunca' }] })[0], /quando/);
  assert.match(com({ consultas: 'x' })[0], /consultas deve ser lista/);
});

const NENHUMA_LEITURA = { entrada: {}, tex: 'O prazo combinado com ele é sexta-feira e o valor fechado é de cinco mil.' };

function stop(extra = {}) {
  return { session_id: 's9', cwd: '/x/p', last_assistant_message: NENHUMA_LEITURA.tex, ...extra };
}

test('Stop: leu conversa sem registrar e o JEV aponta fato novo: registra observada, sem block, mesmo em bloquear', async () => {
  const t = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano" --desde 6h' }));
  const jev = jevFalso('quebra', 'leitura');
  const saida = await executarStop(stop({ transcript_path: t }), { config: cfg('bloquear'), jev });
  assert.equal(saida, null);
  assert.equal(jev.chamadas.length, 1);
  assert.match(JSON.stringify(jev.chamadas[0].perguntas), /devia ir ao contexto/);
  const [ev] = registro();
  assert.deepEqual([ev.hook, ev.lei, ev.natureza, ev.decisao], ['fiscal-resposta', 'L.I.D.A.', 'omissao', 'observada']);
});

test('Stop: o mesmo turno só é julgado uma vez', async () => {
  const t = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano"' }));
  await executarStop(stop({ transcript_path: t }), { config: cfg('observar'), jev: jevFalso('quebra', 'leitura') });
  await executarStop(stop({ transcript_path: t }), { config: cfg('observar'), jev: jevProibido });
  assert.equal(registro().length, 1);
});

test('Stop: JEV diz nenhuma registra passou; JEV fora registra jev_indisponivel', async () => {
  const t = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano"' }));
  await executarStop(stop({ transcript_path: t, session_id: 'a' }), { config: cfg('observar'), jev: jevFalso('quebra', 'nenhuma') });
  await executarStop(stop({ transcript_path: t, session_id: 'b' }), { config: cfg('observar'), jev: jevFalso('quebra', null) });
  assert.deepEqual(registro().map((e) => e.decisao), ['passou', 'jev_indisponivel']);
});

test('Stop: registro de contexto no turno, ou nenhuma leitura, não chama o JEV', async () => {
  const comRegistro = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano"' }), uso('Bash', { command: 'meu-cli contexto add "prazo sexta"' }));
  assert.equal(await executarStop(stop({ transcript_path: comRegistro }), { config: cfg('observar'), jev: jevProibido }), null);
  const semLeitura = transcript(prompt(), uso('Bash', { command: 'ls' }));
  assert.equal(await executarStop(stop({ transcript_path: semLeitura, session_id: 'z' }), { config: cfg('observar'), jev: jevProibido }), null);
  assert.equal(registro().length, 0);
});

test('Stop: leitura de turno anterior não conta para o turno atual', async () => {
  const t = transcript(prompt(10), uso('Bash', { command: 'meu-cli msgs "Fulano"' }, 9), { ...prompt(5), uuid: 'p2' }, uso('Bash', { command: 'ls' }, 4));
  assert.equal(await executarStop(stop({ transcript_path: t }), { config: cfg('observar'), jev: jevProibido }), null);
  assert.equal(registro().length, 0);
});

test('Stop: sem leitores ou sem registro_de_fato configurados, a omissão não roda', async () => {
  const t = transcript(prompt(), uso('Bash', { command: 'meu-cli msgs "Fulano"' }));
  assert.equal(await executarStop(stop({ transcript_path: t }), { config: configCom({}), jev: jevProibido }), null);
  assert.equal(await executarStop(stop({ transcript_path: t }), { config: cfg('observar', { registro_de_fato: undefined }), jev: jevProibido }), null);
  assert.equal(registro().length, 0);
});

test('com mais candidatas que vagas, sobem as linhas com mais termos em comum', async () => {
  const ruido = Array.from({ length: 20 }, (_, i) => `aviso ${i} sobre 15h`).join('\n');
  const alvo = 'Fulano confirmou a call das 15h ontem';
  const c = cfg('bloquear', { consultas: [{ ...consultaDe(ruido), nome: 'ruido' }, { ...consultaDe(alvo), nome: 'alvo' }] });
  const jev = jevFalso('achado', 'nenhum', 0.9);
  await executar(bash('meu-envio texto --para Fulano --mensagem "Confirmo a call das 15h com Fulano?"'), { config: c, jev });
  const vistas = jev.chamadas[0].estado.evidencias;
  assert.equal(vistas.length, 12);
  assert.equal(vistas[0], alvo);
});

test('evidências chegam mascaradas ao JEV', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('oferta de 15h para Fulano, contato dev@exemplo.com token=abcdef123456')] });
  const jev = jevFalso('achado', 'nenhum', 0.9);
  await executar(bash(ENVIO), { config: c, jev });
  const [linha] = jev.chamadas[0].estado.evidencias;
  assert.doesNotMatch(linha, /dev@exemplo|abcdef123456/);
  assert.match(linha, /\[email\]/);
});

test('Read negado ou ainda sem resultado não prova leitura; Read com resultado ok prova', async () => {
  const arq = arquivoReal();
  const ler = (res) => transcript(prompt(), uso('Read', { file_path: arq }, 1, res));
  const roda = (res) => executar(enviar(`veja ${arq}`, { transcript_path: ler(res) }), { config: cfg('bloquear') });
  assert.ok(negou(await roda('erro')));
  assert.ok(negou(await roda('nenhum')));
  assert.equal(await roda('ok'), null);
});

test('eco: só a linha igual à busca ou chave: busca cai; linha com a busca no meio continua candidata', () => {
  const vars = { termos: ['15h', 'Beltrano'], destino: 'Fulano' };
  const saida = ['busca: "15h Beltrano"', '"15h Beltrano"', '15h Beltrano', '15h Beltrano confirmou a reunião'].join('\n');
  assert.deepEqual(linhasCandidatas(saida, vars, ['15h Beltrano']), ['15h Beltrano confirmou a reunião']);
});

test('config leitura: leitores ou saidas que não são lista devolvem erro de esquema, sem exceção', () => {
  const com = (leitura) => { const c = configCom({}).config; c.leitura = leitura; return validarEsquema(c); };
  assert.match(com({ leitores: 'x' })[0], /leitura\.leitores deve ser lista de textos/);
  assert.match(com({ saidas: 'x' })[0], /leitura\.saidas deve ser lista de textos/);
  assert.match(com({ leitores: { a: 1 } })[0], /leitura\.leitores deve ser lista de textos/);
});

test('Bash só prova leitura quando o caminho é argumento do leitor no mesmo segmento', async () => {
  const arq = arquivoReal('plano.md');
  const prova = (comando) => executar(enviar(`veja ${arq}`, { transcript_path: transcript(prompt(), uso('Bash', { command: comando })) }), { config: cfg('bloquear') });
  assert.ok(negou(await prova(`ls ${arq} | grep resultado`)));
  assert.equal(await prova(`grep -n prazo ${arq}`), null);
  assert.equal(await prova(`cat '${arq}' | head`), null);
  assert.equal(await prova(`cd /tmp && FOO=1 sudo tail -n 5 ${arq}`), null);
});

test('caminho com espaço e acento, entre aspas, é fonte e exige leitura', async () => {
  mkdirSync(join(raiz, 'Meu Projeto'), { recursive: true });
  const arq = join(raiz, 'Meu Projeto', 'decisão.md');
  writeFileSync(arq, 'x');
  const sem = transcript(prompt(), uso('Read', { file_path: '/outro.md' }));
  assert.ok(negou(await executar(enviar(`siga "${arq}" à risca`, { transcript_path: sem }), { config: cfg('bloquear') })));
  const solto = join(raiz, 'docs', 'análise.md');
  mkdirSync(join(raiz, 'docs'), { recursive: true });
  writeFileSync(solto, 'x');
  assert.ok(negou(await executar(enviar(`veja ${solto}`, { transcript_path: sem }), { config: cfg('bloquear') })));
  const lido = transcript(prompt(), uso('Read', { file_path: arq }), uso('Read', { file_path: solto }));
  assert.equal(await executar(enviar(`siga "${arq}" e ${solto}`, { transcript_path: lido }), { config: cfg('bloquear') }), null);
});

test('mais de 8 arquivos não escondem o destino: ele é conferido e o corte é registrado', async () => {
  const arqs = Array.from({ length: 10 }, (_, i) => arquivoReal(`n${i}.md`));
  const lidos = transcript(prompt(), ...arqs.slice(0, 8).map((a) => uso('Read', { file_path: a })));
  const saida = await executar(enviar(`veja ${arqs.join(' ')} --para Fulano`, { transcript_path: lidos }), { config: cfg('bloquear') });
  assert.ok(negou(saida));
  const motivo = saida.hookSpecificOutput.permissionDecisionReason;
  assert.match(motivo, /"Fulano" sem leitura/);
  assert.match(motivo, /fontes_cortadas: 2/);
  assert.match(registro()[0].trecho, /fontes_cortadas: 2/);
});

test('JEV em dúvida (0,4 a 0,7) não nega: devolve aviso à sessão e registra avisada, inclusive em bloquear', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('proposta de 15h para Fulano já enviada ontem', { quando: 'com_destino' })] });
  const saida = await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', 'ja_feito', 0.5) });
  assert.ok(!negou(saida));
  assert.equal(saida.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(saida.hookSpecificOutput.additionalContext, /pode já ter sido feito/);
  assert.match(saida.hookSpecificOutput.additionalContext, /proposta de 15h para Fulano já enviada ontem/);
  assert.equal(registro().at(-1).decisao, 'avisada');
});

test('abaixo de 0,4 nem aviso nem registro', async () => {
  const c = cfg('bloquear', { consultas: [consultaDe('proposta de 15h para Fulano já enviada ontem', { quando: 'com_destino' })] });
  const saida = await executar(bash(ENVIO), { config: c, jev: jevFalso('achado', 'ja_feito', 0.3) });
  assert.equal(saida, null);
  assert.equal(registro().filter((e) => e.hook === 'fiscal-leitura').length, 0);
});

test('consulta com filtrar false manda ao JEV a linha sem termo em comum, à frente das outras', async () => {
  const saidaExata = 'count: 1 anteriores\nanteriores[1]{data,conversa,caminho,casou_por}:\n  "19/10 14:29","Grupo X","/dados/a1.pdf","md5"';
  const c = cfg('bloquear', { consultas: [
    { ...consultaDe('oferta de 15h para Fulano'), nome: 'ruido' },
    { ...consultaDe(saidaExata), nome: 'midia', filtrar: false },
  ] });
  const jev = jevFalso('achado', 'nenhum', 0.9);
  await executar(bash(ENVIO), { config: c, jev });
  const vistas = jev.chamadas[0].estado.evidencias;
  assert.match(vistas[0], /a1\.pdf/);
  assert.ok(!vistas.some((l) => /^count:/.test(l)));
});

test('config leitura: filtrar precisa ser booleano', () => {
  const c = cfg('observar', { consultas: [{ nome: 'x', comando: ['x'], filtrar: 'nao' }] }).config;
  assert.ok(validarEsquema(c).some((e) => /filtrar deve ser true ou false/.test(e)));
});

test('caminho sem aspas e com espaço até a extensão é fonte', () => {
  mkdirSync(join(raiz, 'midia', 'documento'), { recursive: true });
  const arq = join(raiz, 'midia', 'documento', 'REGULAMENTO ATUALIZADO _pdf.pdf');
  writeFileSync(arq, 'x');
  const fontes = extrairFontes(`Fontes:\n- PDF de 29 páginas: ${arq}\n- outra coisa`, {});
  assert.deepEqual(fontes.filter((f) => f.tipo === 'arquivo').map((f) => f.fonte), [arq]);
});

test('sugestão de leitura mostra o caminho inteiro, sem máscara, para a sessão poder copiar', async () => {
  mkdirSync(join(raiz, 'midia', '5511987654321_s'), { recursive: true });
  const arq = join(raiz, 'midia', '5511987654321_s', 'doc.pdf');
  writeFileSync(arq, 'x');
  const entrada = { session_id: 's1', cwd: '/x/p', tool_name: 'SendMessage', tool_input: { message: `aplique ${arq}` }, transcript_path: transcript(prompt()) };
  const saida = await executar(entrada, { config: cfg('bloquear') });
  assert.ok(saida.hookSpecificOutput.permissionDecisionReason.includes(`Read ${arq}`));
});
