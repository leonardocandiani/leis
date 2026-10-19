# CLAUDE.md, leis (constituição do plugin)

Plugin do Claude Code que faz as leis de trabalho de uma pessoa valerem de verdade: regra, hooks, validação,
auditoria e medição. Este arquivo governa a sessão que trabalha NO plugin; quem usa o plugin recebe as regras
pela skill `leis`.

## Invariantes

1. **Zero dependência**: só a biblioteca padrão do Node.
2. **Hook falha aberto**: erro, rede ou JEV fora do ar passam e registram; todo hook sai com código 0.
3. **Observar antes de bloquear**: `modos` nasce em `observar`; bloqueio tem teto de 1 seguido por sessão.
4. **Nada do dono no repositório**: nome de cliente, telefone, id real e caminho de máquina ficam na config
   dele (`~/.claude/leis/leis.json`), nunca aqui. `testes/higiene.test.mjs` confere.
5. **Registro mascarado**: todo trecho gravado passa por `scripts/mascarar.mjs`.
6. **Caso que não casa é barato**: sem rede, sem ler arquivo grande, em dezenas de milissegundos.
7. **JEV sempre falso nos testes**: injete a função, nunca chame a rede.

## Regras

| Assunto | Regra |
|---|---|
| Testes | `node --test "testes/*.test.mjs"` (Node 22 ou mais novo; passar só a pasta falha no Node 26) |
| Código | funções com complexidade até 10 (`lizard -C 10 scripts`), sem comentário que descreva o óbvio |
| Texto | pt-BR com acentuação, sem travessão, sem emoji; identificador em ASCII |
| Git | branch por tarefa, PR para a main, Conventional Commits em pt-BR, sem menção a IA |
| Documentação | `README.md` e `docs/FUNDACAO.md` mudam junto com a peça |
