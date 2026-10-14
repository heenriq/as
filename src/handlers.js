'use strict';

const { MessageFlags } = require('discord.js');
const componentModules = require('./interactions');
const { UserError } = require('./utils/errors');
const { markClosedByChannel } = require('./database/tickets');
const logger = require('./utils/logger');

async function safeReply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    logger.error('Não foi possível enviar a mensagem de erro ao usuário:', error);
  }
}

async function reportError(interaction, error) {
  if (error instanceof UserError) {
    await safeReply(interaction, `**Ops!** ${error.message}`);
    return;
  }
  logger.error(
    `Erro inesperado (servidor ${interaction.guildId ?? 'DM'}, usuário ${interaction.user?.id}):`,
    error,
  );
  await safeReply(
    interaction,
    '**Ops!** Deu um erro inesperado. Tente de novo e, se continuar, avise o responsável pelo bot.',
  );
}

async function handleInteraction(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
      const module_ = componentModules.find((m) => interaction.customId.startsWith(`${m.prefix}:`));
      if (!module_) return;
      await module_.handle(interaction);
    }
  } catch (error) {
    await reportError(interaction, error);
  }
}

function handleChannelDelete(channel) {
  try {
    if (markClosedByChannel(channel.id)) logger.info(`Ticket do canal ${channel.id} encerrado (canal apagado).`);
  } catch (error) {
    logger.error('Erro ao encerrar o ticket de um canal apagado:', error);
  }
}

module.exports = { handleInteraction, handleChannelDelete };
