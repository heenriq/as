'use strict';

const { UserError } = require('../utils/errors');
const { handleCloseButton, handleConfirm, handleCancel } = require('../services/ticketClose');

const PREFIX = 'tkt';

const actions = {
  close: handleCloseButton,
  confirm: handleConfirm,
  cancel: handleCancel,
};

async function handle(interaction) {
  if (!interaction.inGuild()) {
    throw new UserError('Este botão só funciona dentro de um servidor.');
  }
  const [, action] = interaction.customId.split(':');
  const run = Object.hasOwn(actions, action) ? actions[action] : null;
  if (!run) {
    throw new UserError('Este botão não é mais válido.');
  }
  await run(interaction);
}

module.exports = { prefix: PREFIX, handle };
