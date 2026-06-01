import { execFile } from "node:child_process";
import { cp, realpath } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { loadConfig, ensureConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { makeSpec, loadSpec, saveSpec, createRun, finishRun, savePrompt, nextPendingTask, updateTask, readActiveWorkers, writeActiveWorkers, attachNotionSpecPage, attachNotionTaskPage } from "./ledger.js";
import { checkNotionPage, inspectNotionPage, markdownBlocks, NotionClient, parseNotionId, pageTitle, notionRelation, notionRichText, notionStatus, notionTitle, notionUrl } from "./notion.js";
import { renderPrompt } from "./prompts.js";
import { scanRepo } from "./repo-scan.js";
import { normalizeProject, nowIso, optionalString, pathExists, printHelp, readJson, requireFlag, writeJson } from "./util.js";

const execFileAsync = promisify(execFile);

export async function dispatch(command, flags) {
  switch (command) {
    case "doctor":
      return doctor(flags);
    case "plan":
    case "tasks":
      return plan(flags);
    case "start":
      await plan({ ...flags, skipIfExists: true });
      return run(flags);
    case "drive":
      return drive(flags);
    case "run":
    case "go":
      return run(flags);
    case "swarm":
      return swarm(flags);
    case "status":
      return status(flags);
    case "sync":
      return sync(flags);
    case "compact":
      return compact(flags);
    case "collect":
      return collect(flags);
    case "cleanup":
      return cleanup(flags);
    case "inspect":
      return inspect(flags);
    case "stop":
      return stop(flags);
    case "review":
      return review(flags);
    case "help":
    default:
      printHelp();
  }
}

async function doctor(flags = {}) {
  const config = await ensureConfig();
  const checks = [];
  checks.push(await commandCheck("node", ["--version"]));
  checks.push(await commandCheck(config.claude.command || "claude", ["--version"]));
  checks.push(await commandCheck("git", ["--version"]));

  console.log("build_fast doctor");
  for (const check of checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.name}: ${check.detail}`);
  }
  console.log(`${config.notionToken ? "OK " : "WARN"} notion token: ${config.notionToken ? "configured" : "missing NOTION_API_TOKEN"}`);
  if (flags.ntn) {
    const page = await checkNotionPage(config, String(flags.ntn));
    console.log(`${page.ok ? "OK " : "WARN"} notion page: ${page.pageId || "unparsed"} ${page.detail}`);
  }
  console.log(`OK  config: .build_fast/config.json`);
}

async function commandCheck(name, args) {
  try {
    const { stdout, stderr } = await execFileAsync(name, args, { timeout: 10000 });
    return { name, ok: true, detail: (stdout || stderr).trim().split("\n")[0] };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

async function plan(flags) {
  const config = await ensureConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const existing = await loadSpec(config, notionUrl);
  const goal = optionalString(flags, "goal", existing?.goal);
  if (!goal) throw new Error("Missing required flag: --goal");
  const type = optionalString(flags, "type", existing?.type || "feature");
  const project = normalizeProject(optionalString(flags, "project", existing?.project || process.cwd()));
  if (existing && flags.skipIfExists) {
    console.log(`Existing plan found: ${existing.title}`);
    return;
  }

  let generated;
  const repoContext = await scanRepo(project);
  if (flags["no-agent"]) {
    generated = normalizePlan(null, goal, repoContext);
  } else {
    const prompt = await renderPrompt("spec.md", { goal, type, project, notionUrl, repoContext });
    const runDir = path.join(process.cwd(), ".build_fast", "planning", `${Date.now()}`);
    await writeJson(path.join(runDir, "repo-context.json"), repoContext);
    const result = await runClaude({
      config,
      prompt,
      projectDir: project,
      runDir,
      autopilot: "intern_mode",
      permissionProfile: "inherit"
    });
    generated = normalizePlan(result.parsed, goal, repoContext);
  }
  const spec = makeSpec({ goal, type, project, notionUrl, plan: generated });
  spec.repoContext = {
    gitRoot: repoContext.gitRoot,
    projectRelativePath: repoContext.projectRelativePath,
    feedbackLoops: repoContext.detected.feedbackLoops,
    scannedAt: nowIso()
  };
  await saveSpec(config, notionUrl, spec);

  await writeToNotion(config, notionUrl, formatSpecMarkdown(spec), { label: "spec" });

  console.log(`Planned ${spec.tasks.length} tasks for: ${spec.title}`);
  console.log(`Local spec: .build_fast/specs/${spec.id}/spec.json`);
}

function normalizePlan(parsed, goal, repoContext = undefined) {
  const source = parsed?.structured_output || parsed;
  if (source?.tasks?.length) return source;
  const feedbackLoops = repoContext?.detected?.feedbackLoops?.length ? repoContext.detected.feedbackLoops : ["Run the project's relevant test, lint, or build command."];
  return {
    title: goal.slice(0, 80),
    overview: source?.summary || `Implement: ${goal}`,
    risks: [],
    feedbackLoops,
    tasks: [
      {
        id: "task-001",
        title: "Implement the requested goal",
        objective: goal,
        instructions: "Inspect the codebase, make the smallest coherent implementation, and keep changes scoped to the goal.",
        acceptanceCriteria: ["The requested behavior is implemented.", "Relevant tests or checks pass."],
        testPlan: feedbackLoops,
        risk: "medium",
        dependencies: []
      }
    ]
  };
}

async function run(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const autopilot = optionalString(flags, "autopilot", config.defaultAutopilot);
  const permissionProfile = optionalString(flags, "permission-profile", config.permissionProfile || "inherit");
  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run `build_fast plan --goal ... --ntn ... --project ...` first.");

  const maxTasks = autopilot === "boss_mode" ? Number(optionalString(flags, "max-tasks", 50)) : Number(optionalString(flags, "max-tasks", 1));
  let completedThisRun = 0;

  while (completedThisRun < maxTasks) {
    const task = nextPendingTask(spec);
    if (!task) {
      spec = { ...spec, status: "completed", updatedAt: nowIso() };
      await saveSpec(config, notionUrl, spec);
      await updateNotionSpecStatus(config, notionUrl, spec, "Shipped");
      await appendNotionSpecSnapshot(config, spec);
      console.log("Spec complete.");
      return;
    }

    const { run, dir } = await createRun(config, notionUrl, task);
    const prompt = await renderPrompt("worker.md", { spec, task, autopilot, permissionProfile });
    await savePrompt(dir, prompt);

    console.log(`Running ${task.id}: ${task.title}`);
    await updateNotionSpecStatus(config, notionUrl, spec, "Building");
    await updateNotionTaskStatus(config, notionUrl, task, "In progress");

    const result = await runClaude({
      config,
      prompt,
      projectDir: spec.project,
      runDir: dir,
      autopilot,
      permissionProfile,
      onStart: ({ pid }) => registerWorker(config, { runId: run.id, taskId: task.id, pid, status: "running", startedAt: nowIso() })
    });

    await unregisterWorker(config, run.id);
    const taskPatch = taskPatchFromResult(result);
    spec = updateTask(spec, task.id, taskPatch);
    await saveSpec(config, notionUrl, spec);
    await finishRun(dir, { status: taskPatch.status, result: result.parsed, exitCode: result.code, signal: result.signal });
    await updateNotionAfterTask(config, notionUrl, spec, task, taskPatch);

    completedThisRun += 1;
    if (taskPatch.status !== "completed" || autopilot !== "boss_mode") {
      console.log(`${task.id} ${taskPatch.status}: ${taskPatch.summary || ""}`);
      return;
    }
  }
}

async function drive(flags) {
  const notionUrl = requireFlag(flags, "ntn");
  const autopilot = optionalString(flags, "autopilot", "junior_mode");
  const permissionProfile = optionalString(flags, "permission-profile", "managed");
  const concurrency = optionalString(flags, "concurrency", "2");
  const maxTasks = optionalString(flags, "max-tasks", concurrency);

  let config = await ensureConfig();
  let spec = await loadSpec(config, notionUrl);
  if (!spec) {
    if (!flags.goal) throw new Error("No local spec found. Pass --goal, --project, and --type or run plan first.");
    await plan(flags);
    config = await loadConfig();
    spec = await loadSpec(config, notionUrl);
  }

  await sync({ ntn: notionUrl });

  let iterations = 0;
  const maxIterations = Math.max(1, Number(optionalString(flags, "max-iterations", "20")));
  while (iterations < maxIterations) {
    spec = await loadSpec(config, notionUrl);
    const pending = readyPendingTasks(spec);
    if (!pending.length) break;
    await swarm({ ntn: notionUrl, autopilot, "permission-profile": permissionProfile, concurrency, "max-tasks": maxTasks });
    iterations += 1;
  }

  spec = await loadSpec(config, notionUrl);
  if (readyPendingTasks(spec).length) {
    throw new Error(`Drive stopped after ${maxIterations} swarm iterations with pending tasks remaining.`);
  }

  const collection = await collectSummary(config, notionUrl, spec, undefined, { uncollectedOnly: true, skipMissing: true });
  if (collection.reports.length) {
    printCollectReports(collection.reports, false);
    if (collection.overlaps.length) {
      console.log("Overlapping changed files detected:");
      for (const overlap of collection.overlaps) console.log(`  ${overlap.file}: ${overlap.taskIds.join(", ")}`);
    }

    const shouldApply = shouldDriveApply(autopilot, collection);
    if (shouldApply.apply) {
      await collect({ ntn: notionUrl, task: shouldApply.taskId, apply: true });
    } else {
      console.log(`Drive stopped before collection apply: ${shouldApply.reason}`);
      return;
    }
  } else {
    console.log("No uncollected worktree output found. Continuing to feedback checks.");
  }

  const refreshed = await loadSpec(config, notionUrl);
  const checks = await runFeedbackLoops(refreshed);
  for (const check of checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.command}: ${check.detail}`);
  }
  if (checks.some((check) => !check.ok)) {
    throw new Error("Drive feedback checks failed.");
  }

  await sync({ ntn: notionUrl });
  console.log("Drive complete.");
}

