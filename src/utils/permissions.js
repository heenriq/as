'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { UserError } = require('./errors');

function isAdminOrOwner(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

function assertAdminOrOwner(interaction) {
  if (!interaction.inGuild()) {
    throw new UserError('Este comando só pode ser usado dentro de um servidor.');
  }
  if (!isAdminOrOwner(interaction)) {
    throw new UserError(
      'Apenas o proprietário do servidor ou membros com permissão de **Administrador** podem usar isto.',
    );
  }
}

module.exports = { isAdminOrOwner, assertAdminOrOwner };
