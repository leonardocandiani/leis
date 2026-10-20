// Captura de contexto para o JEV: cauda do transcript, projeto e leis. Tudo mascarado e limitado.
import { execFileSync } from 'node:child_process';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import { mascarar } from './mascarar.mjs';

const LIMITE_LEITURA = 256 * 1024;
const LIMITE_CAUDA = 4096;
const LIMITE_MENSAGEM = 1500;

export function textoDe(conteudo) {
  if (typeof conteudo === 'string') return conteudo;
  if (!Array.isArray(conteudo)) return '';
  return conteudo.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
}

export function lerFinal(caminho, maxBytes) {
  const fd = openSync(caminho, 'r');
  try {
    const { size } = fstatSync(fd);
    const inicio = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - inicio);
    readSync(fd, buf, 0, buf.length, inicio);
    const linhas = buf.toString('utf8').split('\n');
    return inicio > 0 ? linhas.slice(1) : linhas;
  } finally {
    closeSync(fd);
  }
}

export function mensagensDoTranscript(caminho, maxBytes = LIMITE_LEITURA) {
  let linhas = [];
  try {
    linhas = lerFinal(caminho, maxBytes);
  } catch {
    return [];
  }
  return linhas.flatMap((linha) => {
    try {
      const e = JSON.parse(linha);
      const papel = e.type === 'user' ? 'dono' : e.type === 'assistant' ? 'sessao' : null;
      const texto = papel && !e.isSidechain && !e.isMeta ? textoDe(e.message?.content).trim() : '';
      return texto ? [{ papel, texto }] : [];
    } catch {
      return [];
    }
  });
}

export function ultimaRespostaDaSessao(caminho) {
  return mensagensDoTranscript(caminho).filter((m) => m.papel === 'sessao').at(-1)?.texto ?? '';
}

function recorte(mensagem) {
  const t = mascarar(mensagem.texto);
  const texto = t.length > LIMITE_MENSAGEM ? (mensagem.papel === 'sessao' ? `…${t.slice(-LIMITE_MENSAGEM)}` : `${t.slice(0, LIMITE_MENSAGEM)}…`) : t;
  return { papel: mensagem.papel, texto };
}

export function caudaDaConversa(caminho, limite = LIMITE_CAUDA) {
  const saida = [];
  let usado = 0;
  for (const m of mensagensDoTranscript(caminho).reverse()) {
    const r = recorte(m);
    if (usado + r.texto.length > limite && saida.length) break;
    usado += r.texto.length;
    saida.unshift(r);
  }
  return saida;
}

export function projetoDe(cwd) {
  const nome = cwd ? basename(cwd) : undefined;
  let remote;
  try {
    remote = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 800, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().replace(/\/\/[^@/]+@/, '//');
  } catch {
    remote = undefined;
  }
  return { nome, remote };
}

export function montarEstado({ entrada, leis, extra = {} }) {
  return {
    leis: leis.map((l) => ({ sigla: l.sigla, regra: l.regra, teste: l.teste })),
    cwd_nome: basename(entrada.cwd || ''),
    projeto: projetoDe(entrada.cwd),
    conversa: entrada.transcript_path ? caudaDaConversa(entrada.transcript_path) : [],
    ...extra,
  };
}
