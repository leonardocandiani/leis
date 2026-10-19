#!/usr/bin/env node
// Gera a rule global (rules/leis.md) a partir do leis.json, a fonte única das leis.
// Uso: node gerar-rule.mjs [--saida caminho] [--seco] [--help]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { opcoesOuSair } from './cli.mjs';
import { ehPrincipal } from './entrada.mjs';
import { carregarConfig } from './leis.mjs';

export const CABECALHO = '<!-- Gerado de ~/.claude/leis/leis.json por /leis-implantar; edite o json -->';
const celula = (t) => String(t).replace(/\|/g, '\\|');

const AJUDA = `Gera a rule global das leis a partir do leis.json (a fonte única).

Uso: node gerar-rule.mjs [--saida <caminho>] [--seco] [--help]

Opções:
  --saida <caminho>  onde gravar (padrão: <config do Claude>/rules/leis.md)
  --seco             mostra o que geraria e não escreve nada
  --help             esta ajuda

Exemplos (examples):
  node gerar-rule.mjs --seco
  node gerar-rule.mjs --saida ./leis.md`;

function secaoDaLei(l) {
  return [
    `## Lei ${l.numero}, ${l.sigla}, ${l.nome}`,
    `**Regra.** ${l.regra}`,
    `**Teste.** ${l.teste}`,
    ...(l.aplicacao?.length ? ['**Como se aplica.**', ...l.aplicacao.map((a) => `- ${a}`)] : []),
    `**Erro.** ${l.erro}`,
    `**Correção.** ${l.correcao}`,
    '',
  ];
}

const linhaDeFontes = (fontes) => (fontes?.length ? [`Fontes: ${fontes.map((f) => `${f.rotulo} (${f.caminho_ou_url})`).join('; ')}`, ''] : []);

export function gerarRegra(config) {
  const linhas = config.leis.map((l) => `| ${l.numero} | ${celula(l.sigla)} | ${celula(l.nome)} | ${celula(l.regra)} | ${celula(l.teste)} |`);
  return [
    CABECALHO,
    `# Leis do ${config.dono}`,
    'Valem em toda sessão, acima das outras regras. Quando duas leis brigam, vale o equilíbrio abaixo.',
    '',
    ...linhaDeFontes(config.fontes),
    '| Lei | Sigla | Nome por extenso | Regra | Teste |',
    '|---|---|---|---|---|',
    ...linhas,
    '',
    ...config.leis.flatMap(secaoDaLei),
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
  const opcoes = opcoesOuSair({ '--saida': 'valor', '--seco': 'flag' }, AJUDA);
  const destino = opcoes['--saida'] ?? join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'rules', 'leis.md');
  const { config, origem, aviso } = carregarConfig();
  if (origem !== 'usuario') {
    process.stderr.write(`erro: ${aviso}\n`);
    process.exit(1);
  }
  if (opcoes['--seco']) {
    process.stdout.write(`destino: ${destino} (nada foi escrito)\n---\n${gerarRegra(config)}`);
  } else {
    const r = gravarRegra(config, destino);
    process.stdout.write(`destino: ${r.destino}\n${r.backup ? `backup: ${r.backup}\n` : ''}`);
  }
}
