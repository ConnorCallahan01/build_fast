import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readJson, writeJson } from "../src/util.js";

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
  assert.equal(config.defaultPermissionMode, "");
  assert.equal(config.dangerouslySkipPermissions, false);

  await cli([
    "init",
    "--yes",
    "--ntn", "local-init-target",
    "--project", temp,
    "--worker", "claude",
    "--qa", "none",
    "--permission-profile", "inherit",
    "--permission-mode", "bypassPermissions"
  ]);
  const inheritedConfig = await readJson(path.join(temp, ".build_fast", "config.json"));
  assert.equal(inheritedConfig.permissionProfile, "inherit");
  assert.equal(inheritedConfig.defaultPermissionMode, "bypassPermissions");
  assert.equal(inheritedConfig.dangerouslySkipPermissions, false);

  await assert.rejects(
    cli(["init", "--yes", "--permission-mode", "acceptEdits", "--dangerously-skip-permissions"]),
    /Use either --permission-mode or --dangerously-skip-permissions/
  );

  await writeFile(path.join(temp, "AGENTS.md"), "# Existing Guidance\n\nKeep this paragraph.\n");
  const alignOutput = await cli(["align", "--yes"]);
  assert.match(alignOutput, /Agent Align/);
  assert.match(alignOutput, /AGENTS\.md, CLAUDE\.md/);
  const profile = await readJson(path.join(temp, ".build_fast", "agent-profile.json"));
  assert.equal(profile.version, 1);
  assert.ok(profile.guardrails.length);
  const agentsMd = await readFile(path.join(temp, "AGENTS.md"), "utf8");
  assert.match(agentsMd, /Keep this paragraph/);
  assert.match(agentsMd, /build_fast:agent-align:start/);
  const claudeMd = await readFile(path.join(temp, "CLAUDE.md"), "utf8");
  assert.match(claudeMd, /@AGENTS\.md/);

  const planOutput = await cli(["plan", "--goal", "Smoke default config planning", "--no-agent"]);
  assert.match(planOutput, /Planned 1 tasks/);
  assert.match(planOutput, /Recommended Next/);
  assert.match(planOutput, /go/);

  const statusOutput = await cli(["status"]);
  assert.match(statusOutput, /Smoke default config planning/);

  const current = await readJson(path.join(temp, ".build_fast", "current.json"));
  const specFile = path.join(temp, ".build_fast", "specs", current.targetId, "spec.json");
  const completedSpec = await readJson(specFile);
  await writeJson(specFile, { ...completedSpec, status: "completed" });
  await assert.rejects(
    cli(["plan", "--no-agent"]),
    /Missing required flag: --goal/
  );
  await writeJson(specFile, completedSpec);

  const pickupOutput = await cli(["pickup"]);
  assert.match(pickupOutput, /Pickup/);
  assert.match(pickupOutput, /Recommended Next/);
  assert.match(pickupOutput, /Resume build/);
  assert.match(pickupOutput, /Start new goal/);

  const startOutput = await cli(["start"]);
  assert.match(startOutput, /Start/);
  assert.match(startOutput, /Recommended Next/);
  assert.match(startOutput, /Start new goal/);

  const startGoalOutput = await cli(["start", "--goal"]);
  assert.match(startGoalOutput, /Goal not provided/);
  assert.match(startGoalOutput, /start --goal "\.\.\."/);

  const syncOutput = await cli(["sync"]);
  assert.match(syncOutput, /missing NOTION_API_TOKEN/);
  assert.match(syncOutput, /Recommended Next/);

  const goOutput = await cli(["go", "--dry-run", "--no-agent"]);
  assert.match(goOutput, /Drive dry run/);
  assert.match(goOutput, /Concurrency: 3/);
  assert.match(goOutput, /Max tasks per swarm: 4/);
  assert.match(goOutput, /Claude permissions: bypassPermissions/);
  assert.match(goOutput, /Recommended Next/);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("init/go tests passed");
