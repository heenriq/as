'use strict';

const { ChannelType, PermissionFlagsBits, escapeMarkdown } = require('discord.js');
const { UserError } = require('./errors');
const { assertRoleUsable, resolveRole } = require('./roles');

const ITEM_ORDER = ['jobs', 'panelDescription', 'ticketDescription', 'channel', 'category', 'staff'];

function getSetupStatus({ guild, jobs, settings, staffRoleIds }) {
  const channel = settings.panel_channel_id
    ? (guild.channels.cache.get(settings.panel_channel_id) ?? null)
    : null;
  const category = settings.ticket_category_id
    ? (guild.channels.cache.get(settings.ticket_category_id) ?? null)
    : null;
  const staffRoles = staffRoleIds
    .map((id) => guild.roles.cache.get(id))
    .filter((role) => role && role.id !== guild.id);

  const done = {
    jobs: jobs.length > 0,
    panelDescription: Boolean(settings.panel_description),
    ticketDescription: Boolean(settings.ticket_description),
    channel: channel?.type === ChannelType.GuildText,
    category: category?.type === ChannelType.GuildCategory,
    staff: staffRoles.length > 0,
  };

  return {
    channel,
    category,
    staffRoles,
    channelMissing: Boolean(settings.panel_channel_id) && !done.channel,
    categoryMissing: Boolean(settings.ticket_category_id) && !done.category,
    staffMissing: staffRoleIds.length - staffRoles.length,
    done,
    allDone: ITEM_ORDER.every((key) => done[key]),
    nextPending: ITEM_ORDER.find((key) => !done[key]) ?? null,
  };
}

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
  [PermissionFlagsBits.ManageChannels, 'Gerenciar canais'],
  [PermissionFlagsBits.ReadMessageHistory, 'Ver histórico de mensagens'],
]);

function missingPermissions(channel, me, needed) {
  const perms = channel.permissionsFor(me);
  return needed.filter((flag) => !perms?.has(flag)).map((flag) => PERMISSION_LABELS.get(flag));
}

async function collectProblems({ guild, jobs, settings, staffRoleIds }) {
  const status = getSetupStatus({ guild, jobs, settings, staffRoleIds });
  const problems = [];

  if (!status.done.jobs) problems.push('Cadastre pelo menos um emprego.');
  if (!status.done.panelDescription) problems.push('Defina a descrição do painel público.');
  if (!status.done.ticketDescription) problems.push('Defina a descrição que aparecerá dentro dos tickets.');

  if (status.channelMissing) problems.push('O canal do painel não existe mais (ou não é de texto). Escolha outro.');
  else if (!status.done.channel) problems.push('Selecione o canal de texto onde o painel será publicado.');

  if (status.categoryMissing) problems.push('A categoria dos tickets não existe mais. Escolha outra.');
  else if (!status.done.category) problems.push('Selecione a categoria onde os tickets serão criados.');

  if (!status.done.staff) problems.push('Selecione pelo menos um cargo da equipe de atendimento.');
  else if (status.staffMissing > 0) {
    problems.push(`${status.staffMissing} cargo(s) da equipe foram apagados do servidor. Selecione a equipe de novo.`);
  }

  const me = await guild.members.fetchMe();
  if (status.done.channel) {
    const missing = missingPermissions(status.channel, me, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ]);
    if (missing.length > 0) {
      problems.push(`Em ${status.channel}, eu preciso das permissões: **${missing.join(', ')}**.`);
    }
  }
  if (status.done.category) {
    const missing = missingPermissions(status.category, me, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ]);
    if (missing.length > 0) {
      problems.push(
        `Na categoria **${escapeMarkdown(status.category.name)}**, eu preciso das permissões: **${missing.join(', ')}** ` +
          '(para criar os tickets dos jogadores).',
      );
    }
  }

  for (const job of jobs) {
    try {
      const role = await resolveRole(guild, job.role_id);
      await assertRoleUsable(guild, role);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      problems.push(`Emprego **${escapeMarkdown(job.name)}**: ${error.message}`);
    }
  }

  return problems;
}

module.exports = { ITEM_ORDER, getSetupStatus, collectProblems };
