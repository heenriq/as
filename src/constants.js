'use strict';

module.exports = {
  PAGE_SIZE: 8,

  MAX_JOBS_PER_GUILD: 100,

  JOBS_PER_MENU_PAGE: 25,

  MAX_STAFF_ROLES: 10,

  DRAFT_TTL_MS: 15 * 60 * 1000,

  LIMITS: {
    NAME_MIN: 2,
    NAME_MAX: 50,
    DESC_MIN: 5,
    DESC_MAX: 300,
    PANEL_DESC_MIN: 10,
    PANEL_DESC_MAX: 1500,
    TICKET_DESC_MIN: 10,
    TICKET_DESC_MAX: 1500,
    AGE_INPUT_MAX: 10,
    AGE_MAX: 999,
    HOBBY_MAX: 300,
    ADDRESS_MAX: 300,
  },

  APPLICATION_DRAFT_TTL_MS: 15 * 60 * 1000,

  PANEL_WELCOME:
    'Seja bem-vindo ao sistema de atendimento. Para abrir um ticket, siga os passos abaixo e fale com nossa equipe de imediato!',

  TICKET_RULES: ['Especifique detalhadamente o seu problema.', 'Evite abrir um ticket sem motivo.'],

  COLORS: {
    primary: 0x5865f2,
    success: 0x57f287,
    warning: 0xfee75c,
    danger: 0xed4245,
  },
};
