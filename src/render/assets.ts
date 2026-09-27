/**
 * Erik's models, as exported: every .glb in models/ at the repo root, found by name (the file
 * name without .glb). The game loads them all before it starts (`loadModels`), so the rest of the
 * renderer can use them straight away. In a normal build they are separate files next to the page;
 * in a single-file build (artifact, mockups) they are inlined.
 */
const URLS = import.meta.glob("../../models/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const loaded = new Map<string, ArrayBuffer>();

export type ModelName = "sentinel" | "blaster" | "colossus" | "titan";

export async function loadModels(): Promise<void> {
  await Promise.all(Object.entries(URLS).map(async ([path, url]) => {
    const name = path.slice(path.lastIndexOf("/") + 1, -".glb".length);
    loaded.set(name, url.startsWith("data:") ? fromDataUrl(url) : await fetchBytes(name, url));
  }));
}

async function fetchBytes(name: string, url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model ${name}: ${res.status}`);
  return res.arrayBuffer();
}

/** Inlined models (single-file builds) are decoded in place: artifact pages may not fetch data: URLs. */
function fromDataUrl(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** A loaded model's bytes (`loadModels` must have finished). */
export function modelBytes(name: ModelName): Uint8Array<ArrayBuffer> {
  const b = loaded.get(name);
  if (!b) throw new Error(`model ${name} not loaded`);
  return new Uint8Array(b);
}
