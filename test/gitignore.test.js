import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureInitGitignore } from "../src/commands.js";

const originalLog = console.log;
console.log = () => {};

const first = await mkdtemp(path.join(tmpdir(), "build-fast-gitignore-"));
const second = await mkdtemp(path.join(tmpdir(), "build-fast-gitignore-"));

try {
  await ensureInitGitignore(first);
  await ensureInitGitignore(first);
  const created = await readFile(path.join(first, ".gitignore"), "utf8");
  assert.equal(created, ".build_fast/\nnode_modules/\n");

  await writeFile(path.join(second, ".gitignore"), "node_modules\n/.build_fast/\n");
  await ensureInitGitignore(second);
  const existing = await readFile(path.join(second, ".gitignore"), "utf8");
  assert.equal(existing, "node_modules\n/.build_fast/\n");
} finally {
  console.log = originalLog;
  await rm(first, { recursive: true, force: true });
  await rm(second, { recursive: true, force: true });
}

console.log("gitignore tests passed");
