# Bot de Tickets (Empregos)

Bot de tickets para servidores de roleplay, feito com Node.js, discord.js v14, Components V2 e SQLite.

O canal tem um painel fixo com o botão **Abrir ticket**. O jogador clica, escolhe o emprego, preenche o formulário (idade, hobby e endereço) e o bot cria um ticket privado, entrega o cargo do emprego e avisa a equipe. Quem fecha o ticket é um administrador.

## Requisitos

- Node.js 20 ou superior
- Um servidor do Discord para testar

## Instalação

### 1. Criar o bot

1. Acesse https://discord.com/developers/applications e crie uma aplicação.
2. Em **General Information**, copie o **Application ID** (vai em `CLIENT_ID`).
3. Em **Bot**, clique em **Reset Token** e copie o token (vai em `DISCORD_TOKEN`). Nunca compartilhe esse token.
4. Não ative nenhum Privileged Gateway Intent. O bot usa só o intent `Guilds`.

### 2. Convidar o bot

Em **OAuth2 > URL Generator**, marque os scopes `bot` e `applications.commands` e estas permissões:

| Permissão | Para quê |
|---|---|
| Gerenciar Cargos | entregar o cargo do emprego |
| Gerenciar Canais | criar e apagar os canais dos tickets |
| Ver Canais | enxergar canais e categorias |
| Enviar Mensagens | publicar o painel e as mensagens dos tickets |
| Ver Histórico de Mensagens | achar o painel já publicado e as confirmações |
| Incorporar Links e Anexar Arquivos | liberar links e anexos para jogador e equipe |

Não dê Administrador ao bot. Depois de adicionar, arraste o cargo do bot para cima dos cargos de emprego que ele vai entregar. Na categoria dos tickets ele precisa de Ver canal, Gerenciar canais, Enviar mensagens e Ver histórico.

### 3. Configurar

```bash
npm install
```

Copie `.env.example` para `.env` e preencha:

```
DISCORD_TOKEN=token_do_bot
CLIENT_ID=id_da_aplicacao
GUILD_ID=id_do_servidor_de_testes
DATABASE_PATH=./data/bot.sqlite
```

`GUILD_ID` e `DATABASE_PATH` são opcionais. Com `GUILD_ID` o comando aparece na hora, sem ele o registro é global e demora.

### 4. Registrar o comando e iniciar

```bash
npm run deploy
npm start
```

O banco `data/bot.sqlite` é criado sozinho. Se já existir, é atualizado sem perder empregos, configurações nem tickets. Para atualizar uma versão antiga, troque os arquivos mantendo o seu `.env` e a pasta `data/`, rode `npm install` e `npm start`.

## Uso

1. Rode `/colocar-painel` (só dono ou administrador) e cadastre os empregos, as descrições, o canal do painel, a categoria dos tickets e a equipe de atendimento.
2. Clique em **Revisar e publicar**. O painel fixo vai para o canal escolhido.
3. Os jogadores clicam em **Abrir ticket**, escolhem o emprego e preenchem o formulário.

O texto do painel fixo e as regras que aparecem no painel e dentro do ticket ficam em `src/constants.js` (`PANEL_WELCOME` e `TICKET_RULES`). Depois de mudar, use **Revisar e atualizar painel** no `/colocar-painel` para o painel do canal ser editado.

### Fechamento do ticket

1. O jogador clica em **Solicitar fechamento**. O bot avisa no canal que está aguardando confirmação e o canal continua aberto.
2. Um administrador clica em **Fechar ticket** e confirma em **Confirmar fechamento**, ou cancela em **Cancelar** (some só a pergunta).
3. Ao confirmar, o canal é apagado e o ticket fica como `closed` no banco.

Só administrador (ou dono do servidor) consegue confirmar ou cancelar. O bot confere no banco se o ticket é daquele servidor e daquele canal, e o fechamento é atômico: mesmo com vários cliques ao mesmo tempo o canal é apagado uma vez só. Se o Discord recusar a exclusão, o ticket volta a ficar aberto e o administrador recebe o motivo.

