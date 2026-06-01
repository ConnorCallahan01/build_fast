import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function parseArgs(argv) {
  const args = [...argv];
  let command = args.shift();

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

Commands:
  doctor
  goal   --goal "..." --ntn <notion-url> --project <dir> --type <type>
  plan   --goal "..." --ntn <notion-url> --project <dir> --type <type>
         [--no-agent for deterministic local planning]
  tasks  --ntn <notion-url> [regenerates from an existing local spec]
  start  --goal "..." --ntn <notion-url> --project <dir> --type <type> --autopilot junior_mode
  drive  --ntn <notion-url> [--goal "..." | --from-goal] [--project <dir>] [--type <type>]
  run    --ntn <notion-url> [--autopilot intern_mode|junior_mode|boss_mode]
  swarm  --ntn <notion-url> [--concurrency 2] [--max-tasks 2]
  status --ntn <notion-url>
  sync   --ntn <notion-url> [--mode data-source|blocks]
  compact --ntn <notion-url> [--keep-runs 1]
  collect --ntn <notion-url> [--task task-003] [--apply] [--force]
  cleanup --ntn <notion-url> [--task task-003] [--apply] [--force] [--branches]
  inspect --ntn <notion-url>
  stop   --ntn <notion-url>
  review --ntn <notion-url> --type pr_readiness

Compatibility aliases:
  --goal implies plan
  --tasks implies plan
  --go implies run
  --review implies review
`);
}
