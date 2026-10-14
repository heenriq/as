'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch {
  console.error('\n[ERRO] A biblioteca javascript-obfuscator não está instalada. Rode "npm install" e tente de novo.\n');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');
const rootPkg = require(path.join(root, 'package.json'));

const RUNTIME_DEPENDENCIES = ['better-sqlite3', 'discord.js', 'dotenv'];

const firstPass = {
  target: 'node',
  compact: true,
  sourceMap: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 3,
  stringArrayWrappersType: 'function',
  stringArrayWrappersChainedCalls: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  splitStrings: true,
  splitStringsChunkLength: 6,
  numbersToExpressions: true,
  simplify: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  unicodeEscapeSequence: true,
  disableConsoleOutput: false,
  selfDefending: false,
  debugProtection: false,
};

const secondPass = {
  target: 'node',
  compact: true,
  sourceMap: false,
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,
  renameProperties: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  splitStrings: true,
  splitStringsChunkLength: 10,
  numbersToExpressions: true,
  simplify: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  unicodeEscapeSequence: true,
  disableConsoleOutput: false,
  selfDefending: true,
  debugProtection: true,
  debugProtectionInterval: 4000,
};

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function obfuscate(code, options, label) {
  const output = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
  try {
    new vm.Script(output, { filename: label });
  } catch (error) {
    throw new Error(`Saída inválida ao ofuscar ${label}: ${error.message}`);
  }
  return output;
}

fs.rmSync(outDir, { recursive: true, force: true });

let total = 0;
for (const file of listFiles(srcDir)) {
  const relative = path.relative(srcDir, file);
  const target = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (!file.endsWith('.js')) {
    fs.copyFileSync(file, target);
    continue;
  }

  const original = fs.readFileSync(file, 'utf8');
  const afterFirstPass = obfuscate(original, firstPass, `${relative} (passada 1)`);
  const afterSecondPass = obfuscate(afterFirstPass, secondPass, `${relative} (passada 2)`);

  fs.writeFileSync(target, afterSecondPass);
  total += 1;
  console.log(`ofuscado (2 passadas): ${path.relative(root, target)}`);
}

const distPackage = {
  name: rootPkg.name,
  version: rootPkg.version,
  private: true,
  main: 'index.js',
  scripts: {
    start: 'node index.js',
    deploy: 'node deploy-commands.js',
  },
  engines: rootPkg.engines,
  dependencies: Object.fromEntries(
    RUNTIME_DEPENDENCIES.map((name) => [name, rootPkg.dependencies[name]]),
  ),
  allowScripts: rootPkg.allowScripts,
};
fs.writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(distPackage, null, 2)}\n`);

const envExampleSrc = path.join(root, '.env.example');
if (fs.existsSync(envExampleSrc)) {
  fs.copyFileSync(envExampleSrc, path.join(outDir, '.env.example'));
}

console.log(
  `\nPronto: ${total} arquivos ofuscados em duas passadas em dist/. A pasta dist/ já tem o próprio package.json ` +
    'e pode ser zipada e enviada sozinha, sem o resto do projeto.',
);
