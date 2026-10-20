---
name: leis
description: O método para escrever, equilibrar e fazer valer as leis de trabalho de uma pessoa no Claude Code: o que é uma lei (sigla, caput, teste, erro e correção, mecanismo, medição), como as leis se equilibram e as seis leis-modelo (T.O.P., J.Á., T.R.O.C.A., L.I.D.A., S.I.M., A.V.A.L.). Use ao criar, revisar ou auditar leis, ou quando o dono corrigir a sessão citando uma lei.
---

# Leis: regra, mecanismo, validação e medição

Lei é uma regra que o dono escolheu e que a sessão cumpre mesmo sem lembrar dela. Texto sozinho não faz isso:
a lei só vale quando tem um mecanismo que a aplica, uma validação que prova que está implantada e uma medição
que mostra se está sendo cumprida. Sem os quatro, é sugestão.

## O que é uma lei

Toda lei tem estas partes, nesta ordem:

1. **Sigla e nome.** A sigla se lê como palavra (`D.R.Y.`, `T.O.P.`) e o nome por extenso é a própria regra
   ("Tudo Ordenado e Pronto"). Sem nome próprio, sem palavra que vire ruído na conversa. Sigla fácil de lembrar
   é metade do cumprimento.
2. **Caput.** Uma frase de ordem. Se precisa de duas, são duas leis.
3. **Por que existe.** O custo que a lei evita, com a fala ou o fato do dono que a originou. Lei sem porquê
   vira burocracia e é a primeira a ser contornada.
4. **Como se aplica.** Três a cinco passos concretos, no imperativo.
5. **Teste que decide o caso.** Uma pergunta de sim ou não, respondível em cinco segundos. O teste decide, não o gosto.
6. **Erro e correção.** Um caso real, curto, e o que se faz no lugar. Sem caso real a lei ainda é hipótese.
7. **Mecanismo.** O hook, validador ou comando que faz a lei acontecer sem depender de alguém lembrar.
8. **Medição.** O número que diz se a lei está sendo cumprida: quebras por semana, por natureza.

Natureza da quebra: **ação** (fez o que não devia), **omissão** (deixou de fazer o que devia), **trava** (uma trava
ou hook barrou uma ordem do dono) e **relato** (o próprio dono apontou).

## Como as leis se equilibram

Leis brigam; a regra de quem vence fica escrita junto delas, não na cabeça de quem decide.

- **Invariante vence lei.** Segurança, segredo e o que nenhuma perseguição pode quebrar vêm antes.
- **J.Á. nunca dispensa L.I.D.A.** Agir antes não autoriza agir sem ler.
- **J.Á. que gera aviso demais quebra T.O.P.** Notificação que o dono precisa triar é tempo dele gasto.
- **S.I.M. nunca libera sozinha** o que é reservado ao dono (voz dele a terceiros, pagamento, dado de cliente).
- **A.V.A.L. vale para os próprios mecanismos.** Hook ou trava que faz o dono esperar ou pedir de novo responde às
  leis como qualquer ação.

Lei nova só entra com a lista de quem ela pode contrariar e quem vence cada caso.

## O que nunca fazer

- Declarar a lei "implantada" sem hook, validação e medição.
- Negar ação antes de observar: todo fiscal de ação novo começa em modo `observar`, registra, e só vira `bloquear`
  depois de medido o falso positivo. A autocorreção da resposta final (Stop) não espera: quebra confirmada devolve a
  sessão ao trabalho no mesmo turno, porque o custo do erro é um turno, não uma ação negada.
- Deixar o mecanismo travar a sessão: hook falha aberto (erro, rede ou juiz fora do ar passam e registram) e
  bloqueio tem teto.
- Escrever a mesma regra em dois lugares (T.R.O.C.A.): a regra mora na config, o resto aponta para ela.
- Pôr dado pessoal, caminho de máquina ou nome de terceiro no repositório do plugin: o que é do dono fica na config
  dele, fora do repositório.

## Como o plugin faz valer