## Ofuscação do código

O build usa o [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) em **duas passadas em cascata**: a primeira embaralha nomes, bagunça o fluxo de execução, injeta código morto e criptografa todas as strings com RC4; a segunda pega esse resultado já ofuscado e ofusca de novo por cima (novos nomes, strings recriptografadas em base64, mais uma camada de fragmentação), e só nessa passada final liga `selfDefending` (o código quebra sozinho se alguém tentar reformatar/"prettificar" para facilitar a leitura) e `debugProtection` (atrapalha quem tenta anexar um debugger para rodar passo a passo).

O resultado é texto JavaScript comum — não é bytecode, não precisa compilar nada, roda em qualquer instalação de Node 20+ sem nenhum risco de incompatibilidade de versão.

### Como gerar

```bash
npm install
npm run build
```

Isso cria a pasta `dist/`, que é **autossuficiente**: tem o código ofuscado nas duas passadas e o próprio `package.json` dentro, já configurado com `npm start` e `npm run deploy`, listando só as dependências de verdade usadas em produção (nem `javascript-obfuscator`, que só serve para gerar o `dist/`). Dá para zipar e enviar só essa pasta, sem o resto do projeto.

### Enviar para outra pessoa rodar (sem o código-fonte)

1. Rode `npm install` e `npm run build` na sua máquina.
2. Dentro de `dist/`, copie o `.env.example` para `.env` e preencha com o token e o Client ID **do bot que a pessoa vai usar** (normalmente ela mesma cria a própria aplicação no Discord Developer Portal e te passa esses dados, ou cria a aplicação e preenche sozinha).
3. Zipe só a pasta `dist/` (já contém `package.json`, `.env` e o código ofuscado).
4. Mande esse zip. A pessoa só precisa:
   ```bash
   npm install
   npm run deploy
   npm start
   ```
   dentro da pasta, em qualquer hospedagem com Node 20 ou mais novo — Wispbyte incluso, sem precisar bater versão nenhuma com a sua máquina.

Teste esse fluxo você mesmo antes de mandar pra valer: rode `npm install`, `npm run deploy` e `npm start` dentro de `dist/` localmente (ou numa Wispbyte sua) com um bot de teste, e confira que o painel, o ticket e o fechamento funcionam normalmente. Ofuscação pesada ocasionalmente derruba algum detalhe sutil — é melhor achar isso num teste seu do que no deploy do seu amigo.

### Hospedar você mesmo (Wispbyte e parecidos)

Mesma lógica: suba só o conteúdo de `dist/` (não precisa do `src/`). No painel, configure:

- **Comando de instalação:** `npm install`
- **Comando de inicialização:** `npm run deploy && npm start`

### Ajustes e limites

- As opções de cada passada ficam em `firstPass` e `secondPass`, em `scripts/build.js`. Se o bot ficar lento, travar ou algum ticket se comportar estranho depois do build, o primeiro suspeito é `debugProtection` (pode deixar o processo preso em alguns ambientes) — desative essa opção na `secondPass` e gere de novo. Depois, se ainda houver problema, teste desligar `controlFlowFlattening` e `deadCodeInjection` da `firstPass`.
- Os erros da versão ofuscada aparecem com nomes e números de linha sem nexo. Para depurar um problema de verdade, reproduza com `npm start` na raiz do projeto (roda `src/` direto, sem ofuscação nenhuma).
- Ofuscação nunca é proteção "inquebrável": alguém com tempo e conhecimento técnico avançado consegue, na pior das hipóteses, rodar o bot e observar o que ele faz. Duas passadas empilhadas, com `selfDefending` e `debugProtection`, tornam isso bem mais trabalhoso do que uma passada só — é o nível prático mais alto que dá para ter mantendo o código como JavaScript comum, portável para qualquer máquina. O que realmente protege o bot é o token no `.env`, que nunca deve ir para um repositório nem ser enviado a mais ninguém além de quem vai rodar aquele bot específico. Se o token vazar, gere outro no Developer Portal.
- Sempre que mudar algo em `src/`, rode `npm run build` de novo e reenvie o `dist/` atualizado.

