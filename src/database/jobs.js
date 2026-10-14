'use strict';

const { getDatabase } = require('./index');
const { normalizeName } = require('../utils/validation');
const { UserError } = require('../utils/errors');

function listJobs(guildId) {
  return getDatabase()
    .prepare('SELECT * FROM jobs WHERE guild_id = ? ORDER BY id ASC')
    .all(guildId);
}

function countJobs(guildId) {
  return getDatabase()
    .prepare('SELECT COUNT(*) AS total FROM jobs WHERE guild_id = ?')
    .get(guildId).total;
}

function getJob(guildId, jobId) {
  return (
    getDatabase().prepare('SELECT * FROM jobs WHERE guild_id = ? AND id = ?').get(guildId, jobId) ??
    null
  );
}

function jobNameExists(guildId, name, excludeId = null) {
  const wanted = normalizeName(name);
  return listJobs(guildId).some(
    (job) => job.id !== excludeId && normalizeName(job.name) === wanted,
  );
}

function translateDbError(error) {
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new UserError('Já existe um emprego com esse nome neste servidor.');
  }
  return error;
}

function createJob({ guildId, name, description, roleId }) {
  try {
    const info = getDatabase()
      .prepare('INSERT INTO jobs (guild_id, name, description, role_id) VALUES (?, ?, ?, ?)')
      .run(guildId, name, description, roleId);
    return getJob(guildId, Number(info.lastInsertRowid));
  } catch (error) {
    throw translateDbError(error);
  }
}

function updateJobInfo(guildId, jobId, { name, description }) {
  try {
    getDatabase()
      .prepare(
        "UPDATE jobs SET name = ?, description = ?, updated_at = strftime('%s','now') WHERE guild_id = ? AND id = ?",
      )
      .run(name, description, guildId, jobId);
    return getJob(guildId, jobId);
  } catch (error) {
    throw translateDbError(error);
  }
}

function updateJobRole(guildId, jobId, roleId) {
  getDatabase()
    .prepare(
      "UPDATE jobs SET role_id = ?, updated_at = strftime('%s','now') WHERE guild_id = ? AND id = ?",
    )
    .run(roleId, guildId, jobId);
  return getJob(guildId, jobId);
}

function deleteJob(guildId, jobId) {
  return getDatabase().prepare('DELETE FROM jobs WHERE guild_id = ? AND id = ?').run(guildId, jobId)
    .changes > 0;
}

module.exports = {
  listJobs,
  countJobs,
  getJob,
  jobNameExists,
  createJob,
  updateJobInfo,
  updateJobRole,
  deleteJob,
};
