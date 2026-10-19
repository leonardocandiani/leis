<!-- readme-padrao:header -->
<!-- Banner -->
<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:1a1a2e,100:00d9ff&height=200&section=header&text=leis&fontSize=54&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=Leis%20de%20trabalho%20que%20o%20Claude%20Code%20obedece%2C%20com%20regra%2C%20hook%2C%20valida%C3%A7%C3%A3o%20e%20medi%C3%A7%C3%A3o&descAlignY=58&descSize=16" alt="leis" width="100%" />
</div>

<!-- Typing -->
<div align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=21&duration=2800&pause=900&color=00d9ff&center=true&vCenter=true&width=840&lines=Leis+de+trabalho+que+o+Claude+Code+obedece;Sigla%2C+teste+de+sim+ou+n%C3%A3o%2C+erro+real+e+corre%C3%A7%C3%A3o;Hooks+fiscalizam%2C+registram+e+medem+cada+quebra;Seis+leis-modelo%2C+zero+depend%C3%AAncia%2C+Node+22" alt="Leis de trabalho que o Claude Code obedece" />
</div>

<div align="center">

  <p><strong>Regra escrita, hook que fiscaliza, validação e medição, num plugin do Claude Code.</strong></p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-00d9ff?style=for-the-badge" alt="License: MIT" /></a>
    <a href="https://docs.claude.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Made%20for-Claude%20Code-D97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Made for: Claude Code" /></a>
    <a href="https://github.com/leonardocandiani/leis/releases"><img src="https://img.shields.io/github/v/release/leonardocandiani/leis?display_name=tag&style=for-the-badge&color=00d9ff&labelColor=1a1a2e" alt="Release" /></a>
    <a href="https://github.com/leonardocandiani/leis/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/leonardocandiani/leis/ci.yml?style=for-the-badge&labelColor=1a1a2e&label=CI" alt="CI" /></a>
    <img src="https://img.shields.io/badge/Node-22-1a1a2e?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node: 22" />
    <img src="https://img.shields.io/badge/depend%C3%AAncias-zero-00d9ff?style=for-the-badge" alt="dependências: zero" />
    <a href="https://github.com/leonardocandiani/leis/pulls"><img src="https://img.shields.io/badge/PRs-welcome-1a1a2e?style=for-the-badge" alt="PRs: welcome" /></a>
  </p>

  <p>
    <a href="#por-que-existe">Por que existe</a> •
    <a href="#instalação">Instalação</a> •
    <a href="#as-seis-leis-modelo">As seis leis-modelo</a> •
    <a href="#o-que-roda-sozinho">O que roda sozinho</a> •
    <a href="#comandos">Comandos</a> •
    <a href="#escrever-uma-lei-nova">Escrever uma lei nova</a> •
    <a href="#privacidade">Privacidade</a> •
    <a href="#licença">Licença</a>
  </p>
</div>

<br>

> **leis** troca o arquivo de regras que a sessão esquece por leis com sigla que se lê como palavra, teste de sim ou não e um hook que registra cada quebra. Começa em modo observar, passa a bloquear lei por lei e mostra o número no `/leis:leis-medir`.

> Projeto independente, sem vínculo com a Anthropic. "Claude" e "Claude Code" são marcas da Anthropic.

## O que é

```yaml
produto:     plugin do Claude Code que faz as leis de trabalho valerem
leis:        seis leis-modelo, troque pelas suas
hooks:       sessao, relato, fiscal-resposta e fiscal-acao, todos falham abertos
modos:       observar (padrão) ou bloquear, por lei
medicao:     registro local em JSONL, /leis:leis-medir por lei, 24 h e 7 d
privacidade: registro só na sua máquina, token, e-mail e telefone mascarados
instalar:    claude plugin marketplace add leonardocandiani/leis · claude plugin install leis@leis
requisitos:  Node 22 (testado no CI), chave do JEV opcional
licença:     MIT
```

<!-- /readme-padrao:header -->

## Por que existe

