import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { specKeyFromNotion } from "../src/notion.js";
import { readJson, writeJson } from "../src/util.js";

const root = process.cwd();
const notionTarget = `local-user-test-${Date.now()}`;
const specPath = path.join(root, ".build_fast", "specs", specKeyFromNotion(notionTarget));

async function cli(args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn("node", ["bin/build_fast.js", ...args], {
      cwd: root,
      env: { ...process.env, NOTION_API_TOKEN: "", ...(options.env || {}) },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out: ${args.join(" ")}`));
    }, 30000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(output || `Command failed with ${code}: ${args.join(" ")}`));
    });
    child.stdin.end(options.input || "");
  });
}

try {
  await rm(specPath, { recursive: true, force: true });

  await cli([
    "plan",
    "--goal", "Add a tiny visible smoke feature",
    "--type", "feature",
    "--project", ".",
    "--ntn", notionTarget,
    "--no-agent"
  ]);

  const helpRun = await cli(["-h"]);
  assert.match(helpRun, /user-test/);

  const dryRun = await cli(["user-test", "--ntn", notionTarget, "--dry-run"]);
  assert.match(dryRun, /User Test/);
  assert.match(dryRun, /Checklist/);
  assert.match(dryRun, /Dry run/);

  const passRun = await cli(["user-test", "--ntn", notionTarget, "--yes"]);
  assert.match(passRun, /Result:\s+passed/);
  assert.match(passRun, /Notion Sync/);
  assert.match(passRun, /missing NOTION_API_TOKEN/);
  assert.match(passRun, /build_fast ship/);
  assert.doesNotMatch(passRun, /ship --ntn/);

  const runs = await readdir(path.join(specPath, "user-tests"));
  assert.equal(runs.length, 1);

  const specPathname = path.join(specPath, "spec.json");
  const specWithBrowserQa = await readJson(specPathname);
  specWithBrowserQa.notion = { specPageId: "fake-page-id" };
  specWithBrowserQa.browserQa = {
    startCommand: "node -e \"console.log(process.env.PORT); setTimeout(() => {}, 30000)\"",
    url: "http://127.0.0.1:${PORT}/demo/"
  };
  await writeJson(specPathname, specWithBrowserQa);

  const fastSyncRun = await cli(["user-test", "--ntn", notionTarget, "--yes"], { env: { NOTION_API_TOKEN: "fake-token" } });
  assert.match(fastSyncRun, /Fast sync/);
  assert.match(fastSyncRun, /Notion sync failed/);
  assert.doesNotMatch(fastSyncRun, /missing NOTION_API_TOKEN/);

  const setupRun = await cli(["user-test", "--ntn", notionTarget, "--run-setup", "--yes", "--port", "19001"]);
  assert.match(setupRun, /http:\/\/127\.0\.0\.1:19001\/demo\//);
  assert.doesNotMatch(setupRun, /\$\{PORT\}/);

  const failRun = await cli(["user-test", "--ntn", notionTarget, "--create-tasks", "--fail-checks", "1", "--note", "Needs clearer copy"]);
  assert.match(failRun, /Result:\s+failed/);
  assert.match(failRun, /Created follow-up tasks/);
  assert.match(failRun, /build_fast go/);
  assert.doesNotMatch(failRun, /go --ntn/);

  const spec = await readJson(path.join(specPath, "spec.json"));
  assert.ok(spec.tasks.some((task) => task.title.startsWith("[user-test]")));
} finally {
  await rm(specPath, { recursive: true, force: true });
}

console.log("user-test tests passed");
