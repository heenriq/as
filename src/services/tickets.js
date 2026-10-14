'use strict';

const { ChannelType, OverwriteType, PermissionFlagsBits: P } = require('discord.js');
const settingsDb = require('../database/settings');
const ticketsDb = require('../database/tickets');
const { UserError } = require('../utils/errors');
const { assertRoleUsable, resolveRole } = require('../utils/roles');
const { slugify } = require('../utils/text');
const logger = require('../utils/logger');
const { renderTicketIntro, renderTicketSummary, renderRoleWarning } = require('../ui/ticketViews');

const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_MEMBER = 10007;
const UNKNOWN_ROLE = 10011;
const MISSING_ACCESS = 50001;
const MISSING_PERMISSIONS = 50013;
const MAX_CHANNELS = 30013;

const creating = new Set();
const lockKey = (guildId, userId) => `${guildId}:${userId}`;

async function fetchChannelOrNull(guild, channelId) {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  try {
    return (await guild.channels.fetch(channelId)) ?? null;
  } catch (error) {
    if (error?.code === UNKNOWN_CHANNEL) return null;
    throw error;
  }
}

async function findActiveTicket(guild, userId) {
  const ticket = ticketsDb.getActiveTicketByUser(guild.id, userId);
  if (!ticket) return null;

  if (ticket.status === 'creating') {
    if (creating.has(lockKey(guild.id, userId))) return { ticket, channel: null };
    ticketsDb.deleteTicketRow(guild.id, ticket.id);
    return null;
  }

  const channel = ticket.channel_id ? await fetchChannelOrNull(guild, ticket.channel_id) : null;
  if (!channel) {
    ticketsDb.markTicketClosed(guild.id, ticket.id, 'channel_missing');
    return null;
  }
  return { ticket, channel };
}

async function assertNoActiveTicket(guild, userId) {
  const active = await findActiveTicket(guild, userId);
  if (!active) return;
  if (active.channel) {
    throw new UserError(
      `Você já tem um atendimento aberto: ${active.channel}. Continue a conversa por lá, só dá para ter um ticket por vez.`,
    );
  }
  throw new UserError('Já estou criando o seu ticket. Aguarde alguns segundos.');
}

function loadTicketConfig(guild) {
  const settings = settingsDb.getSettings(guild.id);
  const category = settings.ticket_category_id ? guild.channels.cache.get(settings.ticket_category_id) : null;
  const staffRoles = settingsDb
    .getStaffRoleIds(guild.id)
    .map((id) => guild.roles.cache.get(id))
    .filter((role) => role && role.id !== guild.id);

  const problems = [];
  if (!settings.ticket_description) problems.push('descrição dos tickets não definida');
  if (!category || category.type !== ChannelType.GuildCategory) problems.push('categoria dos tickets inexistente');
  if (staffRoles.length === 0) problems.push('nenhum cargo de equipe válido');

  if (problems.length > 0) {
    logger.warn(`Tickets indisponíveis no servidor ${guild.id}: ${problems.join('; ')}.`);
    throw new UserError(
      'O sistema de tickets não está totalmente configurado neste servidor. Avise a equipe para revisar o `/colocar-painel`.',
    );
  }
  return { settings, category, staffRoles };
}

function buildOverwrites({ guild, me, category, userId, staffRoles }) {
  const botPerms = category.permissionsFor(me);
  const grantable = (flags) => flags.filter((flag) => botPerms.has(flag));
  const chat = grantable([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles]);
  const botAllow = grantable([
    P.ViewChannel,
    P.SendMessages,
    P.ReadMessageHistory,
    P.EmbedLinks,
    P.AttachFiles,
    P.ManageChannels,
  ]);

  const overwrites = [
    { id: guild.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
    { id: userId, type: OverwriteType.Member, allow: chat },
    ...staffRoles.map((role) => ({ id: role.id, type: OverwriteType.Role, allow: chat })),
    { id: me.id, type: OverwriteType.Member, allow: botAllow },
  ];
  return overwrites;
}

const REQUIRED_BOT_PERMISSIONS = [
  [P.ViewChannel, 'Ver canal'],
  [P.ManageChannels, 'Gerenciar canais'],
  [P.SendMessages, 'Enviar mensagens'],
  [P.ReadMessageHistory, 'Ver histórico de mensagens'],
];

function translateCreateError(error) {
  if (error?.code === MISSING_PERMISSIONS || error?.code === MISSING_ACCESS) {
    return new UserError(
      'Não consegui criar o seu ticket porque o bot não tem permissão suficiente na categoria dos tickets. Avise a equipe.',
    );
  }
  const parentError = error?.rawError?.errors?.parent_id?._errors?.[0]?.code;
  if (error?.code === MAX_CHANNELS || parentError === 'CHANNEL_PARENT_MAX_CHANNELS') {
    return new UserError(
      'Não foi possível criar o ticket: a categoria dos tickets (ou o servidor) atingiu o limite de canais. Avise a equipe.',
    );
  }
  return error;
}

function explainRoleError(error) {
  switch (error?.code) {
    case MISSING_PERMISSIONS:
      return 'o bot não tem permissão para entregar esse cargo (ele precisa de **Gerenciar Cargos** e de um cargo mais alto que o do emprego).';
    case UNKNOWN_ROLE:
      return 'o cargo do emprego não existe mais no servidor.';
    case UNKNOWN_MEMBER:
      return 'o jogador não está mais no servidor.';
    default:
      return `erro inesperado do Discord (${String(error?.message ?? error).slice(0, 150)}).`;
  }
}

async function assignJobRole({ guild, userId, role, ticket }) {
  try {
    const member = await guild.members.fetch(userId);
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `Emprego "${ticket.job_name}" escolhido no ticket #${ticket.id}`.slice(0, 500));
    }
    return { ok: true };
  } catch (error) {
    logger.error(
      `Falha ao atribuir o cargo ${role.id} ao usuário ${userId} (servidor ${guild.id}, ticket #${ticket.id}):`,
      error,
    );
    return { ok: false, reason: explainRoleError(error) };
  }
}

