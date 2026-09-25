// Builds a three.js mockup under mockups/<name>/ into one self-contained
// artifact page: node scripts/mockup.mjs turrets -> dist-mockup/<name>.html
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync, writeFileSync } from "node:fs";

const name = process.argv[2];
if (!name) throw new Error("usage: node scripts/mockup.mjs <name>");
const outDir = `dist-mockup/${name}`;
await build({ root: `mockups/${name}`, base: "./", configFile: false, logLevel: "warn", plugins: [viteSingleFile()], build: { outDir: `../../${outDir}`, emptyOutDir: true } });
const src = readFileSync(`${outDir}/index.html`, "utf8");
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const keep = head.replace(/<meta charset[^>]*>/i, "").replace(/<meta name="viewport"[^>]*>/i, "");
writeFileSync(`dist-mockup/${name}.html`, `${keep.trim()}\n${body.trim()}\n`);
console.log(`wrote dist-mockup/${name}.html`);
