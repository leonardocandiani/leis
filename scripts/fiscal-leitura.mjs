#!/usr/bin/env node
// PreToolUse (SendMessage, Agent, Workflow e o Bash que casa com leitura.saidas): L.I.D.A. antes de a decisão sair.
// Confere se as fontes citadas foram lidas nos últimos 30 min e se uma consulta local já acha o mesmo trabalho.
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { nomeDoProjeto, principal, projetoTem, saidaContexto, saidaNegar } from './entrada.mjs';
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
// Entre o aviso e a negação, o JEV está em dúvida: a sessão recebe o alerta e decide, nada é negado.
const AVISO_MINIMO = 0.4;
const JEV_MINIMO_MS = 800;
const FLAGS_IGNORADAS_PADRAO = ['--origem'];
const MANUTENCAO = /(?:^|\s)--(?:substitui|cancelar)(?:[\s=]|$)/;

// A flag só conta no segmento da própria saída e fora de aspas; um envio novo no mesmo comando segue consultado.
function soManutencao(texto, saidas) {
  const segmentos = texto.split(/\|\|?|&&|;|\n/).filter((s) => casaAlgum(saidas, s));
  return segmentos.length > 0 && segmentos.every((s) => MANUTENCAO.test(s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, ' ')));
}
const FLAGS_DE_TEXTO = new Set(['titulo', 'contexto', 'mensagem', 'texto', 'descricao', 'corpo', 'assunto', 'motivo', 'nota', 'message', 'title', 'body', 'text', 'description']);
const HORARIO = /\b\d{1,2}(?:h(?:\d{2})?|:\d{2})(?!\w)/g;
const DATA = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g;
const NOME_PROPRIO = /\p{Lu}\p{L}{2,}/gu;
const LIBERACAO = /\bLIDO:[ \t]*(\S.{9,})/s;
const CAMINHO = /(?<![\p{L}\p{N}_.:/~$-])\/(?:[\p{L}\p{N}_.@+%-]+\/)*[\p{L}\p{N}_.@+%-]+/gu;
const CAMINHO_ENTRE_ASPAS = /(["'])(\/[^"'\n]+)\1/g;
// Caminho sem aspas e com espaço (comum em mídia de WhatsApp): vai até a extensão; o statSync descarta o que não for arquivo.
const CAMINHO_COM_ESPACO = /(?<![\p{L}\p{N}_.:/~$-])\/[^\n"'`]*?\.[\p{L}\p{N}]{2,5}(?=$|[\s,;:)])/gmu;
const TABELA = /^\S+\[\d+\](?:\{[^}]*\})?:$/;
const CHAVE_VALOR = /^[\w-]+:(?:\s|$)/;
const STOPWORDS = new Set(['para', 'como', 'com', 'uma', 'umas', 'uns', 'que', 'por', 'dos', 'das', 'nos', 'nas', 'mais', 'esta', 'este', 'esse', 'essa', 'isso', 'isto', 'sobre', 'entre', 'ainda', 'quando', 'onde', 'voce', 'seu', 'sua', 'ele', 'ela', 'foi', 'ser', 'tem', 'sem', 'mas', 'pelo', 'pela', 'aos', 'ate', 'depois', 'antes', 'tambem', 'ja', 'nao', 'sim', 'todo', 'toda', 'cada', 'fazer', 'feito']);

const textoDaEntrada = (entrada) => (entrada.tool_name === 'Bash'
  ? String(entrada.tool_input?.command ?? '')
  : CAMPOS_DE_TEXTO.map((c) => entrada.tool_input?.[c]).filter((v) => typeof v === 'string').join('\n'));

const casaAlgum = (padroes, texto) => (padroes ?? []).some((p) => regexSeguro(p)?.test(texto));

// Só vira fonte o arquivo que a sessão consegue e pode ler: binário de sistema, segredo (.env, o keyfence nega a leitura)
// e mídia que o Read não abre (vídeo, áudio, compactado, banco) ficam de fora, senão a negação manda fazer o impossível.
const PASTA_DE_SISTEMA = /^\/(?:bin|sbin|usr|System|dev|etc)\//;
const ILEGIVEL = /(?:^|\/)\.env(?:\.[\w-]+)?$|\.(?:mp4|m4v|mov|webm|mkv|avi|mp3|m4a|ogg|opus|wav|aac|flac|zip|gz|tgz|zst|7z|rar|sqlite|db|wal)$/i;

function ehArquivo(caminho) {
  if (PASTA_DE_SISTEMA.test(caminho) || ILEGIVEL.test(caminho)) return false;
  try {
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
}

// Destino com variável de shell, substituição ou valor mascarado não é conversa que se possa ler.
const DESTINO_LEGIVEL = (d) => !/[$`⟨⟩]|^\[[^\]]*\]$/.test(d);

function valoresDaFlag(texto, flag) {
  const rx = new RegExp(`(?:^|\\s)${escapar(flag)}(?:=|\\s+)("[^"]*"|'[^']*'|\\S+)`, 'g');
  return [...texto.matchAll(rx)].map((m) => m[1].replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
}

function caminhosDe(texto) {
  const entreAspas = [...texto.matchAll(CAMINHO_ENTRE_ASPAS)].map((m) => m[2]);
  const soltos = (texto.match(CAMINHO) ?? []).map((c) => c.replace(/[.,;:]+$/, ''));
  const comEspaco = texto.match(CAMINHO_COM_ESPACO) ?? [];
  return [...new Set([...entreAspas, ...soltos, ...comEspaco])].filter(ehArquivo);
}

// Destinos e nomes sempre entram; só os arquivos passam do teto, e o corte fica em `cortadas`.
export function extrairFontes(texto, leitura = {}) {
  const alvo = normalizar(texto);
  const arquivos = caminhosDe(texto);
  const destinos = [...new Set((leitura.flags_de_destino ?? []).flatMap((f) => valoresDaFlag(texto, f)))].filter(DESTINO_LEGIVEL);
  const nomes = (leitura.nomes ?? []).filter((n) => new RegExp(`(?<![a-z0-9])${escapar(normalizar(n))}(?![a-z0-9])`).test(alvo));
  const fontes = [
    ...destinos.map((fonte) => ({ fonte, tipo: 'destino' })),
    ...nomes.map((fonte) => ({ fonte, tipo: 'nome' })),
    ...arquivos.slice(0, MAX_FONTES).map((fonte) => ({ fonte, tipo: 'arquivo' })),
  ];
  return Object.assign(fontes, { cortadas: Math.max(0, arquivos.length - MAX_FONTES) });
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

const ehEco = (linha, ecos) => ecos.some((e) => linha.replace(/^(["'])(.*)\1$/, '$2') === e || new RegExp(`^[\\w-]+:\\s*["']?${escapar(e)}["']?$`).test(linha));

// Linhas candidatas: sem eco da busca nem cabeçalho TOON, com o destino ou ao menos um termo.
export function linhasCandidatas(stdout, vars, ecos = [], { filtrar = true } = {}) {
  const destino = vars.destino ? normalizar(vars.destino) : '';
  const termos = vars.termos.map(normalizar);
  let naTabela = false;
  return stdout.split('\n').map((l) => l.trim()).filter((l) => {
    if (!l || /^(?:count:|help\b|0\s)/.test(l)) return false;
    if (TABELA.test(l)) return !(naTabela = true);
    return !(CHAVE_VALOR.test(l) && !naTabela) && !ehEco(l, ecos);
  }).filter((l) => {
    if (!filtrar) return true;
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
    .flatMap((r) => {
      // Consulta exata (filtrar: false, ex.: mesmo arquivo pelo hash) já responde sobre a ação: toda linha de dado vale e sobe primeiro.
      const exata = aplicaveis.find((c) => c.nome === r.nome)?.filtrar === false;
      return linhasCandidatas(r.stdout, vars, ecos, { filtrar: !exata })
        .map((linha) => ({ consulta: r.nome, linha: trecho(linha, 200), pontos: pontosDaLinha(linha, vars) + (exata ? 10 : 0) }));
    })
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, MAX_CANDIDATAS)
    .map(({ consulta, linha }) => ({ consulta, linha }));
  return { indisponiveis: resultados.filter((r) => r.indisponivel).map((r) => r.nome), candidatas };
}

// Medido em 20/10: o JEV marcava "já feito" no relato, porque a consulta acha o próprio assunto relatado.
const CRITERIOS_DA_CONSULTA = {
  ja_feito: 'a ação pede, cria ou executa de novo algo que as linhas mostram já executado',
  ja_aberto: 'a ação abre de novo um pedido, espera ou oferta que já está aberto, ou oferece a outra pessoa um horário já oferecido. Ação que dá andamento ao que está aberto (responde, troca, fecha, cancela) não conta',
  nenhum: 'as linhas não mostram repetição. Também é nenhum: relato do que já foi feito, repasse de resposta, correção de dado, cobrança ou referência a algo que está aberto',
};

async function julgarCandidatas(candidatas, texto, timeoutMs, deps, config) {
  const estado = { acao: mascarar(texto).slice(0, 1500), evidencias: candidatas.map((c) => mascarar(c.linha)) };
  const perguntas = { achado: { type: 'choice', instructions: 'Dada a ação (campo acao) e as linhas que uma consulta local devolveu (campo evidencias), diga se a ação repete algo já feito ou já aberto. Relatar, repassar ou citar o que as linhas mostram não é repetir. Escolha "nenhum" na dúvida.', criteria: CRITERIOS_DA_CONSULTA } };
  const respostas = await (deps.jev ?? perguntarAoJev)(estado, perguntas, { timeoutMs, extras: config.jev?.arquivos_chave ?? [] });
  return repeticao(respostas, escolha(respostas, 'achado', CRITERIOS_DA_CONSULTA));
}

// "Já feito" e "já aberto" dizem a mesma coisa (a ação repete algo que existe): a confiança é a soma das duas, senão um
// JEV dividido (0,37 e 0,44) fica abaixo do limiar com 0,81 de certeza de repetição. Medido em 21/10.
function repeticao(respostas, veredito) {
  const p = respostas?.achado?.probabilities;
  if (!veredito || !p || typeof p.ja_feito !== 'number' || typeof p.ja_aberto !== 'number') return veredito;
  const soma = p.ja_feito + p.ja_aberto;
  if (soma <= (p.nenhum ?? 1 - soma)) return { escolha: 'nenhum', confianca: p.nenhum ?? 1 - soma };
  return { escolha: p.ja_aberto >= p.ja_feito ? 'ja_aberto' : 'ja_feito', confianca: soma };
}

async function achadosDasConsultas(consultas, texto, inicio, deps, config, tetoMs) {
  if (!consultas.candidatas.length) return { achados: [], jevFora: false };
  const veredito = await julgarCandidatas(consultas.candidatas, texto, Math.max(JEV_MINIMO_MS, tetoMs - (Date.now() - inicio)), deps, config);
  if (!veredito) return { achados: [], jevFora: true };
  const confianca = veredito.confianca ?? 0;
  if (veredito.escolha === 'nenhum' || confianca < AVISO_MINIMO) return { achados: [], jevFora: false };
  const consulta = [...new Set(consultas.candidatas.slice(0, 3).map((c) => c.consulta))].join(', ');
  const linhas = consultas.candidatas.slice(0, 3).map((c) => `"${c.linha}"`).join('; ');
  if (confianca < CONFIANCA_MINIMA) {
    const aviso = `isto pode já ter sido feito ou estar aberto, segundo a consulta "${consulta}" (${linhas}). Confira antes de seguir; se já está feito, responda com a prova em vez de repetir.`;
    return { achados: [], aviso: { fonte: consulta, texto: aviso }, jevFora: false };
  }
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

  // Em Agent e Workflow o caminho vai ao subagente, que lê: a leitura é delegada, e só o destino segue conferido.
  const extraidas = extrairFontes(texto, leitura);
  const fontes = Object.assign(nome === 'Agent' || nome === 'Workflow' ? extraidas.filter((f) => f.tipo !== 'arquivo') : extraidas, { cortadas: nome === 'Agent' || nome === 'Workflow' ? 0 : extraidas.cortadas });
  const usos = fontes.length && entrada.transcript_path ? (deps.usosRecentes ?? usosRecentes)(entrada.transcript_path, deps.agora ?? Date.now()) : null;
  const teto = deps.tetoMs ?? TETO_CONSULTAS_MS;
  // Trocar ou cancelar um pedido mexe no que já existe por definição: perguntar se "já existe" só produz falso positivo.
  const manutencao = nome === 'Bash' && soManutencao(texto, leitura.saidas);
  const consultas = manutencao ? { indisponiveis: [], candidatas: [] } : await consultar(leitura, fontes, teto, textoLivre(nome, texto, leitura));
  for (const indisponivel of consultas.indisponiveis) registrar({ ...base, decisao: 'consulta_indisponivel', trecho: indisponivel });

  const doJev = await achadosDasConsultas(consultas, texto, inicio, deps, config, teto);
  if (doJev.jevFora) registrar({ ...base, decisao: 'jev_indisponivel', trecho: 'consulta com candidatas' });
  const achados = [...(usos ? achadosSemLeitura(fontes, usos, leitura) : []), ...doJev.achados];
  if (!achados.length && doJev.aviso) {
    registrar({ ...base, decisao: 'avisada', duracao_ms: Date.now() - inicio, trecho: `aviso: ${doJev.aviso.fonte}` });
    return saidaContexto('PreToolUse', `${nomeCompleto(lei)}: ${mascarar(doJev.aviso.texto)}`);
  }
  if (!achados.length) return null;

  const bloquear = modoDaLei(config, lei.numero) === 'bloquear';
  registrar({ ...base, decisao: bloquear ? 'negada' : 'observada', duracao_ms: Date.now() - inicio, trecho: [...achados.map((a) => `${a.tipo}: ${a.fonte}`), ...(fontes.cortadas ? [`fontes_cortadas: ${fontes.cortadas}`] : [])].join('; ') });
  if (!bloquear) return null;
  const motivo = `${nomeCompleto(lei)}: ${lei.regra} ${achados.map((a) => (a.tipo === 'sem_leitura' ? a.texto : mascarar(a.texto))).join(' ')}${fontes.cortadas ? ` (fontes_cortadas: ${fontes.cortadas} arquivos além do teto não foram conferidos)` : ''} Para seguir mesmo assim, inclua no texto "LIDO: <o que você leu e concluiu>" (ao menos 10 caracteres).`;
  return saidaNegar(motivo);
}

await principal(import.meta.url, executar);
