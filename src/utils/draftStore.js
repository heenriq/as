'use strict';

const { DRAFT_TTL_MS } = require('../constants');

const drafts = new Map();
const key = (guildId, userId) => `${guildId}:${userId}`;

function setDraft(guildId, userId, data) {
  drafts.set(key(guildId, userId), { ...data, expiresAt: Date.now() + DRAFT_TTL_MS });
}

function getDraft(guildId, userId) {
  const k = key(guildId, userId);
  const draft = drafts.get(k);
  if (!draft) return null;
  if (draft.expiresAt < Date.now()) {
    drafts.delete(k);
    return null;
  }
  return draft;
}

function clearDraft(guildId, userId) {
  drafts.delete(key(guildId, userId));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, draft] of drafts) {
    if (draft.expiresAt < now) drafts.delete(k);
  }
}, 5 * 60 * 1000).unref();

module.exports = { setDraft, getDraft, clearDraft };
