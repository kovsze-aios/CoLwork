#!/usr/bin/env node
/**
 * Generates platform icons from `build/icon.svg`:
 *   • build/icon.png   (512x512 PNG, used by linux + electron-builder fallback)
 *   • build/icon.ico   (multi-resolution ICO for Windows)
 *   • build/icon.icns  (only on macOS — silently skipped elsewhere; mac builds
 *                       are intended to run on macOS via `npm run build:all`)
 *
 * Dependencies (devDependencies):  sharp, png-to-ico
 *
 * Usage:
 *   node build/build-icons.js
 */
const fs = require("fs");
const path = require("path");

(async () => {
  const SRC = path.join(__dirname, "icon.svg");
  if (!fs.existsSync(SRC)) {
    console.error("[icons] missing source:", SRC);
    process.exit(1);
  }

  let sharp, pngToIco;
  try {
    sharp = require("sharp");
  } catch {
    console.error('[icons] missing dependency "sharp" — run: npm install --save-dev sharp');
    process.exit(1);
  }
  try {
    pngToIco = require("png-to-ico");
  } catch {
    console.error('[icons] missing dependency "png-to-ico" — run: npm install --save-dev png-to-ico');
    process.exit(1);
  }

  const svg = fs.readFileSync(SRC);

  // 1) Master 512×512 PNG (Linux + AppImage)
  const png512 = path.join(__dirname, "icon.png");
  await sharp(svg).resize(512, 512).png().toFile(png512);
  console.log("[icons] wrote", png512);

  // 2) Multi-resolution ICO for Windows (NSIS installer + .exe icon)
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer())
  );
  const ico = await pngToIco(buffers);
  const icoPath = path.join(__dirname, "icon.ico");
  fs.writeFileSync(icoPath, ico);
  console.log("[icons] wrote", icoPath, `(${sizes.length} sizes)`);

  // 3) macOS .icns is left to electron-builder if the user runs the mac build
  //    on a Mac. Generating .icns reliably from Linux/Windows is a rabbit hole
  //    we don't need to dig today — `mac` target builds will fall back to PNG.
  console.log("[icons] done");
})().catch((e) => {
  console.error("[icons] failed:", e.message);
  process.exit(1);
});
