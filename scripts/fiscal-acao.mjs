#!/usr/bin/env node
// PreToolUse (Bash e AskUserQuestion): regras determinísticas, sem rede e sem ler arquivo grande.
import { nomeDoProjeto, principal, projetoTem, saidaNegar } from './entrada.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto } from './leis.mjs';
import { escalar } from './escalada.mjs';
import { registrar } from './registro.mjs';

const GATILHOS = /sleep|access_token|SSHPASS|Bearer/;
const LACO_COM_SLEEP = /\b(?:while|until)\b[\s\S]*\bsleep\s+\d|\bfor\b[\s\S]*\bdo\b[\s\S]*\bsleep\s+\d/;
const SEGREDOS = [/access_token=(?!\$)([^\s&"']{20,})/gi, /\bSSHPASS=["']?(?!\$)([^\s"']+)/g, /\bBearer\s+(?!\$)([A-Za-z0-9._~+/=-]{20,})/g];
const VALOR_FICTICIO = /test|teste|exemplo|example|fake|dummy|placeholder|ficticio|mock|xxx|changeme|seu_|sua_|your_|^<.*>$|^\$\{|^\$\w/i;

const temSegredoLiteral = (comando) => SEGREDOS.some((r) => [...comando.matchAll(r)].some((m) => !VALOR_FICTICIO.test(m[1])));

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
  if (temSegredoLiteral(comando)) return 'segredo_literal';
  const emSegundoPlano = entrada.tool_input?.run_in_background === true;
  return !emSegundoPlano && LACO_COM_SLEEP.test(comando) ? 'laco_com_sleep' : null;
}

export function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'portao.ts')) return null;
  const regra = classificar(entrada);
  if (!regra) return null;
  const { config } = deps.config ?? carregarConfig();
  const { papel, motivo } = REGRAS[regra];
  const lei = leiPorPapel(config, papel);
  if (!lei) return null;
  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  const projeto = nomeDoProjeto(entrada);
  const comando = String(entrada.tool_input?.command ?? entrada.tool_name);
  registrar({
    sessao: entrada.session_id, projeto, hook: 'fiscal-acao', lei: lei.sigla, natureza: 'acao', sinal: regra,
    decisao: bloquear ? 'negada' : 'observada', trecho: `${regra}: ${comando}`,
  });
  return escalar(bloquear ? saidaNegar(`${nomeCompleto(lei)}: ${motivo}`) : null, { entrada, config, lei, projeto, sinal: regra, trecho: comando }, deps);
}

await principal(import.meta.url, executar);
