'use strict';

const { getDatabase } = require('./index');
const { UserError } = require('../utils/errors');

const ACTIVE = ['creating', 'open', 'closing'];

function getTicketById(guildId, ticketId) {
  return (
    getDatabase().prepare('SELECT * FROM tickets WHERE guild_id = ? AND id = ?').get(guildId, ticketId) ??
    null
  );
}

function getTicketByChannel(channelId) {
  return (
    getDatabase().prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) ?? null
  );
}

function getActiveTicketByUser(guildId, userId) {
  return (
    getDatabase()
      .prepare(
        `SELECT * FROM tickets
          WHERE guild_id = ? AND user_id = ? AND status IN ('creating', 'open', 'closing')
          ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId, userId) ?? null
  );
}

function createTicketRow({ guildId, userId, job, age, hobby, address }) {
  try {
    const info = getDatabase()
      .prepare(
        `INSERT INTO tickets (guild_id, user_id, job_id, job_name, role_id, age, hobby, address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating')`,
      )
      .run(guildId, userId, job.id, job.name, job.role_id, age, hobby, address);
    return getTicketById(guildId, Number(info.lastInsertRowid));
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(error?.message ?? '')) {
      throw new UserError('Você já tem um atendimento aberto neste servidor.');
    }
    throw error;
  }
}

function markTicketOpen(guildId, ticketId, channelId) {
  getDatabase()
    .prepare(
      `UPDATE tickets SET channel_id = ?, status = 'open', updated_at = strftime('%s','now')
        WHERE guild_id = ? AND id = ?`,
    )
    .run(channelId, guildId, ticketId);
  return getTicketById(guildId, ticketId);
}

function setRoleResult(guildId, ticketId, status, error = null) {
  getDatabase()
    .prepare(
      `UPDATE tickets SET role_status = ?, role_error = ?, updated_at = strftime('%s','now')
        WHERE guild_id = ? AND id = ?`,
    )
    .run(status, error, guildId, ticketId);
}

function requestClose(guildId, ticketId, userId) {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET close_requested_at = strftime('%s','now'), close_requested_by = ?,
                            updated_at = strftime('%s','now')
          WHERE guild_id = ? AND id = ? AND status = 'open' AND close_requested_at IS NULL`,
      )
      .run(userId, guildId, ticketId).changes > 0
  );
}

function setCloseRequestMessage(guildId, ticketId, messageId) {
  getDatabase()
    .prepare('UPDATE tickets SET close_request_message_id = ? WHERE guild_id = ? AND id = ?')
    .run(messageId, guildId, ticketId);
}

function clearCloseRequest(guildId, ticketId) {
  getDatabase()
    .prepare(
      `UPDATE tickets SET close_requested_at = NULL, close_requested_by = NULL, close_request_message_id = NULL,
                          updated_at = strftime('%s','now')
        WHERE guild_id = ? AND id = ? AND status = 'open'`,
    )
    .run(guildId, ticketId);
}

function setConfirmMessage(guildId, ticketId, messageId) {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET confirm_message_id = ?, updated_at = strftime('%s','now')
          WHERE guild_id = ? AND id = ? AND status = 'open'`,
      )
      .run(messageId, guildId, ticketId).changes > 0
  );
}

function clearConfirmMessage(guildId, ticketId) {
  getDatabase()
    .prepare('UPDATE tickets SET confirm_message_id = NULL WHERE guild_id = ? AND id = ?')
    .run(guildId, ticketId);
}

function beginClosing(guildId, ticketId) {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET status = 'closing', updated_at = strftime('%s','now')
          WHERE guild_id = ? AND id = ? AND status = 'open'`,
      )
      .run(guildId, ticketId).changes > 0
  );
}

function revertClosing(guildId, ticketId) {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET status = 'open', updated_at = strftime('%s','now')
          WHERE guild_id = ? AND id = ? AND status = 'closing'`,
      )
      .run(guildId, ticketId).changes > 0
  );
}

function markTicketClosed(guildId, ticketId, reason, closedBy = null) {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET status = 'closed', closed_reason = ?, closed_by = ?, confirm_message_id = NULL,
                            closed_at = strftime('%s','now'), updated_at = strftime('%s','now')
          WHERE guild_id = ? AND id = ? AND status IN ('creating', 'open', 'closing')`,
      )
      .run(reason, closedBy, guildId, ticketId).changes > 0
  );
}

function markClosedByChannel(channelId, reason = 'channel_deleted') {
  return (
    getDatabase()
      .prepare(
        `UPDATE tickets SET status = 'closed', closed_reason = ?, confirm_message_id = NULL,
                            closed_at = strftime('%s','now'), updated_at = strftime('%s','now')
          WHERE channel_id = ? AND status IN ('creating', 'open')`,
      )
      .run(reason, channelId).changes > 0
  );
}

function deleteTicketRow(guildId, ticketId) {
  getDatabase().prepare('DELETE FROM tickets WHERE guild_id = ? AND id = ?').run(guildId, ticketId);
}

function recoverInterruptedTickets() {
  const db = getDatabase();
  const discarded = db.prepare("DELETE FROM tickets WHERE status = 'creating'").run().changes;
  const reopened = db
    .prepare("UPDATE tickets SET status = 'open', updated_at = strftime('%s','now') WHERE status = 'closing'")
    .run().changes;
  return { discarded, reopened };
}

module.exports = {
  ACTIVE,
  getTicketById,
  getTicketByChannel,
  getActiveTicketByUser,
  createTicketRow,
  markTicketOpen,
  setRoleResult,
  requestClose,
  setCloseRequestMessage,
  clearCloseRequest,
  setConfirmMessage,
  clearConfirmMessage,
  beginClosing,
  revertClosing,
  markTicketClosed,
  markClosedByChannel,
  deleteTicketRow,
  recoverInterruptedTickets,
};
