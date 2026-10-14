'use strict';

const { MessageFlags } = require('discord.js');

async function render(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
    return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
  }
  return interaction.update(payload);
}

module.exports = { render };
