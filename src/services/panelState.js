'use strict';

const { getSettings, getStaffRoleIds } = require('../database/settings');
const { listJobs } = require('../database/jobs');
const { renderSettingsHub, renderReview } = require('../ui/settingsViews');
const { collectProblems } = require('../utils/setupStatus');

function loadState(guildId) {
  return {
    jobs: listJobs(guildId),
    settings: getSettings(guildId),
    staffRoleIds: getStaffRoleIds(guildId),
  };
}

function buildHub(guild, notice = null) {
  return renderSettingsHub({ guild, ...loadState(guild.id), notice });
}

async function buildReview(guild, notice = null) {
  const state = loadState(guild.id);
  const problems = await collectProblems({ guild, ...state });
  return renderReview({ guild, ...state, problems, notice });
}

module.exports = { loadState, buildHub, buildReview };
