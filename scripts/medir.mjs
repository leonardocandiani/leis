#!/usr/bin/env node
// Mede o registro das leis: por lei e natureza, nas últimas 24 h e 7 d. Só leitura.
// Uso: node medir.mjs [--json]
import { ehPrincipal } from './entrada.mjs';
import { lerRegistro } from './registro.mjs';
import { tabela } from './toon.mjs';

const HORA = 3600 * 1000;
export const JANELAS = [['24h', 24 * HORA], ['7d', 7 * 24 * HORA]];
const COLUNAS = ['lei', 'natureza', 'registradas', 'bloqueadas', 'observadas', 'jev_fora', 'mediana_ms', 'p95_ms'];

export function percentil(valores, p) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1)];
}

const contar = (eventos, decisoes) => eventos.filter((e) => decisoes.includes(e.decisao)).length;

function resumir(eventos) {
  const duracoes = eventos.map((e) => e.duracao_ms).filter((d) => typeof d === 'number');
  return {
    lei: eventos[0].lei ?? '-', natureza: eventos[0].natureza ?? '-',
    registradas: eventos.length,
    bloqueadas: contar(eventos, ['negada', 'bloqueada']),
    observadas: contar(eventos, ['observada']),
    jev_fora: contar(eventos, ['jev_indisponivel']),
    mediana_ms: percentil(duracoes, 50), p95_ms: percentil(duracoes, 95),
  };
}

export function agrupar(eventos) {
  const grupos = new Map();
  for (const e of eventos) {
    const chave = `${e.lei ?? '-'}|${e.natureza ?? '-'}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), e]);
  }
  return [...grupos.values()].map(resumir).sort((a, b) => b.registradas - a.registradas);
}

export function medir(eventos, agora = Date.now()) {
  return JANELAS.map(([janela, ms]) => {
    const dentro = eventos.filter((e) => Date.parse(e.ts) >= agora - ms);
    return { janela, eventos: dentro.length, linhas: agrupar(dentro) };
  });
}

export function paraToon(resultado) {
  const blocos = resultado.map((j) => [`janela: ${j.janela}`, `eventos: ${j.eventos}`, tabela('por_lei', COLUNAS, j.linhas)].join('\n'));
  const vazio = resultado.every((j) => j.eventos === 0);
  const dica = vazio ? 'help: sem eventos ainda; o registro nasce quando um hook das leis dispara (ver /leis:leis-validar)' : 'help: node scripts/medir.mjs --json para o detalhe bruto';
  return [...blocos, dica].join('\n');
}

if (ehPrincipal(import.meta.url)) {
  const resultado = medir(lerRegistro(0));
  process.stdout.write(`${process.argv.includes('--json') ? JSON.stringify(resultado, null, 2) : paraToon(resultado)}\n`);
}
