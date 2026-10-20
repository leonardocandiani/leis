// Prova de leitura da L.I.D.A.: o que a sessão leu, tirado da cauda do transcript. Compartilhado pelo PreToolUse e pelo Stop.
import { lerFinal, textoDe } from './contexto.mjs';

const LIMITE_LEITURA = 1024 * 1024;
const LEITORES_DE_SHELL = /\b(?:cat|head|tail|sed|less|more|bat|grep|rg|awk)\b/;

export const escapar = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function regexSeguro(padrao, flags = 'i') {
  try {
    return new RegExp(padrao, flags);
  } catch {
    return null;
  }
}

// O marcador {fonte} do leitor vira a fonte escapada (ou o curinga dado, quando só interessa saber se houve leitura).
export const leitorRegex = (padrao, fonte) => regexSeguro(String(padrao).replaceAll('{fonte}', fonte === undefined ? '\\S+' : escapar(fonte)));

function eventosDoTranscript(caminho) {
  let linhas;
  try {
    linhas = lerFinal(caminho, LIMITE_LEITURA);
  } catch {
    return null;
  }
  return linhas.flatMap((l) => {
    try {
      const e = JSON.parse(l);
      return e && !e.isSidechain ? [e] : [];
    } catch {
      return [];
    }
  });
}

const usosDe = (eventos) => eventos.flatMap((e) => (e.type === 'assistant' && Array.isArray(e.message?.content)
  ? e.message.content.filter((b) => b?.type === 'tool_use').map((b) => ({ ts: Date.parse(e.timestamp), nome: b.name, entrada: b.input ?? {} }))
  : []));

const ehPromptDoDono = (e) => e.type === 'user' && !e.isMeta && textoDe(e.message?.content).trim() !== '';

// Linha sem timestamp legível conta como recente: na dúvida, não acusar.
export function usosRecentes(caminho, agora = Date.now(), janelaMs = 30 * 60 * 1000) {
  const eventos = eventosDoTranscript(caminho);
  return eventos && usosDe(eventos).filter((u) => Number.isNaN(u.ts) || u.ts >= agora - janelaMs);
}

export function turnoAtual(caminho) {
  const eventos = eventosDoTranscript(caminho);
  if (!eventos) return null;
  const inicio = eventos.findLastIndex(ehPromptDoDono);
  const prompt = eventos[inicio];
  return { id: prompt?.uuid ?? prompt?.timestamp ?? 'inicio', usos: usosDe(eventos.slice(inicio + 1)) };
}

export const comandosBash = (usos) => usos.filter((u) => u.nome === 'Bash').map((u) => String(u.entrada.command ?? ''));

function leuArquivo(uso, fonte) {
  const alvo = uso.entrada.file_path ?? uso.entrada.path;
  if (!['Read', 'Grep'].includes(uso.nome) || typeof alvo !== 'string') return false;
  return alvo === fonte || fonte.startsWith(alvo.endsWith('/') ? alvo : `${alvo}/`);
}

export function leuFonte(usos, { fonte, tipo }, leitores = []) {
  return usos.some((u) => {
    if (tipo === 'arquivo' && leuArquivo(u, fonte)) return true;
    if (u.nome !== 'Bash') return false;
    const comando = String(u.entrada.command ?? '');
    if (tipo === 'arquivo' && comando.includes(fonte) && LEITORES_DE_SHELL.test(comando)) return true;
    return leitores.some((p) => leitorRegex(p, fonte)?.test(comando));
  });
}
