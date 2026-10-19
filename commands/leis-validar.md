---
description: Confere se as leis estão implantadas: config válida, hooks ativos, chave do JEV, JEV respondendo em menos de 3 s e registro gravável.
allowed-tools: Bash(node:*), Read
---

Rode a validação e mostre a saída inteira:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/validar.mjs"
```

A saída é TOON, com `resultado: pass|fail` e uma linha por item (`config_esquema`, `config_origem`,
`hooks_arquivos`, `hooks_ativos`, `chave_jev`, `jev_responde`, `registro_gravavel`). Exit 0 sem falha, 1 com falha.

Para cada item em `falha`, diga em uma frase a causa provável e o comando que conserta. `aviso` não reprova:
explique só se mudar o comportamento (por exemplo, rodando com o modelo padrão por falta de `leis.json`).
Não imprima nem peça o valor de nenhuma chave.
