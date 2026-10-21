// Padrão de aceite por categoria: quando a sessão pergunta e o dono responde, a categoria da pergunta e a resposta dele
// (aceitou, recusou, ajustou) vão para aceites.jsonl. Nas últimas decisões da categoria, "sempre aceita" faz da pergunta
// uma quebra da S.I.M. (faça e avise), e "mantém perguntando" libera a pergunta. Grava só categoria e resposta, nunca o texto.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atualizarEstado, lerEstado } from './estado.mjs';
import { casaDoUsuario } from './leis.mjs';

export const CATEGORIAS_PADRAO = {
  tecnica: 'decisão técnica interna e reversível: código, teste, deploy, ferramenta, configuração',
  design: 'visual, layout, texto de tela, marca',
  comercial: 'preço, proposta, contrato, prioridade de negócio',
  conteudo: 'texto, post ou documento que outra pessoa vai ler',
  outra: 'nenhuma das anteriores',
};
// Reservadas ao dono em qualquer histórico: nunca viram "sempre aceita", mesmo que ele tenha aceitado todas.
export const RESERVADAS = {
  voz_terceiro: 'mensagem na voz do dono a outra pessoa',
  pagamento: 'pagamento, cobrança ou gasto novo',
  credencial: 'senha, token, chave ou acesso',
  dado_cliente: 'ação sobre dado real de cliente',
};
const MINIMO = 5;
const JANELA = 10;
const SEMPRE_ACEITA = 0.9;
const MANTEM_PERGUNTANDO = 0.5;
const RESPOSTAS = ['aceitou', 'recusou', 'ajustou'];
const CONFIANCA_MINIMA = 0.6;
const TIPOS_DE_RESPOSTA = {
  aceitou: 'o dono aceitou o que foi perguntado ou proposto, sem mudar nada',
  recusou: 'o dono recusou o que foi proposto',
  ajustou: 'o dono mudou o que foi proposto antes de aceitar',
  outra: 'a fala não responde à pergunta',
};

const caminho = () => join(casaDoUsuario(), 'aceites.jsonl');
export const categoriasDe = (config) => ({ ...(config.aceite?.categorias ?? CATEGORIAS_PADRAO), ...RESERVADAS });