function shouldDriveApply(autopilot, collection) {
  if (!collection.reports.length) return { apply: false, reason: "no completed worktree-backed tasks found" };
  if (autopilot === "intern_mode") return { apply: false, reason: "intern_mode requires manual collection apply" };
  if (!collection.overlaps.length) {
    const latest = [...collection.reports].sort((a, b) => (b.task.order || 0) - (a.task.order || 0))[0];
    return { apply: true, taskId: latest.task.id };
  }
  if (collection.recommendation && (autopilot === "junior_mode" || autopilot === "boss_mode")) {
    return { apply: true, taskId: collection.recommendation.task.id };
  }
  return { apply: false, reason: "overlapping task outputs need manual choice" };
}

async function runFeedbackLoops(spec) {
  const repoContext = await scanRepo(spec.project);
  const commands = [...new Set([...(spec.feedbackLoops || []), ...(spec.repoContext?.feedbackLoops || []), ...(repoContext.detected.feedbackLoops || [])])]
    .map(normalizeFeedbackCommand)
    .filter(Boolean)
    .filter((command) => !command.toLowerCase().includes("manual"))
    .slice(0, 5);
  const selected = commands.length ? commands : ["npm test"];
  const results = [];
  for (const command of selected) {
    results.push(await runFeedbackCommand(spec.project, command));
  }
  return results;
}

async function runFeedbackCommand(projectDir, command) {
  try {
    const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], {
      cwd: projectDir,
      timeout: 120000,
      maxBuffer: 1024 * 1024
    });
    return { command, ok: true, detail: firstOutputLine(stdout || stderr || "passed") };
  } catch (error) {
    return { command, ok: false, detail: firstOutputLine(error.stdout || error.stderr || error.message) };
  }
}

function firstOutputLine(value) {
  return String(value || "").trim().split("\n").filter(Boolean).at(-1) || "no output";
}

