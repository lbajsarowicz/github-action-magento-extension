'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { composerCacheMode } = require('../src/config');

const root = path.join(__dirname, '..');
const actionFiles = ['action.yml', ...fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'action.yml')))
  .map((entry) => path.join(entry.name, 'action.yml'))];

test('every action that caches Composer downloads can leave the cache to the runner', () => {
  const caching = actionFiles.filter((file) => fs.readFileSync(path.join(root, file), 'utf8').includes('uses: actions/cache'));
  assert.ok(caching.length >= 7, caching.join(', '));
  for (const file of caching) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(text, /\n {2}composer-cache:\n/, `${file} has no composer-cache input`);
    const steps = text.split('\n    - name:').filter((step) => /uses: actions\/cache|id: composer-cache/.test(step));
    assert.equal(steps.length, 2, file);
    for (const step of steps) {
      const condition = step.split('\n').find((line) => /^ {6}if:/.test(line));
      assert.equal(condition, "      if: ${{ steps.prepared.outputs.cache != 'true' && inputs.composer-cache != 'none' }}", `${file}: ${step.split('\n')[0]}`);
    }
    const prepare = text.split('\n    - name:').find((step) => /\n {6}id: prepared\n/.test(step));
    assert.ok(prepare, `${file} has no prepare step`);
    assert.match(prepare, /MEC_COMPOSER_CACHE: \$\{\{ inputs\.composer-cache \}\}/, `${file}: the prepare step does not get composer-cache`);
  }
});

test('composer-cache is actions or none', () => {
  assert.equal(composerCacheMode('actions'), 'actions');
  assert.equal(composerCacheMode('none'), 'none');
  assert.equal(composerCacheMode(undefined), 'actions');
  assert.throws(() => composerCacheMode('disk'), /composer-cache must be actions or none\./);
});