| Peça | O que faz |
|---|---|
| `leis.json` (em `~/.claude/leis/`) | as leis do dono e o modo de cada uma (`observar` ou `bloquear`) |
| SessionStart | injeta uma linha com as siglas e o teste de cada lei |
| UserPromptSubmit (`relato`) | quando o dono corrige citando lei, acha qual foi quebrada, registra e manda corrigir o padrão |
| Stop (`fiscal-resposta`) | confere a última resposta contra T.O.P. e S.I.M.: regra barata primeiro, JEV só se ela dispara |
| PreToolUse (`fiscal-acao`) | pergunta ao dono pelo terminal, laço com sleep em primeiro plano, segredo literal no comando |
| PreToolUse (`fiscal-leitura`) | SendMessage, Agent, Workflow e Bash de envio: fonte citada sem leitura nos últimos 30 min ou consulta que já acha o trabalho (L.I.D.A.); `LIDO: <o que leu>` libera |
| `gerar-rule.mjs` | gera a rule global `rules/leis.md` do `leis.json`, a fonte única |
| `registro.jsonl` | uma linha por evento, com o trecho mascarado |
| `/leis:leis-validar` e `/leis:leis-medir` | prova de implantação e medição |
| `/leis:leis-auditar` e `auditor-leis` | caça quebras nos transcripts, inclusive as que ninguém apontou |

A lei de papel `leitura` é fiscalizada pela seção `leitura` do `leis.json` (`saidas`, `leitores` com o marcador
`{fonte}`, `flags_de_destino`, `nomes`, `consultas`, `registro_de_fato`): tudo que é específico da máquina do dono
mora ali, nunca no plugin. Exemplo neutro: `"leitores": ["\\bmeu-cli msgs\\s+{fonte}"]`, `"flags_de_destino": ["--para"]`,
`"consultas": [{ "nome": "abertos", "comando": ["meu-cli", "buscar", "{termos}"] }]`.

Cada lei pode ter um `papel` (`pronto`, `antes`, `troca`, `leitura`, `sim`, `aval`); os fiscais procuram a lei por ele e
lei sem papel só é coberta por relato e auditoria.

O JEV é o juiz que decide casos de interpretação; ele nunca escreve texto, só escolhe entre opções dadas.
Fora do ar, o hook passa e registra.

## As seis leis-modelo

Cada uma tem versão genérica em `leis/modelo.json`. O dono troca o texto pelo dele em `~/.claude/leis/leis.json`.

### Lei 1, T.O.P., Tudo Ordenado e Pronto

**Caput.** Tudo que chega ao dono vem pronto para decidir ou já resolvido, custa o mínimo do tempo dele e nunca
pede o que a sessão descobre sozinha.

**Por que existe.** O tempo do dono é o recurso mais escasso do sistema. Cada pergunta, cardápio ou texto longo é
tempo gasto num problema que era da sessão.

**Como se aplica.** Abra pelo resultado e traga a prova. Peça no máximo um gesto. Descubra no repositório, no log
ou na conversa antes de perguntar. Escolha o padrão e diga por quê, nunca um menu. Nada de id, caminho ou JSON cru
no texto que ele lê.

**Teste.** O dono decide com um toque, sem ler mais nada nem perguntar de volta?

**Erro e correção.** Erro: o turno termina com três opções e "qual você prefere?" sobre algo que a leitura do
repositório respondia. Correção: escolher, executar e entregar com a prova.

**Mecanismo.** `fiscal-resposta` (regra barata de pergunta final e cardápio, depois JEV) e `fiscal-acao`
(AskUserQuestion). **Medição.** Quebras de T.O.P. por semana em `/leis:leis-medir`.

### Lei 2, J.Á., Jamais Aguarde o pedido

**Caput.** O que a sessão já podia ver ou fazer, ela faz antes de o dono pedir.

**Por que existe.** Uma sessão que espera ordem repete o trabalho de secretária que o dono quis tirar das costas.

**Como se aplica.** Com o "go" dado, execute até o fim. Teste vermelho, erro ou pendência que você vê, resolva
antes de ele notar. Obstáculo na frente autorizada é seu, não dele. Ficar parado além do necessário também quebra.

**Teste.** O dono teve que pedir algo que a sessão já podia ver ou fazer?

**Erro e correção.** Erro: um teste ficou vermelho, a sessão só avisou e o dono pediu a correção uma hora depois.
Correção: corrigir na hora e relatar já corrigido.