function normalizeFeedbackCommand(command) {
  const value = String(command || "").trim();
  if (!value) return "";
  return value
    .replace(/\s+\([^)]*\)\s*$/s, "")
    .replace(/\s+-\s+.*$/s, "")
    .trim();
}

async function swarm(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const autopilot = optionalString(flags, "autopilot", config.defaultAutopilot);
  const permissionProfile = optionalString(flags, "permission-profile", config.permissionProfile || "inherit");
  const concurrency = Math.max(1, Number(optionalString(flags, "concurrency", "2")));
  const maxTasks = Math.max(1, Number(optionalString(flags, "max-tasks", String(concurrency))));
  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run `build_fast plan --goal ... --ntn ... --project ...` first.");

  const candidates = readyPendingTasks(spec).slice(0, maxTasks);
  if (!candidates.length) {
    console.log("No dependency-ready pending tasks found.");
    return;
  }

  const gitContext = await resolveGitContext(spec.project);
  const assignments = [];
  for (const task of candidates) {
    const assignment = buildWorktreeAssignment(spec, task, gitContext);
    await ensureWorktree(assignment);
    await overlayDependencyWorktrees(assignment);
    assignments.push(assignment);
    spec = updateTask(spec, task.id, {
      status: "in_progress",
      summary: `Swarm worker started in ${assignment.worktreeDir}`,
      lastResult: {
        branch: assignment.branch,
        worktree: assignment.worktreeDir,
        dependencyOverlays: assignment.dependencyOverlays
      }
    });
    await updateNotionTaskStatus(config, notionUrl, task, "In progress");
  }
  await saveSpec(config, notionUrl, spec);

  console.log(`Swarm starting ${assignments.length} task${assignments.length === 1 ? "" : "s"} with concurrency ${concurrency}.`);
  const results = await runWithConcurrency(assignments, concurrency, (assignment) =>
    runSwarmAssignment({ config, notionUrl, autopilot, permissionProfile, assignment })
  );

  let latest = await loadSpec(config, notionUrl);
  for (const result of results) {
    latest = updateTask(latest, result.task.id, {
      ...result.patch,
      lastResult: {
        ...(result.patch.lastResult || {}),
        branch: result.assignment.branch,
        worktree: result.assignment.worktreeDir,
        dependencyOverlays: result.assignment.dependencyOverlays
      }
    });
    await saveSpec(config, notionUrl, latest);
    await updateNotionAfterTask(config, notionUrl, latest, result.task, {
      ...result.patch,
      lastResult: {
        ...(result.patch.lastResult || {}),
        branch: result.assignment.branch,
        worktree: result.assignment.worktreeDir,
        dependencyOverlays: result.assignment.dependencyOverlays
      }
    });
  }

  console.log(`Swarm finished ${results.length} task${results.length === 1 ? "" : "s"}.`);
  for (const result of results) {
    console.log(`${result.task.id} ${result.patch.status}: ${result.patch.summary || ""}`);
  }
}

async function runSwarmAssignment({ config, notionUrl, autopilot, permissionProfile, assignment }) {
  const { task, workerProjectDir } = assignment;
  const { run, dir } = await createRun(config, notionUrl, task);
  const prompt = await renderPrompt("worker.md", {
    spec: {
      ...assignment.spec,
      project: workerProjectDir,
      swarm: {
        branch: assignment.branch,
        worktree: assignment.worktreeDir,
        originalProject: assignment.spec.project
      }
    },
    task: {
      ...task,
      branch: assignment.branch,
      worktree: assignment.worktreeDir
    },
    autopilot,
    permissionProfile
  });
  await savePrompt(dir, prompt);

  const result = await runClaude({
    config,
    prompt,
    projectDir: workerProjectDir,
    runDir: dir,
    autopilot,
    permissionProfile,
    onStart: ({ pid }) =>
      registerWorker(config, {
        runId: run.id,
        taskId: task.id,
        pid,
        status: "running",
        branch: assignment.branch,
        worktree: assignment.worktreeDir,
        startedAt: nowIso()
      })
  });

  await unregisterWorker(config, run.id);
  const patch = taskPatchFromResult(result);
  await finishRun(dir, { status: patch.status, result: result.parsed, exitCode: result.code, signal: result.signal });
  return { assignment, task, patch };
}

function readyPendingTasks(spec) {
  const completed = new Set((spec.tasks || []).filter((task) => task.status === "completed").map((task) => task.id));
  return [...(spec.tasks || [])]
    .sort((a, b) => a.order - b.order)
    .filter((task) => task.status === "pending" || task.status === "failed")
    .filter((task) => (task.dependencies || []).every((dependency) => completed.has(dependency)));
}

async function resolveGitContext(projectDir) {
  const root = await resolveGitRoot(projectDir);
  const head = await resolveGitHead(root);
  return {
    root,
    head,
    projectRelativePath: path.relative(root, projectDir)
  };
}

