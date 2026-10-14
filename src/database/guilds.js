'use strict';

const { getDatabase } = require('./index');

function ensureGuild(guildId) {
  getDatabase()
    .prepare('INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT(guild_id) DO NOTHING')
    .run(guildId);
}

function getSetupStep(guildId) {
  const row = getDatabase()
    .prepare('SELECT setup_step FROM guild_settings WHERE guild_id = ?')
    .get(guildId);
  return row?.setup_step ?? 'jobs';
}

function setSetupStep(guildId, step) {
  ensureGuild(guildId);
  getDatabase()
    .prepare(
      "UPDATE guild_settings SET setup_step = ?, updated_at = strftime('%s','now') WHERE guild_id = ?",
    )
    .run(step, guildId);
}

module.exports = { ensureGuild, getSetupStep, setSetupStep };
