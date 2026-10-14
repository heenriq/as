'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../utils/logger');

const migrations = [
  (db) => {
    db.exec(`
      CREATE TABLE guild_settings (
        guild_id   TEXT PRIMARY KEY,
        setup_step TEXT NOT NULL DEFAULT 'jobs',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE jobs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );

      CREATE INDEX idx_jobs_guild ON jobs (guild_id);
      CREATE UNIQUE INDEX idx_jobs_guild_name ON jobs (guild_id, name COLLATE NOCASE);
    `);
  },

  (db) => {
    db.exec(`
      ALTER TABLE guild_settings ADD COLUMN panel_description    TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_description   TEXT;
      ALTER TABLE guild_settings ADD COLUMN panel_channel_id     TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_category_id   TEXT;
      ALTER TABLE guild_settings ADD COLUMN published_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN published_message_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN published_at         INTEGER;

      CREATE TABLE staff_roles (
        guild_id TEXT NOT NULL,
        role_id  TEXT NOT NULL,
        PRIMARY KEY (guild_id, role_id)
      );
    `);
  },

  (db) => {
    db.exec(`
      CREATE TABLE tickets (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        channel_id  TEXT,
        job_id      INTEGER,
        job_name    TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        age         INTEGER NOT NULL,
        hobby       TEXT NOT NULL,
        address     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'creating',
        role_status TEXT NOT NULL DEFAULT 'pending',
        role_error  TEXT,
        closed_reason TEXT,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        closed_at   INTEGER
      );

      CREATE INDEX idx_tickets_guild ON tickets (guild_id);
      CREATE UNIQUE INDEX idx_tickets_one_active
        ON tickets (guild_id, user_id) WHERE status IN ('creating', 'open');
      CREATE UNIQUE INDEX idx_tickets_channel
        ON tickets (channel_id) WHERE channel_id IS NOT NULL;
    `);
  },

  (db) => {
    db.exec(`
      ALTER TABLE tickets ADD COLUMN close_requested_at INTEGER;
      ALTER TABLE tickets ADD COLUMN close_requested_by TEXT;
      ALTER TABLE tickets ADD COLUMN close_request_message_id TEXT;
      ALTER TABLE tickets ADD COLUMN confirm_message_id TEXT;
      ALTER TABLE tickets ADD COLUMN closed_by TEXT;

      DROP INDEX idx_tickets_one_active;
      CREATE UNIQUE INDEX idx_tickets_one_active
        ON tickets (guild_id, user_id) WHERE status IN ('creating', 'open', 'closing');
    `);
  },
];

let db = null;

function runMigrations(database) {
  const current = database.pragma('user_version', { simple: true });
  for (let version = current; version < migrations.length; version += 1) {
    const apply = database.transaction(() => {
      migrations[version](database);
      database.pragma(`user_version = ${version + 1}`);
    });
    apply();
    logger.info(`Banco de dados atualizado para a versão ${version + 1}.`);
  }
}

function getDatabase() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDatabase, closeDatabase };
