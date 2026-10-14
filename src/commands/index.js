'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

function loadCommands() {
  const commands = new Collection();
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'index.js');

  for (const file of files) {
    const command = require(path.join(__dirname, file));
    if (!command?.data || typeof command.execute !== 'function') {
      logger.warn(`O arquivo de comando "${file}" não exporta { data, execute } e foi ignorado.`);
      continue;
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

module.exports = { loadCommands };
