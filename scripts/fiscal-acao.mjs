#!/usr/bin/env node
// PreToolUse (Bash e AskUserQuestion): regras determinísticas, sem rede e sem ler arquivo grande.
import { nomeDoProjeto, principal, projetoTem, saidaContexto, saidaNegar } from './entrada.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto } from './leis.mjs';
import { avisarAgrupado, escalar, nomeDaSessao } from './escalada.mjs';
import { noCofre } from './cofre.mjs';
import { registrar } from './registro.mjs';

const GATILHOS = /sleep|access_token|SSHPASS|Bearer/;
const LACO_COM_SLEEP = /\b(?:while|until)\b[\s\S]*\bsleep\s+\d|\bfor\b[\s\S]*\bdo\b[\s\S]*\bsleep\s+\d/;
const SEGREDOS = [/access_token=(?!\$)([^\s&"']{20,})/gi, /\bSSHPASS=["']?(?!\$)([^\s"']+)/g, /\bBearer\s+(?!\$)([A-Za-z0-9._~+/=-]{20,})/g];
const VALOR_FICTICIO = /test|teste|exemplo|example|fake|dummy|placeholder|ficticio|mock|xxx|changeme|seu_|sua_|your_|^<.*>$|^\$\{|^\$\w/i;

const valoresLiterais = (comando) => SEGREDOS.flatMap((r) => [...comando.matchAll(r)].map((m) => m[1])).filter((v) => !VALOR_FICTICIO.test(v));

const FERRAMENTA_DE_REDE = /\b(?:curl|wget|http|httpie|xh|ssh|scp|sshpass|rsync)\b/;
const ALVO_LOCAL = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])(?:[:/]|$)/i;

// Só sai da máquina o comando que usa ferramenta de rede e não fala apenas com endereço local.
function saiDaMaquina(comando) {
  if (!FERRAMENTA_DE_REDE.test(comando)) return false;
  if (/\b(?:ssh|scp|sshpass|rsync)\b/.test(comando)) return true;
  const alvos = [...comando.matchAll(/https?:\/\/([^\s"']+)/gi)].map((m) => m[1]);
  return alvos.length === 0 || alvos.some((a) => !ALVO_LOCAL.test(a));
}

const REGRAS = {
  pergunta_ao_dono: { papel: 'sim', motivo: 'perguntar ao dono pelo terminal pede decisão que a sessão deve tomar sozinha; escolha o padrão, execute e avise depois.' },
  laco_com_sleep: { papel: 'antes', motivo: 'laço com sleep em primeiro plano trava a sessão; rode em segundo plano e acompanhe por monitor, sem esperar parado.' },
  segredo_literal: { papel: 'aval', motivo: 'segredo literal no comando vaza em log e histórico; use a variável de ambiente ou o arquivo de chaves.' },
};

export function classificar(entrada) {
  if (entrada.tool_name === 'AskUserQuestion') return 'pergunta_ao_dono';
  if (entrada.tool_name !== 'Bash') return null;
  const comando = String(entrada.tool_input?.command ?? '');
  if (!GATILHOS.test(comando)) return null;
  if (valoresLiterais(comando).length) return 'segredo_literal';
  const emSegundoPlano = entrada.tool_input?.run_in_background === true;
  return !emSegundoPlano && LACO_COM_SLEEP.test(comando) ? 'laco_com_sleep' : null;
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
  const regra = classificar(entrada);
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
  return escalar(bloquear ? saidaNegar(`${nomeCompleto(lei)}: ${motivo}`) : null, { entrada, config, lei, projeto, sinal: regra, trecho: comando }, deps);
}

await principal(import.meta.url, executar);
