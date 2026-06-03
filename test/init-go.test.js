import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readJson } from "../src/util.js";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), "build-fast-init-"));

async function cli(args, cwd = temp) {
  const { stdout, stderr } = await execFileAsync("node", [path.join(root, "bin/build_fast.js"), ...args], {
    cwd,
    timeout: 30000,
    env: { ...process.env, NOTION_API_TOKEN: "" }
  });
  return `${stdout}${stderr}`;
}

try {
  const initOutput = await cli([
    "init",
    "--yes",
    "--ntn", "local-init-target",
    "--project", temp,
    "--worker", "claude",
    "--qa", "none",
    "--concurrency", "3",
    "--max-tasks", "4"
  ]);
  assert.match(initOutput, /Saved config/);

  const config = await readJson(path.join(temp, ".build_fast", "config.json"));
  assert.equal(config.defaultNotion, "local-init-target");
  assert.equal(config.defaultProject, temp);
  assert.equal(config.defaultAgent, "claude");
  assert.equal(config.defaultConcurrency, 3);
  assert.equal(config.defaultMaxTasks, 4);
  assert.equal(config.defaultQa, "");

  const planOutput = await cli(["plan", "--goal", "Smoke default config planning", "--no-agent"]);
  assert.match(planOutput, /Planned 1 tasks/);

  const statusOutput = await cli(["status"]);
  assert.match(statusOutput, /Smoke default config planning/);

  const syncOutput = await cli(["sync"]);
  assert.match(syncOutput, /missing NOTION_API_TOKEN/);

  const goOutput = await cli(["go", "--dry-run", "--no-agent"]);
  assert.match(goOutput, /Drive dry run/);
  assert.match(goOutput, /Concurrency: 3/);
  assert.match(goOutput, /Max tasks per swarm: 4/);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("init/go tests passed");
