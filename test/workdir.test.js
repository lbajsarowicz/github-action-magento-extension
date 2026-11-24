'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('../src/config');
const { prepareWorkDirectory, readInstallState, writeInstallState, detectPrepared } = require('../src/workdir');
const { workspace } = require('./helpers');

test('a later step of the same job keeps the install and the results', () => {
  const { env } = workspace();
  const config = readConfig(env);
  assert.equal(prepareWorkDirectory(config), true);
  fs.mkdirSync(config.magentoRoot);
  fs.writeFileSync(path.join(config.results, 'results.json'), '{}');
  writeInstallState(config, 'passed');

  assert.equal(prepareWorkDirectory(readConfig({ ...env, MEC_CHECKS: 'unit' })), false);
  assert.ok(fs.existsSync(config.magentoRoot));
  assert.ok(fs.existsSync(path.join(config.results, 'results.json')));
  assert.deepEqual(readInstallState(config), { version: '2.4.8-p5', status: 'passed' });
});

test('static checks of the same job keep the install', () => {
  const { env } = workspace();
  const config = readConfig(env);
  prepareWorkDirectory(config);
  writeInstallState(config, 'passed');
  assert.equal(prepareWorkDirectory(readConfig({ ...env, MEC_MAGENTO_VERSION: '', MEC_CHECKS: 'lint' })), false);
});

test('another job, another PHP version or another release starts clean', () => {
  for (const override of [{ GITHUB_JOB: 'other' }, { GITHUB_RUN_ATTEMPT: '2' }, { MEC_PHP_VERSION: '8.3' }, { MEC_MAGENTO_VERSION: '2.4.9' }]) {
    const { env } = workspace();
    const config = readConfig(env);
    prepareWorkDirectory(config);
    fs.mkdirSync(config.magentoRoot);
    writeInstallState(config, 'passed');
    assert.equal(prepareWorkDirectory(readConfig({ ...env, ...override })), true, JSON.stringify(override));
    assert.equal(fs.existsSync(config.magentoRoot), false);
    assert.equal(readInstallState(config), null);
  }
});

test('the Composer cache is restored once per job and release', () => {
  const { env } = workspace();
  const base = { work: env.MEC_WORK_DIR, job: '1-1-check' };
  assert.deepEqual(detectPrepared({ ...base, cacheId: 'static' }), { cache: false });
  assert.deepEqual(detectPrepared({ ...base, cacheId: 'static' }), { cache: true });
  assert.deepEqual(detectPrepared({ ...base, cacheId: 'magento2.4.9' }), { cache: false });
  assert.deepEqual(detectPrepared({ ...base, cacheId: 'magento2.4.9' }), { cache: true });
  assert.deepEqual(detectPrepared({ ...base, job: '2-1-check', cacheId: 'magento2.4.9' }), { cache: false });
});

test('a step with composer-cache none leaves the Composer cache to a later step that wants it', () => {
  const { env } = workspace();
  const base = { work: env.MEC_WORK_DIR, job: '1-1-check', cacheId: 'magento2.4.9' };
  assert.deepEqual(detectPrepared({ ...base, cacheMode: 'none' }), { cache: false });
  assert.deepEqual(detectPrepared({ ...base, cacheMode: 'actions' }), { cache: false });
  assert.deepEqual(detectPrepared({ ...base, cacheMode: 'actions' }), { cache: true });

  const other = { ...base, job: '2-1-check' };
  assert.deepEqual(detectPrepared({ ...other, cacheMode: 'actions' }), { cache: false });
  assert.deepEqual(detectPrepared({ ...other, cacheMode: 'none' }), { cache: true });
});
