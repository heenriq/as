'use strict';

const { LIMITS } = require('../constants');
const { UserError } = require('./errors');

function parseJobName(raw) {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length < LIMITS.NAME_MIN || value.length > LIMITS.NAME_MAX) {
    throw new UserError(
      `O nome do emprego deve ter entre ${LIMITS.NAME_MIN} e ${LIMITS.NAME_MAX} caracteres.`,
    );
  }
  return value;
}

function parseJobDescription(raw) {
  const value = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  if (value.length < LIMITS.DESC_MIN || value.length > LIMITS.DESC_MAX) {
    throw new UserError(
      `A descrição deve ter entre ${LIMITS.DESC_MIN} e ${LIMITS.DESC_MAX} caracteres.`,
    );
  }
  return value;
}

function parseLongText(raw, label, min, max) {
  const value = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  if (value.length < min || value.length > max) {
    throw new UserError(`${label} deve ter entre ${min} e ${max} caracteres (agora tem ${value.length}).`);
  }
  return value;
}

function parsePanelDescription(raw) {
  return parseLongText(raw, 'A descrição do painel', LIMITS.PANEL_DESC_MIN, LIMITS.PANEL_DESC_MAX);
}

function parseTicketDescription(raw) {
  return parseLongText(raw, 'A descrição do ticket', LIMITS.TICKET_DESC_MIN, LIMITS.TICKET_DESC_MAX);
}

function parseAge(raw) {
  const value = String(raw ?? '').trim();
  if (value.length === 0) {
    throw new UserError('**Idade:** preencha este campo com um número inteiro positivo (ex.: 25).');
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new UserError(
      `**Idade:** use somente números inteiros positivos, sem letras, espaços ou símbolos (você digitou “${value.slice(0, 20)}”). Exemplo: 25.`,
    );
  }
  const age = Number.parseInt(value, 10);
  if (age < 1) {
    throw new UserError('**Idade:** o número deve ser maior que zero.');
  }
  if (age > LIMITS.AGE_MAX) {
    throw new UserError(`**Idade:** informe uma idade de até ${String(LIMITS.AGE_MAX).length} dígitos (máximo ${LIMITS.AGE_MAX}).`);
  }
  return age;
}

function parseFreeText(raw, label, max) {
  const value = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  if (value.length === 0) {
    throw new UserError(`**${label}:** preencha este campo.`);
  }
  if (value.length > max) {
    throw new UserError(`**${label}:** use no máximo ${max} caracteres (agora tem ${value.length}).`);
  }
  return value;
}

const parseHobby = (raw) => parseFreeText(raw, 'Hobby', LIMITS.HOBBY_MAX);
const parseAddress = (raw) => parseFreeText(raw, 'Endereço', LIMITS.ADDRESS_MAX);

function normalizeName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

module.exports = {
  parseJobName,
  parseJobDescription,
  parsePanelDescription,
  parseTicketDescription,
  parseAge,
  parseHobby,
  parseAddress,
  normalizeName,
};
