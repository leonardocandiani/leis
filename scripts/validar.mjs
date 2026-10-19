#!/usr/bin/env node
// Confere se as leis estão implantadas: config, hooks, chave do JEV, resposta do JEV e registro gravável.
// Uso: node validar.mjs   (saída TOON, exit 0 sem falha e 1 com falha)
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opcoesOuSair } from './cli.mjs';
import { ehPrincipal } from './entrada.mjs';
import { carregarConfig, casaDoUsuario } from './leis.mjs';
import { chaveDisponivel, perguntar } from './jev.mjs';
import { tabela } from './toon.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const LIMITE_JEV_MS = 3000;
const ler = (caminho) => {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return '';
  }
};

const ok = (item, detalhe) => ({ item, estado: 'ok', detalhe });
const falha = (item, detalhe) => ({ item, estado: 'falha', detalhe });
const aviso = (item, detalhe) => ({ item, estado: 'aviso', detalhe });

function conferirConfig() {
  const { origem, aviso: msg, errosUsuario } = carregarConfig();
  if (origem === 'usuario') return [ok('config_esquema', 'leis.json do usuário válido'), ok('config_origem', 'usuario')];
  const ausente = errosUsuario[0] === 'ausente';
  return [ausente ? aviso('config_esquema', 'sem leis.json; usando o modelo') : falha('config_esquema', errosUsuario.slice(0, 3).join('; ')), aviso('config_origem', msg)];
}

export function hooksDoPluginExistem() {
  let hooks;
  try {
    hooks = JSON.parse(readFileSync(join(RAIZ, 'hooks', 'hooks.json'), 'utf8')).hooks;
  } catch {
    return falha('hooks_arquivos', 'hooks/hooks.json ilegível');
  }
  const comandos = Object.values(hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  const faltando = comandos.map((c) => /scripts\/([\w-]+\.mjs)/.exec(c)?.[1]).filter((s) => !s || !existsSync(join(RAIZ, 'scripts', s)));
  return faltando.length ? falha('hooks_arquivos', `script ausente: ${faltando.join(', ')}`) : ok('hooks_arquivos', `${comandos.length} hooks apontam para scripts existentes`);
}

export function hooksAtivos(claudeDir) {
  const settings = ler(join(claudeDir, 'settings.json'));
  const instalados = ler(join(claudeDir, 'plugins', 'installed_plugins.json'));
  const habilitado = /"leis@[^"]+"\s*:\s*true/.test(settings);
  const direto = /scripts\/(relato|fiscal-resposta|fiscal-acao|sessao)\.mjs/.test(settings);
  if (habilitado || direto) return ok('hooks_ativos', habilitado ? 'plugin leis habilitado' : 'hooks das leis no settings.json');
  return falha('hooks_ativos', instalados.includes('"leis@') ? 'plugin instalado mas não habilitado' : 'plugin leis não instalado (claude plugin install leis@leis)');
}

async function conferirJev(extras, jev) {
  if (!chaveDisponivel(extras)) return [falha('chave_jev', 'nenhuma chave encontrada (AI_GATEWAY_API_KEY ou TYPESAFE_API_KEY)'), aviso('jev_responde', 'pulado: sem chave')];
  const perguntas = { v: { type: 'choice', instructions: 'Responda sim.', criteria: { sim: 'a resposta é sim', nao: 'a resposta é não' } } };
  const inicio = Date.now();
  const r = await (jev ?? perguntar)({ validacao: 'plugin leis' }, perguntas, { timeoutMs: LIMITE_JEV_MS, extras });
  const ms = Date.now() - inicio;
  const respondeu = !!r?.v?.choice;
  return [ok('chave_jev', 'chave encontrada (valor não exibido)'), respondeu && ms < LIMITE_JEV_MS ? ok('jev_responde', `${ms} ms`) : falha('jev_responde', respondeu ? `lento: ${ms} ms` : `sem resposta em ${LIMITE_JEV_MS} ms`)];
}

function conferirRegistro() {
  const sonda = join(casaDoUsuario(), `.sonda-${process.pid}`);
  try {
    mkdirSync(casaDoUsuario(), { recursive: true });
    writeFileSync(sonda, 'ok');
    rmSync(sonda);
    return ok('registro_gravavel', casaDoUsuario().replace(homedir(), '~'));
  } catch (e) {
    return falha('registro_gravavel', e.code ?? 'erro de escrita');
  }
}

export async function validar(deps = {}) {
  const claudeDir = deps.claudeDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const { config } = carregarConfig();
  const jev = await conferirJev(config.jev?.arquivos_chave ?? [], deps.jev);
  return [...conferirConfig(), hooksDoPluginExistem(), hooksAtivos(claudeDir), ...jev, conferirRegistro()];
}

export function paraToon(itens) {
  const aprovado = itens.every((i) => i.estado !== 'falha');
  return [`resultado: ${aprovado ? 'pass' : 'fail'}`, tabela('itens', ['item', 'estado', 'detalhe'], itens), aprovado ? 'help: node scripts/medir.mjs mostra o que os hooks registraram' : 'help: corrija os itens em falha e rode de novo'].join('\n');
}

if (ehPrincipal(import.meta.url)) {
  opcoesOuSair({}, 'Confere se as leis estão implantadas (config, hooks, chave do JEV, JEV, registro).\n\nUso: node validar.mjs [--help]\n\nExemplos (examples):\n  node validar.mjs\n\nSaída TOON; exit 0 sem falha, 1 com falha, 2 em erro de uso.');
  const itens = await validar();
  process.stdout.write(`${paraToon(itens)}\n`);
  process.exitCode = itens.some((i) => i.estado === 'falha') ? 1 : 0;
}