async function resolveGitRoot(projectDir) {
  try {
    return (await git(["-C", projectDir, "rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error(`Swarm requires a git repository. ${projectDir} is not inside a git work tree.`);
  }
}

async function resolveGitHead(root) {
  try {
    return (await git(["-C", root, "rev-parse", "--short", "HEAD"])).trim();
  } catch {
    throw new Error(
      [
        "Swarm requires the target repository to have at least one commit before git worktrees can be created.",
        `Repository: ${root}`,
        "Create an initial commit, then rerun the swarm command."
      ].join("\n")
    );
  }
}

function buildWorktreeAssignment(spec, task, gitContext) {
  const branch = `build-fast/${spec.slug}/${task.id}`;
  const worktreeDir = path.join(os.tmpdir(), "build_fast-worktrees", path.basename(gitContext.root), spec.slug, task.id);
  return {
    spec,
    task,
    branch,
    worktreeDir,
    workerProjectDir: path.join(worktreeDir, gitContext.projectRelativePath),
    gitRoot: gitContext.root,
    baseHead: gitContext.head,
    dependencyOverlays: []
  };
}

async function ensureWorktree(assignment) {
  if (await pathExists(assignment.worktreeDir)) return;
  await git(["-C", assignment.gitRoot, "worktree", "add", "-B", assignment.branch, assignment.worktreeDir, "HEAD"]);
}

async function overlayDependencyWorktrees(assignment) {
  const dependencies = dependencyTasksFor(assignment.spec, assignment.task);
  for (const dependency of dependencies) {
    const dependencyWorktree = dependency.lastResult?.worktree;
    if (!dependencyWorktree || !(await pathExists(dependencyWorktree))) continue;
    const files = await worktreeChangedFiles(dependencyWorktree);
    for (const file of files) {
      if (isUnsafeRelativePath(file)) {
        throw new Error(`Refusing to overlay unsafe dependency path from ${dependency.id}: ${file}`);
      }
      await cp(path.join(dependencyWorktree, file), path.join(assignment.worktreeDir, file), { recursive: true });
    }
    assignment.dependencyOverlays.push({
      taskId: dependency.id,
      worktree: dependencyWorktree,
      files
    });
  }
}

function dependencyTasksFor(spec, task) {
  const byId = new Map((spec.tasks || []).map((candidate) => [candidate.id, candidate]));
  return (task.dependencies || []).map((dependencyId) => byId.get(dependencyId)).filter(Boolean);
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { timeout: 30000 });
  return stdout;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

async function updateNotionSpecStatus(config, notionUrl, spec, status) {
  if (!config.notionToken || !spec.notion?.specPageId) return;
  try {
    const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
    await notion.updatePage(spec.notion.specPageId, { Status: notionStatus(status) });
  } catch (error) {
    console.warn(`WARN Notion spec status update skipped: ${error.message}`);
  }
}

async function updateNotionTaskStatus(config, notionUrl, task, status) {
  if (!config.notionToken || !task.notion?.taskPageId) return;
  try {
    const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
    await notion.updatePage(task.notion.taskPageId, { Status: notionStatus(status) });
  } catch (error) {
    console.warn(`WARN Notion task status update skipped: ${error.message}`);
  }
}

async function updateNotionAfterTask(config, notionUrl, spec, task, taskPatch) {
  if (!config.notionToken) return;
  const notionTaskStatus = taskPatch.status === "completed" ? "Done" : "In progress";
  await updateNotionTaskStatus(config, notionUrl, task, notionTaskStatus);

  if (task.notion?.taskPageId) {
    try {
      const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
      await notion.appendBlocks(task.notion.taskPageId, markdownBlocks(formatRunMarkdown(task, taskPatch)));
      await replaceManagedSection(notion, task.notion.taskPageId, "build_fast Task Snapshot", formatTaskSnapshotMarkdown({ ...task, ...taskPatch }));
    } catch (error) {
      console.warn(`WARN Notion task run summary skipped: ${error.message}`);
    }
  }

  const specStatus = spec.status === "completed" ? "Shipped" : taskPatch.status === "completed" ? "Building" : "Building";
  await updateNotionSpecStatus(config, notionUrl, spec, specStatus);
}

async function appendNotionSpecSnapshot(config, spec) {
  if (!config.notionToken || !spec.notion?.specPageId) return;
  try {
    const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
    await replaceManagedSection(notion, spec.notion.specPageId, "build_fast Sync Snapshot", formatSpecSnapshotMarkdown(spec));
  } catch (error) {
    console.warn(`WARN Notion spec snapshot skipped: ${error.message}`);
  }
}

function taskPatchFromResult(result) {
  const parsed = result.parsed || {};
  if (result.code !== 0) {
    return {
      status: "failed",
      summary: parsed.summary || result.stderr || "Claude worker exited with a non-zero status.",
      lastResult: parsed
    };
  }
  const status = ["completed", "blocked", "failed"].includes(parsed.status) ? parsed.status : "completed";
  return {
    status,
    summary: parsed.summary || parsed.result || "Worker completed.",
    lastResult: parsed
  };
}

async function status(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const spec = await loadSpec(config, notionUrl);
  const workers = await readActiveWorkers(config);
  if (!spec) {
    console.log("No local spec found.");
    return;
  }
  console.log(`${spec.title} [${spec.status}]`);
  for (const task of spec.tasks) {
    const collected = task.collectedAt ? " [collected]" : "";
    console.log(`${task.status.padEnd(10)} ${task.id} ${task.title}${collected}`);
  }
  if (workers.length) {
    console.log("\nActive workers:");
    for (const worker of workers) console.log(`${worker.runId} ${worker.taskId} ${worker.status}`);
  }
}

async function sync(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");

  const mode = optionalString(flags, "mode", "data-source");
  const result = mode === "blocks" ? await writeToNotion(config, notionUrl, formatSpecMarkdown(spec), { label: "spec sync", verbose: true }) : await syncToDataSources(config, notionUrl, spec);
  if (result.ok && result.spec) {
    spec = result.spec;
    await saveSpec(config, notionUrl, spec);
    console.log(`Synced ${spec.title} to Notion data sources`);
  } else if (result.ok) {
    console.log(`Synced ${spec.title} to Notion page ${result.pageId}`);
  } else {
    console.log(`Notion sync not completed: ${result.detail}`);
  }
}

async function compact(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");
  if (!config.notionToken) throw new Error("Missing NOTION_API_TOKEN.");

  const keepRuns = Math.max(0, Number(optionalString(flags, "keep-runs", "1")));
  const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
  let deleted = 0;
  let refreshed = 0;

  if (spec.notion?.specPageId) {
    await replaceManagedSection(notion, spec.notion.specPageId, "build_fast Sync Snapshot", formatSpecSnapshotMarkdown(spec));
    refreshed += 1;
  }

  for (const task of spec.tasks || []) {
    if (!task.notion?.taskPageId) continue;
    deleted += await compactTaskPageRuns(notion, task.notion.taskPageId, keepRuns);
    await replaceManagedSection(notion, task.notion.taskPageId, "build_fast Task Snapshot", formatTaskSnapshotMarkdown(task));
    refreshed += 1;
  }

  console.log(`Compacted ${deleted} old run section${deleted === 1 ? "" : "s"} and refreshed ${refreshed} snapshot page${refreshed === 1 ? "" : "s"}.`);
}

async function collect(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");

  const apply = flags.apply === true || flags.apply === "true";
  const force = flags.force === true || flags.force === "true";
  const taskFilter = optionalString(flags, "task", undefined);
  const projectRoot = await resolveGitRoot(spec.project);
  const { reports, overlaps, recommendation } = await collectSummary(config, notionUrl, spec, taskFilter);

  if (!reports.length) {
    console.log("No completed worktree-backed tasks found to collect.");
    return;
  }

  if (apply && overlaps.length && !taskFilter && !force) {
    printCollectReports(reports, false);
    throw new Error(
      [
        "Collect refused because multiple completed task worktrees changed the same file.",
        "Use --task <id> to apply one task, or rerun with --force to apply all in task order.",
        recommendation ? `Recommended: node bin/build_fast.js collect --ntn <page> --task ${recommendation.task.id} --apply` : null,
        "Overlaps:",
        ...overlaps.map((overlap) => `- ${overlap.file}: ${overlap.taskIds.join(", ")}`)
      ].filter(Boolean).join("\n")
    );
  }

  let nextSpec = spec;
  if (apply) {
    for (const report of reports) {
      await applyCollectReport({ report, projectRoot });
      nextSpec = updateTask(nextSpec, report.task.id, {
        collectedAt: nowIso(),
        collectedFiles: report.changedFiles
      });
    }
    await saveSpec(config, notionUrl, nextSpec);
  }

  printCollectReports(reports, apply);

  if (!apply) {
    console.log("Dry run only. Rerun with --apply to copy these files into the main checkout.");
    if (overlaps.length) {
      console.log("Overlapping changed files detected:");
      for (const overlap of overlaps) console.log(`  ${overlap.file}: ${overlap.taskIds.join(", ")}`);
      if (recommendation) {
        console.log(`Recommended integration task: ${recommendation.task.id} (${recommendation.reason})`);
        console.log(`Apply with: node bin/build_fast.js collect --ntn <page> --task ${recommendation.task.id} --apply`);
      }
    }
  }
}

async function collectSummary(config, notionUrl, spec, taskFilter = undefined, options = {}) {
  const tasks = (spec.tasks || [])
    .filter((task) => task.status === "completed")
    .filter((task) => !taskFilter || task.id === taskFilter)
    .filter((task) => !options.uncollectedOnly || !task.collectedAt)
    .filter((task) => task.lastResult?.worktree);
  const reports = [];
  for (const task of tasks) {
    if (options.skipMissing && !(await pathExists(task.lastResult.worktree))) continue;
    reports.push(await inspectCollectTask(task));
  }
  const overlaps = overlappingChangedFiles(reports);
  return {
    reports,
    overlaps,
    recommendation: collectRecommendation(reports, overlaps)
  };
}

async function cleanup(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");

  const apply = flags.apply === true || flags.apply === "true";
  const force = flags.force === true || flags.force === "true";
  const deleteBranches = flags.branches === true || flags.branches === "true";
  const taskFilter = optionalString(flags, "task", undefined);
  const gitRoot = await resolveGitRoot(spec.project);
  const targets = cleanupTargets(spec, taskFilter);

  if (!targets.length) {
    console.log("No recorded swarm worktrees found to clean up.");
    return;
  }

  for (const target of targets) {
    console.log(`${apply ? "removing" : "would remove"} ${target.taskId} worktree ${target.worktree}`);
    if (apply) {
      if (await pathExists(target.worktree)) {
        await removeWorktree(gitRoot, target.worktree, force);
      } else {
        await pruneWorktrees(gitRoot);
      }
    }
    if (deleteBranches && target.branch) {
      console.log(`${apply ? "deleting" : "would delete"} ${target.branch}`);
      if (apply) await deleteBranch(gitRoot, target.branch, force);
    }
  }

  if (!apply) {
    console.log("Dry run only. Rerun with --apply to remove worktrees.");
    if (deleteBranches) console.log("Branch deletion was requested and will also require --apply.");
  }
}

function cleanupTargets(spec, taskFilter) {
  return (spec.tasks || [])
    .filter((task) => !taskFilter || task.id === taskFilter)
    .map((task) => ({
      taskId: task.id,
      worktree: task.lastResult?.worktree,
      branch: task.lastResult?.branch
    }))
    .filter((target) => target.worktree);
}

async function removeWorktree(gitRoot, worktree, force) {
  const args = ["-C", gitRoot, "worktree", "remove"];
  if (force) args.push("--force");
  args.push(await canonicalPath(worktree));
  await git(args);
}

async function pruneWorktrees(gitRoot) {
  await git(["-C", gitRoot, "worktree", "prune"]);
}

async function deleteBranch(gitRoot, branch, force) {
  const existing = (await git(["-C", gitRoot, "branch", "--list", branch])).trim();
  if (!existing) return;
  await git(["-C", gitRoot, "branch", force ? "-D" : "-d", branch]);
}

async function canonicalPath(filePath) {
  try {
    return await realpath(filePath);
  } catch {
    return filePath;
  }
}

async function inspectCollectTask(task) {
  const worktree = task.lastResult.worktree;
  if (!(await pathExists(worktree))) {
    throw new Error(`Worktree for ${task.id} does not exist: ${worktree}`);
  }
  const changedFiles = await worktreeChangedFiles(worktree);
  for (const file of changedFiles) {
    if (isUnsafeRelativePath(file)) {
      throw new Error(`Refusing to collect unsafe path from ${task.id}: ${file}`);
    }
  }
  return { task, worktree, changedFiles };
}

async function applyCollectReport({ report, projectRoot }) {
  for (const file of report.changedFiles) {
    await cp(path.join(report.worktree, file), path.join(projectRoot, file), { recursive: true });
  }
}

function printCollectReports(reports, apply) {
  for (const report of reports) {
    console.log(`${report.task.id} ${report.changedFiles.length} changed file${report.changedFiles.length === 1 ? "" : "s"} from ${report.worktree}`);
    for (const file of report.changedFiles) console.log(`  ${apply ? "applied" : "would apply"} ${file}`);
  }
}

function overlappingChangedFiles(reports) {
  const byFile = new Map();
  for (const report of reports) {
    for (const file of report.changedFiles) {
      const taskIds = byFile.get(file) || [];
      taskIds.push(report.task.id);
      byFile.set(file, taskIds);
    }
  }
  return [...byFile.entries()]
    .filter(([, taskIds]) => taskIds.length > 1)
    .map(([file, taskIds]) => ({ file, taskIds }));
}

function collectRecommendation(reports, overlaps) {
  if (!reports.length) return null;
  const overlappedFiles = new Set(overlaps.map((overlap) => overlap.file));
  const candidates = reports
    .filter((report) => {
      if (!overlappedFiles.size) return true;
      const files = new Set(report.changedFiles);
      return [...overlappedFiles].every((file) => files.has(file));
    })
    .sort((a, b) => {
      const dependencyDelta = (b.task.lastResult?.dependencyOverlays?.length || 0) - (a.task.lastResult?.dependencyOverlays?.length || 0);
      if (dependencyDelta !== 0) return dependencyDelta;
      const orderDelta = (b.task.order || 0) - (a.task.order || 0);
      if (orderDelta !== 0) return orderDelta;
      return b.changedFiles.length - a.changedFiles.length;
    });
  const report = candidates[0] || [...reports].sort((a, b) => (b.task.order || 0) - (a.task.order || 0))[0];
  if (!report) return null;
  const reason = overlappedFiles.size
    ? "it contains every overlapped file and is latest in the dependency chain"
    : "it is the latest completed worktree-backed task";
  return { task: report.task, reason };
}

async function worktreeChangedFiles(worktree) {
  const output = await git(["-C", worktree, "status", "--short"]);
  return output
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3).split(" -> ").pop())
    .filter(Boolean);
}

function isUnsafeRelativePath(filePath) {
  return path.isAbsolute(filePath) || filePath.split(/[\\/]/).includes("..");
}

async function syncToDataSources(config, notionUrl, spec) {
  if (!config.notionToken) return { ok: false, detail: "missing NOTION_API_TOKEN" };
  const schema = await loadOrInspectSchema(config, notionUrl);
  const mapping = resolveBuildFastDataSources(schema);
  if (!mapping.specs || !mapping.specTasks) {
    return { ok: false, detail: "could not find required Specs and Spec Tasks data sources" };
  }

  const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
  let nextSpec = spec;
  let specPageId = spec.notion?.specPageId;

  if (!specPageId) {
    const existingPage = await findExistingSpecPage(notion, mapping.specs.id, spec);
    const page = existingPage || await notion.createDataSourcePage(mapping.specs.id, buildSpecProperties(spec, mapping.specs), markdownBlocks(formatSpecMarkdown(spec)));
    nextSpec = attachNotionSpecPage(nextSpec, page);
    specPageId = page.id;
  } else {
    await notion.updatePage(specPageId, buildSpecProperties(spec, mapping.specs));
    await replaceManagedSection(notion, specPageId, "build_fast Sync Snapshot", formatSpecSnapshotMarkdown(spec));
  }

  for (const task of nextSpec.tasks) {
    if (task.notion?.taskPageId) {
      await notion.updatePage(task.notion.taskPageId, buildTaskProperties(task, mapping.specTasks, specPageId));
      await replaceManagedSection(notion, task.notion.taskPageId, "build_fast Task Snapshot", formatTaskSnapshotMarkdown(task));
      continue;
    }
    const existingTaskPage = await findExistingTaskPage(notion, mapping.specTasks.id, task, specPageId);
    const page = existingTaskPage || await notion.createDataSourcePage(mapping.specTasks.id, buildTaskProperties(task, mapping.specTasks, specPageId), markdownBlocks(formatTaskMarkdown(task)));
    nextSpec = attachNotionTaskPage(nextSpec, task.id, page);
  }

  return { ok: true, spec: nextSpec };
}

async function findExistingSpecPage(notion, dataSourceId, spec) {
  const response = await notion.queryDataSource(dataSourceId, {
    page_size: 10,
    filter: {
      and: [
        { property: "Name", title: { equals: spec.title } },
        { property: "Project", rich_text: { equals: spec.project } }
      ]
    }
  });
  return firstMatchingTitle(response.results, spec.title);
}

async function findExistingTaskPage(notion, dataSourceId, task, specPageId) {
  const response = await notion.queryDataSource(dataSourceId, {
    page_size: 10,
    filter: {
      and: [
        { property: "Name", title: { equals: task.title } },
        { property: "Spec", relation: { contains: specPageId } }
      ]
    }
  });
  return firstMatchingTitle(response.results, task.title);
}

function firstMatchingTitle(pages = [], title) {
  return pages.find((page) => pageTitle(page) === title);
}

async function loadOrInspectSchema(config, notionUrl) {
  const pageId = parseNotionId(notionUrl);
  const inspectPath = path.join(process.cwd(), ".build_fast", "notion-inspect", `${pageId}.json`);
  const existing = await readJson(inspectPath, undefined);
  if (existing?.databases?.length) return existing;
  const inspected = await inspectNotionPage(config, notionUrl);
  if (!inspected.ok) throw new Error(inspected.detail);
  await writeJson(inspectPath, inspected);
  return inspected;
}

function resolveBuildFastDataSources(schema) {
  const sources = [];
  for (const database of schema.databases || []) {
    for (const source of database.dataSources || []) {
      sources.push({ ...source, databaseTitle: database.title });
    }
  }
  return {
    specs: sources.find((source) => source.title === "Specs" && hasProperties(source, ["Name", "Status", "Project"])),
    specTasks: sources.find((source) => source.title === "Spec Tasks" && hasProperties(source, ["Name", "Status", "Spec", "Branch"]))
  };
}

function hasProperties(source, names) {
  return names.every((name) => source.properties?.[name]);
}

function buildSpecProperties(spec) {
  const status = spec.status === "completed" ? "Shipped" : spec.status === "planned" ? "Draft" : "Building";
  return cleanProperties({
    Name: notionTitle(spec.title),
    Status: notionStatus(status),
    Project: notionRichText(spec.project),
    "GitHub Repo": notionUrl("")
  });
}

function buildTaskProperties(task, dataSource, specPageId) {
  const status = task.status === "completed" ? "Done" : task.status === "pending" ? "Not started" : "In progress";
  return cleanProperties({
    Name: notionTitle(task.title),
    Status: notionStatus(status),
    Spec: notionRelation([specPageId]),
    Branch: notionRichText(task.lastResult?.branch || "")
  }, dataSource.properties);
}

function cleanProperties(properties, schema = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([name, value]) => {
      if (schema[name] === undefined && Object.keys(schema).length > 0) return false;
      if (value.url === "") return false;
      return true;
    })
  );
}