## Banco de dados e privacidade

Tabelas: `guild_settings`, `jobs`, `staff_roles` e `tickets`, separadas por servidor. O ticket passa por `creating`, `open`, `closing` e `closed` e fica no banco como histórico.

O bot guarda idade, hobby e endereço informados pelos jogadores. Trate `data/bot.sqlite` como dado pessoal: não compartilhe, faça backup protegido e apague registros que não precisar mais. Para fazer backup, pare o bot e copie a pasta `data/` inteira.

## Estrutura

```
bot-empregos/
├── package.json  .env.example  README.md
├── scripts/build.js          gera a versão ofuscada em dist/
├── src/
│   ├── index.js              inicia o bot
│   ├── deploy-commands.js    registra os comandos
│   ├── handlers.js           roteia as interações
│   ├── config.js  constants.js
│   ├── commands/             /colocar-painel
│   ├── database/             SQLite e migrações
│   ├── interactions/         botões, menus e formulários
│   ├── services/             criação e fechamento de tickets, publicação do painel
│   ├── ui/                   telas em Components V2
│   └── utils/                permissões, validação, cargos, rascunhos, logs
```

## Problemas comuns

- **Variáveis ausentes no .env**: o arquivo precisa se chamar `.env`, não `.env.txt`.
- **O comando não aparece**: rode `npm run deploy` e confira `CLIENT_ID` e `GUILD_ID`. O bot precisa ter sido convidado com `applications.commands`.
- **Erro ao instalar o better-sqlite3**: use o Node.js LTS e rode `npm install` de novo.
- **`npm warn install-scripts ... better-sqlite3 ... blocked because they are not covered by allowScripts`**: versões recentes do npm bloqueiam por padrão o script nativo que o `better-sqlite3` precisa rodar na instalação. Tanto o `package.json` da raiz quanto o `package.json` gerado dentro de `dist/` já liberam isso (`"allowScripts": { "better-sqlite3": true }`); se mesmo assim aparecer o aviso, rode `npm install-scripts approve better-sqlite3` no console do servidor e instale de novo. Sem isso, o bot sobe mas quebra na hora de abrir o banco de dados.
- **`Error: Invalid or incompatible cached data (cachedDataRejected)`**: esse erro é de uma versão antiga do build, que usava o `bytenode` para gerar bytecode. A versão atual de `scripts/build.js` não usa mais bytenode — o `dist/` é só JavaScript ofuscado em duas passadas, sem nenhuma amarração a versão de Node. Se você ainda tiver um `dist/` antigo gerado por um build anterior, apague a pasta e rode `npm run build` de novo.
- **O cargo está acima do meu cargo mais alto**: arraste o cargo do bot para cima na lista de cargos.
- **Bot sem permissões na categoria dos tickets**: dê ao bot Ver canal, Gerenciar canais, Enviar mensagens e Ver histórico na categoria.
- **Este emprego não pode ser entregue**: o cargo foi apagado, ficou acima do bot ou ganhou Administrador. Corrija em `/colocar-painel`, em Empregos, Alterar cargo.
- **A categoria atingiu o limite de canais**: o Discord permite 50 canais por categoria. Feche tickets antigos ou escolha outra categoria.
- **Não consegui apagar o canal**: o bot precisa de Gerenciar Canais naquele canal ou categoria. O ticket continua aberto, ajuste a permissão e confirme de novo.
- **O painel do canal não mudou depois de editar**: use `/colocar-painel`, Revisar e atualizar painel, Confirmar e atualizar.
