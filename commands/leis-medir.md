---
description: Mede o registro das leis nas últimas 24 h e 7 d: por lei e natureza, quantas registradas, bloqueadas, observadas, JEV fora do ar, mediana e p95.
allowed-tools: Bash(node:*), Read
---

Rode a medição e mostre a saída inteira:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/medir.mjs"
```

Depois leia o resultado por lei: qual quebra mais aparece, se `jev_fora` é alto (o juiz está falhando e as
conferências estão passando em branco), e se a mediana do JEV passa de 1,5 s (o hook está pesando no turno).
Se alguma lei tem muitas observações e poucas dúvidas sobre falso positivo, sugira passar `modos.<numero>` para
`"bloquear"` em `~/.claude/leis/leis.json`; só sugira, nunca mude sozinho.
`--json` devolve o detalhe bruto.
