# Fundação do plugin leis

Por que o plugin existe, o que cobre e as decisões que o moldam. Quem muda um hook lê esta página antes.

## Por que existe

Uma lei escrita num arquivo de regras é um pedido. A sessão a lê no início, a esquece no meio e a quebra no fim, e o
dono é quem percebe, corrige e repete a correção. O plugin troca o pedido por quatro peças:

1. **Regra**: as leis em dados (`leis.json`), com sigla, teste, erro e correção.
2. **Mecanismo**: hooks que aplicam a regra sem depender de a sessão lembrar.
3. **Validação**: um comando que prova que a lei está implantada na máquina.
4. **Auditoria e medição**: o registro de cada evento e um agente que caça quebras nos transcripts.

O primeiro uso são as seis leis de uma pessoa, em duas máquinas. A versão pública é genérica: tudo que é do dono
(leis, modos, chave do JEV) mora em `~/.claude/leis/`, fora do repositório.

## Matriz: lei, mecanismo, validação, medição

| Lei | Mecanismo | Validação | Medição |
|---|---|---|---|
| T.O.P. | `fiscal-resposta` (Stop): pergunta final ou cardápio, depois JEV; `fiscal-acao`: AskUserQuestion | `/leis:leis-validar` | quebras de T.O.P. no `registro.jsonl` |
| J.Á. | `relato` (correção do dono); `fiscal-acao`: laço com sleep em primeiro plano; `auditor-leis` para omissão | idem | natureza `omissao` e `relato` |
| T.R.O.C.A. | `auditor-leis`; o plugin audita, o validador de sincronia é do projeto | idem | quebras achadas na auditoria |
| L.I.D.A. | início de sessão com o teste da lei; `auditor-leis` | idem | quebras achadas na auditoria e `relato` |
| S.I.M. | `fiscal-resposta` (pergunta repetida); `fiscal-acao`: AskUserQuestion | idem | quebras de S.I.M., bloqueadas e observadas |
| A.V.A.L. | `fiscal-acao`: segredo literal; natureza `trava` para trava que barrou ordem do dono | idem | natureza `trava`, negações do `fiscal-acao` |
| todas | `sessao` (SessionStart) injeta siglas e testes; `relato` registra a correção do dono | `/leis:leis-validar` confere config, hooks, chave, JEV e registro | `/leis:leis-medir`: por lei e natureza, 24 h e 7 d |

Fora do alcance de hook: T.R.O.C.A. e L.I.D.A. dependem de ler o que a sessão leu e do que ela substituiu, o que um
hook não vê. Por isso a cobertura delas é o início de sessão (lembrar), o `relato` (o dono aponta) e a auditoria de
transcript (achar depois). Dizer que um hook "faz valer" essas duas seria promessa sem mecanismo.

## Decisões

**Observar antes de bloquear.** Todo modo nasce em `observar`: o hook registra e avisa, não nega. Só depois de medir
o falso positivo (`/leis:leis-medir`) uma lei passa para `bloquear` na config. O bloqueio tem teto de um seguido por
sessão, para nunca laçar com outros hooks de Stop. Alternativa descartada: nascer bloqueando, por ser a forma que
faz a lei "valer logo". Descartada porque um falso positivo que trava a sessão custa mais confiança do que a lei
ganha.

**Fail-open.** Erro, entrada corrompida, rede e JEV fora do ar passam e registram (`jev_indisponivel`). Um hook de
governança que derruba a sessão é pior que a quebra que ele evitava.

**Regra barata primeiro, JEV depois.** O caso que não casa custa um processo Node (medido em 48 a 49 ms, a uns
7 ms acima do piso do runtime) e nenhuma rede. O JEV só é chamado quando uma regex já suspeita, e só escolhe entre
opções dadas (select, never generate). A citação explícita de uma lei no `relato` ("quebrou a L2") é resolvida sem
JEV; o JEV entra quando o dono corrige sem dizer qual lei.

**Pular onde há portão.** Num projeto que já tem portão próprio (`scripts/central/hooks/portao.ts`), o
`fiscal-acao` sai sem fazer nada, para não chamar o JEV duas vezes nem negar duas vezes. Pelo mesmo motivo o
`fiscal-resposta` sai quando o projeto tem `scripts/central/hooks/parada.ts`, que já devolve a sessão ao trabalho
quando ela termina pedindo decisão.

**Registro fora do repositório.** `~/.claude/leis/registro.jsonl`, com o trecho mascarado (segredo, e-mail,
telefone) e limitado a 200 caracteres. Sem rede, sem serviço, sem banco.

**Observar no Stop é `systemMessage`, não `additionalContext`.** A documentação dos hooks diz que `additionalContext`
no Stop continua a conversa, o que seria bloqueio disfarçado. Em modo observar o `fiscal-resposta` devolve só
`systemMessage` (o dono vê o aviso) e registra. Em modo bloquear devolve `decision: "block"` com a correção.

**Zero dependência.** Node puro, para rodar em qualquer máquina que tenha o Claude Code.

## O que ainda não foi provado

- O formato de saída do Stop foi confirmado pela documentação, não por uma sessão real rodando o plugin instalado.
- O acerto do JEV nas perguntas do `fiscal-resposta` e do `relato` não foi medido: os testes usam JEV falso. A
  calibração (`CONFIANCA_MINIMA`) vem da medição em modo observar.
- A matriz acima descreve o desenho; a taxa de falso positivo de cada hook só existe depois de dias de registro.