function formatTaskMarkdown(task) {
  return [
    `# ${task.id}: ${task.title}`,
    "## Objective",
    task.objective || "No objective recorded.",
    "## Instructions",
    task.instructions || "No instructions recorded.",
    "## Acceptance Criteria",
    (task.acceptanceCriteria || []).map((item) => `- ${item}`).join("\n") || "- Not specified.",
    "## Test Plan",
    (task.testPlan || []).map((item) => `- ${item}`).join("\n") || "- Not specified."
  ].join("\n\n");
}

function formatSpecSnapshotMarkdown(spec) {
  return [
    `## build_fast Sync Snapshot`,
    `Updated: ${nowIso()}`,
    `Status: ${spec.status}`,
    "## Goal",
    spec.goal,
    "## Current Tasks",
    (spec.tasks || []).map((task) => `- ${task.status}: ${task.id} ${task.title}`).join("\n") || "- No tasks."
  ].join("\n\n");
}

function formatTaskSnapshotMarkdown(task) {
  return [
    `## build_fast Task Snapshot`,
    `Updated: ${nowIso()}`,
    `Status: ${task.status}`,
    "## Objective",
    task.objective || "No objective recorded.",
    "## Latest Summary",
    task.summary || task.lastResult?.summary || "No run summary recorded yet.",
    "## Test Result",
    task.lastResult?.test_result || "not_run"
  ].join("\n\n");
}

