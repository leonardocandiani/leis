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
hooks:       sessao, relato, fiscal-resposta, fiscal-acao e fiscal-leitura, todos falham abertos
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
| `fiscal-leitura` | antes de SendMessage, Agent, Workflow e dos Bash de envio que você configurar | fonte citada (arquivo, destino, nome) sem leitura nos últimos 30 min, ou consulta local que já acha o mesmo trabalho (L.I.D.A.) |

Cada lei do modelo tem um `papel` (`pronto`, `antes`, `troca`, `leitura`, `sim`, `aval`). Os fiscais procuram a lei pelo papel, não pelo número: renumerar não quebra nada. Lei sem papel conhecido não é fiscalizada por hook, só pelo `relato` e pela auditoria.

### Fiscal da L.I.D.A. (`leitura`)

Decisão não sai sem a leitura da fonte. O `fiscal-leitura` olha o texto da ferramenta (`message`, `prompt`, `description` e `script`; no Bash, o comando) e extrai as fontes citadas: caminhos absolutos de arquivos que existem, o valor das flags de `flags_de_destino` e os nomes de `nomes`. Para cada fonte procura, nos últimos 30 minutos do transcript, um `Read` ou `Grep` que a leia, ou um Bash que case com um padrão de `leitores`. Fonte sem leitura vira o achado `sem_leitura`, com o comando que resolve. Também vale como leitura o `Write` do arquivo inteiro e o heredoc `cat > arquivo <<FIM`, porque o conteúdo fica no transcript; `Edit` e saída redirecionada de outro programa não valem. Não viram fonte: `.env`, vídeo, áudio, compactado e banco (o Read não abre ou o cofre nega), arquivos de `/bin`, `/usr`, `/sbin`, `/System`, `/dev` e `/etc`, destino com variável, substituição ou máscara, e os destinos de `destinos_dispensados` (a conversa que a sessão já recebe pelo próprio canal). Em `Agent`, `Workflow` e `SendMessage`, o caminho vai a quem recebe, que lê: só o destino é conferido. Comando que casa com `provas_de_leitura` (um recibo que só sai depois de ler a conversa, por exemplo) não acusa `sem_leitura` em nenhuma fonte. Turno aberto por uma mensagem que casa com `ordens_do_dono` (a ordem direta do dono, "avisa a Ana que vou atrasar") não acusa `sem_leitura` no destino, porque negar ali barraria a ordem dele; o arquivo citado continua conferido. As `consultas` (comandos locais seus, rodados em paralelo com teto de 2 s no total) respondem "isso já foi feito ou já está aberto?". Os `{termos}` saem só do texto livre da ação (no Bash, os valores de `--titulo`, `--contexto`, `--mensagem` e afins, sem os de `flags_ignoradas`, padrão `["--origem"]`), com horários, datas e nomes próprios primeiro, no máximo 8. A consulta só produz linhas candidatas (as que têm o destino ou um termo, sem o eco da própria busca nem cabeçalho TOON, no máximo 12). Com candidatas, o JEV escolhe entre `ja_feito`, `ja_aberto` e `nenhum`. Relatar, repassar, corrigir ou citar o que as linhas mostram é `nenhum`; só pedir, criar ou executar de novo conta. A confiança é a soma de `ja_feito` e `ja_aberto`: com ao menos 0,7 vira o achado `ja_existe`, citando as linhas (mascaradas), e entre 0,4 e 0,7 vira aviso sem negar. Comando com `--substitui` ou `--cancelar` no segmento da saída não consulta. JEV fora do ar registra `jev_indisponivel` e não nega. Consulta que estoura o teto vira `consulta_indisponivel` no registro e nunca nega.

Em `observar` o fiscal só registra; em `bloquear` nega, listando cada achado. Quem leu de verdade e quer seguir escreve `LIDO: <o que leu e concluiu>` (ao menos 10 caracteres) no texto: isso libera e registra. Sem achado, o fiscal não registra nada. Se o transcript não pode ser lido, ele não acusa leitura.

