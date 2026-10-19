---
description: Audita os transcripts recentes atrás de quebras de cada lei, com trecho, lei e correção. Só leitura.
argument-hint: "[período: 24h (padrão), 7d, ou uma sessão]"
allowed-tools: Bash, Read, Grep, Glob, Agent
---

Período ou alvo: $ARGUMENTS (sem argumento, as últimas 24 h)

1. Liste os transcripts do período em `~/.claude/projects/*/<sessao>.jsonl`, pelos mais recentes
   (`find ~/.claude/projects -name '*.jsonl' -mtime -1` para 24 h, `-mtime -7` para 7 d; uma sessão pedida pelo id
   é só o arquivo com esse nome). Ignore os de subagente.
2. Leia as leis: `~/.claude/leis/leis.json`, ou `${CLAUDE_PLUGIN_ROOT}/leis/modelo.json` se não existir.
3. Chame o agente `auditor-leis` (do plugin leis). Mais de 10 transcripts: um agente por grupo de até 5, todos
   no mesmo response, em paralelo. Passe a cada um a lista de arquivos e o caminho do arquivo das leis.
4. Junte as respostas numa tabela só, mais grave primeiro: `transcript:linha | lei | trecho | correção | confiança`.
   Confira cada achado de confiança média ou baixa abrindo o trecho; descarte o que não se sustenta e diga quantos
   descartou.
5. Feche com a contagem por lei e a quebra que mais se repete. Para cada quebra confirmada, registre na medição:

   ```
   node --input-type=module -e "import {registrar} from '${CLAUDE_PLUGIN_ROOT}/scripts/registro.mjs'; registrar({hook:'auditoria', lei:'<sigla>', natureza:'<acao|omissao>', decisao:'auditada', sessao:'<id>', trecho:'<trecho>'})"
   ```

   Use `omissao` quando a sessão deixou de fazer o que devia (J.Á., L.I.D.A.) e `acao` quando fez o que não devia.
   O trecho passa pelo mascaramento do registro.

Não edite nenhum transcript nem arquivo do projeto auditado.
