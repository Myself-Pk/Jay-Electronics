// Makes the app icons (home-screen icon on Android, iPhone, and the installed app) from the logo.
// Usage: node scripts/make-icons.mjs   (writes PNGs into public/icons/)
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const BLUE = "#1e3a8a";
const YELLOW = "#fbbf24";
const BOLT = "M36 10 18 36h12l-4 18 20-28H34z"; // same bolt as public/favicon.svg (64×64 grid)

// "any": rounded tile like the favicon. "maskable": full-bleed square; Android cuts it to a
// circle or squircle, so the bolt is shrunk into the middle 60% (the safe zone).
const svg = (kind) =>
  kind === "maskable"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BLUE}"/><g transform="translate(32 32) scale(0.62) translate(-32 -32)"><path d="${BOLT}" fill="${YELLOW}"/></g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BLUE}"/><path d="${BOLT}" fill="${YELLOW}"/></svg>`;

const out = "public/icons";
mkdirSync(out, { recursive: true });
for (const [name, kind, size] of [
  ["icon-192.png", "any", 192],
  ["icon-512.png", "any", 512],
  ["icon-maskable-512.png", "maskable", 512],
  ["apple-touch-icon.png", "maskable", 180], // iPhone rounds the corners itself
]) {
  const png = new Resvg(svg(kind), { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(`${out}/${name}`, png);
  console.log(`  ✓ ${out}/${name}`);
}
