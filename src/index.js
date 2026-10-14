'use strict';

const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

config.requireEnv('DISCORD_TOKEN');

const { getDatabase, closeDatabase } = require('./database');
const { loadCommands } = require('./commands');
const { handleInteraction, handleChannelDelete } = require('./handlers');
const { recoverInterruptedTickets } = require('./database/tickets');

getDatabase();
logger.info(`Banco de dados pronto em: ${config.databasePath}`);

const { discarded, reopened } = recoverInterruptedTickets();
if (discarded > 0) logger.warn(`${discarded} ticket(s) incompleto(s) de uma execução anterior foram descartados.`);
if (reopened > 0) logger.warn(`${reopened} ticket(s) que estavam sendo fechados voltaram a ficar abertos.`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = loadCommands();

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Bot online como ${readyClient.user.tag} em ${readyClient.guilds.cache.size} servidor(es).`);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction, client);
});

client.on(Events.ChannelDelete, handleChannelDelete);

client.on(Events.Error, (error) => logger.error('Erro do cliente Discord:', error));

process.on('unhandledRejection', (reason) => logger.error('Promise rejeitada sem tratamento:', reason));
process.on('uncaughtException', (error) => logger.error('Exceção não capturada:', error));

function shutdown(signal) {
  logger.info(`${signal} recebido. Encerrando...`);
  client.destroy();
  closeDatabase();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token).catch((error) => {
  logger.error('Falha ao fazer login. Verifique o DISCORD_TOKEN no arquivo .env.', error.message);
  process.exit(1);
});
