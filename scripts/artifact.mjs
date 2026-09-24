// Turns the single-file build into page content for a claude.ai Artifact
// (the Artifact host supplies <html>, <head> and <body> itself).
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("dist-single/index.html", "utf8");
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const keep = head
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "");
writeFileSync("dist-single/artifact.html", `${keep.trim()}\n${body.trim()}\n`);
console.log("wrote dist-single/artifact.html");
