'use strict';

const {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { assertAdminOrOwner } = require('../utils/permissions');
const { ensureGuild, getSetupStep } = require('../database/guilds');
const { listJobs } = require('../database/jobs');
const { renderMainPanel } = require('../ui/views');
const { buildHub } = require('../services/panelState');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('colocar-painel')
    .setDescription('Abre o painel privado de configuração dos tickets (só para administradores).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    assertAdminOrOwner(interaction);

    ensureGuild(interaction.guildId);

    let payload;
    if (getSetupStep(interaction.guildId) === 'jobs') {
      const jobs = listJobs(interaction.guildId);
      payload = renderMainPanel({ guild: interaction.guild, jobs, page: 0 });
    } else {
      payload = buildHub(interaction.guild);
    }

    await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
  },
};