Um arquivo de regras no `CLAUDE.md` é uma sugestão: a sessão lê, concorda e esquece três turnos depois. O dono repete a mesma correção ("já te falei", "de novo") e a regra continua sem dono. Aqui cada lei tem uma sigla que se lê como palavra, um teste de sim ou não que decide o caso em cinco segundos, um erro real com a correção, e um mecanismo que a aplica sem depender de a sessão lembrar. O que não dá para medir não vale como lei, por isso o plugin registra cada quebra e mostra o número.

## Instalação

```
claude plugin marketplace add leonardocandiani/leis
claude plugin install leis@leis
```

Depois, numa sessão do Claude Code:

```
/leis:leis-implantar <seu nome>
```

O comando cria `~/.claude/leis/leis.json` a partir do modelo (ou de um arquivo md com as suas leis), gera `~/.claude/rules/leis.md` e põe o ponteiro no seu `CLAUDE.md` global. O `leis.json` é a fonte única: edite o json e rode `node scripts/gerar-rule.mjs` para regerar a rule. Sem `leis.json`, o plugin usa o modelo e avisa.

Testado no Node 22 (o CI roda nele). Sem dependência externa.

### O juiz das conferências (JEV)

Algumas conferências pedem julgamento, não regra de texto. Quem julga é o JEV (TypeSafe), que precisa de uma chave: `TYPESAFE_API_KEY` ou `AI_GATEWAY_API_KEY`, no ambiente, em `~/.claude/settings.local.json` (campo `env`) ou numa linha `CHAVE=valor` em `~/.config/jev/chaves.env`. Outros arquivos de chaves entram em `jev.arquivos_chave` no `leis.json`. Sem chave, o plugin segue funcionando: as conferências por regra e a citação explícita de lei continuam, e o que dependia do JEV passa e registra.

## As seis leis-modelo

| Lei | Sigla | Nome por extenso | Teste |
|---|---|---|---|
| 1 | T.O.P. | Tudo Ordenado e Pronto | O dono decide com um toque, sem ler mais nada nem perguntar de volta? |
| 2 | J.Á. | Jamais Aguarde o pedido | O dono teve que pedir algo que a sessão já podia ver ou fazer? |
| 3 | T.R.O.C.A. | Troque, Remova o Obsoleto, Consolide e Atualize | Isso substitui algo velho ou só se acumula em cima? |
| 4 | L.I.D.A. | Leia Inteiro, Depois Aja | Existe fonte sobre isso que eu não li? |
| 5 | S.I.M. | Sem Insistir no Mesmo | O dono já decidiu algo igual antes? |
| 6 | A.V.A.L. | Antes de Violar Alguma Lei, a palavra dele | A ação quebra alguma lei? Se quebra, há autorização escrita? |

O texto completo de cada uma, com erro e correção, está em `leis/modelo.json` e na skill `leis`. São um ponto de partida: troque pelas suas.

## O que roda sozinho

| Hook | Quando | O que faz |
|---|---|---|
| `sessao` | início da sessão | injeta uma linha com as siglas e o teste de cada lei |
| `relato` | cada mensagem do dono | se ele corrige citando lei ("infringiu", "L2", a sigla, "de novo", "já te falei"), acha qual foi quebrada, registra e manda corrigir o padrão |
| `fiscal-resposta` | fim de cada resposta | pergunta final ou cardápio ("quer que eu...") dispara o JEV, que diz se quebrou T.O.P. ou S.I.M. |
| `fiscal-acao` | antes de Bash e AskUserQuestion | pergunta ao dono pelo terminal, laço com sleep em primeiro plano, segredo literal no comando |

Cada lei do modelo tem um `papel` (`pronto`, `antes`, `troca`, `leitura`, `sim`, `aval`). Os fiscais procuram a lei pelo papel, não pelo número: renumerar não quebra nada. Lei sem papel conhecido não é fiscalizada por hook, só pelo `relato` e pela auditoria.

### Modos observar e bloquear

O padrão é `observar`: o hook registra e avisa, não nega. Para uma lei passar a bloquear, ponha `"bloquear"` em `modos` no seu `leis.json` (a chave é o número da lei):

```json
{ "modos": { "1": "bloquear" } }
```

