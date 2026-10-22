// Esquema, carga e consulta das leis. A config do usuário vive fora do repositório.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODOS = ['observar', 'bloquear'];
export const NATUREZAS = ['acao', 'omissao', 'trava', 'relato'];
const CAMPOS_TEXTO = ['sigla', 'nome', 'regra', 'teste', 'erro', 'correcao'];
const SIGLA = /^(?:\p{Lu}\.){2,}$/u;
const MODELO = fileURLToPath(new URL('../leis/modelo.json', import.meta.url));

export const casaDoUsuario = () => process.env.LEIS_HOME || join(homedir(), '.claude', 'leis');
export const caminhoConfig = () => join(casaDoUsuario(), 'leis.json');

export const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ehTexto = (v) => typeof v === 'string' && v.trim().length > 0;
const ehListaDeTextos = (v) => Array.isArray(v) && v.every(ehTexto);

function erroDoNumero(lei, onde, numerosVistos) {
  if (!Number.isInteger(lei.numero) || lei.numero < 1) return `${onde}.numero deve ser inteiro a partir de 1`;
  if (numerosVistos.has(lei.numero)) return `${onde}.numero ${lei.numero} repetido`;
  numerosVistos.add(lei.numero);
  return null;
}

function errosOpcionaisDaLei(lei, onde) {
  const erros = [];
  if (lei.papel !== undefined && !ehTexto(lei.papel)) erros.push(`${onde}.papel deve ser texto não vazio`);
  if (lei.aplicacao !== undefined && !ehListaDeTextos(lei.aplicacao)) erros.push(`${onde}.aplicacao deve ser lista de textos`);
  if (!ehListaDeTextos(lei.apelidos)) erros.push(`${onde}.apelidos deve ser lista de textos`);
  return erros;
}

function errosDaLei(lei, indice, numerosVistos) {
  const onde = `leis[${indice}]`;
  if (!lei || typeof lei !== 'object') return [`${onde} não é objeto`];
  const erros = [erroDoNumero(lei, onde, numerosVistos)].filter(Boolean);
  for (const campo of CAMPOS_TEXTO) if (!ehTexto(lei[campo])) erros.push(`${onde}.${campo} ausente ou vazio`);
  if (ehTexto(lei.sigla) && !SIGLA.test(lei.sigla)) erros.push(`${onde}.sigla "${lei.sigla}" deve ser maiúsculas separadas por ponto, como T.O.P.`);
  return [...erros, ...errosOpcionaisDaLei(lei, onde)];
}

function errosDePapeis(leis) {
  const vistos = new Set();
  return leis.flatMap((l) => {
    if (!ehTexto(l?.papel)) return [];
    if (!vistos.has(l.papel)) return (vistos.add(l.papel), []);
    return [`papel "${l.papel}" repetido`];
  });
}

function errosDasFontes(fontes) {
  if (fontes === undefined) return [];
  const ok = Array.isArray(fontes) && fontes.every((f) => ehTexto(f?.rotulo) && ehTexto(f?.caminho_ou_url));
  return ok ? [] : ['fontes deve ser lista de {rotulo, caminho_ou_url}'];
}

function errosDoJev(jev) {
  if (jev === undefined) return [];
  if (!jev || typeof jev !== 'object' || Array.isArray(jev)) return ['jev deve ser objeto'];
  return jev.arquivos_chave === undefined || ehListaDeTextos(jev.arquivos_chave) ? [] : ['jev.arquivos_chave deve ser lista de textos'];
}

const QUANDO_DA_CONSULTA = ['sempre', 'com_destino', 'com_arquivo'];
const regexCompila = (padrao) => {
  try {
    return !!new RegExp(String(padrao).replaceAll('{fonte}', 'x'), 'i');
  } catch {
    return false;
  }
};

