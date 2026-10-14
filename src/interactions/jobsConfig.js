'use strict';

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
} = require('discord.js');

const ids = require('../ui/ids');
const views = require('../ui/views');
const jobsDb = require('../database/jobs');
const { getSetupStep, setSetupStep } = require('../database/guilds');
const { PAGE_SIZE, MAX_JOBS_PER_GUILD, LIMITS } = require('../constants');
const { UserError } = require('../utils/errors');
const { assertAdminOrOwner } = require('../utils/permissions');
const { parseJobName, parseJobDescription } = require('../utils/validation');
const { assertRoleUsable, resolveRole } = require('../utils/roles');
const { setDraft, getDraft, clearDraft } = require('../utils/draftStore');
const { render } = require('../utils/respond');
const { buildHub } = require('../services/panelState');

const FIELD_NAME = 'job_name';
const FIELD_DESC = 'job_description';

function requireJob(guildId, rawId) {
  const id = Number.parseInt(rawId, 10);
  const job = Number.isInteger(id) ? jobsDb.getJob(guildId, id) : null;
  if (!job) {
    throw new UserError('Este emprego não existe mais. Volte à lista e tente novamente.');
  }
  return job;
}

function pageOfJob(guildId, jobId) {
  const index = jobsDb.listJobs(guildId).findIndex((job) => job.id === jobId);
  return index < 0 ? 0 : Math.floor(index / PAGE_SIZE);
}

function buildJobModal({ customId, title, name = '', description = '' }) {
  const nameInput = new TextInputBuilder()
    .setCustomId(FIELD_NAME)
    .setLabel('Nome do emprego')
    .setStyle(TextInputStyle.Short)
    .setMinLength(LIMITS.NAME_MIN)
    .setMaxLength(LIMITS.NAME_MAX)
    .setRequired(true)
    .setPlaceholder('Ex.: Policial');
  if (name) nameInput.setValue(name);

  const descInput = new TextInputBuilder()
    .setCustomId(FIELD_DESC)
    .setLabel('Descrição do emprego')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(LIMITS.DESC_MIN)
    .setMaxLength(LIMITS.DESC_MAX)
    .setRequired(true)
    .setPlaceholder('Explique em poucas palavras o que este emprego faz.');
  if (description) descInput.setValue(description);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
    );
}

async function showMain(interaction, { page = 0, notice = null } = {}) {
  const jobs = jobsDb.listJobs(interaction.guildId);
  const showBack = getSetupStep(interaction.guildId) !== 'jobs';
  await render(
    interaction,
    views.renderMainPanel({ guild: interaction.guild, jobs, page, notice, showBack }),
  );
}

async function showJobDetail(interaction, job, notice = null) {
  await render(
    interaction,
    views.renderJobDetail({
      guild: interaction.guild,
      job,
      page: pageOfJob(interaction.guildId, job.id),
      notice,
    }),
  );
}

