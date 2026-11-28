import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executar, classificar } from '../scripts/fiscal-acao.mjs';
import { isolar, restaurar, configCom, registro } from './ajuda.mjs';

let raiz;
beforeEach(() => { raiz = isolar(); });
afterEach(restaurar);

const bash = (command, extra = {}) => ({ tool_name: 'Bash', session_id: 's1', cwd: '/x/p', tool_input: { command, ...extra } });
const segredoLongo = 'a1B2'.repeat(8);

test('classifica laço com sleep em primeiro plano e deixa passar o resto', () => {
  assert.equal(classificar(bash('while true; do sleep 5; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('for i in 1 2 3; do curl x; sleep 2; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('until test -f pronto; do sleep 1; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('while true; do sleep 5; done', { run_in_background: true })), null);
  assert.equal(classificar(bash('sleep 1 && echo ok')), null);
  assert.equal(classificar(bash('ls -la && git status')), null);
});

test('sleep em texto citado (aspas e heredoc) não é laço com sleep', () => {
  assert.equal(classificar(bash('echo "while true; do sleep 5; done"')), null);
  assert.equal(classificar(bash('git commit -m "para do dia"; sleep 3')), null);
  assert.equal(classificar(bash("echo 'while true; do sleep 5; done'")), null);
  assert.equal(classificar(bash("cat <<'EOF' > x.sh\nwhile true; do sleep 5; done\nEOF")), null);
  assert.equal(classificar(bash("cat <<'EOF' > x.sh\nwhile true; do sleep 5; done\nEOF\nfor i in 1 2; do x; sleep 5; done")), 'laco_com_sleep');
  assert.equal(classificar(bash('for i in 1 2; do x; sleep 5; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('while true; do curl "a b"; sleep 10; done')), 'laco_com_sleep');
});

test('sleep fora do corpo do laço não é laço com sleep', () => {
  assert.equal(classificar(bash('U=gui/501; for s in a b; do launchctl enable $U/x.$s; launchctl bootstrap $U ~/x.$s.plist; done; sleep 25; curl -s http://localhost:1984/api/streams')), null);
  assert.equal(classificar(bash('while read l; do echo $l; done < f; sleep 5')), null);
  assert.equal(classificar(bash('docker run x; sleep 5')), null);
  assert.equal(classificar(bash('sleep 25; for i in 1 2; do echo $i; done')), null);
  assert.equal(classificar(bash('for i in 1 2; do x; sleep 5; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('while true; do curl x; sleep 10; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('for a in 1 2; do for b in 3 4; do sleep 1; done; done')), 'laco_com_sleep');
  assert.equal(classificar(bash('for a in 1 2; do for b in 3 4; do x; done; sleep 1; done; sleep 2')), 'laco_com_sleep');
});

test('classifica segredo literal e aceita variável', () => {
  assert.equal(classificar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" https://x`)), 'segredo_literal');
  assert.equal(classificar(bash(`curl "https://x?access_token=${segredoLongo}"`)), 'segredo_literal');
  assert.equal(classificar(bash('SSHPASS=hunter2 sshpass -e ssh host')), 'segredo_literal');
  assert.equal(classificar(bash('curl -H "Authorization: Bearer $TOKEN" https://x')), null);
  assert.equal(classificar(bash('SSHPASS=$SENHA sshpass -e ssh host')), null);
});

test('código depois de Bearer ou access_token= não é segredo literal, valor opaco continua sendo', () => {
  const esquema = ['Bear', 'er'].join('');
  const campo = ['access', 'token'].join('_');
  assert.equal(classificar(bash(`python3 - <<'EOF'\nlinha = "${esquema} ${'lista_de_destinatarios_ativos'}"\nEOF`)), null);
  assert.equal(classificar(bash(`sed -i 's/x/${esquema} tokenDaSessaoAtual/' a.ts`)), null);
  assert.equal(classificar(bash(`echo "${esquema} \${obterChaveAtual(env)}"`)), null);
  assert.equal(classificar(bash(`curl "https://x?${campo}=\${obterChaveAtual(env)}"`)), null);
  const uuid = '3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13';
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${uuid}" https://x`)), 'segredo_literal');
  assert.equal(classificar(bash(`curl "https://x/recipients/${uuid}/whatsapp?${campo}=${uuid}"`)), 'segredo_literal');
});

test('token de app (id numérico, barra vertical e variável) não é segredo literal (21b3); com o segredo por extenso, continua sendo', () => {
  const campo = ['access', 'token'].join('_');
  const id = '8'.repeat(4) + '123456789012';
  const porExtenso = '9f3c'.repeat(8);
  const chamada = (valor) => bash(`curl "https://graph.facebook.com/v21.0/${id}/subscriptions?${campo}=${valor}"`);
  const marcado = (valor) => assert.equal(classificar(chamada(valor), { noCofre: () => false }), 'segredo_literal', valor);
  for (const barra of ['%7C', '%7c', '|']) {
    for (const ref of ['$APP_SECRET_DO_APP', '${APP_SECRET_DO_APP}']) assert.equal(classificar(chamada(`${id}${barra}${ref}`)), null, `${barra}${ref}`);
    marcado(`${id}${barra}${porExtenso}`);
    marcado(`${id}${barra}$APP_SECRET_DO_APP.${porExtenso}`);
  }
  marcado(`${porExtenso}%7C$APP_SECRET_DO_APP`);
  const comAntes = (antes, ref = '$S') => classificar(bash(`${antes}; ${chamada(`${id}%7C${ref}`).tool_input.command}`), { noCofre: () => false });
  assert.equal(comAntes(`S=${porExtenso}`, '${S}'), 'segredo_literal');
  assert.equal(comAntes(`true&&S=${porExtenso}`), 'segredo_literal');
  assert.equal(comAntes('set -a', `$${campo}`), null);
  assert.equal(classificar(bash(`curl -d ${campo}=${id}%7C$${campo} https://graph.facebook.com/v21.0/me`)), null);
  for (const antes of [`S=${porExtenso}`, `S="${porExtenso}"`, `export S='${porExtenso}'`]) assert.equal(comAntes(antes), 'segredo_literal', antes);
  for (const antes of ['set -a; . ./chaves.env; set +a', 'S=$(grep -m1 NOME chaves.env)', 'S="$(cat arquivo)"', 'S=`cat arquivo`', 'S="$OUTRA"', `OUTRO_S=${porExtenso}`]) assert.equal(comAntes(antes), null, antes);
  assert.equal(executar(chamada(`${id}%7C$APP_SECRET_DO_APP`), { config: configCom({}), noCofre: () => true }), null);
});

test('variável usada como segredo conta quando o próprio comando a preenche por extenso (issue 23)', () => {
  const esquema = ['Bear', 'er'].join('');
  const campo = ['access', 'token'].join('_');
  const var_ = ['SSH', 'PASS'].join('');
  const segredo = '9f3c'.repeat(8);
  const comBarra = `1234|${'aB3d'.repeat(10)}`;
  const uso = `curl -H "Authorization: ${esquema} $K" https://api.exemplo.com.br`;
  const regra = (comando) => classificar(bash(comando), { noCofre: () => false });
  for (const antes of [`K=${segredo}`, `K="${segredo}"`, `export K='${segredo}'`, `printf -v K %s ${segredo}`, `printf -v K '%s' "${segredo}"`, `printf -v K '${segredo}'`, `printf -v K '%s\\n' ${segredo}`, `read -r K <<< ${segredo}`, `read K <<<"${segredo}"`, `K='${comBarra}'`]) {
    assert.equal(regra(`${antes}; ${uso}`), 'segredo_literal', antes);
  }
  assert.equal(regra(`K=${segredo}; curl "https://x?${campo}=$K"`), 'segredo_literal');
  assert.equal(regra(`K=${segredo}; curl "https://x" -H "Authorization: ${esquema} \${K}"`), 'segredo_literal');
  assert.equal(regra(`P=hunter2; ${var_}=$P sshpass -e ssh host`), 'segredo_literal');
  for (const antes of ['set -a; . ./.env; set +a', 'K=$(grep -m1 NOME chaves.env)', 'K="$(cat arquivo)"', 'printf -v K %s "$(cat arquivo)"', 'read -r K < arquivo', 'read -r K <<< "$OUTRA"',
    'K=/caminho/bem/longo/ate/o/arquivo', 'K=https://api.exemplo.com.br/caminho', 'K=curto', 'K=token-de-teste-bem-comprido-123', 'K="uma frase comprida com espaços no meio"', `K=${segredo}$SUFIXO`, `OUTRA_K=${segredo}`]) {
    assert.equal(regra(`${antes}; ${uso}`), null, antes);
  }
  assert.equal(regra(`K=${segredo}; echo ok`), null);
  assert.equal(regra(`curl "https://x?id=1&K=${segredo}" -H "Authorization: ${esquema} $K"`), null);
  const config = configCom({ modos: { 6: 'bloquear' } });
  assert.ok(executar(bash(`K=${segredo}; ${uso}`), { config, noCofre: () => false, avisar: () => {} }).hookSpecificOutput.additionalContext);
});

test('valor de teste ou de exemplo não conta como segredo literal', () => {
  const esquema = ['Bear', 'er'].join('');
  const campo = ['access', 'token'].join('_');
  const var_ = ['SSH', 'PASS'].join('');
  for (const valor of ['token-de-teste', 'token-de-teste-do-crm-sync', 'abcdefghij-EXEMPLO-klmnop', 'your_api_token_goes_here', 'seu_token_aqui_1234567', 'fake-token-0123456789abcdef', '<TOKEN_DO_CLIENTE_AQUI>', '${TOKEN_DO_CLIENTE_AQUI}', '$TOKEN_DO_CLIENTE_AQUI']) {
    assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${valor}" https://x`)), null, valor);
    assert.equal(classificar(bash(`curl "https://x?${campo}=${valor}"`)), null, valor);
    assert.equal(classificar(bash(`${var_}=${valor} sshpass -e ssh host`)), null, valor);
  }
});

test('valor real de 32 caracteres sem palavra de teste segue negado', () => {
  const esquema = ['Bear', 'er'].join('');
  const real = 'Zk9QwR3vLm7XcB2nHs5TyU8eJd4GfA6p';
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${real}" https://x`)), 'segredo_literal');
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} token-de-teste" -H "X: ${esquema} ${real}" https://x`)), 'segredo_literal');
});

test('constante de teste escrita em *.test.ts sem sair da máquina não é segredo literal (a753), mas valor do cofre e comando de rede seguem marcados', () => {
  const esquema = ['Bear', 'er'].join('');
  const opaco = 'Zk9QwR3vLm7XcB2nHs5TyU8eJd4GfA6p';
  const edita = (arquivo, valor) => `cd /x/central && python3 - <<'EOF'\np='${arquivo}'\ns=open(p).read()\ns=s.replace('A', 'headers: { Authorization: "${esquema} ${valor}" }')\nEOF`;
  assert.equal(classificar(bash(edita('testes/modelos-workers.test.ts', opaco)), { noCofre: () => false }), null);
  assert.equal(classificar(bash(edita('src/modelos.spec.ts', opaco)), { noCofre: () => false }), null);
  assert.equal(classificar(bash(edita('testes/modelos-workers.test.ts', opaco)), { noCofre: () => true }), 'segredo_literal');
  assert.equal(classificar(bash(edita('src/modelos.ts', opaco)), { noCofre: () => false }), 'segredo_literal');
  assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${opaco}" https://x # modelos.test.ts`), { noCofre: () => false }), 'segredo_literal');
});

test('o aviso 620d continua sem disparar (UUID em caminho sem Bearer) e token com prefixo conhecido continua marcado', () => {
  const esquema = ['Bear', 'er'].join('');
  const uuid = '3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13';
  assert.equal(classificar(bash(`curl -s -X PUT -H 'content-type: application/json' -d '{"on":false}' https://x.test/service/recipients/${uuid}/whatsapp`)), null);
  const corpo = 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1B4dFg';
  const tokens = [['sbp', '_', corpo], ['sk', '-', corpo], ['EAA', corpo], ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxIn0', '.', 'SflKxwRJSMeKKF2QT4fw']].map((p) => p.join(''));
  for (const t of tokens) assert.equal(classificar(bash(`curl -H "Authorization: ${esquema} ${t}" https://api.x.com.br`), { noCofre: () => false }), 'segredo_literal', t.slice(0, 4));
});

test('AskUserQuestion é classificada; outras ferramentas, não', () => {
  assert.equal(classificar({ tool_name: 'AskUserQuestion', tool_input: {} }), 'pergunta_ao_dono');
  assert.equal(classificar({ tool_name: 'Read', tool_input: { file_path: 'a' } }), null);
});

test('modo observar registra e não nega', () => {
  assert.equal(executar({ tool_name: 'AskUserQuestion', session_id: 's1', cwd: '/x/p', tool_input: {} }, { config: configCom({}) }), null);
  const [ev] = registro();
  assert.deepEqual([ev.hook, ev.lei, ev.decisao], ['fiscal-acao', 'S.I.M.', 'observada']);
});

test('modo bloquear nega com a lei e a correção', () => {
  const config = configCom({ 5: 'bloquear', 2: 'bloquear', 6: 'bloquear' });
  const pergunta = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config });
  assert.equal(pergunta.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(pergunta.hookSpecificOutput.permissionDecisionReason, /Lei 5 \(S\.I\.M\.\)/);
  const laco = executar(bash('while true; do sleep 5; done'), { config });
  assert.match(laco.hookSpecificOutput.permissionDecisionReason, /Lei 2 \(J\.Á\.\).*segundo plano/);
  const segredo = executar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" https://api.exemplo.com.br`), { config, noCofre: () => true });
  assert.match(segredo.hookSpecificOutput.permissionDecisionReason, /Lei 6/);
  assert.deepEqual(registro().map((e) => e.decisao), ['negada', 'negada', 'negada']);
});

test('o trecho do segredo é mascarado no registro', () => {
  executar(bash(`curl -H "Authorization: Bearer ${segredoLongo}" x`), { config: configCom({}), noCofre: () => false, avisar: () => {} });
  assert.doesNotMatch(registro()[0].trecho, new RegExp(segredoLongo));
});

test('comando que não casa não registra nada', () => {
  assert.equal(executar(bash('npm test'), { config: configCom({ 2: 'bloquear' }) }), null);
  assert.equal(registro().length, 0);
});

test('projeto com portão próprio: sai sem fazer nada', () => {
  const projeto = join(raiz, 'projeto');
  mkdirSync(join(projeto, 'scripts', 'central', 'hooks'), { recursive: true });
  writeFileSync(join(projeto, 'scripts', 'central', 'hooks', 'portao.ts'), '');
  process.env.CLAUDE_PROJECT_DIR = projeto;
  const saida = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: configCom({ 5: 'bloquear' }) });
  assert.equal(saida, null);
  assert.equal(registro().length, 0);
});

test('os fiscais acham a lei pelo papel, não pelo número (config renumerada)', () => {
  const c = configCom({});
  c.config.leis.reverse().forEach((l, i) => { l.numero = i + 1; });
  c.config.modos = { 1: 'bloquear', 2: 'bloquear', 3: 'bloquear', 4: 'bloquear', 5: 'bloquear', 6: 'bloquear' };
  const saida = executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: c });
  assert.match(saida.hookSpecificOutput.permissionDecisionReason, /S\.I\.M\./);
  assert.equal(registro()[0].lei, 'S.I.M.');
});

test('lei sem o papel do fiscal: nada é fiscalizado por hook', () => {
  const c = configCom({ 5: 'bloquear' });
  for (const l of c.config.leis) delete l.papel;
  assert.equal(executar({ tool_name: 'AskUserQuestion', tool_input: {} }, { config: c }), null);
  assert.equal(registro().length, 0);
});

const MIN = 60 * 1000;
const comSegredo = () => bash(`curl -H "Authorization: ${['Bear', 'er'].join('')} ${segredoLongo}" https://x`);

function disparar(sessao, comando, instante, avisos) {
  const entrada = { ...comando, session_id: sessao };
  executar(entrada, { config: configCom({}), noCofre: () => false, agora: () => instante, avisar: (_c, m) => avisos.push(m) });
}

test('quatro avisos iguais em 23 minutos geram um envio só', () => {
  const avisos = [];
  for (const min of [0, 7, 15, 23]) disparar('s1', comSegredo(), min * MIN, avisos);
  assert.equal(avisos.length, 1);
  assert.doesNotMatch(avisos[0], /na última hora/);
});

test('o primeiro aviso depois de uma hora sai com a contagem das repetições', () => {
  const avisos = [];
  for (const min of [0, 7, 15, 23]) disparar('s1', comSegredo(), min * MIN, avisos);
  disparar('s1', comSegredo(), 61 * MIN, avisos);
  assert.equal(avisos.length, 2);
  assert.match(avisos[1], /\(mais 3 vezes na última hora\)$/);
  disparar('s1', comSegredo(), 62 * MIN, avisos);
  assert.equal(avisos.length, 2);
});

test('sessões diferentes não se juntam', () => {
  const avisos = [];
  disparar('s1', comSegredo(), 0, avisos);
  disparar('s2', comSegredo(), MIN, avisos);
  assert.equal(avisos.length, 2);
});

test('regras diferentes da mesma sessão não se juntam, e a dupla quebra repetida na hora é agrupada', () => {
  const avisos = [];
  const config = configCom({});
  config.config.escalada = { modo: 'pausar', aviso: ['x', '{mensagem}'] };
  const turno = { turnoAtual: () => ({ id: 't1', usos: [] }) };
  const deps = { config, noCofre: () => false, agora: () => 0, avisar: (_c, m) => avisos.push(m), ...turno };
  const pergunta = { tool_name: 'AskUserQuestion', session_id: 's1', tool_input: {}, transcript_path: '/t.jsonl' };
  const laco = { ...bash('while true; do sleep 5; done'), transcript_path: '/t.jsonl' };
  executar(comSegredo(), deps);
  executar(pergunta, deps);
  executar(laco, deps);
  assert.equal(avisos.length, 2);
  assert.match(avisos[0], /Segredo literal/);
  assert.match(avisos[1], /Dupla quebra/);
  const outroTurno = { ...deps, turnoAtual: () => ({ id: 't2', usos: [] }), agora: () => MIN };
  executar(pergunta, outroTurno);
  executar(laco, outroTurno);
  assert.equal(avisos.length, 2);
  const horaDepois = { ...outroTurno, turnoAtual: () => ({ id: 't3', usos: [] }), agora: () => 61 * MIN };
  executar(pergunta, horaDepois);
  executar(laco, horaDepois);
  assert.equal(avisos.length, 3);
  assert.match(avisos[2], /Dupla quebra.*mais 1 vez na última hora/);
});

test('estado de avisos corrompido não impede o envio', () => {
  writeFileSync(join(process.env.LEIS_HOME, 'avisos.json'), '{não é json');
  const avisos = [];
  disparar('s1', comSegredo(), 0, avisos);
  assert.equal(avisos.length, 1);
  disparar('s1', comSegredo(), MIN, avisos);
  assert.equal(avisos.length, 1);
});

test('entrada de aviso com mais de 24 horas é podada', () => {
  const avisos = [];
  disparar('s1', comSegredo(), 0, avisos);
  disparar('s2', comSegredo(), 25 * 60 * MIN, avisos);
  const estado = JSON.parse(readFileSync(join(process.env.LEIS_HOME, 'avisos.json'), 'utf8'));
  assert.deepEqual(Object.keys(estado), ['s2|segredo_literal']);
});
