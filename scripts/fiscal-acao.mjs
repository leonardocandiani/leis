#!/usr/bin/env node
// PreToolUse (Bash e AskUserQuestion): regras determinísticas, sem rede e sem ler arquivo grande.
import { nomeDoProjeto, principal, projetoTem, saidaNegar } from './entrada.mjs';
import { carregarConfig, modoDaLei, nomeCompleto, leiPorNumero } from './leis.mjs';
import { registrar } from './registro.mjs';

const GATILHOS = /sleep|access_token|SSHPASS|Bearer/;
const LACO_COM_SLEEP = /\b(?:while|until)\b[\s\S]*\bsleep\s+\d|\bfor\b[\s\S]*\bdo\b[\s\S]*\bsleep\s+\d/;
const SEGREDOS = [/access_token=(?!\$)[^\s&"']{20,}/i, /\bSSHPASS=["']?(?!\$)[^\s"']+/, /\bBearer\s+(?!\$)[A-Za-z0-9._~+/=-]{20,}/];

const REGRAS = {
  pergunta_ao_dono: { lei: 5, motivo: 'perguntar ao dono pelo terminal pede decisão que a sessão deve tomar sozinha; escolha o padrão, execute e avise depois.' },
  laco_com_sleep: { lei: 2, motivo: 'laço com sleep em primeiro plano trava a sessão; rode em segundo plano e acompanhe por monitor, sem esperar parado.' },
  segredo_literal: { lei: 6, motivo: 'segredo literal no comando vaza em log e histórico; use a variável de ambiente ou o arquivo de chaves.' },
};

export function classificar(entrada) {
  if (entrada.tool_name === 'AskUserQuestion') return 'pergunta_ao_dono';
  if (entrada.tool_name !== 'Bash') return null;
  const comando = String(entrada.tool_input?.command ?? '');
  if (!GATILHOS.test(comando)) return null;
  if (SEGREDOS.some((r) => r.test(comando))) return 'segredo_literal';
  const emSegundoPlano = entrada.tool_input?.run_in_background === true;
  return !emSegundoPlano && LACO_COM_SLEEP.test(comando) ? 'laco_com_sleep' : null;
}

export function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'portao.ts')) return null;
  const regra = classificar(entrada);
  if (!regra) return null;
  const { config } = deps.config ?? carregarConfig();
  const { lei: numero, motivo } = REGRAS[regra];
  const lei = leiPorNumero(config, numero);
  if (!lei) return null;
  const bloquear = modoDaLei(config, numero) === 'bloquear';
  registrar({
    sessao: entrada.session_id, projeto: nomeDoProjeto(entrada), hook: 'fiscal-acao', lei: lei.sigla, natureza: 'acao',
    decisao: bloquear ? 'negada' : 'observada', trecho: `${regra}: ${entrada.tool_input?.command ?? entrada.tool_name}`,
  });
  return bloquear ? saidaNegar(`${nomeCompleto(lei)}: ${motivo}`) : null;
}

await principal(import.meta.url, executar);
