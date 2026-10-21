#!/usr/bin/env node
// Auto-melhoria do repositório público: a quebra que se repete em vários projetos é um erro genérico do plugin
// (regra fraca, falso positivo, instrução que não ensina), não do dono. Ela vira um caso em docs/casos/.
// O caso leva só estrutura: papel da lei, sinal do fiscal, contagens e versões. Nenhum trecho, caminho, nome,
// número ou projeto sai da máquina. Padrão é --seco (só mostra); --abrir-pr grava, confere e abre o PR.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { opcoesOuSair } from './cli.mjs';
import { ehPrincipal } from './entrada.mjs';
import { carregarConfig } from './leis.mjs';
import { ehQuebra, lerRegistro, quebrasDistintas } from './registro.mjs';
import { tabela } from './toon.mjs';

const MINIMO_PROJETOS = 2;
const MINIMO_VEZES = 3;
const SINAL_SEGURO = /^[a-z][a-z0-9_+]{0,59}$/;
// O que nunca pode sair num caso público, conferido no texto final antes do commit.
const PROIBIDO = [/\/(Users|home)\//, /@lid\b/, /@s\.whatsapp/, /\d{8,}/, /[\w.-]+@[\w-]+\.\w+/];

const dia = (ts) => String(ts).slice(0, 10);

// O papel da lei é do plugin; a sigla é do dono e pode ser pessoal, por isso o caso usa o papel.
function papelDa(config, sigla) {
  return config.leis.find((l) => l.sigla === sigla)?.papel ?? null;
}

export function candidatos(eventos, config) {
  const grupos = new Map();
  for (const e of quebrasDistintas(eventos.filter(ehQuebra))) {
    const papel = papelDa(config, e.lei);
    const sinal = SINAL_SEGURO.test(e.sinal ?? '') ? e.sinal : 'sem_sinal';
    if (!papel) continue;
    const chave = `${papel}|${sinal}|${e.hook}`;
    const g = grupos.get(chave) ?? { papel, sinal, hook: e.hook, vezes: 0, projetos: new Set(), versoes: new Set(), primeira: e.ts, ultima: e.ts };
    g.vezes += 1;
    // Projeto desconhecido não prova que a quebra saiu do mesmo projeto: fica fora da contagem.
    if (e.projeto) g.projetos.add(e.projeto);
    if (e.versao) g.versoes.add(e.versao);
    g.ultima = e.ts;
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .filter((g) => g.projetos.size >= MINIMO_PROJETOS && g.vezes >= MINIMO_VEZES)
    .map((g) => ({ papel: g.papel, sinal: g.sinal, hook: g.hook, vezes: g.vezes, projetos: g.projetos.size, versoes: [...g.versoes].join('/') || '-', primeira: dia(g.primeira), ultima: dia(g.ultima) }))
    .sort((a, b) => b.vezes - a.vezes);
}

export const nomeDoCaso = (c) => `${c.papel}-${c.sinal.replaceAll('+', '-')}-${c.hook}.md`;

export function textoDoCaso(c) {
  return [
    `# Caso: lei de papel "${c.papel}", sinal "${c.sinal}"`,
    '',
    `- fiscal: ${c.hook}`,
    `- quebras distintas: ${c.vezes}, em ${c.projetos} projetos`,
    `- versões do plugin: ${c.versoes}`,
    `- período: ${c.primeira} a ${c.ultima}`,
    '',
    'A mesma quebra apareceu em projetos diferentes da mesma instalação, o que aponta para o plugin',
    '(regra fraca, falso positivo ou instrução de correção que não ensina) e não para um projeto.',
    '',
    '## Para quem mantém',
    '',
    'Reproduza com um teste no fiscal acima, decida se a regra ou a instrução muda e feche o caso no mesmo PR.',
    '',
  ].join('\n');
}

export const conferirHigiene = (texto) => PROIBIDO.filter((r) => r.test(texto)).map(String);

export function paraToon(lista, modo) {
  if (!lista.length) return `count: 0\nmodo: ${modo}\naviso: nenhuma quebra repetida em ${MINIMO_PROJETOS}+ projetos e ${MINIMO_VEZES}+ vezes; nada a contribuir\nhelp: node scripts/validar.mjs mostra a curva de quebras`;
  return [`count: ${lista.length}`, `modo: ${modo}`, tabela('casos', ['papel', 'sinal', 'hook', 'vezes', 'projetos', 'versoes'], lista), modo === 'seco' ? 'help: node scripts/contribuir.mjs --abrir-pr --repo <clone do repositório leis> grava docs/casos/ e abre o PR' : ''].filter(Boolean).join('\n');
}

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function abrirPr(lista, repo, exec = { git, gh: (args, cwd) => execFileSync('gh', args, { cwd, encoding: 'utf8' }).trim() }) {
  if (!existsSync(join(repo, '.claude-plugin', 'plugin.json'))) return { erro: `${repo} não é um clone do repositório leis`, code: 'REPO' };
  const arquivos = lista.map((c) => ({ caminho: join('docs', 'casos', nomeDoCaso(c)), texto: textoDoCaso(c) }));
  const sujos = arquivos.filter((a) => conferirHigiene(a.texto).length);
  if (sujos.length) return { erro: `caso com dado que não pode sair: ${sujos.map((a) => a.caminho).join(', ')}`, code: 'HIGIENE' };
  // O commit leva o índice inteiro: clone com alteração pendente vazaria para o PR público sem passar pela higiene.
  if (exec.git(repo, 'status', '--porcelain')) return { erro: `${repo} tem alteração pendente; use um clone limpo`, code: 'SUJO' };
  const ramo = `casos/${new Date().toISOString().slice(0, 10)}-${process.pid}`;
  exec.git(repo, 'checkout', '-b', ramo, 'origin/main');
  mkdirSync(join(repo, 'docs', 'casos'), { recursive: true });
  for (const a of arquivos) writeFileSync(join(repo, a.caminho), a.texto);
  exec.git(repo, 'add', ...arquivos.map((a) => a.caminho));
  exec.git(repo, 'commit', '-m', `docs(casos): ${arquivos.length} quebras repetidas em vários projetos`, '--', ...arquivos.map((a) => a.caminho));
  exec.git(repo, 'push', '-u', 'origin', ramo);
  const corpo = `Quebras que se repetem em ${MINIMO_PROJETOS} ou mais projetos, geradas por \`contribuir.mjs\`. Só estrutura: papel da lei, sinal do fiscal e contagens.\n\n${arquivos.map((a) => `- ${a.caminho}`).join('\n')}`;
  return { url: exec.gh(['pr', 'create', '--title', `docs(casos): ${arquivos.length} quebras repetidas`, '--body', corpo, '--head', ramo], repo) };
}

if (ehPrincipal(import.meta.url)) {
  const opcoes = opcoesOuSair({ '--seco': 'flag', '--abrir-pr': 'flag', '--repo': 'valor' }, 'Mostra as quebras que se repetem em vários projetos (erro genérico do plugin) e, com --abrir-pr, abre um PR com elas no repositório leis.\n\nUso: node contribuir.mjs [--seco] [--abrir-pr --repo <clone>]\n\nExemplos (examples):\n  node contribuir.mjs\n  node contribuir.mjs --abrir-pr --repo ~/projetos/leis\n\nPadrão é --seco. Saída TOON; exit 0 ok, 1 erro, 2 erro de uso.');
  const lista = candidatos(lerRegistro(0), carregarConfig().config);
  if (!opcoes['--abrir-pr'] || !lista.length) {
    process.stdout.write(`${paraToon(lista, 'seco')}\n`);
  } else if (!opcoes['--repo']) {
    process.stdout.write('error: --abrir-pr pede --repo <clone do repositório leis>\ncode: USO\nhelp: node contribuir.mjs --abrir-pr --repo <clone>\n');
    process.exitCode = 2;
  } else {
    const r = abrirPr(lista, opcoes['--repo']);
    process.stdout.write(r.erro ? `error: ${r.erro}\ncode: ${r.code}\nhelp: rode sem --abrir-pr para ver os casos\n` : `${paraToon(lista, 'pr')}\npr: ${r.url}\n`);
    process.exitCode = r.erro ? 1 : 0;
  }
}
