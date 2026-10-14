'use strict';

const { APPLICATION_DRAFT_TTL_MS } = require('../constants');

const drafts = new Map();
const key = (guildId, userId) => `${guildId}:${userId}`;

function saveApplicationDraft(guildId, userId, data) {
  drafts.set(key(guildId, userId), { ...data, expiresAt: Date.now() + APPLICATION_DRAFT_TTL_MS });
}

function getApplicationDraft(guildId, userId, jobId) {
  const k = key(guildId, userId);
  const draft = drafts.get(k);
  if (!draft) return null;
  if (draft.expiresAt < Date.now() || draft.jobId !== jobId) {
    if (draft.expiresAt < Date.now()) drafts.delete(k);
    return null;
  }
  return draft;
}

function clearApplicationDraft(guildId, userId) {
  drafts.delete(key(guildId, userId));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, draft] of drafts) {
    if (draft.expiresAt < now) drafts.delete(k);
  }
}, 5 * 60 * 1000).unref();

module.exports = { saveApplicationDraft, getApplicationDraft, clearApplicationDraft };
