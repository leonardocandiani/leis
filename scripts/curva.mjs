// Curva de aprendizado: quebras distintas por hora desde a instalação (primeira linha do registro).
// Hora a hora nas primeiras 24 h, depois dia a dia; a versão de cada janela mostra se a queda veio de tirar
// falso positivo (troca de versão) ou de a sessão aprender (mesma versão).
import { ehQuebra, quebrasDistintas } from './registro.mjs';

const HORA = 3600 * 1000;
const DIA = 24 * HORA;
const DIAS_MOSTRADOS = 14;
const MINIMO_PARA_TENDENCIA = 2 * DIA;

const versoesDe = (eventos) => [...new Set(eventos.map((e) => e.versao).filter(Boolean))].join('/') || '-';
const taxa = (quebras, ms) => Math.round((quebras / (ms / HORA)) * 100) / 100;
const rotulo = (inicio, passo) => (passo === HORA ? new Date(inicio).toISOString().slice(0, 13).replace('T', ' ') + 'h' : new Date(inicio).toISOString().slice(0, 10));

function janelas(instalacao, agora) {
  const saida = [];
  const fimDasHoras = Math.min(instalacao + DIA, agora);
  for (let t = instalacao; t < fimDasHoras; t += HORA) saida.push({ inicio: t, fim: Math.min(t + HORA, agora), passo: HORA });
  for (let t = instalacao + DIA; t < agora; t += DIA) saida.push({ inicio: t, fim: Math.min(t + DIA, agora), passo: DIA });
  const horas = saida.filter((j) => j.passo === HORA);
  return [...horas, ...saida.filter((j) => j.passo === DIA).slice(-DIAS_MOSTRADOS)];
}

// Taxa das últimas 24 h contra a taxa de antes delas: caindo abaixo de 80%, subindo acima de 120%.
function tendencia(quebras, instalacao, agora) {
  if (agora - instalacao < MINIMO_PARA_TENDENCIA) return 'sem base (menos de 48 h)';
  const corte = agora - DIA;
  const recente = taxa(quebras.filter((e) => Date.parse(e.ts) >= corte).length, DIA);
  const antes = taxa(quebras.filter((e) => Date.parse(e.ts) < corte).length, corte - instalacao);
  if (antes === 0) return recente === 0 ? 'estável (zero)' : 'subindo';
  const razao = recente / antes;
  return razao < 0.8 ? 'caindo' : razao > 1.2 ? 'subindo' : 'estável';
}

export function curva(eventos, agora = Date.now()) {
  const ordenados = eventos.filter((e) => Number.isFinite(Date.parse(e.ts))).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (!ordenados.length) return null;
  const instalacao = Date.parse(ordenados[0].ts);
  const quebras = quebrasDistintas(ordenados.filter(ehQuebra));
  const dentro = (lista, j) => lista.filter((e) => Date.parse(e.ts) >= j.inicio && Date.parse(e.ts) < j.fim);
  let anterior = null;
  const linhas = janelas(instalacao, agora).map((j) => {
    const versao = versoesDe(dentro(ordenados, j));
    const troca = anterior !== null && versao !== '-' && versao !== anterior ? 'sim' : '';
    if (versao !== '-') anterior = versao;
    const n = dentro(quebras, j).length;
    return { janela: rotulo(j.inicio, j.passo), quebras: n, por_hora: taxa(n, j.fim - j.inicio), versao, troca };
  });
  const ultimas24 = quebras.filter((e) => Date.parse(e.ts) >= agora - DIA).length;
  return { instalacao: new Date(instalacao).toISOString(), total: quebras.length, ultimas24, por_hora_24h: taxa(ultimas24, Math.min(DIA, agora - instalacao) || HORA), tendencia: tendencia(quebras, instalacao, agora), linhas };
}
