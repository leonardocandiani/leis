---
description: Implanta as leis nesta máquina. Cria ~/.claude/leis/leis.json a partir do modelo (ou de um md de leis) e garante o ponteiro no CLAUDE.md global.
argument-hint: "[nome do dono | caminho de um md com as leis]"
allowed-tools: Bash, Read, Write, Edit, Glob
---

Entrada: $ARGUMENTS

Siga estes passos, sem pular nenhum, e mostre o resultado de cada um em uma linha.

1. **Config.** Veja se `~/.claude/leis/leis.json` já existe. Se existe e passa no esquema, não sobrescreva:
   pergunte nada, só informe. Se não existe, crie a pasta e grave o arquivo:
   - entrada vazia ou um nome: copie `${CLAUDE_PLUGIN_ROOT}/leis/modelo.json` e troque o campo `dono` pelo nome
     informado (sem nome, deixe "dono");
   - entrada é o caminho de um md de leis: leia o md inteiro e escreva o `leis.json` no formato do modelo
     (uma lei por seção, com `numero`, `sigla`, `nome`, `regra`, `teste`, `erro`, `correcao`, `apelidos`),
     mais `equilibrio`, `vedacoes` e `modos` com tudo em `"observar"`. Lei do md sem sigla pronunciável ganha
     uma sigla proposta por você e a proposta aparece no relatório.
2. **Esquema.** Confira com
   `node --input-type=module -e "import {validarEsquema} from '${CLAUDE_PLUGIN_ROOT}/scripts/leis.mjs'; import fs from 'node:fs'; console.log(validarEsquema(JSON.parse(fs.readFileSync(process.env.HOME + '/.claude/leis/leis.json','utf8'))))"`.
   Lista vazia passa. Qualquer erro: corrija o arquivo e confira de novo.
3. **Ponteiro.** Procure em `~/.claude/CLAUDE.md` a linha que já aponta para as leis (busque por `leis.json`).
   Se não existe, acrescente no fim do arquivo, uma vez:
   `Leis de trabalho: ~/.claude/leis/leis.json (plugin leis). As siglas e o teste de cada lei entram no início de toda sessão; modos e medição em /leis:leis-medir.`
   Se existe, não duplique: no máximo atualize a linha existente.
4. **Chave do JEV.** Rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/validar.mjs"` e mostre a saída. Chave ausente é falha
   esperada numa máquina nova: diga onde colocá-la (variável de ambiente `TYPESAFE_API_KEY` ou
   `AI_GATEWAY_API_KEY`, ou uma linha `CHAVE=valor` em `~/.config/jev/chaves.env`) e nunca peça nem imprima o valor.
5. **Relatório.** Diga o que ficou ligado: quais leis, em qual modo (todas em `observar` na primeira vez),
   se o plugin aparece habilitado e o que falta para fechar a validação.

Não edite `~/.claude/settings.json`: a instalação do plugin é feita por `claude plugin install leis@leis`.