async function createTicket({ guild, user, member, job, application }) {
  const key = lockKey(guild.id, user.id);
  if (creating.has(key)) {
    throw new UserError('Já estou criando o seu ticket. Aguarde alguns segundos.');
  }
  creating.add(key);

  let ticket = null;
  let channel = null;
  try {
    await assertNoActiveTicket(guild, user.id);
    const { settings, category, staffRoles } = loadTicketConfig(guild);

    const role = await resolveRole(guild, job.role_id);
    try {
      await assertRoleUsable(guild, role);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      logger.warn(`Emprego "${job.name}" (servidor ${guild.id}) sem cargo utilizável: ${error.message}`);
      throw new UserError(
        'Este emprego não pode ser entregue no momento (problema na configuração do cargo). Avise a equipe.',
      );
    }

    const me = await guild.members.fetchMe();
    const botPerms = category.permissionsFor(me);
    const missing = REQUIRED_BOT_PERMISSIONS.filter(([flag]) => !botPerms?.has(flag)).map(([, label]) => label);
    if (missing.length > 0) {
      logger.warn(`Servidor ${guild.id}: o bot não tem na categoria dos tickets: ${missing.join(', ')}.`);
      throw new UserError(
        'O bot está sem permissões na categoria dos tickets e não consegue criar o seu atendimento. Avise a equipe.',
      );
    }

    ticket = ticketsDb.createTicketRow({
      guildId: guild.id,
      userId: user.id,
      job,
      age: application.age,
      hobby: application.hobby,
      address: application.address,
    });

    const name = `${slugify(job.name, 30) || 'emprego'}-${slugify(user.username, 30) || user.id.slice(-4)}`;
    try {
      channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket de ${user.username} (${user.id}) — emprego: ${job.name}`.slice(0, 1000),
        permissionOverwrites: buildOverwrites({ guild, me, category, userId: user.id, staffRoles }),
        reason: `Ticket #${ticket.id} (${user.username})`,
      });
    } catch (error) {
      throw translateCreateError(error);
    }

    ticket = ticketsDb.markTicketOpen(guild.id, ticket.id, channel.id);

    try {
      await channel.send(
        renderTicketIntro({ userId: user.id, jobName: job.name, description: settings.ticket_description }),
      );
      await channel.send(
        renderTicketSummary({
          ticket,
          displayName: member?.displayName ?? user.globalName ?? user.username,
          username: user.username,
        }),
      );
    } catch (error) {
      logger.error(`Falha ao publicar as mensagens do ticket #${ticket.id}; desfazendo a criação:`, error);
      ticketsDb.deleteTicketRow(guild.id, ticket.id);
      const doomed = channel;
      channel = null;
      await doomed.delete('Falha ao montar o ticket').catch((deleteError) => {
        logger.warn('Não foi possível apagar o canal do ticket que falhou:', deleteError.message);
      });
      throw new UserError('Não consegui montar o seu ticket por um erro do Discord. Tente novamente em instantes.');
    }

    const roleResult = await assignJobRole({ guild, userId: user.id, role, ticket });
    if (roleResult.ok) {
      ticketsDb.setRoleResult(guild.id, ticket.id, 'assigned');
    } else {
      ticketsDb.setRoleResult(guild.id, ticket.id, 'failed', roleResult.reason);
      await channel
        .send(renderRoleWarning({ userId: user.id, roleId: role.id, reason: roleResult.reason }))
        .catch((error) => logger.warn(`Não foi possível avisar a equipe no ticket #${ticket.id}:`, error.message));
    }

    logger.info(
      `Ticket #${ticket.id} criado (servidor ${guild.id}, usuário ${user.id}, emprego "${job.name}", cargo ${roleResult.ok ? 'atribuído' : 'NÃO atribuído'}).`,
    );
    return { ticket: ticketsDb.getTicketById(guild.id, ticket.id), channel, role: roleResult };
  } catch (error) {
    if (ticket && !channel) {
      ticketsDb.deleteTicketRow(guild.id, ticket.id);
    } else if (ticket && channel && ticketsDb.getTicketById(guild.id, ticket.id)?.status === 'creating') {
      ticketsDb.deleteTicketRow(guild.id, ticket.id);
    }
    throw error;
  } finally {
    creating.delete(key);
  }
}

module.exports = {
  createTicket,
  assertNoActiveTicket,
  findActiveTicket,
  loadTicketConfig,
  buildOverwrites,
};
