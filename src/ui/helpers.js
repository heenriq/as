'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  escapeMarkdown,
} = require('discord.js');

const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const esc = (value) => escapeMarkdown(String(value));
const escUser = (value) =>
  escapeMarkdown(String(value), { heading: true, bulletedList: true, numberedList: true, maskedLink: true });
const oneLine = (value) => String(value).replace(/\s+/g, ' ').trim();
const truncate = (value, max) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);
const quote = (value) =>
  String(value)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

function button(customId, label, style, { emoji, disabled } = {}) {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}

function linkButton(label, url, { emoji } = {}) {
  const b = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function roleLabel(guild, job) {
  return guild.roles.cache.has(job.role_id) ? `<@&${job.role_id}>` : '*cargo removido do servidor*';
}

function view(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function withNotice(container, notice) {
  if (notice) container.addTextDisplayComponents(text(notice)).addSeparatorComponents(divider());
  return container;
}

function fitLines(lines, maxChars, moreLabel = (n) => `*… e mais ${n}.*`) {
  const out = [];
  let used = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const cost = lines[i].length + 1;
    if (used + cost > maxChars) {
      out.push(moreLabel(lines.length - i));
      break;
    }
    out.push(lines[i]);
    used += cost;
  }
  return out.join('\n');
}

module.exports = {
  text,
  divider,
  row,
  esc,
  escUser,
  oneLine,
  truncate,
  quote,
  button,
  linkButton,
  roleLabel,
  view,
  withNotice,
  fitLines,
};
