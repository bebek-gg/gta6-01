// main.ts — SOLMAR's hand-in program for make.fun's gta6-01.
// It copies game/ and screenshots/ from this repository into the output
// directory and writes dossier.json there with the kit's buildDossier.
// Node 22, standard library only; no install, no network, no build step.
// Run it locally with: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)));
const OUT = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

/** The gate's own caps, from the competition's gate.json. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/**
 * Copy a directory tree, skipping anything whose name starts with a dot.
 * Plain files and directories only; symlinks and special files are refused
 * by the dossier builder, so they never get this far.
 */
function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

/** Hand the entry in: fresh copies, then the dossier built from them. */
function handIn() {
  mkdirSync(OUT, { recursive: true });
  for (const name of ['game', 'screenshots', 'dossier.json']) {
    rmSync(join(OUT, name), { recursive: true, force: true });
  }
  copyTree(join(REPO, 'game'), join(OUT, 'game'));
  copyTree(join(REPO, 'screenshots'), join(OUT, 'screenshots'));
  const dossier = buildDossier(OUT, CAPS);
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  console.log(`SOLMAR handed in to ${OUT} (${dossier.length} byte dossier)`);
}

handIn();
