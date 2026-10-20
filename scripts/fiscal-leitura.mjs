#!/usr/bin/env node
// PreToolUse (SendMessage, Agent, Workflow e o Bash que casa com leitura.saidas): L.I.D.A. antes de a decisão sair.
// Confere se as fontes citadas foram lidas nos últimos 30 min e se uma consulta local já acha o mesmo trabalho.
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { nomeDoProjeto, principal, projetoTem, saidaNegar } from './entrada.mjs';
import { carregarConfig, leiPorPapel, modoDaLei, nomeCompleto, normalizar } from './leis.mjs';
import { escapar, leuFonte, regexSeguro, usosRecentes } from './leitura.mjs';
import { perguntar as perguntarAoJev, escolha } from './jev.mjs';
import { mascarar, trecho } from './mascarar.mjs';
import { registrar } from './registro.mjs';

const FERRAMENTAS = new Set(['SendMessage', 'Agent', 'Workflow']);
const CAMPOS_DE_TEXTO = ['message', 'prompt', 'description', 'script'];
const TETO_CONSULTAS_MS = 2000;
const MAX_FONTES = 8;
const MAX_TERMOS = 8;
const MAX_CANDIDATAS = 12;
const CONFIANCA_MINIMA = 0.7;
const JEV_MINIMO_MS = 800;
const FLAGS_IGNORADAS_PADRAO = ['--origem'];
const FLAGS_DE_TEXTO = new Set(['titulo', 'contexto', 'mensagem', 'texto', 'descricao', 'corpo', 'assunto', 'motivo', 'nota', 'message', 'title', 'body', 'text', 'description']);
const HORARIO = /\b\d{1,2}(?:h(?:\d{2})?|:\d{2})(?!\w)/g;
const DATA = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g;
const NOME_PROPRIO = /\p{Lu}\p{L}{2,}/gu;
const LIBERACAO = /\bLIDO:[ \t]*(\S.{9,})/s;
const CAMINHO = /(?<![\w.:/~$-])\/(?:[\w.@+%-]+\/)*[\w.@+%-]+/g;
const TABELA = /^\S+\[\d+\](?:\{[^}]*\})?:$/;
const CHAVE_VALOR = /^[\w-]+:(?:\s|$)/;
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

