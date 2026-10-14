'use strict';

const {
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  RoleSelectMenuBuilder,
} = require('discord.js');
const { forPrefix } = require('./ids');
const { buildJobSelect, pageCount, PUBLIC_SELECT_ID } = require('./ticketViews');
const {
  COLORS,
  MAX_STAFF_ROLES,
  JOBS_PER_MENU_PAGE,
  PANEL_WELCOME,
  TICKET_RULES,
} = require('../constants');
const { getSetupStatus } = require('../utils/setupStatus');
const {
  text,
  divider,
  row,
  esc,
  oneLine,
  truncate,
  quote,
  button,
  linkButton,
  roleLabel,
  view,
  withNotice,
  fitLines,
} = require('./helpers');

const sid = forPrefix('set');
const MORE_JOBS_ID = forPrefix('pnl')('more');
const OPEN_TICKET_ID = forPrefix('pnl')('open');

const messageUrl = (guildId, channelId, messageId) =>
  `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

const NOT_SET = '*não definido*';

function renderSettingsHub({ guild, jobs, settings, staffRoleIds, notice = null }) {
  const status = getSetupStatus({ guild, jobs, settings, staffRoleIds });
  const mark = (key) => (status.done[key] ? '✅' : status.nextPending === key ? '👉' : '❌');
  const preview = (value) => (value ? `“${esc(truncate(oneLine(value), 70))}”` : NOT_SET);

  const channelInfo = status.done.channel
    ? `${status.channel}`
    : status.channelMissing
      ? '*o canal salvo não existe mais*'
      : NOT_SET;
  const categoryInfo = status.done.category
    ? `**${esc(status.category.name)}**`
    : status.categoryMissing
      ? '*a categoria salva não existe mais*'
      : NOT_SET;
  const staffInfo = status.done.staff
    ? status.staffRoles.map((role) => `<@&${role.id}>`).join(' ') +
      (status.staffMissing > 0 ? ` *${status.staffMissing} cargo(s) apagado(s)*` : '')
    : status.staffMissing > 0
      ? '*os cargos salvos foram apagados*'
      : NOT_SET;

  const lines = [
    `${mark('jobs')} **1. Empregos** — ${jobs.length} cadastrado(s)`,
    `${mark('panelDescription')} **2. Descrição do painel** — ${preview(settings.panel_description)}`,
    `${mark('ticketDescription')} **3. Descrição dos tickets** — ${preview(settings.ticket_description)}`,
    `${mark('channel')} **4. Canal do painel** — ${channelInfo}`,
    `${mark('category')} **5. Categoria dos tickets** — ${categoryInfo}`,
    `${mark('staff')} **6. Equipe de atendimento** — ${staffInfo}`,
  ];

  const published =
    settings.published_channel_id && settings.published_message_id
      ? `\nPainel publicado em <#${settings.published_channel_id}> — ` +
        `[ver mensagem](${messageUrl(guild.id, settings.published_channel_id, settings.published_message_id)}).\n` +
        '-# Mudanças em empregos e descrições já valem na hora. Se trocar o canal, clique em **Revisar e atualizar painel** para mover o painel.'
      : '';

  const container = withNotice(new ContainerBuilder().setAccentColor(COLORS.primary), notice);

  container
    .addTextDisplayComponents(
      text(
        '# Configuração do Painel de Tickets\n' +
          'Complete os itens abaixo. Quando todos estiverem ✅, clique em **Revisar e publicar**.\n' +
          '-# Etapa 2 · Mensagens, canais e equipe',
      ),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.join('\n') + published))
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        button(sid('jobs'), 'Empregos', ButtonStyle.Secondary),
        button(sid('panel_desc'), 'Descrição do painel', ButtonStyle.Primary),
        button(sid('ticket_desc'), 'Descrição dos tickets', ButtonStyle.Primary),
      ),
    );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(sid('channel'))
    .setPlaceholder('Selecione o canal de texto do painel')
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);
  if (status.done.channel) channelSelect.setDefaultChannels(status.channel.id);

  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(sid('category'))
    .setPlaceholder('Selecione a categoria dos tickets')
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1);
  if (status.done.category) categorySelect.setDefaultChannels(status.category.id);

  const staffSelect = new RoleSelectMenuBuilder()
    .setCustomId(sid('staff'))
    .setPlaceholder('Selecione os cargos da equipe de atendimento')
    .setMinValues(1)
    .setMaxValues(MAX_STAFF_ROLES);
  if (status.staffRoles.length > 0) staffSelect.setDefaultRoles(...status.staffRoles.map((r) => r.id));

  container
    .addTextDisplayComponents(text('**Canal onde o painel de tickets vai ficar**'))
    .addActionRowComponents(row(channelSelect))
    .addTextDisplayComponents(text('**Categoria onde os tickets serão criados**'))
    .addActionRowComponents(row(categorySelect))
    .addTextDisplayComponents(text(`**Equipe de atendimento** (até ${MAX_STAFF_ROLES} cargos)`))
    .addActionRowComponents(row(staffSelect))
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        button(
          sid('review'),
          settings.published_message_id ? 'Revisar e atualizar painel' : 'Revisar e publicar',
          ButtonStyle.Success,
          { disabled: !status.allDone },
        ),
      ),
    );

  return view(container);
}