function errosDasConsultas(consultas) {
  if (consultas === undefined) return [];
  if (!Array.isArray(consultas)) return ['leitura.consultas deve ser lista'];
  return consultas.flatMap((c, i) => {
    const onde = `leitura.consultas[${i}]`;
    if (!c || typeof c !== 'object') return [`${onde} não é objeto`];
    const erros = [];
    if (!ehTexto(c.nome)) erros.push(`${onde}.nome ausente ou vazio`);
    if (!Array.isArray(c.comando) || c.comando.length === 0 || !ehListaDeTextos(c.comando)) erros.push(`${onde}.comando deve ser lista não vazia de textos`);
    if (c.quando !== undefined && !QUANDO_DA_CONSULTA.includes(c.quando)) erros.push(`${onde}.quando deve ser um de: ${QUANDO_DA_CONSULTA.join(', ')}`);
    if (c.filtrar !== undefined && typeof c.filtrar !== 'boolean') erros.push(`${onde}.filtrar deve ser true ou false`);
    return erros;
  });
}

function errosDaLeitura(leitura) {
  if (leitura === undefined) return [];
  if (!leitura || typeof leitura !== 'object' || Array.isArray(leitura)) return ['leitura deve ser objeto'];
  const erros = [];
  for (const campo of ['saidas', 'leitores', 'flags_de_destino', 'flags_ignoradas', 'nomes', 'destinos_dispensados', 'provas_de_leitura', 'ordens_do_dono']) {
    if (leitura[campo] === undefined) continue;
    if (!ehListaDeTextos(leitura[campo])) erros.push(`leitura.${campo} deve ser lista de textos`);
    else if (['saidas', 'leitores', 'provas_de_leitura', 'ordens_do_dono'].includes(campo)) leitura[campo].forEach((p, i) => { if (!regexCompila(p)) erros.push(`leitura.${campo}[${i}] não é uma regex válida`); });
  }
  if (Array.isArray(leitura.leitores)) leitura.leitores.forEach((p, i) => { if (typeof p === 'string' && !p.includes('{fonte}')) erros.push(`leitura.leitores[${i}] deve conter o marcador {fonte}`); });
  if (leitura.registro_de_fato !== undefined && !(ehTexto(leitura.registro_de_fato) && regexCompila(leitura.registro_de_fato))) erros.push('leitura.registro_de_fato deve ser uma regex válida');
  return [...erros, ...errosDasConsultas(leitura.consultas)];
}

function errosDaEscalada(escalada) {
  if (escalada === undefined) return [];
  if (!escalada || typeof escalada !== 'object' || Array.isArray(escalada)) return ['escalada deve ser objeto'];
  const erros = [];
  if (escalada.modo !== undefined && !['observar', 'pausar'].includes(escalada.modo)) erros.push('escalada.modo deve ser "observar" ou "pausar"');
  if (escalada.aviso !== undefined && !ehListaDeTextos(escalada.aviso)) erros.push('escalada.aviso deve ser lista de textos (comando e argumentos, {mensagem} é trocado)');
  return erros;
}

function errosDoAceite(aceite) {
  if (aceite === undefined) return [];
  if (!aceite || typeof aceite !== 'object' || Array.isArray(aceite)) return ['aceite deve ser objeto'];
  const erros = [];
  if (aceite.categorias !== undefined && (!aceite.categorias || typeof aceite.categorias !== 'object' || Array.isArray(aceite.categorias) || !Object.values(aceite.categorias).every(ehTexto))) erros.push('aceite.categorias deve mapear nome para descrição');
  for (const campo of ['minimo', 'janela']) if (aceite[campo] !== undefined && !(Number.isInteger(aceite[campo]) && aceite[campo] > 0)) erros.push(`aceite.${campo} deve ser inteiro positivo`);
  // Com mínimo acima da janela a categoria nunca sai de "aprendendo": o aceite ficaria desligado em silêncio.
  if (!erros.length && (aceite.minimo ?? 5) > (aceite.janela ?? 10)) erros.push('aceite.minimo não pode passar de aceite.janela');
  return erros;
}

