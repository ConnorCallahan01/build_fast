import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { pathExists } from "./util.js";

const execFileAsync = promisify(execFile);
const MAX_FILES = 160;
const MAX_README_CHARS = 6000;

export async function scanRepo(projectDir) {
  const root = await gitRoot(projectDir);
  const packageJson = await readPackageJson(projectDir);
  const files = await listProjectFiles(projectDir);
  const readme = await readFirstExisting(projectDir, ["README.md", "readme.md"]);
  const scripts = packageJson?.scripts || {};
  return {
    projectDir,
    gitRoot: root,
    projectRelativePath: path.relative(root, projectDir) || ".",
    git: {
      branch: await gitValue(root, ["branch", "--show-current"]),
      head: await gitValue(root, ["rev-parse", "--short", "HEAD"]),
      status: await gitValue(root, ["status", "--short"])
    },
    package: packageJson
      ? {
          name: packageJson.name,
          type: packageJson.type,
          scripts
        }
      : null,
    detected: {
      runtimes: detectRuntimes(packageJson, files),
      sourceDirs: detectDirs(files, ["src", "app", "lib", "server", "client"]),
      testDirs: detectDirs(files, ["test", "tests", "__tests__", "spec"]),
      feedbackLoops: detectFeedbackLoops(scripts, files)
    },
    files,
    readme: readme ? readme.slice(0, MAX_README_CHARS) : ""
  };
}

async function gitRoot(projectDir) {
  try {
    return (await git(projectDir, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return projectDir;
  }
}

async function gitValue(root, args) {
  try {
    return (await git(root, args)).trim();
  } catch {
    return "";
  }
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10000 });
  return stdout;
}

async function readPackageJson(projectDir) {
  const filePath = path.join(projectDir, "package.json");
  if (!(await pathExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readFirstExisting(projectDir, names) {
  for (const name of names) {
    const filePath = path.join(projectDir, name);
    if (await pathExists(filePath)) return readFile(filePath, "utf8");
  }
  return "";
}

async function listProjectFiles(projectDir) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectDir, "ls-files"], { timeout: 10000 });
    return stdout.split("\n").filter(Boolean).slice(0, MAX_FILES);
  } catch {
    return walkFiles(projectDir, projectDir, []);
  }
}

async function walkFiles(root, dir, results) {
  if (results.length >= MAX_FILES) return results;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;
    if ([".git", "node_modules", ".build_fast", "dist", "build", "coverage"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      await walkFiles(root, fullPath, results);
    } else if ((await stat(fullPath)).isFile()) {
      results.push(rel);
    }
  }
  return results;
}

function detectRuntimes(packageJson, files) {
  const runtimes = new Set();
  if (packageJson) runtimes.add("node");
  if (files.some((file) => file.endsWith(".py"))) runtimes.add("python");
  if (files.some((file) => file.endsWith(".rs"))) runtimes.add("rust");
  if (files.some((file) => file === "Cargo.toml")) runtimes.add("rust");
  return [...runtimes];
}

function detectDirs(files, names) {
  return names.filter((name) => files.some((file) => file === name || file.startsWith(`${name}/`)));
}

function detectFeedbackLoops(scripts, files) {
  const loops = [];
  if (scripts.test) loops.push("npm test");
  if (scripts.lint) loops.push("npm run lint");
  if (scripts.build) loops.push("npm run build");
  if (files.some((file) => file.endsWith(".js"))) {
    const source = files.find((file) => file.startsWith("src/") && file.endsWith(".js"));
    if (source) loops.push(`node --check ${source}`);
  }
  if (files.includes("Cargo.toml")) loops.push("cargo test");
  return [...new Set(loops)];
}
