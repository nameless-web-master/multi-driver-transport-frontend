/**
 * One-off image compression for /public assets.
 *
 * Re-encodes large PNGs (hero, features, auth-bg, logo) at sane dimensions and
 * compression. Original files are overwritten in place so existing
 * <Image src="/foo.png" /> references keep working.
 *
 * Run with: npm run optimize-images
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

// Each entry: target filename in /public + desired max width + encoder settings.
const targets = [
  { file: "home-hero.png", width: 1600, encoder: "png" },
  { file: "home-hero-dark.png", width: 1600, encoder: "png" },
  { file: "home-features.png", width: 1600, encoder: "png" },
  { file: "home-features-dark.png", width: 1600, encoder: "png" },
  { file: "auth-bg.png", width: 1400, encoder: "png" },
  { file: "logo.png", width: 256, encoder: "png" },
];

function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

async function processOne({ file, width, encoder }) {
  const src = path.join(PUBLIC_DIR, file);
  const before = (await stat(src)).size;
  const input = await readFile(src);

  let pipeline = sharp(input).resize({ width, withoutEnlargement: true });

  if (encoder === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, quality: 80, effort: 10 });
  } else if (encoder === "jpeg") {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  }

  const output = await pipeline.toBuffer();
  await writeFile(src, output);
  const after = (await stat(src)).size;

  const pct = ((1 - after / before) * 100).toFixed(0);
  console.log(
    `  ${file.padEnd(26)} ${formatBytes(before).padStart(9)} -> ${formatBytes(after).padStart(9)}  (-${pct}%)`,
  );
}

async function main() {
  console.log(`Optimising ${targets.length} images in ${PUBLIC_DIR}\n`);
  for (const t of targets) {
    try {
      await processOne(t);
    } catch (err) {
      console.error(`  ! Failed on ${t.file}: ${err.message}`);
    }
  }
  console.log("\nDone.");
}

main();