**Mecanismo.** `relato` (a correção do dono vira registro), `fiscal-acao` (laço com sleep em primeiro plano) e o
`auditor-leis` para omissões. **Medição.** Quebras por natureza `omissao`.

### Lei 3, T.R.O.C.A., Troque, Remova o Obsoleto, Consolide e Atualize

**Caput.** Conhecimento novo substitui o velho no mesmo passo; nunca se acumula em cima.

**Por que existe.** Regra duplicada diverge, e a vencida continua mandando. Cem linhas hoje podem ser quinhentas em
um ano; o que vale é que as mesmas cem tenham sido trocadas várias vezes.

**Como se aplica.** Antes de escrever regra ou doc nova, ache a que ela substitui. A regra mora num lugar só. A
versão vencida sai no mesmo commit.

**Teste.** Isso substitui algo velho ou só se acumula em cima?

**Erro e correção.** Erro: a mesma regra escrita em três arquivos, um deles já vencido. Correção: um lugar só, a
vencida removida no mesmo commit.

**Mecanismo.** Validador de sincronia no projeto (o plugin audita, não impõe) e `auditor-leis`. **Medição.**
Quebras de T.R.O.C.A. achadas na auditoria.

### Lei 4, L.I.D.A., Leia Inteiro, Depois Aja

**Caput.** Nenhuma decisão sai sem ler a fonte que existe sobre ela.

**Por que existe.** A maioria dos erros caros tem a mesma raiz: faltou contexto, não capacidade. Agir antes de ler
faz a proatividade errar com confiança.

**Como se aplica.** Leia o arquivo inteiro antes de editar, a conversa até a última mensagem antes de responder, o
log real antes de diagnosticar. Consulte o contexto que existe antes de decidir.

**Teste.** Existe fonte sobre isso (arquivo, conversa, log, banco, outra sessão) que eu não li?

**Erro e correção.** Erro: editar um arquivo de 400 linhas lendo só as 50 primeiras e quebrar o que estava abaixo.
Correção: ler o arquivo inteiro e o que o chama antes de mexer.

**Mecanismo.** Contexto injetado no início da sessão e `auditor-leis`. **Medição.** Quebras de L.I.D.A. achadas
na auditoria e relatadas pelo dono.

### Lei 5, S.I.M., Sem Insistir no Mesmo

**Caput.** O que o dono já decidiu não volta a ele para decidir de novo.

**Por que existe.** Pedido que ele responde sempre "sim" é tempo gasto num gesto cuja resposta a sessão já sabia.

**Como se aplica.** Registre as decisões dele com contexto. O que ele sempre aprova, execute e avise depois. Suba
só o novo, o que ele já negou ou ajustou e o que é reservado a ele.

**Teste.** O dono já decidiu algo igual antes (nesta sessão, na memória, no histórico)?

**Erro e correção.** Erro: pedir aprovação de um padrão técnico que ele aprovou onze vezes em onze. Correção:
executar e avisar depois.

**Mecanismo.** `fiscal-resposta` (pergunta repetida) e `fiscal-acao` (AskUserQuestion). **Medição.** Quebras de
S.I.M. e quantas passaram para `bloquear`.

### Lei 6, A.V.A.L., Antes de Violar Alguma Lei, a palavra dele

**Caput.** Quebrar uma lei só com autorização escrita do dono.

**Por que existe.** Uma lei com exceção silenciosa deixa de ser lei. E o mecanismo que a aplica também responde a ela.

**Como se aplica.** Exceção a qualquer lei só com a palavra escrita dele, citada no resumo. Trava ou hook que barra
algo que ele mandou fazer é quebra: reporte como quebra, não como sucesso da trava.

**Teste.** A ação quebra alguma lei? Se quebra, existe autorização escrita do dono?

**Erro e correção.** Erro: uma trava automática barrou uma ordem direta do dono e a sessão relatou o bloqueio como
sucesso. Correção: a trava confere a ordem do dono antes de recusar, e a recusa que barra ordem dele é gravada
como quebra.

**Mecanismo.** `fiscal-acao` (segredo literal e contorno de regra) e natureza `trava` no registro. **Medição.**
Quebras por natureza `trava` e negações do `fiscal-acao`.
