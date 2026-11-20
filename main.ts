// main.ts — SOLMAR (gta6-01) entry. Stages the game and its screenshots into
// the make.fun output directory and writes dossier.json, the summary the
// judge reads, through the vendored buildDossier helper.
// Run it with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (inside the grader's container MAKEFUN_OUTPUT_DIR is unset, so /output.)
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this entry lives on disk, and where the graded copy goes.
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one top-level entry (game/ or screenshots/) into the output dir,
// creating the destination first. Missing screenshots/ is fine.
function stage(name: string) {
  const src = join(ROOT, name);
  const dst = join(OUT, name);
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

mkdirSync(OUT, { recursive: true });
stage('game');
stage('screenshots');


// The scorer's own caps: the dossier text stays under 163,840 bytes, at most
// 4 screenshots and none over 256 KiB, at most 993 files under game/ totalling
// 48 MiB, and no game path over 1000 bytes. buildDossier enforces them and
// returns the dossier text to write.
const dossierText = buildDossier(OUT, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(OUT, 'dossier.json'), dossierText);
console.log('SOLMAR staged to ' + OUT + ' (dossier ' + dossierText.length + ' chars)');