async function replaceManagedSection(notion, pageId, heading, markdown) {
  const children = await notion.listBlockChildren(pageId);
  const blocksToDelete = uniqueBlocks([
    ...collectManagedSectionBlocks(children, heading),
    ...collectLegacyOrphanSnapshotBlocks(children, heading)
  ]);
  for (const block of blocksToDelete.reverse()) {
    await notion.deleteBlock(block.id);
  }
  await notion.appendBlocks(pageId, markdownBlocks(markdown));
}

async function compactTaskPageRuns(notion, pageId, keepRuns) {
  const children = await notion.listBlockChildren(pageId);
  const sections = collectRunSections(children);
  const sectionsToDelete = sections.slice(0, Math.max(0, sections.length - keepRuns)).flat();
  for (const block of sectionsToDelete.reverse()) {
    await notion.deleteBlock(block.id);
  }
  return sectionsToDelete.filter((block) => blockTitle(block).startsWith("build_fast Run:")).length;
}

function collectRunSections(blocks) {
  const sections = [];
  let current = null;

  for (const block of blocks) {
    if (isSectionHeading(block)) {
      const title = blockTitle(block);
      if (title.startsWith("build_fast Run:")) {
        if (current) sections.push(current);
        current = [block];
        continue;
      }
      if (current && (block.type === "heading_1" || title === "build_fast Task Snapshot")) {
        sections.push(current);
        current = null;
        continue;
      }
    }

    if (current) current.push(block);
  }

  if (current) sections.push(current);
  return sections;
}

