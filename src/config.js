'use strict';

require('dotenv').config();
const path = require('node:path');

const config = {
  token: process.env.DISCORD_TOKEN?.trim() || '',
  clientId: process.env.CLIENT_ID?.trim() || '',
  guildId: process.env.GUILD_ID?.trim() || '',
  databasePath: path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH?.trim() || './data/bot.sqlite',
  ),
};

function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(
      `\n[ERRO] Variáveis ausentes no arquivo .env: ${missing.join(', ')}\n` +
        'Copie o arquivo .env.example para .env e preencha os valores.\n',
    );
    process.exit(1);
  }
}

module.exports = { ...config, requireEnv };
