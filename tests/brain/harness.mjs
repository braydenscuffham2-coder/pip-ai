// Loads the real bundle, with its internals exported on a temporary copy, so tests can call the gate, scorer, selection and lane picker.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export async function loadBrain(path = "../../supabase/functions/scan-run/brain.js") {
  const src = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "brain-"));
  const f = join(dir, "brain.mjs");
  writeFileSync(f, `${src}\nexport { $ as __gate, H as __score, J as __select, Ie as __lane, ve as __catalog, E as __listed };\n`);
  return import(pathToFileURL(f).href);
}
