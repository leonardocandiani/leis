#!/usr/bin/env node
// PreToolUse (SendMessage, Agent, Workflow e o Bash que casa com leitura.saidas): L.I.D.A. antes de a decisão sair.
// Confere se as fontes citadas foram lidas nos últimos 30 min e se uma consulta local já acha o mesmo trabalho.
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { nomeDoProjeto, principal, projetoTem, saidaNegar } from './entrada.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto, normalizar } from './leis.mjs';
import { escapar, leuFonte, regexSeguro, usosRecentes } from './leitura.mjs';
import { mascarar, trecho } from './mascarar.mjs';
import { registrar } from './registro.mjs';

const FERRAMENTAS = new Set(['SendMessage', 'Agent', 'Workflow']);
const CAMPOS_DE_TEXTO = ['message', 'prompt', 'description', 'script'];
const TETO_CONSULTAS_MS = 2000;
const MAX_FONTES = 8;
const MAX_TERMOS = 6;
const LIBERACAO = /\bLIDO:[ \t]*(\S.{9,})/s;
const CAMINHO = /(?<![\w.:/~$-])\/(?:[\w.@+%-]+\/)*[\w.@+%-]+/g;
const CABECALHO = /^(?:count:|help\b|0\s|\S+\[\d+\](?:\{[^}]*\})?:$)/;
const STOPWORDS = new Set(['para', 'como', 'com', 'uma', 'umas', 'uns', 'que', 'por', 'dos', 'das', 'nos', 'nas', 'mais', 'esta', 'este', 'esse', 'essa', 'isso', 'isto', 'sobre', 'entre', 'ainda', 'quando', 'onde', 'voce', 'seu', 'sua', 'ele', 'ela', 'foi', 'ser', 'tem', 'sem', 'mas', 'pelo', 'pela', 'aos', 'ate', 'depois', 'antes', 'tambem', 'ja', 'nao', 'sim', 'todo', 'toda', 'cada', 'fazer', 'feito']);

const textoDaEntrada = (entrada) => (entrada.tool_name === 'Bash'
  ? String(entrada.tool_input?.command ?? '')
  : CAMPOS_DE_TEXTO.map((c) => entrada.tool_input?.[c]).filter((v) => typeof v === 'string').join('\n'));

const casaAlgum = (padroes, texto) => (padroes ?? []).some((p) => regexSeguro(p)?.test(texto));

