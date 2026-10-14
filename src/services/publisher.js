'use strict';

const { ChannelType } = require('discord.js');
const { renderTicketPanel } = require('../ui/settingsViews');
const { UserError } = require('../utils/errors');
const logger = require('../utils/logger');

const publishing = new Set();

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;

function explainDiscordError(error, channel) {
  if (error?.code === MISSING_ACCESS || error?.code === MISSING_PERMISSIONS) {
    return new UserError(
      `Não consegui publicar em ${channel}. Confira se eu tenho as permissões **Ver canal** e ` +
        '**Enviar mensagens** nesse canal.',
    );
  }
  if (error?.code === UNKNOWN_CHANNEL) {
    return new UserError('O canal escolhido não existe mais. Selecione outro canal e tente novamente.');
  }
  return error;
}

async function fetchPreviousMessage(guild, settings) {
  if (!settings.published_channel_id || !settings.published_message_id) return null;
  const channel = await guild.channels.fetch(settings.published_channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  const message = await channel.messages.fetch(settings.published_message_id).catch((error) => {
    if (error?.code !== UNKNOWN_MESSAGE) logger.warn('Não foi possível ler o painel anterior:', error.message);
    return null;
  });
  return message?.author?.id === guild.client.user.id ? message : null;
}

async function publishPanel({ guild, channel, settings }) {
  if (publishing.has(guild.id)) {
    throw new UserError('Já estou publicando o painel. Aguarde alguns segundos.');
  }
  publishing.add(guild.id);

  try {
    const payload = renderTicketPanel();
    const previous = await fetchPreviousMessage(guild, settings);

    try {
      if (previous && previous.channelId === channel.id) {
        const message = await previous.edit(payload);
        return { message, updated: true };
      }

      const message = await channel.send(payload);

      if (previous) {
        await previous.delete().catch((error) => {
          logger.warn('Não foi possível apagar o painel antigo:', error.message);
        });
      }
      return { message, updated: false };
    } catch (error) {
      throw explainDiscordError(error, channel);
    }
  } finally {
    publishing.delete(guild.id);
  }
}

module.exports = { publishPanel };
