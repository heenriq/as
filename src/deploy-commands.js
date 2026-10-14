'use strict';

const { REST, Routes } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

config.requireEnv('DISCORD_TOKEN', 'CLIENT_ID');

const { loadCommands } = require('./commands');

async function main() {
  const body = [...loadCommands().values()].map((command) => command.data.toJSON());
  const rest = new REST().setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    logger.info(`${body.length} comando(s) registrado(s) no servidor ${config.guildId} (disponível na hora).`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    logger.info(`${body.length} comando(s) registrado(s) globalmente (pode levar um tempo para aparecer).`);
  }
}

main().catch((error) => {
  logger.error('Falha ao registrar os comandos:', error);
  process.exit(1);
});