const actions = {
  async add(interaction) {
    if (jobsDb.countJobs(interaction.guildId) >= MAX_JOBS_PER_GUILD) {
      throw new UserError(`O limite de ${MAX_JOBS_PER_GUILD} empregos por servidor foi atingido.`);
    }
    await interaction.showModal(buildJobModal({ customId: ids.make('add_modal'), title: 'Novo emprego' }));
  },

  async add_modal(interaction) {
    const { guildId, user } = interaction;
    const name = parseJobName(interaction.fields.getTextInputValue(FIELD_NAME));
    const description = parseJobDescription(interaction.fields.getTextInputValue(FIELD_DESC));

    if (jobsDb.jobNameExists(guildId, name)) {
      throw new UserError(`Já existe um emprego chamado **${escapeMarkdown(name)}** neste servidor.`);
    }

    setDraft(guildId, user.id, { name, description });
    await render(interaction, views.renderAddRoleStep({ name, description }));
  },

  async add_role(interaction) {
    const { guild, guildId, user } = interaction;
    const draft = getDraft(guildId, user.id);
    if (!draft) {
      throw new UserError('O cadastro expirou. Clique em **Adicionar emprego** para começar de novo.');
    }
    if (jobsDb.countJobs(guildId) >= MAX_JOBS_PER_GUILD) {
      throw new UserError(`O limite de ${MAX_JOBS_PER_GUILD} empregos por servidor foi atingido.`);
    }

    const role = await resolveRole(guild, interaction.values[0]);
    await assertRoleUsable(guild, role);

    const job = jobsDb.createJob({
      guildId,
      name: draft.name,
      description: draft.description,
      roleId: role.id,
    });
    clearDraft(guildId, user.id);

    const total = jobsDb.countJobs(guildId);
    await showMain(interaction, {
      page: Math.floor((total - 1) / PAGE_SIZE),
      notice: `Emprego **${escapeMarkdown(job.name)}** adicionado com o cargo <@&${job.role_id}>.`,
    });
  },

  async cancel_add(interaction) {
    clearDraft(interaction.guildId, interaction.user.id);
    await showMain(interaction);
  },

  async home(interaction, arg) {
    const page = Number.parseInt(arg, 10);
    await showMain(interaction, { page: Number.isInteger(page) ? page : 0 });
  },

  async page(interaction, arg) {
    const page = Number.parseInt(arg, 10);
    await showMain(interaction, { page: Number.isInteger(page) ? page : 0 });
  },

  async noop(interaction) {
    await interaction.deferUpdate();
  },

  async select(interaction) {
    const job = requireJob(interaction.guildId, interaction.values[0]);
    await showJobDetail(interaction, job);
  },

  async job(interaction, arg) {
    const job = requireJob(interaction.guildId, arg);
    await showJobDetail(interaction, job);
  },

  async edit(interaction, arg) {
    const job = requireJob(interaction.guildId, arg);
    await interaction.showModal(
      buildJobModal({
        customId: ids.make('edit_modal', job.id),
        title: 'Editar emprego',
        name: job.name,
        description: job.description,
      }),
    );
  },

  async edit_modal(interaction, arg) {
    const { guildId } = interaction;
    const job = requireJob(guildId, arg);
    const name = parseJobName(interaction.fields.getTextInputValue(FIELD_NAME));
    const description = parseJobDescription(interaction.fields.getTextInputValue(FIELD_DESC));

    if (jobsDb.jobNameExists(guildId, name, job.id)) {
      throw new UserError(`Já existe outro emprego chamado **${escapeMarkdown(name)}** neste servidor.`);
    }

    const updated = jobsDb.updateJobInfo(guildId, job.id, { name, description });
    await showJobDetail(interaction, updated, 'Informações atualizadas.');
  },

  async role(interaction, arg) {
    const job = requireJob(interaction.guildId, arg);
    await render(interaction, views.renderChangeRole({ guild: interaction.guild, job }));
  },

  async role_set(interaction, arg) {
    const { guild, guildId } = interaction;
    const job = requireJob(guildId, arg);

    const role = await resolveRole(guild, interaction.values[0]);
    await assertRoleUsable(guild, role);

    const updated = jobsDb.updateJobRole(guildId, job.id, role.id);
    await showJobDetail(interaction, updated, `Cargo alterado para <@&${role.id}>.`);
  },

  async remove(interaction, arg) {
    const job = requireJob(interaction.guildId, arg);
    await render(interaction, views.renderRemoveConfirm({ job }));
  },

  async remove_ok(interaction, arg) {
    const { guildId } = interaction;
    const job = requireJob(guildId, arg);
    jobsDb.deleteJob(guildId, job.id);
    await showMain(interaction, {
      notice: `Emprego **${escapeMarkdown(job.name)}** removido.`,
    });
  },

  async finish(interaction) {
    const { guild, guildId } = interaction;
    if (jobsDb.countJobs(guildId) === 0) {
      throw new UserError('Cadastre pelo menos um emprego antes de concluir esta etapa.');
    }
    if (getSetupStep(guildId) === 'jobs') setSetupStep(guildId, 'jobs_done');
    await render(interaction, buildHub(guild, 'Etapa de empregos concluída. Agora configure os itens abaixo.'));
  },

  async hub(interaction) {
    await render(interaction, buildHub(interaction.guild));
  },
};

async function handle(interaction) {
  assertAdminOrOwner(interaction);

  const [, action, arg] = interaction.customId.split(':');
  const run = Object.hasOwn(actions, action) ? actions[action] : null;
  if (!run) {
    throw new UserError('Este botão não é mais válido. Use `/colocar-painel` para abrir o painel novamente.');
  }
  await run(interaction, arg);
}

module.exports = { prefix: ids.PREFIX, handle };