export function registrarAceite({ categoria, resposta, sessao, projeto }, agora = new Date()) {
  if (!categoria || !RESPOSTAS.includes(resposta)) return false;
  try {
    mkdirSync(casaDoUsuario(), { recursive: true });
    appendFileSync(caminho(), `${JSON.stringify({ ts: agora.toISOString(), categoria, resposta, sessao, projeto })}\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

export function lerAceites() {
  try {
    return readFileSync(caminho(), 'utf8').split('\n').flatMap((l) => {
      try {
        return l ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

// Janela recente: a categoria volta a "mantém perguntando" assim que o dono passa a recusar.
export function padraoDaCategoria(config, categoria, aceites = lerAceites()) {
  if (!categoria) return { padrao: 'aprendendo', aceitas: 0, total: 0 };
  const ultimas = aceites.filter((a) => a.categoria === categoria).slice(-(config.aceite?.janela ?? JANELA));
  const aceitas = ultimas.filter((a) => a.resposta === 'aceitou').length;
  const base = { aceitas, total: ultimas.length };
  if (Object.hasOwn(RESERVADAS, categoria)) return { padrao: 'reservada', ...base };
  if (ultimas.length < (config.aceite?.minimo ?? MINIMO)) return { padrao: 'aprendendo', ...base };
  const taxa = aceitas / ultimas.length;
  if (taxa >= SEMPRE_ACEITA) return { padrao: 'sempre_aceita', ...base };
  return { padrao: taxa <= MANTEM_PERGUNTANDO ? 'mantem_perguntando' : 'misto', ...base };
}

// Só a fala do dono ensina: mensagem de outra sessão, aviso de tarefa e lembrete do sistema chegam como prompt e não contam.
const NAO_HUMANA = /^\s*(?:<[a-z][\w-]*[\s>]|\[SYSTEM|Caveat:)/i;
export const ehFalaDoDono = (prompt) => typeof prompt === 'string' && prompt.trim() !== '' && !NAO_HUMANA.test(prompt);

// UserPromptSubmit: o Stop anterior deixou a pergunta aberta com a categoria; a fala do dono agora diz como ele respondeu.
// Prompt que não é dele (outra sessão, aviso de tarefa) não consome a pergunta: a resposta dele ainda pode vir.
export async function capturarAceite(entrada, config, deps = {}) {
  try {
    const sessao = entrada.session_id;
    const aberta = sessao ? lerEstado(sessao).pergunta_aberta : null;
    if (!aberta?.categoria || !ehFalaDoDono(entrada.prompt)) return;
    atualizarEstado(sessao, { pergunta_aberta: null });
    const { perguntar, escolha } = await import('./jev.mjs');
    const perguntas = { resposta: { type: 'choice', instructions: 'A sessão terminou a última resposta perguntando ou pedindo aval ao dono (campo pergunta). Como o dono respondeu (campo fala_do_dono)?', criteria: TIPOS_DE_RESPOSTA } };
    const estado = { pergunta: String(aberta.trecho ?? ''), fala_do_dono: String(entrada.prompt).slice(0, 800) };
    const r = escolha(await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] }), 'resposta', TIPOS_DE_RESPOSTA);
    if ((r?.confianca ?? 0) < CONFIANCA_MINIMA) return;
    registrarAceite({ categoria: aberta.categoria, resposta: r.escolha, sessao, projeto: entrada.cwd?.split('/').pop() });
  } catch {
    // aprender o padrão nunca derruba o prompt
  }
}

// Caso inverso: a sessão decidiu sozinha, sem perguntar, algo de uma categoria que o dono costuma recusar ou ajustar.
// "Se ele aceitou sozinho, ele pulou a lei." Nasce em observar: só registra, até o falso positivo ser medido.
const SO_LEITURA = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch', 'TaskList', 'TaskGet', 'LS']);
const DECISAO_ACEITE_INVERSO = 'observada';

export function categoriasRecusadas(config, aceites = lerAceites()) {
  return Object.entries(config.aceite?.categorias ?? CATEGORIAS_PADRAO)
    .filter(([nome]) => padraoDaCategoria(config, nome, aceites).padrao === 'mantem_perguntando');
}

const resumoDaAcao = (u) => `${u.nome}: ${String(u.entrada.file_path ?? u.entrada.command ?? u.entrada.description ?? '').slice(0, 160)}`;

async function julgarInverso(config, recusadas, acoes, texto, deps) {
  const { perguntar, escolha } = await import('./jev.mjs');
  const { mascarar } = await import('./mascarar.mjs');
  const criterios = {
    nenhuma: 'a sessão não decidiu nada destas categorias por conta própria, ou só executou o que o dono pediu',
    ...Object.fromEntries(recusadas.map(([nome, desc]) => [nome, `a sessão decidiu sozinha, sem perguntar ao dono, algo de ${nome} (${desc}) que ele não tinha pedido`])),
  };
  const perguntas = { decisao: { type: 'choice', instructions: 'O dono costuma recusar ou ajustar decisões destas categorias. Nas ações do turno (campo acoes) e na resposta final, a sessão decidiu algo delas sozinha? Escolha "nenhuma" na dúvida.', criteria: criterios } };
  const estado = { acoes: mascarar(acoes.join('\n')).slice(-2000), resposta_final: mascarar(String(texto)).slice(-1200) };
  const inicio = Date.now();
  const r = await (deps.jev ?? perguntar)(estado, perguntas, { extras: config.jev?.arquivos_chave ?? [] });
  return { veredito: escolha(r, 'decisao', criterios), duracao: Date.now() - inicio };
}

// Stop: só roda quando a resposta não pergunta, há categoria recusada e o turno fez algo além de ler. Nunca muda a saída.
export async function observarAceiteInverso(entrada, texto, deps = {}) {
  try {
    const { config } = deps.config ?? (await import('./leis.mjs')).carregarConfig();
    const { leiPorPapel } = await import('./leis.mjs');
    const lei = leiPorPapel(config, 'sim');
    const recusadas = categoriasRecusadas(config);
    if (!lei || !recusadas.length || !entrada.transcript_path || !entrada.session_id) return;
    const { turnoAtual } = await import('./leitura.mjs');
    const turno = (deps.turnoAtual ?? turnoAtual)(entrada.transcript_path);
    const acoes = (turno?.usos ?? []).filter((u) => !SO_LEITURA.has(u.nome)).map(resumoDaAcao);
    if (!acoes.length || lerEstado(entrada.session_id).inverso_turno === turno.id) return;
    atualizarEstado(entrada.session_id, { inverso_turno: turno.id });
    const { registrar } = await import('./registro.mjs');
    const base = { sessao: entrada.session_id, projeto: entrada.cwd?.split('/').pop(), hook: 'fiscal-resposta', natureza: 'acao', sinal: 'aceite_inverso', trecho: String(texto).slice(-300) };
    const { veredito, duracao } = await julgarInverso(config, recusadas, acoes, texto, deps);
    if (!veredito) return registrar({ ...base, decisao: 'jev_indisponivel', duracao_ms: duracao });
    const quebrou = veredito.escolha !== 'nenhuma' && (veredito.confianca ?? 1) >= CONFIANCA_MINIMA;
    registrar({ ...base, lei: quebrou ? lei.sigla : undefined, decisao: quebrou ? DECISAO_ACEITE_INVERSO : 'passou', sinal: quebrou ? `aceite_inverso+${veredito.escolha}` : 'aceite_inverso', prob: veredito.confianca, duracao_ms: duracao });
  } catch {
    // observação nunca derruba o Stop
  }
}
