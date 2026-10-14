'use strict';

const {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { forPrefix } = require('../ui/ids');
const views = require('../ui/views');
const { renderPublished } = require('../ui/settingsViews');
const jobsDb = require('../database/jobs');
const settingsDb = require('../database/settings');
const { LIMITS, MAX_STAFF_ROLES } = require('../constants');
const { UserError } = require('../utils/errors');
const { assertAdminOrOwner } = require('../utils/permissions');
const { parsePanelDescription, parseTicketDescription } = require('../utils/validation');
const { resolveRole } = require('../utils/roles');
const { render } = require('../utils/respond');
const { collectProblems } = require('../utils/setupStatus');
const { loadState, buildHub, buildReview } = require('../services/panelState');
const { publishPanel } = require('../services/publisher');

const PREFIX = 'set';
const sid = forPrefix(PREFIX);

const FIELD_PANEL_DESC = 'panel_description';
const FIELD_TICKET_DESC = 'ticket_description';

async function showHub(interaction, notice = null) {
  await render(interaction, buildHub(interaction.guild, notice));
}

async function hubOrError(interaction, action) {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    await showHub(interaction, `**Ops!** ${error.message}`);
  }
}

function buildDescriptionModal({ customId, title, label, fieldId, placeholder, min, max, value }) {
  const input = new TextInputBuilder()
    .setCustomId(fieldId)
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(min)
    .setMaxLength(max)
    .setRequired(true)
    .setPlaceholder(placeholder);
  if (value) input.setValue(value);

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function assertBotCanUse(channel, me, needed, where) {
  const perms = channel.permissionsFor(me);
  const missing = needed.filter(([flag]) => !perms?.has(flag)).map(([, label]) => label);
  if (missing.length > 0) {
    throw new UserError(`Em ${where}, eu preciso das permissões: **${missing.join(', ')}**.`);
  }
}

const actions = {
  async hub(interaction) {
    await showHub(interaction);
  },

  async jobs(interaction) {
    const jobs = jobsDb.listJobs(interaction.guildId);
    await render(
      interaction,
      views.renderMainPanel({ guild: interaction.guild, jobs, page: 0, showBack: true }),
    );
  },

  async panel_desc(interaction) {
    const { settings } = loadState(interaction.guildId);
    await interaction.showModal(
      buildDescriptionModal({
        customId: sid('panel_desc_modal'),
        title: 'Descrição do painel de empregos',
        label: 'Descrição do painel de empregos',
        fieldId: FIELD_PANEL_DESC,
        placeholder: 'Explique como escolher um emprego e preencher os dados.',
        min: LIMITS.PANEL_DESC_MIN,
        max: LIMITS.PANEL_DESC_MAX,
        value: settings.panel_description ?? '',
      }),
    );
  },

  async panel_desc_modal(interaction) {
    const value = parsePanelDescription(interaction.fields.getTextInputValue(FIELD_PANEL_DESC));
    settingsDb.setPanelDescription(interaction.guildId, value);
    await showHub(interaction, 'Descrição do painel salva.');
  },

  async ticket_desc(interaction) {
    const { settings } = loadState(interaction.guildId);
    await interaction.showModal(
      buildDescriptionModal({
        customId: sid('ticket_desc_modal'),
        title: 'Descrição dos tickets',
        label: 'Mensagem inicial dentro do ticket',
        fieldId: FIELD_TICKET_DESC,
        placeholder: 'Mensagem inicial do ticket, com orientações para o jogador e a equipe.',
        min: LIMITS.TICKET_DESC_MIN,
        max: LIMITS.TICKET_DESC_MAX,
        value: settings.ticket_description ?? '',
      }),
    );
  },

  async ticket_desc_modal(interaction) {
    const value = parseTicketDescription(interaction.fields.getTextInputValue(FIELD_TICKET_DESC));
    settingsDb.setTicketDescription(interaction.guildId, value);
    await showHub(interaction, 'Descrição dos tickets salva.');
  },

  async channel(interaction) {
    await hubOrError(interaction, async () => {
      const { guild } = interaction;
      const channel = await guild.channels.fetch(interaction.values[0]).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new UserError('Escolha um **canal de texto** válido.');
      }
      const me = await guild.members.fetchMe();
      assertBotCanUse(
        channel,
        me,
        [
          [PermissionFlagsBits.ViewChannel, 'Ver canal'],
          [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
        ],
        `${channel}`,
      );
      settingsDb.setPanelChannel(guild.id, channel.id);
      await showHub(interaction, `Canal do painel definido: ${channel}.`);
    });
  },

  async category(interaction) {
    await hubOrError(interaction, async () => {
      const { guild } = interaction;
      const category = await guild.channels.fetch(interaction.values[0]).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        throw new UserError('Escolha uma **categoria** válida.');
      }
      const me = await guild.members.fetchMe();
      assertBotCanUse(
        category,
        me,
        [
          [PermissionFlagsBits.ViewChannel, 'Ver canal'],
          [PermissionFlagsBits.ManageChannels, 'Gerenciar canais'],
          [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
          [PermissionFlagsBits.ReadMessageHistory, 'Ver histórico de mensagens'],
        ],
        `na categoria **${category.name}**`,
      );
      settingsDb.setTicketCategory(guild.id, category.id);
      await showHub(interaction, `Categoria dos tickets definida: **${category.name}**.`);
    });
  },

  async staff(interaction) {
    await hubOrError(interaction, async () => {
      const { guild } = interaction;
      const ids = [...new Set(interaction.values)];
      if (ids.length === 0 || ids.length > MAX_STAFF_ROLES) {
        throw new UserError(`Selecione de 1 a ${MAX_STAFF_ROLES} cargos.`);
      }
      for (const id of ids) {
        if (id === guild.id) {
          throw new UserError('O cargo `@everyone` não pode ser usado como equipe de atendimento.');
        }
        const role = await resolveRole(guild, id);
        if (!role) throw new UserError('Um dos cargos escolhidos não existe mais. Tente novamente.');
      }
      settingsDb.setStaffRoleIds(guild.id, ids);
      await showHub(interaction, `Equipe de atendimento salva (${ids.length} cargo(s)).`);
    });
  },

  async review(interaction) {
    await interaction.deferUpdate();
    await render(interaction, await buildReview(interaction.guild));
  },

  async publish(interaction) {
    await interaction.deferUpdate();
    const { guild } = interaction;

    const state = loadState(guild.id);
    const problems = await collectProblems({ guild, ...state });
    if (problems.length > 0) {
      await render(interaction, await buildReview(guild, 'Algo mudou desde a revisão. Veja as pendências abaixo.'));
      return;
    }

    const channel = await guild.channels.fetch(state.settings.panel_channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new UserError('Não encontrei o canal do painel. Selecione-o novamente.');
    }

    const { message, updated } = await publishPanel({
      guild,
      channel,
      settings: state.settings,
    });

    settingsDb.savePublication(guild.id, { channelId: channel.id, messageId: message.id });
    await render(
      interaction,
      renderPublished({ guildId: guild.id, channelId: channel.id, messageId: message.id, updated }),
    );
  },
};

async function handle(interaction) {
  assertAdminOrOwner(interaction);

  const [, action] = interaction.customId.split(':');
  const run = Object.hasOwn(actions, action) ? actions[action] : null;
  if (!run) {
    throw new UserError('Este botão não é mais válido. Use `/colocar-painel` para abrir o painel novamente.');
  }
  await run(interaction);
}

module.exports = { prefix: PREFIX, handle };