Um segundo caminho roda no Stop: se o turno teve um leitor e nenhum `registro_de_fato`, e a resposta traz fato novo de terceiro (combinado, prazo, valor, decisão, material enviado), o JEV diz se isso devia ter ido ao contexto. Por enquanto só registra `observada`, em qualquer modo, até o falso positivo ser medido.

Tudo que é específico da sua máquina entra em `leitura` no seu `leis.json`, e os padrões são regex em texto (o marcador `{fonte}` de um leitor vira a fonte escapada; as consultas aceitam `{termos}`, `{destino}` e `{arquivo}`):

```json
{
  "leitura": {
    "saidas": ["\\bmeu-envio\\s+texto\\b"],
    "leitores": ["\\bmeu-cli msgs\\s+['\"]?{fonte}"],
    "flags_de_destino": ["--para", "--conversa"],
    "nomes": ["Fulano"],
    "flags_ignoradas": ["--origem"],
    "consultas": [
      { "nome": "abertos", "comando": ["meu-cli", "buscar", "{termos}"], "quando": "sempre" },
      { "nome": "enviados", "comando": ["meu-cli", "enviados", "{destino}"], "quando": "com_destino" }
    ],
    "provas_de_leitura": ["--recibo\\s+\\S"],
    "ordens_do_dono": ["\\[chamado\\]"],
    "registro_de_fato": "\\bmeu-cli contexto add\\b"
  }
}
```

`quando` aceita `sempre`, `com_destino` e `com_arquivo`. A config é validada: regex que não compila ou lista com tipo errado reprova o `leis.json`.

### Autocorreção e modos

Quando o JEV confirma que a resposta final quebrou T.O.P. ou S.I.M., o `fiscal-resposta` devolve a sessão ao trabalho no mesmo turno, com a lei, o teste e a correção: ela escolhe o padrão, executa e entrega o resultado, em vez de parar esperando você. Se a mesma lei já foi quebrada no mesmo projeto nos últimos 7 dias, a instrução manda gravar o aprendizado na memória ou nas regras do projeto, trocando a regra velha (T.R.O.C.A.). Isso vale em qualquer modo, porque o custo de um falso positivo é só um turno a mais.

Os modos valem para as ações de risco (`fiscal-acao`), onde negar tem custo real. O padrão é `observar`: o hook registra e avisa, não nega. Para uma lei passar a bloquear, ponha `"bloquear"` em `modos` no seu `leis.json` (a chave é o número da lei):

```json
{ "modos": { "1": "bloquear" } }
```

A autocorreção do Stop devolve a sessão até três vezes seguidas no mesmo turno, apertando a instrução a cada volta (decidir pelo padrão mais seguro e reversível, fazer e parar só com o resultado). A regra barata pega pergunta no fim, cardápio e também oferta sem ponto de interrogação ("se quiser, eu já subo", "aguardo seu ok", "é só me falar"). Passado o teto, a sessão para, a quebra vira pendência e o próximo prompt a reanima com "Na resposta anterior você quebrou a ..." e a ordem de gravar o aprendizado antes de seguir. Se o disco não grava a contagem, o teto vale na primeira volta, para nunca virar laço.

### Aceite por categoria

Perguntar ao dono só faz sentido quando a resposta dele não é previsível. Quando o `fiscal-resposta` vê uma pergunta no fim da resposta, o JEV diz também a categoria do que se pergunta (`tecnica`, `design`, `comercial`, `conteudo`, `outra`, ou as reservadas `voz_terceiro`, `pagamento`, `credencial`, `dado_cliente`). Se a pergunta chega a você, ela fica aberta, e a sua mensagem seguinte vira `aceitou`, `recusou` ou `ajustou` em `~/.claude/leis/aceites.jsonl` (só categoria e resposta, nunca o texto). Mensagem de outra sessão, aviso de tarefa e lembrete do sistema não contam.

Nas últimas 10 respostas da categoria (com pelo menos 5):