function ehArquivo(caminho) {
  try {
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
}

function valoresDaFlag(texto, flag) {
  const rx = new RegExp(`(?:^|\\s)${escapar(flag)}(?:=|\\s+)("[^"]*"|'[^']*'|\\S+)`, 'g');
  return [...texto.matchAll(rx)].map((m) => m[1].replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
}

export function extrairFontes(texto, leitura = {}) {
  const alvo = normalizar(texto);
  const arquivos = [...new Set((texto.match(CAMINHO) ?? []).map((c) => c.replace(/[.,;:]+$/, '')))].filter(ehArquivo);
  const destinos = [...new Set((leitura.flags_de_destino ?? []).flatMap((f) => valoresDaFlag(texto, f)))];
  const nomes = (leitura.nomes ?? []).filter((n) => new RegExp(`(?<![a-z0-9])${escapar(normalizar(n))}(?![a-z0-9])`).test(alvo));
  return [
    ...arquivos.map((fonte) => ({ fonte, tipo: 'arquivo' })),
    ...destinos.map((fonte) => ({ fonte, tipo: 'destino' })),
    ...nomes.map((fonte) => ({ fonte, tipo: 'nome' })),
  ].slice(0, MAX_FONTES);
}

export function termosDe(texto) {
  const palavras = normalizar(texto.replace(/\S*\/\S*/g, ' ')).match(/[a-z]{4,}/g) ?? [];
  const unicas = [...new Set(palavras)].filter((p) => !STOPWORDS.has(p));
  const escolhidas = new Set([...unicas].sort((a, b) => b.length - a.length).slice(0, MAX_TERMOS));
  return unicas.filter((p) => escolhidas.has(p));
}

// Regex de leitor vira comando legível para a dica: sem \b, \s+ e classes de aspas.
const legivel = (padrao, fonte) => padrao.replaceAll('{fonte}', fonte).replace(/\\b/g, '').replace(/\\s[+*]?/g, ' ').replace(/\[[^\]]*\][?*+]?/g, '').replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim();

function achadosSemLeitura(fontes, usos, leitura) {
  return fontes.filter((f) => !leuFonte(usos, f, leitura.leitores)).map((f) => {
    const leitor = (leitura.leitores ?? [])[0];
    const sugestao = f.tipo === 'arquivo' ? `Read ${f.fonte}` : leitor ? legivel(leitor, f.fonte) : `leia ${f.fonte}`;
    return { tipo: 'sem_leitura', fonte: f.fonte, texto: `"${f.fonte}" sem leitura nos últimos 30 min; leia antes de agir: ${sugestao}.` };
  });
}

const aplica = (consulta, vars) => {
  const quando = consulta.quando ?? 'sempre';
  return quando === 'sempre' || (quando === 'com_destino' && !!vars.destino) || (quando === 'com_arquivo' && !!vars.arquivo);
};

const preencher = (arg, vars) => arg.replaceAll('{termos}', vars.termos.join(' ')).replaceAll('{destino}', vars.destino ?? '').replaceAll('{arquivo}', vars.arquivo ?? '');

function rodarConsulta(consulta, vars, tetoMs) {
  const [programa, ...args] = consulta.comando.map((a) => preencher(a, vars));
  return new Promise((resolve) => {
    execFile(programa, args, { timeout: tetoMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 256 * 1024 }, (erro, stdout) => {
      if (erro && (erro.killed || typeof erro.code === 'string')) return resolve({ nome: consulta.nome, indisponivel: true });
      resolve({ nome: consulta.nome, stdout: erro ? '' : stdout });
    });
  });
}

export function linhasQueAchou(stdout, vars) {
  const destino = vars.destino ? normalizar(vars.destino) : '';
  return stdout.split('\n').map((l) => l.trim()).filter((l) => l && !CABECALHO.test(l)).filter((l) => {
    const n = normalizar(l);
    return (destino && n.includes(destino)) || vars.termos.filter((t) => n.includes(t)).length >= 2;
  });
}

async function consultar(leitura, fontes, texto, tetoMs) {
  const vars = { termos: termosDe(texto), destino: fontes.find((f) => f.tipo === 'destino')?.fonte ?? fontes.find((f) => f.tipo === 'nome')?.fonte, arquivo: fontes.find((f) => f.tipo === 'arquivo')?.fonte };
  const aplicaveis = (leitura.consultas ?? []).filter((c) => aplica(c, vars));
  const resultados = await Promise.all(aplicaveis.map((c) => rodarConsulta(c, vars, tetoMs)));
  return {
    indisponiveis: resultados.filter((r) => r.indisponivel).map((r) => r.nome),
    achados: resultados.filter((r) => !r.indisponivel).flatMap((r) => {
      const linhas = linhasQueAchou(r.stdout, vars).slice(0, 2).map((l) => trecho(l, 200));
      return linhas.length ? [{ tipo: 'ja_existe', fonte: r.nome, texto: `a consulta "${r.nome}" já achou algo parecido (${linhas.map((l) => `"${l}"`).join('; ')}); confirme se isto já foi feito ou está aberto.` }] : [];
    }),
  };
}

export async function executar(entrada, deps = {}) {
  if (projetoTem('scripts', 'central', 'hooks', 'portao.ts')) return null;
  const nome = entrada.tool_name;
  if (!FERRAMENTAS.has(nome) && nome !== 'Bash') return null;
  const { config } = deps.config ?? carregarConfig();
  const lei = leiPorPapel(config, 'leitura');
  if (!lei) return null;
  const leitura = config.leitura ?? {};
  const texto = textoDaEntrada(entrada);
  if (!texto || (nome === 'Bash' && !casaAlgum(leitura.saidas, texto))) return null;

  const inicio = Date.now();
  const base = { sessao: entrada.session_id, projeto: nomeDoProjeto(entrada), hook: 'fiscal-leitura', lei: lei.sigla, natureza: 'omissao' };
  const liberacao = LIBERACAO.exec(texto);
  if (liberacao) {
    registrar({ ...base, decisao: 'liberada', trecho: liberacao[0] });
    return null;
  }

  const fontes = extrairFontes(texto, leitura);
  const usos = fontes.length && entrada.transcript_path ? (deps.usosRecentes ?? usosRecentes)(entrada.transcript_path, deps.agora ?? Date.now()) : null;
  const consultas = await consultar(leitura, fontes, texto, deps.tetoMs ?? TETO_CONSULTAS_MS);
  for (const indisponivel of consultas.indisponiveis) registrar({ ...base, decisao: 'consulta_indisponivel', trecho: indisponivel });

  const achados = [...(usos ? achadosSemLeitura(fontes, usos, leitura) : []), ...consultas.achados];
  if (!achados.length) return null;

  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  registrar({ ...base, decisao: bloquear ? 'negada' : 'observada', duracao_ms: Date.now() - inicio, trecho: achados.map((a) => `${a.tipo}: ${a.fonte}`).join('; ') });
  if (!bloquear) return null;
  const motivo = `${nomeCompleto(lei)}: ${lei.regra} ${achados.map((a) => mascarar(a.texto)).join(' ')} Para seguir mesmo assim, inclua no texto "LIDO: <o que você leu e concluiu>" (ao menos 10 caracteres).`;
  return saidaNegar(motivo);
}

await principal(import.meta.url, executar);