function collectManagedSectionBlocks(blocks, heading) {
  const matches = [];
  let collecting = false;

  for (const block of blocks) {
    if (isSectionHeading(block)) {
      const title = blockTitle(block);
      if (title === heading) {
        collecting = true;
        matches.push(block);
        continue;
      }
      if (collecting && isManagedSectionBoundary(block, title, heading)) {
        collecting = false;
        continue;
      }
    }

    if (collecting) {
      matches.push(block);
    }
  }

  return matches;
}

function collectLegacyOrphanSnapshotBlocks(blocks, heading) {
  if (heading !== "build_fast Task Snapshot") return [];

  const matches = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!isSectionHeading(block) || blockTitle(block) !== "Objective") continue;

    const lookahead = blocks.slice(index, index + 8).map(blockTitle);
    if (!lookahead.includes("Latest Summary") || !lookahead.includes("Test Result")) continue;

    for (let cursor = index; cursor < blocks.length; cursor += 1) {
      const candidate = blocks[cursor];
      if (cursor !== index && isSectionHeading(candidate)) {
        const title = blockTitle(candidate);
        if (title === "build_fast Task Snapshot" || title.startsWith("build_fast Run:")) break;
        if (title === "Objective") break;
      }
      matches.push(candidate);
    }
  }
  return matches;
}

function isManagedSectionBoundary(block, title, currentHeading) {
  if (block.type === "heading_1") return true;
  if (title === currentHeading) return false;
  return title.startsWith("build_fast ");
}

function uniqueBlocks(blocks) {
  const seen = new Set();
  return blocks.filter((block) => {
    if (seen.has(block.id)) return false;
    seen.add(block.id);
    return true;
  });
}

function isSectionHeading(block) {
  return block.type === "heading_1" || block.type === "heading_2";
}

function blockTitle(block) {
  const value = block[block.type];
  return (value?.rich_text || []).map((part) => part.plain_text || part.text?.content || "").join("");
}

