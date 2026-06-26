// Builds an unpacked Windows executable into ./release via @electron/packager.
// Run with: npm run package
import { packager } from '@electron/packager';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectDir = dirname(fileURLToPath(import.meta.url));

const paths = await packager({
  dir: projectDir,
  name: 'copy-to-rtl',
  platform: 'win32',
  arch: 'x64',
  out: join(projectDir, 'release'),
  overwrite: true,
  appVersion: '1.0.0',
  // The app has no runtime dependencies (only Electron/Node built-ins), so
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
