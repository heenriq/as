'use strict';

const { getDatabase } = require('./index');
const { ensureGuild } = require('./guilds');

const EDITABLE_COLUMNS = new Set([
  'panel_description',
  'ticket_description',
  'panel_channel_id',
  'ticket_category_id',
]);

function getSettings(guildId) {
  ensureGuild(guildId);
  return getDatabase().prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
}

function setColumn(guildId, column, value) {
  if (!EDITABLE_COLUMNS.has(column)) {
    throw new Error(`Coluna não permitida: ${column}`);
  }
  ensureGuild(guildId);
  getDatabase()
    .prepare(
      `UPDATE guild_settings SET ${column} = ?, updated_at = strftime('%s','now') WHERE guild_id = ?`,
    )
    .run(value, guildId);
}

const setPanelDescription = (guildId, value) => setColumn(guildId, 'panel_description', value);
const setTicketDescription = (guildId, value) => setColumn(guildId, 'ticket_description', value);
const setPanelChannel = (guildId, channelId) => setColumn(guildId, 'panel_channel_id', channelId);
const setTicketCategory = (guildId, categoryId) => setColumn(guildId, 'ticket_category_id', categoryId);

function getStaffRoleIds(guildId) {
  return getDatabase()
    .prepare('SELECT role_id FROM staff_roles WHERE guild_id = ? ORDER BY rowid ASC')
    .all(guildId)
    .map((row) => row.role_id);
}

function setStaffRoleIds(guildId, roleIds) {
  const db = getDatabase();
  ensureGuild(guildId);
  const replace = db.transaction((ids) => {
    db.prepare('DELETE FROM staff_roles WHERE guild_id = ?').run(guildId);
    const insert = db.prepare('INSERT INTO staff_roles (guild_id, role_id) VALUES (?, ?)');
    for (const id of new Set(ids)) insert.run(guildId, id);
  });
  replace(roleIds);
}

function savePublication(guildId, { channelId, messageId }) {
  ensureGuild(guildId);
  getDatabase()
    .prepare(
      `UPDATE guild_settings
          SET published_channel_id = ?, published_message_id = ?,
              published_at = strftime('%s','now'), setup_step = 'published',
              updated_at = strftime('%s','now')
        WHERE guild_id = ?`,
    )
    .run(channelId, messageId, guildId);
}

module.exports = {
  getSettings,
  setPanelDescription,
  setTicketDescription,
  setPanelChannel,
  setTicketCategory,
  getStaffRoleIds,
  setStaffRoleIds,
  savePublication,
};
