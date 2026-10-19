// Leitura de opções das CLIs do plugin: flag desconhecida é erro de uso (exit 2) e nada acontece antes disso.
export function analisar(argv, definicao) {
  const opcoes = {};
  for (let i = 0; i < argv.length; i++) {
    const tipo = definicao[argv[i]];
    if (tipo === 'flag') opcoes[argv[i]] = true;
    else if (tipo === 'valor' && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) opcoes[argv[i]] = argv[++i];
    else return { erro: tipo === 'valor' ? `${argv[i]} pede um valor` : `argumento desconhecido: ${argv[i]}` };
  }
  return { opcoes };
}

// Devolve as opções, ou já encerra: --help sai com 0 e erro de uso sai com 2, sem executar nada.
export function opcoesOuSair(definicao, ajuda, argv = process.argv.slice(2)) {
  const { opcoes, erro } = analisar(argv, { '--help': 'flag', ...definicao });
  if (erro) {
    process.stdout.write(`error: ${erro}\ncode: USO\nhelp: use --help para ver as opções\n`);
    process.exit(2);
  }
  if (opcoes['--help']) {
    process.stdout.write(`${ajuda}\n`);
    process.exit(0);
  }
  return opcoes;
}
