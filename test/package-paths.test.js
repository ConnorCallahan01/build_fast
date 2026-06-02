import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readTemplate } from "../src/ledger.js";
import { packagePath, packageRoot } from "../src/paths.js";
import { renderPrompt } from "../src/prompts.js";

const root = packageRoot();
assert.equal(path.basename(root), "build_fast");
assert.equal(packagePath("prompts", "spec.md"), path.join(root, "prompts", "spec.md"));

const originalCwd = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), "build-fast-package-paths-"));

try {
  process.chdir(temp);
  const rendered = await renderPrompt("multi-spec.md", {
    goal: "Package path smoke",
    type: "project",
    project: temp,
    notionUrl: "local",
    repoContext: {}
  });
  assert.match(rendered, /Package path smoke/);

  const worker = await readTemplate("worker.md");
  assert.match(worker, /Assigned task/);
} finally {
  process.chdir(originalCwd);
  await rm(temp, { recursive: true, force: true });
}

console.log("package path tests passed");