// Só o texto livre da ação: no Bash, o valor das flags de texto (menos as ignoradas); nas outras ferramentas, o texto todo.
export function textoLivre(nomeDaFerramenta, texto, leitura = {}) {
  if (nomeDaFerramenta !== 'Bash') return texto;
  const ignoradas = new Set(leitura.flags_ignoradas ?? FLAGS_IGNORADAS_PADRAO);
  const rx = /(?:^|\s)(--[\w-]+)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/g;
  return [...texto.matchAll(rx)]
    .filter(([, flag]) => FLAGS_DE_TEXTO.has(flag.slice(2)) && !ignoradas.has(flag))
    .map(([, , valor]) => valor.replace(/^(["'])(.*)\1$/s, '$2')).join('\n');
}

// Prioridade: horários, datas, nomes próprios, depois as demais palavras sem stopword (as mais longas primeiro).
export function termosDe(texto) {
  const datas = texto.match(DATA) ?? [];
  const livre = texto.replace(/\S*\/\S*/g, ' ');
  const nomes = (livre.replace(/(^|[.!?]\s+|\n)\p{L}+/gu, '$1').match(NOME_PROPRIO) ?? []).filter((n) => !STOPWORDS.has(normalizar(n)));
  const palavras = (normalizar(livre).match(/[a-z]{4,}/g) ?? []).filter((p) => !STOPWORDS.has(p)).sort((a, b) => b.length - a.length);
  const vistos = new Set();
  return [...[...(livre.match(HORARIO) ?? []), ...datas].slice(0, 2), ...nomes.slice(0, 3), ...palavras]
    .filter((t) => (vistos.has(normalizar(t)) ? false : vistos.add(normalizar(t))))
    .slice(0, MAX_TERMOS);
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

const ehEco = (linha, ecos) => ecos.some((e) => linha.includes(e) && (/\s/.test(e) || new RegExp(`^[\\w-]+:\\s*["']?${escapar(e)}["']?$`).test(linha)));

// Linhas candidatas: sem eco da busca nem cabeçalho TOON, com o destino ou ao menos um termo.
export function linhasCandidatas(stdout, vars, ecos = []) {
  const destino = vars.destino ? normalizar(vars.destino) : '';
  const termos = vars.termos.map(normalizar);
  let naTabela = false;
  return stdout.split('\n').map((l) => l.trim()).filter((l) => {
    if (!l || /^(?:count:|help\b|0\s)/.test(l)) return false;
    if (TABELA.test(l)) return !(naTabela = true);
    return !(CHAVE_VALOR.test(l) && !naTabela) && !ehEco(l, ecos);
  }).filter((l) => {
    const n = normalizar(l);
    return (destino && n.includes(destino)) || termos.some((t) => n.includes(t));
  });
}

// Uma consulta ruidosa não pode ocupar as vagas do JEV: sobem as linhas com mais termos em comum (destino vale 3).
function pontosDaLinha(linha, vars) {
  const n = normalizar(linha);
  const destino = vars.destino && n.includes(normalizar(vars.destino)) ? 3 : 0;
  return destino + vars.termos.filter((t) => n.includes(normalizar(t))).length;
}

async function consultar(leitura, fontes, tetoMs, textoDaAcao) {
  const vars = { termos: termosDe(textoDaAcao), destino: fontes.find((f) => f.tipo === 'destino')?.fonte ?? fontes.find((f) => f.tipo === 'nome')?.fonte, arquivo: fontes.find((f) => f.tipo === 'arquivo')?.fonte };
  const aplicaveis = (leitura.consultas ?? []).filter((c) => aplica(c, vars));
  const resultados = await Promise.all(aplicaveis.map((c) => rodarConsulta(c, vars, tetoMs)));
  const ecos = aplicaveis.flatMap((c) => c.comando.filter((a) => /\{(?:termos|destino)\}/.test(a)).map((a) => preencher(a, vars))).filter(Boolean);
  const candidatas = resultados.filter((r) => !r.indisponivel)
    .flatMap((r) => linhasCandidatas(r.stdout, vars, ecos).map((linha) => ({ consulta: r.nome, linha: trecho(linha, 200), pontos: pontosDaLinha(linha, vars) })))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, MAX_CANDIDATAS)
    .map(({ consulta, linha }) => ({ consulta, linha }));
  return { indisponiveis: resultados.filter((r) => r.indisponivel).map((r) => r.nome), candidatas };
}

const CRITERIOS_DA_CONSULTA = {
  ja_feito: 'a ação descrita já foi executada, segundo as linhas de evidência',
  ja_aberto: 'já existe pedido, espera ou oferta aberta que esta ação repete ou contradiz: o mesmo pedido de novo, ou o mesmo horário já oferecido a outra pessoa. Ação que dá andamento ao que está aberto (responde, troca, fecha) não conta',
  nenhum: 'as linhas não mostram que a ação já foi feita nem que haja algo aberto sobre ela',
};

async function julgarCandidatas(candidatas, texto, timeoutMs, deps, config) {
  const estado = { acao: mascarar(texto).slice(0, 1500), evidencias: candidatas.map((c) => c.linha) };
  const perguntas = { achado: { type: 'choice', instructions: 'Dada a ação (campo acao) e as linhas que uma consulta local devolveu (campo evidencias), diga se a ação já foi feita ou se já há algo aberto sobre ela. Escolha "nenhum" na dúvida.', criteria: CRITERIOS_DA_CONSULTA } };
  const respostas = await (deps.jev ?? perguntarAoJev)(estado, perguntas, { timeoutMs, extras: config.jev?.arquivos_chave ?? [] });
  return escolha(respostas, 'achado', CRITERIOS_DA_CONSULTA);
}

async function achadosDasConsultas(consultas, texto, inicio, deps, config, tetoMs) {
  if (!consultas.candidatas.length) return { achados: [], jevFora: false };
  const veredito = await julgarCandidatas(consultas.candidatas, texto, Math.max(JEV_MINIMO_MS, tetoMs - (Date.now() - inicio)), deps, config);
  if (!veredito) return { achados: [], jevFora: true };
  if (veredito.escolha === 'nenhum' || (veredito.confianca ?? 0) < CONFIANCA_MINIMA) return { achados: [], jevFora: false };
  const consulta = [...new Set(consultas.candidatas.map((c) => c.consulta))].join(', ');
  const linhas = consultas.candidatas.slice(0, 3).map((c) => `"${c.linha}"`).join('; ');
  const quadro = veredito.escolha === 'ja_feito' ? 'a ação já foi feita' : 'já há algo aberto sobre o mesmo assunto';
  return { achados: [{ tipo: 'ja_existe', fonte: consulta, texto: `a consulta "${consulta}" indica que ${quadro} (${linhas}); confirme antes de repetir.` }], jevFora: false };
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
  const base = { sessao: entrada.session_id, projeto: nomeDoProjeto(entrada), hook: 'fiscal-leitura', lei: lei.sigla, natureza: 'acao' };
  const liberacao = LIBERACAO.exec(texto);
  if (liberacao) {
    registrar({ ...base, decisao: 'liberada', trecho: liberacao[0] });
    return null;
  }

  const fontes = extrairFontes(texto, leitura);
  const usos = fontes.length && entrada.transcript_path ? (deps.usosRecentes ?? usosRecentes)(entrada.transcript_path, deps.agora ?? Date.now()) : null;
  const teto = deps.tetoMs ?? TETO_CONSULTAS_MS;
  const consultas = await consultar(leitura, fontes, teto, textoLivre(nome, texto, leitura));
  for (const indisponivel of consultas.indisponiveis) registrar({ ...base, decisao: 'consulta_indisponivel', trecho: indisponivel });

  const doJev = await achadosDasConsultas(consultas, texto, inicio, deps, config, teto);
  if (doJev.jevFora) registrar({ ...base, decisao: 'jev_indisponivel', trecho: 'consulta com candidatas' });
  const achados = [...(usos ? achadosSemLeitura(fontes, usos, leitura) : []), ...doJev.achados];
  if (!achados.length) return null;

  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  registrar({ ...base, decisao: bloquear ? 'negada' : 'observada', duracao_ms: Date.now() - inicio, trecho: achados.map((a) => `${a.tipo}: ${a.fonte}`).join('; ') });
  if (!bloquear) return null;
  const motivo = `${nomeCompleto(lei)}: ${lei.regra} ${achados.map((a) => mascarar(a.texto)).join(' ')} Para seguir mesmo assim, inclua no texto "LIDO: <o que você leu e concluiu>" (ao menos 10 caracteres).`;
  return saidaNegar(motivo);
}

await principal(import.meta.url, executar);
