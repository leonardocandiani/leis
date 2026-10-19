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
3. **Rule global.** O `leis.json` é a fonte única das leis. Gere a rule a partir dele, sem perguntar:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gerar-rule.mjs"` grava `~/.claude/rules/leis.md` (cabeçalho "Gerado de
   ~/.claude/leis/leis.json por /leis-implantar; edite o json", tabela de leis, equilíbrio e vedações). Se já
   existia um `leis.md` escrito à mão, o script o guarda como `leis.md.antes`: avise isso no relatório. Nunca edite
   o `leis.md` gerado; mude o json e rode o script de novo.
4. **Ponteiro.** Procure em `~/.claude/CLAUDE.md` a linha que já aponta para as leis (busque por `leis.json`).
   Se não existe, acrescente no fim do arquivo, uma vez:
   `Leis de trabalho: ~/.claude/leis/leis.json (plugin leis); a rule ~/.claude/rules/leis.md é gerada dele. As siglas e o teste de cada lei entram no início de toda sessão; modos e medição em /leis:leis-medir.`
   Se existe, não duplique: no máximo atualize a linha existente.
5. **Chave do JEV.** Rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/validar.mjs"` e mostre a saída. Se `chave_jev` falhar,
   procure a chave em caminhos conhecidos do usuário que a busca padrão não cobre (`~/.env`, `~/.config/*/*.env`,
   `~/central/.env`) só com `grep -l -E '^(export )?(TYPESAFE_API_KEY|AI_GATEWAY_API_KEY)=' <arquivo>`, sem nunca
   imprimir o valor. Achou: grave o caminho em `jev.arquivos_chave` do `leis.json` (lista, sem duplicar), sem
   perguntar, e rode o validar de novo. Não achou: diga onde colocar (variável de ambiente `TYPESAFE_API_KEY` ou
   `AI_GATEWAY_API_KEY`, ou uma linha `CHAVE=valor` em `~/.config/jev/chaves.env`).
6. **Relatório.** Diga o que ficou ligado: quais leis, em qual modo (todas em `observar` na primeira vez),
   se o plugin aparece habilitado e o que falta para fechar a validação.

Não edite `~/.claude/settings.json`: a instalação do plugin é feita por `claude plugin install leis@leis`.
