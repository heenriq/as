'use strict';

const stamp = () => new Date().toISOString();

module.exports = {
  info: (...args) => console.log(`[${stamp()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${stamp()}] [AVISO]`, ...args),
  error: (...args) => console.error(`[${stamp()}] [ERRO]`, ...args),
};
