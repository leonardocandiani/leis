#!/usr/bin/env node
// Gera a rule global (rules/leis.md) a partir do leis.json, a fonte única das leis.
// Uso: node gerar-rule.mjs [--saida caminho]   (padrão: <config do Claude>/rules/leis.md)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ehPrincipal } from './entrada.mjs';
import { carregarConfig } from './leis.mjs';

export const CABECALHO = '<!-- Gerado de ~/.claude/leis/leis.json por /leis-implantar; edite o json -->';
const celula = (t) => String(t).replace(/\|/g, '\\|');

export function gerarRegra(config) {
  const linhas = config.leis.map((l) => `| ${l.numero} | ${celula(l.sigla)} | ${celula(l.nome)} | ${celula(l.regra)} | ${celula(l.teste)} |`);
  return [
    CABECALHO,
    `# Leis do ${config.dono}`,
    'Valem em toda sessão, acima das outras regras. Quando duas leis brigam, vale o equilíbrio abaixo.',
    '',
    '| Lei | Sigla | Nome por extenso | Regra | Teste |',
    '|---|---|---|---|---|',
    ...linhas,
    '',
    '## Equilíbrio',
    ...config.equilibrio.map((e) => `- ${e}`),
    '',
    '## O que nunca fazer',
    ...config.vedacoes.map((v) => `- ${v}`),
    '',
  ].join('\n');
}

export function gravarRegra(config, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  let backup = null;
  if (existsSync(destino) && !readFileSync(destino, 'utf8').startsWith(CABECALHO)) {
    backup = `${destino}.antes`;
    copyFileSync(destino, backup);
  }
  writeFileSync(destino, gerarRegra(config));
  return { destino, backup };
}

if (ehPrincipal(import.meta.url)) {
  const i = process.argv.indexOf('--saida');
  const padrao = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'rules', 'leis.md');
  const { config, origem, aviso } = carregarConfig();
  if (origem !== 'usuario') {
    process.stderr.write(`erro: ${aviso}\n`);
    process.exit(1);
  }
  const r = gravarRegra(config, i > -1 ? process.argv[i + 1] : padrao);
  process.stdout.write(`destino: ${r.destino}\n${r.backup ? `backup: ${r.backup}\n` : ''}`);
}
