'use strict';

const { MessageFlags } = require('discord.js');
const ticketsDb = require('../database/tickets');
const { UserError } = require('../utils/errors');
const { isAdminOrOwner } = require('../utils/permissions');
const logger = require('../utils/logger');
const { renderCloseRequest, renderCloseConfirm } = require('../ui/ticketViews');

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MESSAGE = 10008;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;

const prompting = new Set();

function assertAdmin(interaction) {
  if (!isAdminOrOwner(interaction)) {
    throw new UserError(
      'Somente membros com a permissão de **Administrador** (ou o proprietário do servidor) podem ' +
        'confirmar ou cancelar o fechamento de um ticket. O fechamento continua aguardando a ação de um administrador.',
    );
  }
}

function resolveOpenTicket(interaction) {
  const raw = interaction.customId.split(':')[2] ?? '';
  if (!/^\d{1,15}$/.test(raw)) {
    throw new UserError('Este botão não é mais válido.');
  }
  const ticket = ticketsDb.getTicketById(interaction.guildId, Number(raw));

  if (!ticket || !ticket.channel_id || ticket.channel_id !== interaction.channelId) {
    throw new UserError('Este botão não pertence a este ticket.');
  }
  if (ticket.status === 'closing') {
    throw new UserError('Este ticket já está sendo fechado.');
  }
  if (ticket.status !== 'open') {
    throw new UserError('Este ticket já foi encerrado.');
  }
  return ticket;
}

async function getTicketChannel(interaction, ticket) {
  const cached = interaction.channel ?? interaction.guild?.channels?.cache?.get(ticket.channel_id);
  if (cached) return cached;
  try {
    return (await interaction.guild.channels.fetch(ticket.channel_id)) ?? null;
  } catch (error) {
    if (error?.code === UNKNOWN_CHANNEL) return null;
    throw error;
  }
}

async function fetchMessageOrNull(channel, messageId) {
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (error?.code === UNKNOWN_MESSAGE) return null;
    throw error;
  }
}

function assertCurrentConfirmMessage(interaction, ticket) {
  if (!ticket.confirm_message_id || interaction.message?.id !== ticket.confirm_message_id) {
    throw new UserError(
      'Esta confirmação não é mais válida. Se ainda quiser fechar o ticket, clique em **Fechar ticket** de novo.',
    );
  }
}

function translateDeleteError(error) {
  if (error?.code === MISSING_PERMISSIONS || error?.code === MISSING_ACCESS) {
    return new UserError(
      'Não consegui apagar o canal: o bot precisa da permissão **Gerenciar canais** neste canal/categoria. ' +
        'O ticket continua aberto.',
    );
  }
  return error;
}

async function handleCloseButton(interaction) {
  const ticket = resolveOpenTicket(interaction);

  if (isAdminOrOwner(interaction)) {
    await promptConfirmation(interaction, ticket);
    return;
  }

  if (interaction.user.id === ticket.user_id) {
    await requestClose(interaction, ticket);
    return;
  }

  throw new UserError(
    'Somente o jogador deste ticket pode solicitar o fechamento, e somente um **administrador** pode confirmá-lo. ' +
      'Você não tem permissão para fechar este ticket.',
  );
}

async function requestClose(interaction, ticket) {
  if (!ticketsDb.requestClose(ticket.guild_id, ticket.id, interaction.user.id)) {
    throw new UserError(
      'Você já solicitou o fechamento deste ticket. Aguarde: um administrador precisa confirmar. ' +
        'Enquanto isso, o atendimento continua normalmente.',
    );
  }

  try {
    await interaction.deferUpdate();
    const channel = await getTicketChannel(interaction, ticket);
    if (!channel) throw new UserError('Não encontrei o canal deste ticket.');
    const message = await channel.send(renderCloseRequest({ ticket }));
    ticketsDb.setCloseRequestMessage(ticket.guild_id, ticket.id, message.id);
  } catch (error) {
    ticketsDb.clearCloseRequest(ticket.guild_id, ticket.id);
    throw error;
  }
  logger.info(`Fechamento do ticket #${ticket.id} solicitado pelo jogador ${interaction.user.id} (servidor ${ticket.guild_id}).`);
}

async function promptConfirmation(interaction, ticket) {
  if (prompting.has(ticket.id)) {
    throw new UserError('Já estou preparando a confirmação deste ticket. Aguarde um instante.');
  }
  prompting.add(ticket.id);

  try {
    await interaction.deferUpdate();
    const channel = await getTicketChannel(interaction, ticket);
    if (!channel) throw new UserError('Não encontrei o canal deste ticket.');

    if (ticket.confirm_message_id) {
      const existing = await fetchMessageOrNull(channel, ticket.confirm_message_id);
      if (existing) {
        await interaction.followUp({
          content: `Já existe uma confirmação de fechamento pendente neste ticket: ${existing.url}`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      ticketsDb.clearConfirmMessage(ticket.guild_id, ticket.id);
    }

    const message = await channel.send(renderCloseConfirm({ ticket, adminId: interaction.user.id }));

    if (!ticketsDb.setConfirmMessage(ticket.guild_id, ticket.id, message.id)) {
      await message.delete().catch(() => {});
      throw new UserError('Este ticket não está mais aberto.');
    }
  } finally {
    prompting.delete(ticket.id);
  }
}

async function handleConfirm(interaction) {
  assertAdmin(interaction);
  const ticket = resolveOpenTicket(interaction);
  assertCurrentConfirmMessage(interaction, ticket);

  if (!ticketsDb.beginClosing(ticket.guild_id, ticket.id)) {
    throw new UserError('Este ticket já está sendo fechado.');
  }

  let alreadyGone = false;
  try {
    await interaction.deferUpdate();
    const channel = await getTicketChannel(interaction, ticket);
    if (!channel) {
      alreadyGone = true;
    } else {
      if (channel.deletable === false) {
        throw new UserError(
          'Não tenho permissão para apagar este canal. Dê ao bot a permissão **Gerenciar canais** e tente de novo. ' +
            'O ticket continua aberto.',
        );
      }
      await channel.delete(`Ticket #${ticket.id} fechado por ${interaction.user.tag ?? interaction.user.id}`.slice(0, 500));
    }
  } catch (error) {
    if (error?.code === UNKNOWN_CHANNEL) {
      alreadyGone = true;
    } else {
      ticketsDb.revertClosing(ticket.guild_id, ticket.id);
      throw translateDeleteError(error);
    }
  }

  try {
    ticketsDb.markTicketClosed(
      ticket.guild_id,
      ticket.id,
      alreadyGone ? 'channel_deleted' : 'closed_by_admin',
      interaction.user.id,
    );
  } catch (error) {
    logger.error(`Canal do ticket #${ticket.id} apagado, mas falhou ao gravar o encerramento:`, error);
  }
  logger.info(
    `Ticket #${ticket.id} fechado pelo administrador ${interaction.user.id} (servidor ${ticket.guild_id}, jogador ${ticket.user_id}).`,
  );
}

async function handleCancel(interaction) {
  assertAdmin(interaction);
  const ticket = resolveOpenTicket(interaction);
  assertCurrentConfirmMessage(interaction, ticket);

  await interaction.deferUpdate();
  try {
    await interaction.message.delete();
  } catch (error) {
    if (error?.code !== UNKNOWN_MESSAGE) throw error;
  }
  ticketsDb.clearConfirmMessage(ticket.guild_id, ticket.id);
}

module.exports = { handleCloseButton, handleConfirm, handleCancel };