| Padrão | Quando | Efeito |
|---|---|---|
| `sempre_aceita` | 90% ou mais aceitas | perguntar quebra a S.I.M., mesmo com o JEV dizendo que não: a sessão volta e faz, e avisa depois |
| `mantem_perguntando` | 50% ou menos aceitas | a pergunta passa, mesmo com o JEV apontando T.O.P. |
| `misto` ou `aprendendo` | o resto | vale o veredito do JEV |

O caso inverso também conta: quando a resposta não pergunta nada, o turno fez algo além de ler e existe categoria em `mantem_perguntando`, o JEV confere se a sessão decidiu sozinha algo dessa categoria. Se decidiu, o registro ganha uma S.I.M. com o sinal `aceite_inverso+<categoria>`. Por enquanto só registra (`observada`), até o falso positivo ser medido.

As reservadas nunca viram `sempre_aceita`, nem com todos os aceites. Para trocar as categorias, ponha `aceite.categorias` (nome e descrição) no `leis.json`; `aceite.janela` e `aceite.minimo` mudam o tamanho da janela.

### Dupla quebra

Duas leis diferentes quebradas no mesmo turno são o sinal de que a sessão perdeu o rumo. O registro ganha uma linha do hook `escalada` com as duas siglas (`T.O.P.+J.Á.`). Em `observar`, o padrão, é só isso. Em `pausar`, o hook encerra o turno (`continue: false`) com o motivo e roda o seu comando de aviso; a sua próxima mensagem retoma a sessão, que nunca é desligada:

```json
{ "escalada": { "modo": "pausar", "aviso": ["meu-aviso", "--texto", "{mensagem}"] } }
```

O aviso tem teto de 3 s e nunca derruba o hook.

Todo hook falha aberto e sai com código 0: erro do plugin nunca derruba a sua sessão. O caso que não casa não usa rede e custa cerca de 50 ms (um processo Node).

## Comandos

| Comando | Para que serve |
|---|---|
| `/leis:leis-implantar` | cria a config e o ponteiro no `CLAUDE.md` global |
| `/leis:leis-validar` | confere config, hooks ativos, chave do JEV, JEV respondendo em menos de 3 s e registro gravável (exit 0 ou 1), e mostra a curva de quebras |
| `/leis:leis-contribuir` | mostra as quebras que se repetem em vários projetos e, só se você pedir, abre um PR com elas neste repositório |
| `/leis:leis-auditar` | o agente `auditor-leis` lê os transcripts das últimas 24 h (ou do período pedido) atrás de quebras |
| `/leis:leis-medir` | por lei e natureza, 24 h e 7 d: registradas, bloqueadas, observadas, JEV fora, mediana e p95 |
| `/leis:leis-nova` | cria uma lei nova no molde e atualiza a config |

`node scripts/validar.mjs` e `node scripts/medir.mjs` rodam fora do Claude Code, com a mesma saída (TOON).

**Curva de aprendizado.** O `validar` termina com as quebras distintas por hora desde a instalação: hora a hora nas primeiras 24 h, depois dia a dia, com a versão do plugin em cada janela. A mesma lei quebrada de novo na mesma sessão em menos de 15 min conta uma vez. A tendência compara as últimas 24 h com a taxa de antes delas (`caindo`, `estável`, `subindo`). Queda junto de troca de versão pode ser só falso positivo que saiu; queda na mesma versão é a sessão aprendendo.

**Casos para o repositório.** Quebra que aparece 3 vezes ou mais em 2 projetos ou mais é erro do plugin, não do projeto. `node scripts/contribuir.mjs` lista esses casos (modo seco, o padrão); `--abrir-pr --repo <clone>` grava `docs/casos/` e abre o PR. O caso leva só o papel da lei, o sinal do fiscal, contagens, versões e datas, e o script recusa com `code: HIGIENE` texto com caminho, e-mail, identificador de mensagem ou número longo, e com `code: SUJO` um clone com alteração pendente.

## Levar as leis a outro agente

