import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function parseArgs(argv) {
  const args = [...argv];
  let command = args.shift();

  if (command === "-h" || command === "--help") {
    return { command: "help", flags: {} };
  }

  if (!command || command.startsWith("--")) {
    if (command) args.unshift(command);
    command = inferCommandFromFlags(args);
  }

  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      flags._ = flags._ || [];
      flags._.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split(/=(.*)/s).filter(Boolean);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { command, flags };
}

function inferCommandFromFlags(args) {
  if (args.includes("--tasks")) return "plan";
  if (args.includes("--go")) return "run";
  if (args.includes("--review")) return "review";
  if (args.includes("--goal")) return "plan";
  return "help";
}

export function requireFlag(flags, name) {
  const value = flags[name];
  if (!value || value === true) {
    throw new Error(`Missing required flag: --${name}`);
  }
  return String(value);
}

export function optionalString(flags, name, fallback = undefined) {
  const value = flags[name];
  if (!value || value === true) return fallback;
  return String(value);
}

export function boolFlag(flags, name) {
  return flags[name] === true || flags[name] === "true";
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "spec";
}

export function shortHash(value, length = 10) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

export function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback = undefined) {
  if (!(await pathExists(filePath))) return fallback;
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeProject(project) {
  return path.resolve(project || process.cwd());
}

export function printHelp() {
  console.log(`build_fast

Repo-aware agent workflow: align -> plan -> go -> user-test -> ship -> cleanup.
Notion is the control plane; git/worktrees are the implementation surface.

Quick Start
  build_fast init
  build_fast align
  build_fast plan
  build_fast go
  build_fast user-test --run-setup
  build_fast ship
  build_fast ship --apply --pr
  build_fast cleanup --apply --force --branches

Daily Commands
  build_fast pickup --status       Show where to resume after time away.
  build_fast start                 Orient yourself; shows current state and new-goal options.
  build_fast start --goal "..."    Plan and enter the build pipeline from a new goal.
  build_fast plan                  Interactive fresh plan. Completed/shipped work is not reused.
  build_fast go                    Run the default drive loop saved by init.
  build_fast status                Current spec/program, tasks, workers, collection state.

Setup And Alignment
  init   [--ntn <url>] [--project <dir>] [--install-qa] [--yes]
         [--permission-profile inherit|managed]
         [--permission-mode default|acceptEdits|bypassPermissions|plan]
         [--dangerously-skip-permissions]
         Saves project defaults in .build_fast/config.json.

  align  [--project <dir>] [--yes]
         Writes AGENTS.md, CLAUDE.md, and .build_fast/agent-profile.json.
         CLAUDE.md imports AGENTS.md so Claude Code loads shared repo guidance.

  doctor [--ntn <url>]             Check Node, Git, Claude, token, and Notion access.
  inspect [--ntn <url>]            Inspect Notion child data sources and properties.

Planning
  plan    [--goal "..."] [--type feature|bug|chore|refactor|project|init|overhaul]
          [--project <dir>] [--no-agent] [--status]
          Single-spec types: feature, bug, chore, refactor.
          Program-style types: project, init, overhaul.

  program --goal "..." [--project <dir>] [--drive]
          Plan a multi-spec phased program explicitly.

  goal    --goal "..." [--type <type>] [--interactive]
          Shape a goal contract before planning.

Build Loop
  drive  [--goal "..."] [--from-goal] [--type <type>] [--dry-run]
         [--parallel smart] [--concurrency 4] [--max-tasks 5]
         [--qa browser] [--max-qa-repairs 1] [--status]

  go     Uses init defaults; equivalent to drive with saved smart parallel, QA,
         concurrency, max task, Claude permission, and Notion defaults.

  swarm  [--concurrency 2] [--max-tasks 2] [--parallel smart]
         Lower-level worker launch for dependency-ready tasks.

Review And Repair
  qa       --type browser [--create-task] [--require-playwright]
  review   --type pr_readiness [--create-tasks]
  bugs     [--create-tasks]
  user-test [--run-setup] [--create-tasks] [--keep-running]
            [--no-sync] [--full-sync] [--status]
          Human acceptance pass after go/QA. Passed user tests lead to ship.

Collect, Ship, Cleanup
  collect [--task task-003] [--apply] [--force] [--patch] [--status]
          Inspect or apply completed worker worktree output.

  ship    [--branch build-fast/name] [--apply] [--pr] [--ready]
          [--publish] [--repo owner/name] [--base main] [--status]
          Preview first; --apply creates branch/commit/push and optional PR.
          Program ships attach repo/PR metadata to every program spec in Notion.

  cleanup [--task task-003] [--apply] [--force] [--branches] [--status]
          Remove recorded worktrees and optionally task branches after ship.

State And Notion
  status  [--spec spec-001]
  pickup  [--status]
  sync    [--mode data-source|blocks] [--status]
  compact [--keep-runs 1]
  stop

Claude Permissions
  --permission-profile inherit
      Do not pass build_fast managed --settings or default permission mode.
      Claude Code uses your normal global/project settings.

  --permission-profile managed
      Use build_fast temporary settings and autopilot permission defaults.

  --permission-mode default|acceptEdits|bypassPermissions|plan
      Pass Claude Code's permission mode for this run or save it during init.

  --dangerously-skip-permissions
      Pass Claude Code's skip-permissions flag. Cannot combine with --permission-mode.

Notion Defaults
  After init, --ntn is optional from the project directory.
  Fast sync paths update changed build_fast-managed pages/sections; they do not
  delete your existing Notion audit trail.

Common Recovery
  build_fast pickup --status
  build_fast collect --task <task-id> --apply
  build_fast go
  build_fast user-test --create-tasks
  build_fast cleanup --apply --force --branches

Compatibility Aliases
  --goal implies plan
  --tasks implies plan
  --go implies run
  --review implies review
`);
}