async function inspect(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const result = await inspectNotionPage(config, notionUrl);
  if (!result.ok) {
    console.log(`Notion inspect not completed: ${result.detail}`);
    return;
  }

  const outputPath = path.join(process.cwd(), ".build_fast", "notion-inspect", `${result.pageId}.json`);
  await writeJson(outputPath, result);

  console.log(`Notion page: ${result.pageId}`);
  console.log(`URL: ${result.page.url}`);
  console.log(`Child databases: ${result.databases.length}`);
  for (const database of result.databases) {
    console.log(`\n- ${database.title}`);
    console.log(`  id: ${database.id}`);
    if (database.error) {
      console.log(`  error: ${database.error}`);
      if (database.legacyError) console.log(`  legacy error: ${database.legacyError}`);
      continue;
    }
    if (database.dataSources?.length) {
      for (const source of database.dataSources) {
        console.log(`  data source: ${source.title}`);
        console.log(`    id: ${source.id}`);
        if (source.error) {
          console.log(`    error: ${source.error}`);
          continue;
        }
        printProperties(source.properties, "    ");
      }
    } else {
      if (database.dataSourceError) console.log(`  data source API: ${database.dataSourceError}`);
      printProperties(database.properties, "  ");
    }
  }
  console.log(`\nWrote ${outputPath}`);
}

function printProperties(properties = {}, indent = "") {
  for (const [name, property] of Object.entries(properties)) {
    const options = property.options?.length ? ` [${property.options.join(", ")}]` : "";
    console.log(`${indent}${name}: ${property.type}${options}`);
  }
}

async function stop(flags) {
  const config = await loadConfig();
  const workers = await readActiveWorkers(config);
  if (!workers.length) {
    console.log("No active workers recorded.");
    return;
  }
  for (const worker of workers) {
    if (!worker.pid) continue;
    try {
      process.kill(worker.pid, "SIGTERM");
      console.log(`Sent SIGTERM to ${worker.pid}`);
    } catch (error) {
      console.log(`Could not stop ${worker.pid}: ${error.message}`);
    }
  }
  await writeActiveWorkers(config, []);
}

async function review(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const reviewType = optionalString(flags, "type", "pr_readiness");
  const spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");

  const { run, dir } = await createRun(config, notionUrl, { id: `review-${reviewType}` });
  const prompt = await renderPrompt("review.md", { spec, reviewType });
  await savePrompt(dir, prompt);
  const result = await runClaude({
    config,
    prompt,
    projectDir: spec.project,
    runDir: dir,
    autopilot: "intern_mode",
    permissionProfile: "inherit"
  });
  await finishRun(dir, { status: result.code === 0 ? "completed" : "failed", result: result.parsed, exitCode: result.code });
  await writeToNotion(config, notionUrl, `## build_fast Review: ${reviewType}\n\n${result.parsed?.summary || result.stdout || result.stderr}`, { label: `review ${reviewType}` });
  console.log(result.parsed?.summary || result.stdout || result.stderr);
}

async function writeToNotion(config, notionUrl, markdown, options = {}) {
  const pageId = parseNotionId(notionUrl);
  if (!pageId) return { ok: false, pageId: null, detail: "could not parse Notion page ID" };
  if (!config.notionToken) {
    const detail = "missing NOTION_API_TOKEN";
    if (options.verbose) console.warn(`WARN Notion ${options.label || "write"} skipped: ${detail}`);
    return { ok: false, pageId, detail };
  }
  const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
  try {
    await notion.appendBlocks(pageId, markdownBlocks(markdown));
    return { ok: true, pageId, detail: "appended blocks" };
  } catch (error) {
    console.warn(`WARN Notion update skipped: ${error.message}`);
    return { ok: false, pageId, detail: error.message };
  }
}

function formatSpecMarkdown(spec) {
  const riskLines = spec.risks?.length ? spec.risks.map((risk) => `- ${risk}`).join("\n") : "- None recorded yet.";
  const feedbackLines = spec.feedbackLoops?.length ? spec.feedbackLoops.map((loop) => `- ${loop}`).join("\n") : "- Project-specific checks will be discovered during execution.";
  const taskLines = spec.tasks
    .map((task) => [
      `- [ ] ${task.id}: ${task.title}`,
      `Objective: ${task.objective}`,
      `Acceptance: ${(task.acceptanceCriteria || []).join("; ") || "Not specified."}`,
      `Tests: ${(task.testPlan || []).join("; ") || "Not specified."}`
    ].join("\n"))
    .join("\n");

  return [
    `# build_fast Spec: ${spec.title}`,
    `Status: ${spec.status}`,
    `Type: ${spec.type}`,
    `Project: ${spec.project}`,
    `Created: ${spec.createdAt}`,
    "## Goal",
    spec.goal,
    "## Overview",
    spec.overview || "No overview recorded.",
    "## Risks",
    riskLines,
    "## Feedback Loops",
    feedbackLines,
    "## Tasks",
    taskLines
  ].join("\n\n");
}

function formatRunMarkdown(task, taskPatch) {
  const result = taskPatch.lastResult || {};
  const changedFiles = result.changed_files?.length ? result.changed_files.map((file) => `- ${file}`).join("\n") : "- None reported.";
  const tests = result.tests_run?.length ? result.tests_run.map((test) => `- ${test}`).join("\n") : "- None reported.";
  const blockers = result.blockers?.length ? result.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None.";

  return [
    `## build_fast Run: ${task.id}`,
    `Task: ${task.title}`,
    `Status: ${taskPatch.status}`,
    `Updated: ${nowIso()}`,
    "## Summary",
    taskPatch.summary || "No summary.",
    "## Changed Files",
    changedFiles,
    "## Tests Run",
    tests,
    `Test Result: ${result.test_result || "unknown"}`,
    "## Blockers",
    blockers
  ].join("\n\n");
}

async function registerWorker(config, worker) {
  const workers = await readActiveWorkers(config);
  await writeActiveWorkers(config, [...workers, worker]);
}

async function unregisterWorker(config, runId) {
  const workers = await readActiveWorkers(config);
  await writeActiveWorkers(config, workers.filter((worker) => worker.runId !== runId));
}
