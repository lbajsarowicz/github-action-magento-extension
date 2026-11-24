'use strict';

const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Steps of one job share the Magento install and the results. Anything left by another job, or by
 * a different Magento release in the same job, is discarded.
 *
 * @returns {boolean} true when the work directory was reset
 */
function prepareWorkDirectory(config) {
  fs.mkdirSync(config.work, { recursive: true });
  const state = `${config.job} php${config.phpVersion} ${config.extension}`;
  const installed = readInstallState(config);
  const otherRelease = Boolean(config.magentoVersion && installed && installed.version !== config.magentoVersion);
  const reset = read(path.join(config.work, 'state')) !== state || otherRelease;
  if (reset) {
    for (const entry of [config.magentoRoot, config.tools, config.results, path.join(config.work, 'install-state')]) {
      fs.rmSync(entry, { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(config.work, 'state'), state);
  }
  fs.mkdirSync(config.results, { recursive: true });
  return reset;
}

function readInstallState(config) {
  const [version, status] = read(path.join(config.work, 'install-state')).split(' ');
  return version && status ? { version, status } : null;
}

function writeInstallState(config, status) {
  fs.writeFileSync(path.join(config.work, 'install-state'), `${config.magentoVersion} ${status}`);
}

/**
 * Tells a sub-action whether an earlier step of the same job already restored the Composer cache,
 * and records what this step is about to restore.
 */
function detectPrepared({ work, job, cacheId, cacheMode = 'actions' }) {
  fs.mkdirSync(work, { recursive: true });
  const cacheFile = path.join(work, 'prepared-cache');
  const cacheWanted = `${job} ${cacheId}`;
  const cache = read(cacheFile) === cacheWanted;
  // With `none` nothing is restored, so a later step that asks for the cache must still restore it.
  if (!cache && cacheMode !== 'none') {
    fs.writeFileSync(cacheFile, cacheWanted);
  }
  return { cache };
}

module.exports = { prepareWorkDirectory, readInstallState, writeInstallState, detectPrepared };
