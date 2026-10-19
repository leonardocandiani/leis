# leis

Plugin do Claude Code que faz as leis de trabalho de uma pessoa valerem de verdade: regra, hooks, validação,
auditoria e medição. Em vez de um arquivo de regras que a sessão esquece, cada lei tem uma sigla que se lembra
fácil, um teste de sim ou não, um erro real com a correção e um mecanismo que a aplica sozinho.

## As seis leis-modelo

| Lei | Sigla | Nome por extenso | Teste |
|---|---|---|---|
| 1 | T.O.P. | Tudo Ordenado e Pronto | O dono decide com um toque, sem ler mais nada nem perguntar de volta? |
| 2 | J.Á. | Jamais Aguarde o pedido | O dono teve que pedir algo que a sessão já podia ver ou fazer? |
| 3 | T.R.O.C.A. | Troque, Remova o Obsoleto, Consolide e Atualize | Isso substitui algo velho ou só se acumula em cima? |
| 4 | L.I.D.A. | Leia Inteiro, Depois Aja | Existe fonte sobre isso que eu não li? |
| 5 | S.I.M. | Sem Insistir no Mesmo | O dono já decidiu algo igual antes? |
| 6 | A.V.A.L. | Antes de Violar Alguma Lei, a palavra dele | A ação quebra alguma lei? Se quebra, há autorização escrita? |

O texto completo de cada uma, com erro e correção, está em `leis/modelo.json` e na skill `leis`. Troque pelo seu.

## Instalação

```
claude plugin marketplace add <caminho do repositório ou usuario/repositorio>
claude plugin install leis@leis
```

Depois, numa sessão: `/leis:leis-implantar <seu nome>` cria `~/.claude/leis/leis.json` a partir do modelo (ou de
um md com as suas leis) gera `~/.claude/rules/leis.md` a partir dele (o json é a fonte única; edite o json e rode
`node scripts/gerar-rule.mjs`) e põe o ponteiro no seu `CLAUDE.md`. Sem `leis.json`, o plugin usa o modelo e avisa.

O juiz das conferências é o JEV (TypeSafe). Ele precisa de uma chave: `TYPESAFE_API_KEY` ou
`AI_GATEWAY_API_KEY`, no ambiente, em `~/.claude/settings.local.json` (campo `env`) ou numa linha `CHAVE=valor` em
`~/.config/jev/chaves.env`. Outros arquivos de chaves entram em `jev.arquivos_chave` no `leis.json` (opcional;
o `/leis-implantar` grava o campo sozinho quando acha a chave num caminho conhecido fora da busca padrão). Sem chave o
plugin continua funcionando: as conferências por regra e a citação explícita de lei seguem, e o que dependia do
JEV passa e registra.

## O que roda sozinho

| Hook | Quando | O que faz |
|---|---|---|
| `sessao` | início da sessão | injeta uma linha com as siglas e o teste de cada lei |
| `relato` | cada mensagem do dono | se ele corrige citando lei ("infringiu", "L2", a sigla, "de novo", "já te falei"), acha qual foi quebrada, registra e manda corrigir o padrão |
| `fiscal-resposta` | fim de cada resposta | pergunta final ou cardápio ("quer que eu...") dispara o JEV, que diz se quebrou T.O.P. ou S.I.M. |
| `fiscal-acao` | antes de Bash e AskUserQuestion | pergunta ao dono pelo terminal, laço com sleep em primeiro plano, segredo literal no comando |

Todo hook falha aberto e sai com código 0. O caso que não casa não usa rede e custa cerca de 50 ms (um processo
Node). O padrão é o modo `observar`: o hook registra e avisa, não nega. Para uma lei passar a bloquear, ponha
`"bloquear"` em `modos` no seu `leis.json` (a chave é o número da lei): `{"modos": {"1": "bloquear"}}`. O bloqueio do
Stop tem teto de um seguido por turno. Em `observar`, a quebra que o `fiscal-resposta` viu vira pendência da sessão
e o próximo prompt injeta "Na resposta anterior você quebrou a ...", uma vez, para o modelo aprender.

Cada lei do modelo tem um `papel` (`pronto`, `antes`, `troca`, `leitura`, `sim`, `aval`). Os fiscais procuram a lei
pelo papel, não pelo número: renumerar não quebra nada. Lei sem papel conhecido não é fiscalizada por hook, só pelo
`relato` e pela auditoria.

## Comandos

| Comando | Para que serve |
|---|---|
| `/leis:leis-implantar` | cria a config e o ponteiro no `CLAUDE.md` global |
| `/leis:leis-validar` | confere config, hooks ativos, chave do JEV, JEV respondendo em menos de 3 s e registro gravável (exit 0 ou 1) |
| `/leis:leis-auditar` | o agente `auditor-leis` lê os transcripts das últimas 24 h (ou do período pedido) atrás de quebras |
| `/leis:leis-medir` | por lei e natureza, 24 h e 7 d: registradas, bloqueadas, observadas, JEV fora, mediana e p95 |
| `/leis:leis-nova` | cria uma lei nova no molde e atualiza a config |

`node scripts/validar.mjs` e `node scripts/medir.mjs` rodam fora do Claude Code, com a mesma saída (TOON).

## Escrever uma lei nova

Rode `/leis:leis-nova <o que a lei deve garantir>`. Uma lei tem: sigla pronunciável (maiúsculas com ponto, sem nome
próprio), caput de uma frase, teste de sim ou não, um erro real com a correção, as vedações e o equilíbrio com as
leis que ela pode contrariar. Lei sem mecanismo e sem medição é texto: o comando avisa.

## Registro e privacidade

Cada evento vira uma linha em `~/.claude/leis/registro.jsonl`: `ts`, `maquina`, `sessao`, `projeto`, `hook`, `lei`,
`natureza` (`acao`, `omissao`, `trava`, `relato`), `decisao`, `prob`, `duracao_ms` e um trecho de até 200
caracteres. Token, e-mail e telefone saem mascarados antes de gravar. O registro fica na sua máquina; o JEV recebe
apenas a cauda mascarada da conversa (até 4 KB) e as leis, e só quando uma regra barata já suspeitou.

## Desenvolvimento

```
node --test "testes/*.test.mjs"
```

Sem dependência externa. Os testes usam JEV falso e uma casa temporária (`LEIS_HOME`). Mais sobre as decisões em
`docs/FUNDACAO.md`.

## Licença

MIT.
