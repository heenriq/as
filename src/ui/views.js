'use strict';

const {
  ButtonStyle,
  ContainerBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const ids = require('./ids');
const { PAGE_SIZE, MAX_JOBS_PER_GUILD, COLORS } = require('../constants');
const {
  text,
  divider,
  row,
  esc,
  oneLine,
  truncate,
  quote,
  button,
  roleLabel,
  view,
  withNotice,
} = require('./helpers');

function renderMainPanel({ guild, jobs, page = 0, notice = null, showBack = false }) {
  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  const start = current * PAGE_SIZE;
  const pageJobs = jobs.slice(start, start + PAGE_SIZE);

  const listText =
    pageJobs.length === 0
      ? '*Nenhum emprego cadastrado ainda. Clique em **Adicionar emprego** para começar.*'
      : pageJobs
          .map((job, i) => {
            const n = start + i + 1;
            return `**${n}. ${esc(job.name)}** → ${roleLabel(guild, job)}\n> ${truncate(oneLine(job.description), 120)}`;
          })
          .join('\n\n');

  const container = withNotice(new ContainerBuilder().setAccentColor(COLORS.primary), notice);

  container
    .addTextDisplayComponents(
      text(
        '# Configuração dos Empregos\n' +
          'Cadastre os empregos que os jogadores poderão escolher e associe cada um a um cargo do servidor.\n' +
          '-# Etapa 1 · Empregos',
      ),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(listText))
    .addTextDisplayComponents(
      text(`-# ${jobs.length} emprego(s) cadastrado(s) · Página ${current + 1}/${totalPages}`),
    )
    .addSeparatorComponents(divider());

  if (pageJobs.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(ids.make('select'))
      .setPlaceholder('Selecione um emprego para editar, trocar o cargo ou remover')
      .addOptions(
        pageJobs.map((job, i) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(truncate(`${start + i + 1}. ${job.name}`, 100))
            .setValue(String(job.id))
            .setDescription(truncate(oneLine(job.description), 100)),
        ),
      );
    container.addActionRowComponents(row(select));
  }

  if (totalPages > 1) {
    container.addActionRowComponents(
      row(
        button(ids.make('page', current - 1), 'Anterior', ButtonStyle.Secondary, {
          disabled: current === 0,
        }),
        button(ids.make('noop'), `${current + 1}/${totalPages}`, ButtonStyle.Secondary, {
          disabled: true,
        }),
        button(ids.make('page', current + 1), 'Próxima', ButtonStyle.Secondary, {
          disabled: current >= totalPages - 1,
        }),
      ),
    );
  }

  container.addActionRowComponents(
    row(
      button(ids.make('add'), 'Adicionar emprego', ButtonStyle.Success, {
        disabled: jobs.length >= MAX_JOBS_PER_GUILD,
      }),
      button(ids.make('finish'), 'Concluir etapa', ButtonStyle.Primary, {
        disabled: jobs.length === 0,
      }),
      ...(showBack
        ? [button(ids.make('hub'), 'Voltar à configuração', ButtonStyle.Secondary)]
        : []),
    ),
  );

  return view(container);
}

function renderJobDetail({ guild, job, page = 0, notice = null }) {
  const container = withNotice(new ContainerBuilder().setAccentColor(COLORS.primary), notice);

  container
    .addTextDisplayComponents(
      text(
        `# ${esc(job.name)}\n${quote(job.description)}\n\n` +
          `**Cargo associado:** ${roleLabel(guild, job)}\n` +
          `-# ID do emprego: ${job.id}`,
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        button(ids.make('edit', job.id), 'Editar informações', ButtonStyle.Primary),
        button(ids.make('role', job.id), 'Alterar cargo', ButtonStyle.Primary),
        button(ids.make('remove', job.id), 'Remover', ButtonStyle.Danger),
      ),
      row(button(ids.make('home', page), 'Voltar à lista', ButtonStyle.Secondary)),
    );

  return view(container);
}

function renderAddRoleStep({ name, description }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.success);

  container
    .addTextDisplayComponents(
      text(
        '# Novo emprego\n' +
          `**Nome:** ${esc(name)}\n**Descrição:**\n${quote(description)}\n\n` +
          'Agora escolha, no seletor abaixo, o **cargo** que será entregue aos jogadores que escolherem este emprego.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        new RoleSelectMenuBuilder()
          .setCustomId(ids.make('add_role'))
          .setPlaceholder('Selecione o cargo deste emprego')
          .setMinValues(1)
          .setMaxValues(1),
      ),
      row(button(ids.make('cancel_add'), 'Cancelar cadastro', ButtonStyle.Secondary)),
    );

  return view(container);
}

function renderChangeRole({ guild, job }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.warning);

  container
    .addTextDisplayComponents(
      text(
        `# Alterar cargo de ${esc(job.name)}\n` +
          `**Cargo atual:** ${roleLabel(guild, job)}\n\n` +
          'Selecione abaixo o novo cargo deste emprego.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        new RoleSelectMenuBuilder()
          .setCustomId(ids.make('role_set', job.id))
          .setPlaceholder('Selecione o novo cargo')
          .setMinValues(1)
          .setMaxValues(1),
      ),
      row(button(ids.make('job', job.id), 'Cancelar', ButtonStyle.Secondary)),
    );

  return view(container);
}

function renderRemoveConfirm({ job }) {
  const container = new ContainerBuilder().setAccentColor(COLORS.danger);

  container
    .addTextDisplayComponents(
      text(
        `# Remover emprego\nTem certeza que deseja remover **${esc(job.name)}**?\n` +
          'Esta ação não pode ser desfeita. O cargo em si **não** será apagado do servidor.',
      ),
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      row(
        button(ids.make('remove_ok', job.id), 'Confirmar remoção', ButtonStyle.Danger),
        button(ids.make('job', job.id), 'Cancelar', ButtonStyle.Secondary),
      ),
    );

  return view(container);
}

module.exports = {
  renderMainPanel,
  renderJobDetail,
  renderAddRoleStep,
  renderChangeRole,
  renderRemoveConfirm,
};
