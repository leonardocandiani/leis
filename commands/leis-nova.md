---
description: Cria uma lei nova no molde (sigla pronunciável, teste, erro e correção, equilíbrio com as existentes) e atualiza a config.
argument-hint: <o que a lei deve garantir>
allowed-tools: Read, Write, Edit, Bash(node:*)
---

Pedido: $ARGUMENTS

Siga a skill `leis`, seção "O que é uma lei". Leia antes `~/.claude/leis/leis.json` (sem ele, o modelo em
`${CLAUDE_PLUGIN_ROOT}/leis/modelo.json`) para conhecer as leis existentes.

1. **Caput.** Uma frase de ordem, no imperativo ou na afirmativa curta, que o dono reconheça como dele.
2. **Sigla.** Uma palavra que se lê em voz alta, escrita em maiúsculas com ponto (`D.R.Y.`, `T.O.P.`), cujo nome
   por extenso é a própria regra. Sem nome próprio, sem sigla que já exista, sem palavra que vire ruído em
   conversa comum.
3. **Teste.** Uma pergunta de sim ou não que decide o caso em cinco segundos.
4. **Erro e correção.** Um caso real (se o pedido não trouxe um, peça-o em uma pergunta só) e o que se faz no lugar.
5. **Equilíbrio.** Para cada lei existente que pode brigar com a nova, uma frase dizendo quem vence e por quê.
6. **Gravar.** Acrescente a lei a `leis` com o próximo `numero`, um `papel` só se algum fiscal do plugin deve aplicá-la (`pronto`, `antes`, `troca`, `leitura`, `sim`, `aval`, cada um usado por uma lei só; sem papel, só `relato` e auditoria a cobrem), os `apelidos` (pode ser lista vazia), a linha em
   `equilibrio`, a vedação em `vedacoes` e `"<numero>": "observar"` em `modos`. Confira o esquema (passo 2 de
   `/leis:leis-implantar`) e regenere a rule com `node "${CLAUDE_PLUGIN_ROOT}/scripts/gerar-rule.mjs"`.
7. **Mecanismo e medição.** Diga qual hook faria a lei valer (os que o plugin já traz estão na skill) e como ela
   será medida. Lei sem mecanismo nem medição é texto: avise isso no relatório.

Mostre a lei final no formato do modelo e a contagem de leis depois da gravação.
