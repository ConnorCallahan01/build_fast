import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { specKeyFromNotion } from "../src/notion.js";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const notionTarget = `local-program-test-${Date.now()}`;
const specPath = path.join(root, ".build_fast", "specs", specKeyFromNotion(notionTarget));

async function cli(args) {
  const { stdout, stderr } = await execFileAsync("node", ["bin/build_fast.js", ...args], {
    cwd: root,
    timeout: 30000
  });
  return `${stdout}${stderr}`;
}

try {
  await rm(specPath, { recursive: true, force: true });

  const planOutput = await cli([
    "plan",
    "--goal", "Build a small multi-phase sample project",
    "--type", "project",
    "--project", ".",
    "--ntn", notionTarget,
    "--no-agent"
  ]);
  assert.match(planOutput, /Planned 1 specs/);
  assert.match(planOutput, /Local program:/);

  const statusOutput = await cli(["status", "--ntn", notionTarget]);
  assert.match(statusOutput, /Specs: 0\/1 completed/);
  assert.match(statusOutput, /Tasks: 0\/1 completed, 1 pending/);
  assert.match(statusOutput, /Next: spec-001 Full implementation/);
  assert.match(statusOutput, /Current Spec/);
  assert.match(statusOutput, /Next Tasks/);

  const specStatusOutput = await cli(["status", "--ntn", notionTarget, "--spec", "spec-001"]);
  assert.match(specStatusOutput, /spec-001: Full implementation \[planned\]/);
  assert.match(specStatusOutput, /pending\s+task-001 Implement the requested goal/);

  const driveOutput = await cli(["drive", "--ntn", notionTarget, "--no-agent"]);
  assert.match(driveOutput, /Drive no-agent smoke complete after plan\/sync/);

  const dryRunOutput = await cli(["drive", "--ntn", notionTarget, "--dry-run", "--parallel", "smart", "--concurrency", "2", "--max-tasks", "2"]);
  assert.match(dryRunOutput, /Drive dry run/);
  assert.match(dryRunOutput, /Plan quality:/);
  assert.match(dryRunOutput, /Next swarm:/);
  assert.match(dryRunOutput, /Dry run only/);

  const programTarget = `${notionTarget}-explicit`;
  const programPath = path.join(root, ".build_fast", "specs", specKeyFromNotion(programTarget));
  await rm(programPath, { recursive: true, force: true });
  const programOutput = await cli([
    "program",
    "--goal", "Build a small multi-phase sample project",
    "--project", ".",
    "--ntn", programTarget,
    "--no-agent"
  ]);
  assert.match(programOutput, /Planned 1 specs/);

  await assert.rejects(
    cli(["plan", "--goal", "Smoke", "--type", "feature", "--project", ".", "--ntn", `${notionTarget}-worker`, "--worker", "codex", "--no-agent"]),
    /Unsupported worker adapter: codex/
  );

  const shipOutput = await cli(["ship", "--ntn", notionTarget, "--branch", "build-fast/test-branch"]);
  assert.match(shipOutput, /Ship preview/);
  assert.match(shipOutput, /Dry run only/);
  await rm(programPath, { recursive: true, force: true });
} finally {
  await rm(specPath, { recursive: true, force: true });
}

console.log("program mode tests passed");
