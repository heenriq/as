'use strict';

const {
  ActionRowBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { forPrefix } = require('./ids');
const { COLORS, JOBS_PER_MENU_PAGE, LIMITS, TICKET_RULES } = require('../constants');
const { text, divider, row, escUser, oneLine, truncate, quote, button, view } = require('./helpers');

const pid = forPrefix('pnl');
const tid = forPrefix('tkt');

const PUBLIC_SELECT_ID = pid('select');

function pageCount(total) {
  return Math.max(1, Math.ceil(total / JOBS_PER_MENU_PAGE));
}

function clampPage(page, total) {
  const last = pageCount(total) - 1;
  const n = Number.isInteger(page) ? page : 0;
  return Math.min(Math.max(n, 0), last);
}

function buildJobSelect(jobs, page = 0, placeholder = 'Selecione um emprego') {
  const current = clampPage(page, jobs.length);
  const slice = jobs.slice(current * JOBS_PER_MENU_PAGE, (current + 1) * JOBS_PER_MENU_PAGE);
  return new StringSelectMenuBuilder()
    .setCustomId(PUBLIC_SELECT_ID)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      slice.map((job) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(job.name, 100))
          .setValue(String(job.id))
          .setDescription(truncate(oneLine(job.description), 100)),
      ),
    );
}

function renderJobPager({ jobs, page = 0 }) {
  const total = jobs.length;
  const pages = pageCount(total);
  const current = clampPage(page, total);

  const container = new ContainerBuilder().setAccentColor(COLORS.primary);
  container
    .addTextDisplayComponents(
      text(
        '# Todos os empregos\n' +
          `Mostrando a página **${current + 1}** de **${pages}** (${total} empregos). ` +
          'Escolha um emprego no menu para preencher o formulário.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(buildJobSelect(jobs, current, `Empregos — página ${current + 1} de ${pages}`)),
    )
    .addActionRowComponents(
      row(
        button(pid('page', current - 1), 'Anterior', ButtonStyle.Secondary, {
          disabled: current === 0,
        }),
        button(pid('noop'), `${current + 1} / ${pages}`, ButtonStyle.Secondary, { disabled: true }),
        button(pid('page', current + 1), 'Próxima', ButtonStyle.Secondary, {
          disabled: current >= pages - 1,
        }),
      ),
    );

  return view(container);
}

const FIELD_AGE = 'age';
const FIELD_HOBBY = 'hobby';
const FIELD_ADDRESS = 'address';

function buildApplicationModal({ job, values = {} }) {
  const age = new TextInputBuilder()
    .setCustomId(FIELD_AGE)
    .setLabel('Idade (somente números)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(LIMITS.AGE_INPUT_MAX)
    .setRequired(true)
    .setPlaceholder('Ex: 25');

  const hobby = new TextInputBuilder()
    .setCustomId(FIELD_HOBBY)
    .setLabel('Hobby')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(LIMITS.HOBBY_MAX)
    .setRequired(true)
    .setPlaceholder('Escreva livremente. Ex: jogar futebol, desenhar, ouvir música...');

  const address = new TextInputBuilder()
    .setCustomId(FIELD_ADDRESS)
    .setLabel('Endereço')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(LIMITS.ADDRESS_MAX)
    .setRequired(true)
    .setPlaceholder('Nick do Minecraft. Ex: petruusw');

  if (values.age) age.setValue(String(values.age).slice(0, LIMITS.AGE_INPUT_MAX));
  if (values.hobby) hobby.setValue(String(values.hobby).slice(0, LIMITS.HOBBY_MAX));
  if (values.address) address.setValue(String(values.address).slice(0, LIMITS.ADDRESS_MAX));

  return new ModalBuilder()
    .setCustomId(pid('apply', job.id))
    .setTitle(truncate(`Ticket: ${oneLine(job.name)}`, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(age),
      new ActionRowBuilder().addComponents(hobby),
      new ActionRowBuilder().addComponents(address),
    );
}

function renderTicketIntro({ userId, jobName, description }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.primary);
  container
    .addTextDisplayComponents(text(`# Atendimento — ${escUser(truncate(oneLine(jobName), 80))}\n<@${userId}>`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(description))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(quote(TICKET_RULES.join('\n'))));
  return {
    ...view(container),
    allowedMentions: { users: [userId] },
  };
}

function renderTicketSummary({ ticket, displayName, username }) {
  const field = (value) => quote(escUser(value));

  const container = new ContainerBuilder().setAccentColor(COLORS.success);
  container
    .addTextDisplayComponents(
      text(
        '## Informações do jogador\n' +
          `**Jogador:** <@${ticket.user_id}> — ${escUser(truncate(oneLine(displayName), 80))} (\`${username.replace(/`/g, '')}\`)\n` +
          `**Emprego:** ${escUser(truncate(oneLine(ticket.job_name), 80))}\n` +
          `**Cargo do emprego:** <@&${ticket.role_id}>\n` +
          `**Idade:** ${ticket.age}`,
      ),
    )
    .addTextDisplayComponents(text(`**Hobby:**\n${field(ticket.hobby)}`))
    .addTextDisplayComponents(text(`**Endereço:**\n${field(ticket.address)}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(`-# Ticket #${ticket.id} · ticket aberto em <t:${ticket.created_at}:f>`),
    )
    .addActionRowComponents(
      row(button(tid('close', ticket.id), 'Solicitar fechamento', ButtonStyle.Danger)),
    );
  return view(container);
}

function renderRoleWarning({ userId, roleId, reason }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.danger);
  container.addTextDisplayComponents(
    text(
      '## Cargo não atribuído\n' +
        `Não consegui entregar o cargo <@&${roleId}> ao jogador <@${userId}>.\n` +
        `**Motivo:** ${reason}\n` +
        'A equipe deve atribuir o cargo manualmente ou corrigir a permissão do bot (ele precisa de ' +
        '**Gerenciar Cargos** e de um cargo acima do cargo do emprego).',
    ),
  );
  return view(container);
}

function renderCloseRequest({ ticket }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.warning);
  container
    .addTextDisplayComponents(
      text(
        '### Aguardando confirmação do fechamento do ticket.\n' +
          `<@${ticket.user_id}> solicitou o fechamento deste atendimento.\n` +
          '-# O canal continua aberto e a conversa pode seguir normalmente. ' +
          'Somente um administrador do servidor pode confirmar o fechamento.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(button(tid('close', ticket.id), 'Fechar ticket', ButtonStyle.Danger)),
    );
  return view(container);
}

function renderCloseConfirm({ ticket, adminId }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.danger);
  container
    .addTextDisplayComponents(
      text(
        '### Tem certeza que deseja fechar o ticket?\n' +
          `Pedido por <@${adminId}>. Ao confirmar, este canal será **apagado permanentemente**, ` +
          'com todas as mensagens.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        button(tid('confirm', ticket.id), 'Confirmar fechamento', ButtonStyle.Danger),
        button(tid('cancel', ticket.id), 'Cancelar', ButtonStyle.Secondary),
      ),
    );
  return view(container);
}

module.exports = {
  PUBLIC_SELECT_ID,
  FIELD_AGE,
  FIELD_HOBBY,
  FIELD_ADDRESS,
  pageCount,
  clampPage,
  buildJobSelect,
  renderJobPager,
  buildApplicationModal,
  renderTicketIntro,
  renderTicketSummary,
  renderRoleWarning,
  renderCloseRequest,
  renderCloseConfirm,
};