O plugin é do Claude Code, mas as leis valem para qualquer agente que tenha um prompt e um ponto onde conferir a resposta antes de ela sair (um agente de WhatsApp, um assistente com ferramentas próprias). São duas peças.

**O prompt.** O `leis.json` já é o texto: para cada lei, a sigla, a regra, o teste e a correção. Cole no prompt do sistema do agente, nesta forma:

```
Você trabalha sob seis leis. Antes de responder, aplique o teste de cada uma.
- T.O.P. (Tudo Ordenado e Pronto): <regra>. Teste: <teste>
- S.I.M. (Sem Insistir no Mesmo): <regra>. Teste: <teste>
...
Se uma resposta quebra uma lei, corrija antes de enviar: <correção de cada lei>.
```

`node scripts/gerar-rule.mjs --seco` imprime a mesma coisa em markdown, pronta para colar.

**O fiscal.** Cada hook é um contrato de entrada e saída em JSON, e o agente chama o script do mesmo jeito que o Claude Code chama:

| Momento no agente | Script | Entrada (stdin) | Saída (stdout) |
|---|---|---|---|
| resposta pronta, antes de enviar | `fiscal-resposta.mjs` | `{session_id, cwd, last_assistant_message}` | vazio passa; `{decision: "block", reason}` manda reescrever com `reason` |
| antes de uma ação | `fiscal-acao.mjs` e `fiscal-leitura.mjs` | `{session_id, cwd, tool_name, tool_input, transcript_path}` | vazio passa; `hookSpecificOutput.permissionDecision: "deny"` nega com o motivo |
| mensagem nova do dono | `relato.mjs` | `{session_id, cwd, prompt}` | `hookSpecificOutput.additionalContext` vai junto da mensagem ao modelo |

Sem `transcript_path`, o fiscal da L.I.D.A. e a dupla quebra não rodam (não há turno para conferir); o resto funciona. A chave do JEV é a mesma (`AI_GATEWAY_API_KEY` ou `TYPESAFE_API_KEY`), e o registro, o aceite, a curva e o `contribuir` funcionam igual, porque leem o mesmo `~/.claude/leis/` (ou `LEIS_HOME`).

## Escrever uma lei nova

Rode `/leis:leis-nova <o que a lei deve garantir>`. Uma lei tem:

1. **Sigla pronunciável**: maiúsculas com ponto, que se lê como palavra (`T.O.P.`, `S.I.M.`), sem nome próprio.
2. **Caput**: uma frase de ordem que o dono reconhece como dele.
3. **Teste**: uma pergunta de sim ou não que decide o caso em cinco segundos.
4. **Erro e correção**: um caso real do que deu errado e o que se faz no lugar.
5. **Vedações e equilíbrio**: o que a lei proíbe e quem vence quando ela briga com outra.

Lei sem mecanismo e sem medição é texto: o comando avisa quando falta um dos dois.

Campos opcionais do `leis.json`: por lei, `aplicacao` (lista de frases de "como se aplica") e `papel`; no topo, `fontes` (lista de `{rotulo, caminho_ou_url}`), `jev.arquivos_chave` e `leitura` (ver o fiscal da L.I.D.A.). O gerador da rule escreve a tabela-resumo, a linha de fontes e, por lei, uma seção com regra, teste, como se aplica, erro e correção. `node scripts/gerar-rule.mjs --seco` mostra o que geraria sem escrever; `--help` lista as opções, e flag desconhecida sai com erro de uso (exit 2), sem efeito, em todos os scripts.

## Privacidade

Cada evento vira uma linha em `~/.claude/leis/registro.jsonl`: `ts`, `maquina`, `sessao`, `projeto`, `hook`, `lei`, `natureza` (`acao`, `omissao`, `trava`, `relato`), `decisao`, `sinal` (a regra ou o achado que disparou), `prob`, `duracao_ms`, a `versao` do plugin e um trecho de até 200 caracteres. O aceite por categoria grava em `aceites.jsonl` só `ts`, `categoria`, `resposta`, `sessao` e `projeto`.

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
