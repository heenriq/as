'use strict';

const { ButtonStyle, MessageFlags, escapeMarkdown } = require('discord.js');
const { forPrefix } = require('../ui/ids');
const {
  FIELD_AGE,
  FIELD_HOBBY,
  FIELD_ADDRESS,
  buildApplicationModal,
  renderJobPager,
  clampPage,
} = require('../ui/ticketViews');
const { row, button, linkButton } = require('../ui/helpers');
const { renderJobPanel } = require('../ui/settingsViews');
const { getSettings } = require('../database/settings');
const { getJob, listJobs } = require('../database/jobs');
const { UserError } = require('../utils/errors');
const { parseAge, parseHobby, parseAddress } = require('../utils/validation');
const {
  saveApplicationDraft,
  getApplicationDraft,
  clearApplicationDraft,
} = require('../utils/applicationDrafts');
const { assertNoActiveTicket, createTicket, loadTicketConfig } = require('../services/tickets');
const logger = require('../utils/logger');

const PREFIX = 'pnl';
const pid = forPrefix(PREFIX);

const EPHEMERAL = MessageFlags.Ephemeral;
const NO_MENTIONS = { parse: [] };

function assertInGuild(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    throw new UserError('Este painel só funciona dentro de um servidor.');
  }
}

function requireJob(interaction, rawId) {
  const jobId = Number.parseInt(rawId, 10);
  const job = Number.isInteger(jobId) ? getJob(interaction.guildId, jobId) : null;
  if (!job) {
    throw new UserError('Este emprego não existe mais. Peça a um administrador para atualizar o painel.');
  }
  return job;
}

const lastReset = new Map();
function resetPublicMenu(interaction) {
  const message = interaction.message;
  if (!message || message.flags?.has(EPHEMERAL) || message.author?.id !== interaction.client.user?.id) return;
  const now = Date.now();
  if (now - (lastReset.get(message.id) ?? 0) < 2000) return;
  lastReset.set(message.id, now);
  if (lastReset.size > 200) lastReset.clear();

  Promise.resolve()
    .then(() =>
      message.edit({
        components: message.components.map((component) => component.toJSON()),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_MENTIONS,
      }),
    )
    .catch((error) => logger.warn('Não foi possível limpar a seleção do menu público:', error.message));
}

async function openForm(interaction, job, values = {}) {
  assertInGuild(interaction);
  await assertNoActiveTicket(interaction.guild, interaction.user.id);
  loadTicketConfig(interaction.guild);
  await interaction.showModal(buildApplicationModal({ job, values }));
}

const actions = {
  async open(interaction) {
    assertInGuild(interaction);
    await assertNoActiveTicket(interaction.guild, interaction.user.id);
    loadTicketConfig(interaction.guild);

    const jobs = listJobs(interaction.guildId);
    if (jobs.length === 0) {
      throw new UserError('Ainda não há empregos disponíveis. Peça a um administrador para configurar o painel.');
    }
    const { panel_description: description } = getSettings(interaction.guildId);
    await interaction.reply({
      ...renderJobPanel({ jobs, description }),
      flags: MessageFlags.IsComponentsV2 | EPHEMERAL,
    });
  },

  async select(interaction) {
    assertInGuild(interaction);
    try {
      const job = requireJob(interaction, interaction.values?.[0]);
      await openForm(interaction, job);
    } finally {
      resetPublicMenu(interaction);
    }
  },

  async more(interaction) {
    assertInGuild(interaction);
    const jobs = listJobs(interaction.guildId);
    if (jobs.length === 0) {
      throw new UserError('Ainda não há empregos disponíveis. Peça a um administrador para atualizar o painel.');
    }
    await interaction.reply({
      ...renderJobPager({ jobs, page: clampPage(1, jobs.length) }),
      flags: MessageFlags.IsComponentsV2 | EPHEMERAL,
    });
  },

  async page(interaction) {
    assertInGuild(interaction);
    const requested = Number.parseInt(interaction.customId.split(':')[2], 10);
    const jobs = listJobs(interaction.guildId);
    if (jobs.length === 0) {
      throw new UserError('Ainda não há empregos disponíveis.');
    }
    await interaction.update(renderJobPager({ jobs, page: clampPage(requested, jobs.length) }));
  },

  async retry(interaction) {
    assertInGuild(interaction);
    const job = requireJob(interaction, interaction.customId.split(':')[2]);
    const draft = getApplicationDraft(interaction.guildId, interaction.user.id, job.id);
    await openForm(interaction, job, draft ?? {});
  },

  async apply(interaction) {
    assertInGuild(interaction);
    const { guild, user } = interaction;
    const job = requireJob(interaction, interaction.customId.split(':')[2]);

    await assertNoActiveTicket(guild, user.id);

    const raw = {
      age: interaction.fields.getTextInputValue(FIELD_AGE),
      hobby: interaction.fields.getTextInputValue(FIELD_HOBBY),
      address: interaction.fields.getTextInputValue(FIELD_ADDRESS),
    };

    const errors = [];
    const parsed = {};
    for (const [field, parse] of [
      ['age', parseAge],
      ['hobby', parseHobby],
      ['address', parseAddress],
    ]) {
      try {
        parsed[field] = parse(raw[field]);
      } catch (error) {
        if (!(error instanceof UserError)) throw error;
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      saveApplicationDraft(guild.id, user.id, { jobId: job.id, ...raw });
      await interaction.reply({
        content:
          `**Seu ticket de ${escapeMarkdown(job.name)} ainda não foi aberto.** Corrija:\n` +
          errors.map((message) => `• ${message}`).join('\n') +
          '\n\nClique no botão abaixo para corrigir. O que você já escreveu fica guardado.',
        components: [row(button(pid('retry', job.id), 'Corrigir informações', ButtonStyle.Primary))],
        flags: EPHEMERAL,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    await interaction.deferReply({ flags: EPHEMERAL });

    const { channel, role } = await createTicket({
      guild,
      user,
      member: interaction.member,
      job,
      application: parsed,
    });
    clearApplicationDraft(guild.id, user.id);

    const link = linkButton('Abrir meu ticket', channel.url);
    const name = escapeMarkdown(job.name);

    if (role.ok) {
      await interaction.editReply({
        content:
          `**Ticket aberto!** Você recebeu o cargo <@&${job.role_id}> (emprego **${name}**).\n` +
          `Seu atendimento: ${channel}`,
        components: [row(link)],
        allowedMentions: NO_MENTIONS,
      });
    } else {
      await interaction.editReply({
        content:
          `**Seu ticket foi criado, mas NÃO consegui entregar o cargo do emprego ${name}.**\n` +
          `Motivo: ${role.reason}\n` +
          `A equipe já foi avisada no seu atendimento (${channel}) e vai resolver isso com você.`,
        components: [row(link)],
        allowedMentions: NO_MENTIONS,
      });
    }
  },
};

async function handle(interaction) {
  const [, action] = interaction.customId.split(':');
  const run = Object.hasOwn(actions, action) ? actions[action] : null;
  if (!run) {
    throw new UserError('Este menu não é mais válido. Peça a um administrador para atualizar o painel.');
  }
  await run(interaction);
}

module.exports = { prefix: PREFIX, handle };
