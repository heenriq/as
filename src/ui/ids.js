'use strict';

const PREFIX = 'cfg';

const forPrefix = (prefix) => (action, ...args) => [prefix, action, ...args].join(':');

const make = forPrefix(PREFIX);

module.exports = { PREFIX, make, forPrefix };
