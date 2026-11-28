#!/usr/bin/env node
// PreToolUse (Bash e AskUserQuestion): regras determinísticas, sem rede e sem ler arquivo grande.
import { nomeDoProjeto, principal, projetoTem, saidaContexto, saidaNegar } from './entrada.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto } from './leis.mjs';
import { avisarAgrupado, escalar, nomeDaSessao } from './escalada.mjs';
import { noCofre } from './cofre.mjs';
import { registrar } from './registro.mjs';

const GATILHOS = /sleep|access_token|SSHPASS|Bearer/;
const PASSO_DO_LACO = /\b(?:done\b|do\b|sleep\s+\d)/g;
const SEGREDOS = [/access_token=(?!\$)([^\s&"']{20,})/gi, /\bSSHPASS=["']?(?!\$)([^\s"']+)/g, /\bBearer\s+(?!\$)([A-Za-z0-9._~+/=-]{20,})/g];
const VALOR_FICTICIO = /test|teste|exemplo|example|fake|dummy|placeholder|ficticio|mock|xxx|changeme|seu_|sua_|your_|^<.*>$|^\$\{|^\$\w/i;

// Código escrito no comando (nome de variável, chamada, template) que vem depois de Bearer ou access_token= não é valor de segredo.
const EXPRESSAO_DE_CODIGO = /[(){}]|^(?:[A-Za-z]+(?:_[A-Za-z]+)+|[a-z]+(?:[A-Z][a-z]*)+)$/;

// Token de app da Meta montado como id público, barra vertical (ou %7C) e variável: o token em si não é literal, quem é julgado é o valor da variável.
const TOKEN_DE_APP_COM_VARIAVEL = /^\d{6,20}(?:\||%7C)\$(?:[A-Za-z_]\w*|\{[A-Za-z_]\w*\})$/i;

// Variável usada como segredo, com o tamanho mínimo que o mesmo lugar exige do valor escrito direto.
const USOS_DE_VARIAVEL = [
  [/access_token=["']?(?:\d{6,20}(?:\||%7C))?\$\{?([A-Za-z_]\w*)/gi, 20],
  [/\bBearer\s+["']?\$\{?([A-Za-z_]\w*)/g, 20],
  [/\bSSHPASS=["']?\$\{?([A-Za-z_]\w*)/g, 1],
];
// Valor escrito por extenso: sem espaço, sem expansão e sem nada colado depois.
const VALOR_ESCRITO = `(?:"([^"\\s$\`\\\\]+)"|'([^'\\s]+)'|([^\\s;&|"'$\`()<>]+))(?![^\\s;&|)<>])`;
const FORMAS_DE_ATRIBUIR = [
  (nome) => `(?:^|[\\s;(|]|&&)${nome}=`,
  (nome) => `\\bprintf\\s+-v\\s+${nome}\\s+(?:(?:'%s(?:\\\\n)?'|"%s(?:\\\\n)?"|%s)\\s+)?`,
  (nome) => `\\bread\\s+(?:-\\w+\\s+)*${nome}\\s*<<<\\s*`,
];
const CAMINHO_OU_URL = /^(?:[~.]?\/|https?:\/\/)/;

const valoresAtribuidos = (comando, nome) => FORMAS_DE_ATRIBUIR.flatMap((forma) => [...comando.matchAll(new RegExp(forma(nome) + VALOR_ESCRITO, 'g'))].map((m) => m[1] ?? m[2] ?? m[3]));

const nomesUsados = (comando, uso) => [...new Set([...comando.matchAll(uso)].map((m) => m[1]))];
const valoresPorVariavel = (comando) => USOS_DE_VARIAVEL.flatMap(([uso, minimo]) => nomesUsados(comando, uso)
  .flatMap((nome) => valoresAtribuidos(comando, nome))
  .filter((v) => v.length >= minimo && !CAMINHO_OU_URL.test(v)));

// Comando que escreve em *.test.ts ou *.spec.ts sem sair da máquina: o valor é constante de teste, a não ser que esteja no cofre.
const ARQUIVO_DE_TESTE = /\.(?:test|spec)\.[cm]?[jt]sx?(?![\w])/i;
const ehConstanteDeTeste = (comando, valor, deps) => ARQUIVO_DE_TESTE.test(comando) && !saiDaMaquina(comando) && !(deps.noCofre ?? noCofre)(valor);

const NAO_SAO_SEGREDO = [VALOR_FICTICIO, EXPRESSAO_DE_CODIGO, TOKEN_DE_APP_COM_VARIAVEL];
const escritosNoUso = (comando) => SEGREDOS.flatMap((r) => [...comando.matchAll(r)].map((m) => m[1]));
const valoresLiterais = (comando, deps = {}) => [...escritosNoUso(comando), ...valoresPorVariavel(comando)]
  .filter((v) => !NAO_SAO_SEGREDO.some((r) => r.test(v)) && !ehConstanteDeTeste(comando, v, deps));

const FERRAMENTA_DE_REDE = /\b(?:curl|wget|http|httpie|xh|ssh|scp|sshpass|rsync)\b/;
const ALVO_LOCAL = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(?:[:/]|$)/i;

// Só sai da máquina o comando que usa ferramenta de rede e não fala apenas com endereço local.
function saiDaMaquina(comando) {
  if (!FERRAMENTA_DE_REDE.test(comando)) return false;
  if (/\b(?:ssh|scp|sshpass|rsync)\b/.test(comando)) return true;
  const alvos = [...comando.matchAll(/https?:\/\/([^\s"']+)/gi)].map((m) => m[1]);
  return alvos.length === 0 || alvos.some((a) => !ALVO_LOCAL.test(a));
}

const CORPO_DE_HEREDOC = /(<<-?\s*(['"]?)([A-Za-z_]\w*)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g;
const TEXTO_ENTRE_ASPAS = /'[^']*'|"(?:\\.|[^"\\])*"/g;

// Corpo de heredoc e texto entre aspas são dado, não comando: "while true; do sleep 5; done" dentro de echo ou de mensagem de commit não é laço.
const semTextoCitado = (comando) => comando.replace(CORPO_DE_HEREDOC, '$1 ').replace(TEXTO_ENTRE_ASPAS, ' ');

// Só marca sleep entre o do e o done de um laço, contando aninhamento; espera única antes ou depois do laço não é laço de espera.
function temSleepDentroDeLaco(comando) {
  let fundo = 0;
  for (const [passo] of semTextoCitado(comando).matchAll(PASSO_DO_LACO)) {
    if (passo === 'do') fundo += 1;
    else if (passo === 'done') fundo = Math.max(0, fundo - 1);
    else if (fundo > 0) return true;
  }
  return false;
}

const REGRAS = {
  pergunta_ao_dono: { papel: 'sim', motivo: 'perguntar ao dono pelo terminal pede decisão que a sessão deve tomar sozinha; escolha o padrão, execute e avise depois.' },
  laco_com_sleep: { papel: 'antes', motivo: 'laço com sleep em primeiro plano trava a sessão; rode em segundo plano e acompanhe por monitor, sem esperar parado.' },
  segredo_literal: { papel: 'aval', motivo: 'segredo literal no comando vaza em log e histórico; use a variável de ambiente ou o arquivo de chaves.' },
};

export function classificar(entrada, deps = {}) {
  if (entrada.tool_name === 'AskUserQuestion') return 'pergunta_ao_dono';
  if (entrada.tool_name !== 'Bash') return null;
  const comando = String(entrada.tool_input?.command ?? '');
  if (!GATILHOS.test(comando)) return null;
  if (valoresLiterais(comando, deps).length) return 'segredo_literal';
  const emSegundoPlano = entrada.tool_input?.run_in_background === true;
  return !emSegundoPlano && temSleepDentroDeLaco(comando) ? 'laco_com_sleep' : null;
}

// Pausa só quando o valor está no cofre (é real) e o comando o leva para fora da máquina.
const pausaPorSegredo = (comando, deps) => saiDaMaquina(comando) && valoresLiterais(comando).some((v) => (deps.noCofre ?? noCofre)(v));

// Segredo que não está no cofre, ou que não sai da máquina, nunca pausa: avisa a sessão e a CENTRAL e deixa o trabalho seguir.
function avisarSegredo(entrada, config, lei, deps) {
  const projeto = nomeDoProjeto(entrada);
  const comando = String(entrada.tool_input?.command ?? '');
  registrar({ sessao: entrada.session_id, projeto, hook: 'fiscal-acao', lei: lei.sigla, natureza: 'acao', sinal: 'segredo_literal', decisao: 'avisada', trecho: `segredo_literal: ${comando}` });
  const motivo = `${nomeCompleto(lei)}: ${REGRAS.segredo_literal.motivo}`;
  avisarAgrupado(config, { sessao: entrada.session_id, regra: 'segredo_literal' }, `Segredo literal no comando da sessão "${nomeDaSessao(entrada)}" (projeto ${projeto ?? 'sem projeto'}): valor fora do cofre ou que não sai da máquina; só aviso, nada foi pausado.`, deps);
  return saidaContexto('PreToolUse', `[leis] ${motivo}`);
}

export function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'portao.ts')) return null;
  const regra = classificar(entrada, deps);
  if (!regra) return null;
  const { config } = deps.config ?? carregarConfig();
  const { papel, motivo } = REGRAS[regra];
  const lei = leiPorPapel(config, papel);
  if (!lei) return null;
  const comando = String(entrada.tool_input?.command ?? entrada.tool_name);
  if (regra === 'segredo_literal' && !pausaPorSegredo(comando, deps)) return avisarSegredo(entrada, config, lei, deps);
  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  const projeto = nomeDoProjeto(entrada);
  registrar({
    sessao: entrada.session_id, projeto, hook: 'fiscal-acao', lei: lei.sigla, natureza: 'acao', sinal: regra,
    decisao: bloquear ? 'negada' : 'observada', trecho: `${regra}: ${comando}`,
  });
  return escalar(bloquear ? saidaNegar(`${nomeCompleto(lei)}: ${motivo}`) : null, { entrada, config, lei, projeto, sinal: regra, trecho: comando, segredo: regra === 'segredo_literal' }, deps);
}

await principal(import.meta.url, executar);
