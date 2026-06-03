import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { specKeyFromNotion } from "../src/notion.js";
import { readJson, writeJson } from "../src/util.js";

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

  const worktreePath = path.join(specPath, "test-worktree");
  await mkdir(worktreePath, { recursive: true });
  await writeFile(path.join(worktreePath, "ship-preview.txt"), "from worker\n");
  const programFile = path.join(specPath, "program", "program.json");
  const program = await readJson(programFile);
  program.specs[0].tasks[0] = {
    ...program.specs[0].tasks[0],
    status: "completed",
    lastResult: {
      worktree: worktreePath,
      changed_files: ["ship-preview.txt"]
    }
  };
  await writeJson(programFile, program);

  const shipOutput = await cli(["ship", "--ntn", notionTarget, "--branch", "build-fast/test-branch"]);
  assert.match(shipOutput, /Ship preview/);
  assert.match(shipOutput, /Before applying ship/);
  assert.match(shipOutput, /build_fast collect --task task-001 --apply/);
  assert.match(shipOutput, /build_fast ship --apply/);
  assert.match(shipOutput, /Dry run only/);

  const cleanupOutput = await cli(["cleanup", "--ntn", notionTarget]);
  assert.match(cleanupOutput, /would remove spec-001\/task-001 worktree/);
  await rm(programPath, { recursive: true, force: true });
} finally {
  await rm(specPath, { recursive: true, force: true });
}

console.log("program mode tests passed");
