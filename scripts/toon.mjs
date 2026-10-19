// Saída TOON mínima (tabelas), o formato compacto das CLIs agent-facing.
const celula = (v) => {
  const t = v === undefined || v === null || v === '' ? '-' : String(v);
  return /[,:"\n]/.test(t) ? JSON.stringify(t) : t;
};

export function tabela(nome, colunas, linhas) {
  const topo = `${nome}[${linhas.length}]{${colunas.join(',')}}:`;
  return [topo, ...linhas.map((l) => `  ${colunas.map((c) => celula(l[c])).join(',')}`)].join('\n');
}
