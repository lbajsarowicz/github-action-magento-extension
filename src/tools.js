'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PACKAGE_NAME } = require('./config');

const TOOL_PACKAGES = {
  phpcs: /^(squizlabs\/php_codesniffer|dealerdirect\/phpcodesniffer-composer-installer|magento\/magento-coding-standard|slevomat\/coding-standard|phpcompatibility\/.+|phpcsstandards\/.+|[^/]+\/[^/]*(coding-standard|phpcs)[^/]*)$/,
  phpstan: /^(phpstan\/.+|bitexpert\/phpstan-magento|[^/]+\/[^/]*phpstan[^/]*)$/,
};

/**
 * The `require-dev` entries of the extension that belong to a static-analysis tool, as
 * `name:constraint`, so that the repository's own ruleset finds the packages it was written for.
 */
function toolPackages(composer, tool) {
  const packages = [];
  for (const [rawName, constraint] of Object.entries((composer && composer['require-dev']) || {})) {
    const name = rawName.toLowerCase();
    if (typeof constraint === 'string' && TOOL_PACKAGES[tool].test(name) && PACKAGE_NAME.test(name)
      && /^[\w.*^~<>=|,@ -]+$/.test(constraint)) {
      packages.push(`${name}:${constraint}`);
    }
  }
  return packages;
}

function readComposer(extension) {
  try {
    return JSON.parse(fs.readFileSync(path.join(extension, 'composer.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Installs a tool into its own directory, outside the Magento project. Packages the extension asks
 * for in require-dev take precedence, with their constraints; a default is added only when the
 * extension does not ask for that package. When the constraints cannot be installed, the same
 * packages are installed at their current releases, so plugins such as phpstan/extension-installer
 * and custom coding standards stay in place; only when that fails too are the defaults used.
 *
 * @returns {Promise<{directory: string, source: string}>}
 */
async function installTools(ctx, tool, defaults) {
  const directory = path.join(ctx.config.tools, tool);
  const composer = (args, options) => ctx.sh.exec('composer', [`--working-dir=${directory}`, ...args], options);
  const initialise = async () => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    await composer(['init', '--quiet', `--name=magento-extension-check/${tool}-tools`]);
    if (ctx.config.customRepositories) {
      const file = path.join(directory, 'composer.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(file, `${JSON.stringify({ ...manifest, repositories: ctx.config.repositories }, null, 4)}\n`);
    }
    await composer(['config', 'allow-plugins.dealerdirect/phpcodesniffer-composer-installer', 'true']);
    await composer(['config', 'allow-plugins.phpstan/extension-installer', 'true']);
  };

  await initialise();
  const own = toolPackages(readComposer(ctx.config.extension), tool);
  const ownNames = own.map((entry) => entry.slice(0, entry.indexOf(':')));
  const missingDefaults = defaults.filter((name) => !ownNames.includes(name));
  let source = 'action defaults';
  if (own.length > 0) {
    const attempt = await composer(['require', '--no-progress', '--quiet', ...own, ...missingDefaults], { allowFailure: true });
    if (attempt.code === 0) {
      source = "versions from the extension's require-dev";
    } else {
      ctx.log("The extension's require-dev tool versions could not be installed; using current releases of the same packages.");
      await initialise();
      const current = await composer(['require', '--no-progress', '--quiet', ...ownNames, ...missingDefaults], { allowFailure: true });
      if (current.code === 0) {
        source = "current releases of the extension's require-dev tools";
      } else {
        ctx.log('Current releases of those packages could not be installed either; using the defaults.');
        await initialise();
        await composer(['require', '--no-progress', '--quiet', ...defaults]);
      }
    }
  } else {
    await composer(['require', '--no-progress', '--quiet', ...defaults]);
  }
  const listing = await composer(['show', '--no-ansi'], { echo: false });
  for (const line of listing.stdout.split('\n').filter(Boolean)) {
    const [name, version] = line.split(/\s+/);
    ctx.log(`  ${name} ${version}`);
  }
  return { directory, source };
}

module.exports = { toolPackages, readComposer, installTools };