function errosDosModos(modos, numeros) {
  if (!modos || typeof modos !== 'object' || Array.isArray(modos)) return ['modos deve ser objeto'];
  return Object.entries(modos).flatMap(([chave, valor]) => {
    const erros = [];
    if (!numeros.has(Number(chave))) erros.push(`modos.${chave} não corresponde a nenhuma lei`);
    if (!MODOS.includes(valor)) erros.push(`modos.${chave} deve ser "observar" ou "bloquear"`);
    return erros;
  });
}

export function validarEsquema(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['a config deve ser um objeto'];
  const erros = [];
  if (!Number.isInteger(c.versao)) erros.push('versao deve ser inteiro');
  if (!ehTexto(c.dono)) erros.push('dono ausente ou vazio');
  if (!Array.isArray(c.leis) || c.leis.length === 0) return [...erros, 'leis deve ser lista com ao menos uma lei'];
  const numeros = new Set();
  c.leis.forEach((lei, i) => erros.push(...errosDaLei(lei, i, numeros)));
  if (!ehListaDeTextos(c.equilibrio)) erros.push('equilibrio deve ser lista de textos');
  if (!ehListaDeTextos(c.vedacoes)) erros.push('vedacoes deve ser lista de textos');
  erros.push(...errosDePapeis(c.leis), ...errosDoJev(c.jev), ...errosDaLeitura(c.leitura), ...errosDasFontes(c.fontes), ...errosDosModos(c.modos, numeros), ...errosDaEscalada(c.escalada), ...errosDoAceite(c.aceite));
  return erros;
}

function lerJson(caminho) {
  try {
    return { valor: JSON.parse(readFileSync(caminho, 'utf8')) };
  } catch (e) {
    return { erro: e.code === 'ENOENT' ? 'ausente' : 'ilegível' };
  }
}

export function carregarConfig() {
  const caminho = caminhoConfig();
  const usuario = lerJson(caminho);
  const errosUsuario = usuario.valor ? validarEsquema(usuario.valor) : [];
  if (usuario.valor && errosUsuario.length === 0) return { config: usuario.valor, origem: 'usuario', aviso: null, errosUsuario };
  const aviso = usuario.valor
    ? `config do usuário inválida (${errosUsuario[0]}); usando o modelo`
    : `config do usuário ${usuario.erro}; usando o modelo padrão (rode /leis:leis-implantar)`;
  return { config: lerJson(MODELO).valor, origem: 'modelo', aviso, errosUsuario: usuario.valor ? errosUsuario : [usuario.erro] };
}

export const leiPorNumero = (config, numero) => config.leis.find((l) => l.numero === numero) ?? null;
// Papéis conhecidos dos fiscais; lei com outro papel (ou sem) só é coberta por relato e auditoria.
export const PAPEIS = ['pronto', 'antes', 'troca', 'leitura', 'sim', 'aval'];
export const leiPorPapel = (config, papel) => config.leis.find((l) => l.papel === papel) ?? null;
export const siglaDe = (config, numero) => leiPorNumero(config, numero)?.sigla ?? `L${numero}`;
export const modoDaLei = (config, numero) => (config.modos?.[String(numero)] === 'bloquear' ? 'bloquear' : 'observar');

function escapar(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function leisCitadas(config, texto) {
  const alvo = normalizar(texto);
  return config.leis.filter((lei) => {
    const formas = [lei.sigla, ...lei.apelidos, `lei ${lei.numero}`, `l${lei.numero}`].map((f) => escapar(normalizar(f)));
    return formas.some((f) => new RegExp(`(?<![a-z0-9])${f}(?![a-z0-9])`).test(alvo));
  });
}

export const nomeCompleto = (lei) => `Lei ${lei.numero} (${lei.sigla})`;

export function resumoSessao(config, aviso) {
  const itens = config.leis.map((l) => `${l.sigla} ${l.teste}`).join(' | ');
  const base = `Leis do ${config.dono} (valem acima das outras regras; teste de cada uma): ${itens}`;
  return aviso ? `${base} [${aviso}]` : base;
}
