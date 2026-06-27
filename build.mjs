// Builds an unpacked Windows executable into ./release via @electron/packager.
// Run with: npm run package
import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));

const paths = await packager({
  dir: projectDir,
  name: 'copy-to-rtl',
  platform: 'win32',
  arch: 'x64',
  out: join(projectDir, 'release'),
  overwrite: true,
  appVersion: version,
  // Runtime assets (KaTeX) are vendored under ./vendor and committed, so
  // node_modules is excluded outright rather than relying on prune.
  prune: false,
  // No asar: foreground-title.ps1 must stay a real on-disk file so the external
  // PowerShell process can read it (asar paths aren't visible to execFile).
  asar: false,
  ignore: [
    /^\/node_modules($|\/)/,
    /^\/dist($|\/)/,
    /^\/out($|\/)/,
    /^\/release($|\/)/,
    /^\/terminals($|\/)/,
    /^\/mcps($|\/)/,
    /^\/\.git($|\/)/,
    /^\/\.gitignore$/,
    /^\/build\.mjs$/,
  ],
});

console.log('Packaged to:', paths.join(', '));