O bloqueio do Stop tem teto de um seguido por turno, para a sessão nunca travar num laço. Em `observar`, a quebra que o `fiscal-resposta` viu vira pendência da sessão e o próximo prompt injeta "Na resposta anterior você quebrou a ...", uma vez, para o modelo aprender.

Todo hook falha aberto e sai com código 0: erro do plugin nunca derruba a sua sessão. O caso que não casa não usa rede e custa cerca de 50 ms (um processo Node).

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

Rode `/leis:leis-nova <o que a lei deve garantir>`. Uma lei tem:

1. **Sigla pronunciável**: maiúsculas com ponto, que se lê como palavra (`T.O.P.`, `S.I.M.`), sem nome próprio.
2. **Caput**: uma frase de ordem que o dono reconhece como dele.
3. **Teste**: uma pergunta de sim ou não que decide o caso em cinco segundos.
4. **Erro e correção**: um caso real do que deu errado e o que se faz no lugar.
5. **Vedações e equilíbrio**: o que a lei proíbe e quem vence quando ela briga com outra.

Lei sem mecanismo e sem medição é texto: o comando avisa quando falta um dos dois.

Campos opcionais do `leis.json`: por lei, `aplicacao` (lista de frases de "como se aplica") e `papel`; no topo, `fontes` (lista de `{rotulo, caminho_ou_url}`) e `jev.arquivos_chave`. O gerador da rule escreve a tabela-resumo, a linha de fontes e, por lei, uma seção com regra, teste, como se aplica, erro e correção. `node scripts/gerar-rule.mjs --seco` mostra o que geraria sem escrever; `--help` lista as opções, e flag desconhecida sai com erro de uso (exit 2), sem efeito, em todos os scripts.

## Privacidade

Cada evento vira uma linha em `~/.claude/leis/registro.jsonl`: `ts`, `maquina`, `sessao`, `projeto`, `hook`, `lei`, `natureza` (`acao`, `omissao`, `trava`, `relato`), `decisao`, `prob`, `duracao_ms` e um trecho de até 200 caracteres.

- O registro fica na sua máquina e nunca é enviado.
- Token, e-mail e telefone saem mascarados antes de gravar.
- O JEV recebe apenas a cauda mascarada da conversa (até 4 KB) e as leis, e só quando uma regra barata já suspeitou.
- Todo hook falha aberto: sem chave, sem rede ou com erro, a sessão segue como se o plugin não estivesse lá.

## Desenvolvimento

```
node --test "testes/*.test.mjs"
```

Sem dependência externa. Os testes usam JEV falso e uma casa temporária (`LEIS_HOME`). As decisões de desenho estão em `docs/FUNDACAO.md`.

## Licença

MIT. Veja o arquivo `LICENSE`.

<!-- readme-padrao:footer -->
<br>

---

<div align="center">
  <p><strong>Feito por <a href="https://github.com/leonardocandiani">Leonardo Candiani</a></strong> · Mais projetos em <a href="https://github.com/leonardocandiani?tab=repositories">github.com/leonardocandiani</a></p>
  <p>Leonardo Candiani constrói agentes de IA que conversam, decidem e fecham negócio. Cofundador da SixQuasar, operando Proteauto, SegSmart e IACall ponta a ponta.</p>
  <a href="https://leonardocandiani.com.br">
    <img src="https://img.shields.io/badge/-Site-0d1117?style=for-the-badge&logo=safari&logoColor=00d9ff" alt="Site" />
  </a>
  <a href="https://github.com/leonardocandiani">
    <img src="https://img.shields.io/badge/-GitHub-0d1117?style=for-the-badge&logo=github&logoColor=00d9ff" alt="GitHub" />
  </a>
  <a href="https://instagram.com/leonardocandiani">
    <img src="https://img.shields.io/badge/-Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram" />
  </a>
  <a href="https://youtube.com/@oleonardocandiani">
    <img src="https://img.shields.io/badge/-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube" />
  </a>
</div>

<br>

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:00d9ff,50:1a1a2e,100:0d1117&height=120&section=footer&text=Obrigado%20pela%20visita%21&fontSize=18&fontColor=ffffff&fontAlignY=72" alt="Obrigado pela visita!" width="100%" />
</div>
<!-- /readme-padrao:footer -->
