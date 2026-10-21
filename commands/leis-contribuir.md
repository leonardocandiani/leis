---
description: Mostra as quebras que se repetem em vários projetos (erro genérico do plugin) e, só se pedido, abre um PR com elas no repositório público das leis.
allowed-tools: Bash(node:*), Read
---

Rode no modo seco e mostre a saída inteira:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/contribuir.mjs"
```

Cada linha é uma quebra (papel da lei e sinal do fiscal) que apareceu 3 vezes ou mais em 2 projetos ou mais.
Repetir em projetos diferentes indica regra fraca, falso positivo ou instrução de correção que não ensina,
ou seja, algo a corrigir no plugin e não no projeto.

Só abra o PR quando o dono pedir com essas palavras, e com um clone do repositório leis:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/contribuir.mjs" --abrir-pr --repo <clone>
```

O caso leva só estrutura (papel, sinal, fiscal, contagens, versões e datas). O script recusa com `code: HIGIENE`
qualquer texto com caminho, e-mail, identificador de mensagem ou número longo; nunca contorne a recusa.