function renderReview({ guild, jobs, settings, staffRoleIds, problems = [], notice = null }) {
  const status = getSetupStatus({ guild, jobs, settings, staffRoleIds });
  const ready = problems.length === 0;

  const jobLines = jobs.map(
    (job, i) =>
      `**${i + 1}. ${esc(job.name)}** → ${roleLabel(guild, job)} · *${esc(truncate(oneLine(job.description), 60))}*`,
  );

  const sections = [
    '# Revisão final\nConfira tudo antes de publicar o painel de tickets.',
    `## Empregos (${jobs.length})\n${jobs.length ? fitLines(jobLines, 1200) : NOT_SET}`,
    `## Descrição do painel de empregos\n${
      settings.panel_description ? quote(truncate(oneLine(settings.panel_description), 450)) : NOT_SET
    }`,
    `## Descrição dentro dos tickets\n${
      settings.ticket_description ? quote(truncate(oneLine(settings.ticket_description), 350)) : NOT_SET
    }`,
    '## Destinos\n' +
      `**Canal do painel:** ${status.done.channel ? status.channel : NOT_SET}\n` +
      `**Categoria dos tickets:** ${status.done.category ? `**${esc(status.category.name)}**` : NOT_SET}\n` +
      `**Equipe de atendimento:** ${
        status.staffRoles.length ? status.staffRoles.map((role) => `<@&${role.id}>`).join(' ') : NOT_SET
      }`,
  ];

  const container = withNotice(
    new ContainerBuilder().setAccentColor(ready ? COLORS.success : COLORS.warning),
    notice,
  );

  container
    .addTextDisplayComponents(text(sections[0]))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(sections[1]))
    .addTextDisplayComponents(text(sections[2]))
    .addTextDisplayComponents(text(sections[3]))
    .addTextDisplayComponents(text(sections[4]))
    .addSeparatorComponents(divider());

  if (ready) {
    container.addTextDisplayComponents(
      text(
        settings.published_message_id
          ? 'Tudo certo! Ao confirmar, o painel já publicado será **atualizado**.'
          : 'Tudo certo! Ao confirmar, o painel será publicado no canal escolhido.',
      ),
    );
  } else {
    const list = fitLines(
      problems.map((problem) => `• ${problem}`),
      700,
    );
    container.addTextDisplayComponents(text(`## Pendências\n${list}`));
  }

  container.addActionRowComponents(
    row(
      button(
        sid('publish'),
        settings.published_message_id ? 'Confirmar e atualizar' : 'Confirmar e publicar',
        ButtonStyle.Success,
        { disabled: !ready },
      ),
      button(sid('hub'), 'Voltar e editar', ButtonStyle.Secondary),
    ),
  );

  return view(container);
}

function renderPublished({ guildId, channelId, messageId, updated }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.success);

  container
    .addTextDisplayComponents(
      text(
        `# Painel ${updated ? 'atualizado' : 'publicado'}!\n` +
          `O painel público ${updated ? 'foi atualizado' : 'está disponível'} em <#${channelId}>.\n\n` +
          'Tudo ficou salvo. Use `/colocar-painel` quando quiser mudar alguma coisa, seus empregos continuam cadastrados.\n' +
          '-# Agora é só os jogadores clicarem em **Abrir ticket**. Cada ticket é privado e já entrega o cargo do emprego escolhido.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        linkButton('Ver painel publicado', messageUrl(guildId, channelId, messageId)),
        button(sid('hub'), 'Voltar à configuração', ButtonStyle.Secondary),
      ),
    );

  return view(container);
}

function renderTicketPanel() {
  const container = new ContainerBuilder().setAccentColor(COLORS.primary);

  container
    .addTextDisplayComponents(text(PANEL_WELCOME))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(quote(TICKET_RULES.join('\n'))))
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(button(OPEN_TICKET_ID, 'Abrir ticket', ButtonStyle.Primary, { emoji: '🎫' })),
    );

  return view(container);
}

function renderJobPanel({ jobs, description }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.primary);
  const extraPages = pageCount(jobs.length) > 1;

  container
    .addTextDisplayComponents(text(`# Informe o seu Emprego\n${description ?? ''}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(
        extraPages
          ? `-# Mostrando os primeiros ${JOBS_PER_MENU_PAGE} de ${jobs.length} empregos. ` +
              'Para ver os demais, clique em **Ver mais empregos**.'
          : '-# Escolha um emprego no menu abaixo e preencha o formulário para se inscrever.',
      ),
    )
    .addActionRowComponents(row(buildJobSelect(jobs, 0)));

  if (extraPages) {
    container.addActionRowComponents(
      row(button(MORE_JOBS_ID, 'Ver mais empregos', ButtonStyle.Secondary)),
    );
  }

  return view(container);
}

module.exports = {
  PUBLIC_SELECT_ID,
  renderSettingsHub,
  renderReview,
  renderPublished,
  renderTicketPanel,
  renderJobPanel,
  OPEN_TICKET_ID,
};
