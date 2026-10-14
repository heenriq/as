'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { UserError } = require('./errors');

async function assertRoleUsable(guild, role) {
  if (!role) {
    throw new UserError('Não encontrei esse cargo. Ele pode ter sido apagado, tente de novo.');
  }
  if (role.id === guild.id) {
    throw new UserError('O cargo `@everyone` não pode ser usado em um emprego.');
  }
  if (role.managed) {
    throw new UserError(
      'Esse cargo é gerenciado por um bot ou integração e não pode ser atribuído manualmente.',
    );
  }
  if (role.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new UserError(
      'Por segurança, cargos com a permissão de **Administrador** não podem ser usados em empregos, ' +
        'pois qualquer jogador poderia recebê-los ao se inscrever.',
    );
  }

  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new UserError('Eu preciso da permissão **Gerenciar Cargos** para atribuir cargos aos jogadores.');
  }
  if (role.position >= me.roles.highest.position) {
    throw new UserError(
      `O cargo ${role} está acima (ou igual) ao meu cargo mais alto. ` +
        'Nas configurações do servidor, arraste o cargo do bot para ACIMA dele e tente novamente.',
    );
  }
}

async function resolveRole(guild, roleId) {
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

module.exports = { assertRoleUsable, resolveRole };
