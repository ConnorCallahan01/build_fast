import { execFile, spawn } from "node:child_process";
import { cp, mkdir, rm, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { loadConfig, ensureConfig } from "./config.js";
import { runClaude } from "./claude.js";
import { makeSpec, loadSpec, saveSpec, specDir, createRun, finishRun, savePrompt, nextPendingTask, updateTask, readActiveWorkers, writeActiveWorkers, attachNotionSpecPage, attachNotionTaskPage, isMultiSpecType, makeProgram, loadProgram, saveProgram, readyProgramSpecs, programToStandaloneSpec, updateProgramSpec } from "./ledger.js";
import { checkNotionPage, inspectNotionPage, markdownBlocks, NotionClient, parseNotionId, pageTitle, notionRelation, notionRichText, notionStatus, notionTitle, notionUrl } from "./notion.js";
import { renderPrompt } from "./prompts.js";
import { scanRepo } from "./repo-scan.js";
import { normalizeProject, nowIso, optionalString, pathExists, printHelp, readJson, requireFlag, writeJson } from "./util.js";

const execFileAsync = promisify(execFile);

export async function dispatch(command, flags) {
  switch (command) {
    case "doctor":
      return doctor(flags);
    case "goal":
      return goal(flags);
    case "program":
      return program(flags);
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
    case "qa":
      return qa(flags);
    case "bugs":
      return bugs(flags);
    case "ship":
      return ship(flags);
    case "workers":
      return workers(flags);
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

async function goal(flags) {
  const config = await ensureConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const rawGoal = requireFlag(flags, "goal");
  const type = optionalString(flags, "type", "feature");
  const project = normalizeProject(optionalString(flags, "project", process.cwd()));
  const repoContext = await scanRepo(project);
  const intake = await collectGoalIntake({ flags, rawGoal, type, project, repoContext });
  const shapedGoal = formatGoalWithIntake(rawGoal, intake);

  let contract;
  if (flags["no-agent"]) {
    contract = normalizeGoalContract(null, shapedGoal, repoContext);
  } else {
    const prompt = await renderPrompt("goal.md", { goal: shapedGoal, type, project, notionUrl, repoContext, intake });
    const runDir = path.join(process.cwd(), ".build_fast", "goals", `${Date.now()}`);
    await writeJson(path.join(runDir, "repo-context.json"), repoContext);
    const result = await runClaude({
      config,
      prompt,
      projectDir: project,
      runDir,
      autopilot: "intern_mode",
      permissionProfile: "inherit"
    });
    contract = normalizeGoalContract(result.parsed, shapedGoal, repoContext);
  }

  const saved = {
    ...contract,
    rawGoal,
    intake,
    type,
    project,
    notionUrl,
    createdAt: nowIso(),
    repoContext: {
      gitRoot: repoContext.gitRoot,
      projectRelativePath: normalizeProjectSubdir(repoContext.projectRelativePath),
      feedbackLoops: repoContext.detected.feedbackLoops,
      scannedAt: nowIso()
    }
  };
  const finalContract = await confirmGoalContract(saved, flags);
  if (!finalContract) {
    console.log("Goal contract cancelled.");
    return;
  }
  await writeJson(goalPath(config, notionUrl), finalContract);
  console.log(`\nSaved goal contract: ${path.relative(process.cwd(), goalPath(config, notionUrl))}`);
  console.log(`Run it with: node bin/build_fast.js drive --ntn <page> --from-goal --autopilot junior_mode --permission-profile managed`);
}

async function program(flags) {
  if (flags.drive || flags.go || flags.run) {
    return drive({ ...flags, type: optionalString(flags, "type", "project") });
  }
  return plan({ ...flags, type: optionalString(flags, "type", "project") });
}

async function collectGoalIntake({ flags, rawGoal, type, project, repoContext }) {
  if (flags["skip-questions"] || flags.yes || flags.y || flags["non-interactive"] || flags["no-interactive"]) return [];
  if (!process.stdin.isTTY || !process.stdout.isTTY) return [];

  const questions = goalIntakeQuestions(type, repoContext).slice(0, 5);
  if (!questions.length) return [];

  console.log("\nGoal intake questions");
  console.log("Press Enter to skip a question.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];
  try {
    for (const question of questions) {
      const answer = (await rl.question(`${question} `)).trim();
      if (answer) answers.push({ question, answer });
    }
  } finally {
    rl.close();
  }
  return answers;
}

function goalIntakeQuestions(type, repoContext) {
  const normalizedType = String(type || "feature").toLowerCase();
  const checks = repoContext?.detected?.feedbackLoops?.length ? repoContext.detected.feedbackLoops.join(", ") : "the project checks";
  const common = [
    "What should be explicitly out of scope?",
    `What command or behavior proves this is done? Detected checks: ${checks}.`
  ];
  if (normalizedType === "bug") {
    return [
      "What is the expected behavior?",
      "What is the actual broken behavior?",
      "What reproduction steps or failing case should the agent use?",
      ...common
    ];
  }
  if (normalizedType === "refactor") {
    return [
      "What behavior must remain unchanged?",
      "What code areas should be targeted?",
      "What code areas should not be touched?",
      ...common
    ];
  }
  if (isMultiSpecType(normalizedType)) {
    return [
      "What is the smallest useful first phase?",
      "What milestones or phases do you already have in mind?",
      "Should the CLI pause for approval between phases?",
      ...common
    ];
  }
  return [
    "Who or what is the primary user of this change?",
    "What is the most important visible behavior to add or change?",
    "Are there any edge cases the agents must handle?",
    ...common
  ];
}

function formatGoalWithIntake(rawGoal, intake = []) {
  if (!intake.length) return rawGoal;
  return [
    rawGoal,
    "",
    "User clarification answers:",
    ...intake.map((item) => `- ${item.question} ${item.answer}`)
  ].join("\n");
}

async function confirmGoalContract(contract, flags) {
  printGoalContract(contract);
  if (!shouldPrompt(flags)) return contract;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      printGoalActions();
      const answer = (await rl.question("Choose an action [a/e/q]: ")).trim().toLowerCase();
      if (!answer || answer === "a" || answer === "approve" || answer === "y" || answer === "yes") {
        return { ...contract, approvedAt: nowIso() };
      }
      if (answer === "q" || answer === "quit" || answer === "cancel") return null;
      if (answer === "e" || answer === "edit") {
        contract = await editGoalContract(rl, contract);
        printGoalContract(contract);
      } else {
        console.log("Please choose approve, edit, or quit.");
      }
    }
  } finally {
    rl.close();
  }
}

function printGoalActions() {
  console.log("\nGoal contract actions:");
  console.log("  a  approve and save");
  console.log("  e  edit/refine");
  console.log("  q  quit without saving");
}

function shouldPrompt(flags) {
  if (flags.yes || flags.y || flags["non-interactive"] || flags["no-interactive"]) return false;
  if (flags.interactive) return true;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function editGoalContract(rl, contract) {
  let next = contract;
  while (true) {
    printEditActions();
    const action = (await rl.question("Choose edit [1-6]: ")).trim().toLowerCase();
    if (!action || action === "6" || action === "d" || action === "done") return { ...next, revisedAt: nowIso() };
    if (action === "1") {
      const note = await askRequired(rl, "Refinement to add to final goal");
      next = {
        ...next,
        finalGoal: `${next.finalGoal} Additional requirement: ${note}`,
        targetChanges: appendIfPresent(next.targetChanges, note)
      };
    } else if (action === "2") {
      next = { ...next, finalGoal: await askRequired(rl, "Rewrite final goal") };
    } else if (action === "3") {
      next = { ...next, targetChanges: appendIfPresent(next.targetChanges, await askRequired(rl, "Target change to add")) };
    } else if (action === "4") {
      next = { ...next, acceptanceCriteria: appendIfPresent(next.acceptanceCriteria, await askRequired(rl, "Acceptance criterion to add")) };
    } else if (action === "5") {
      next = { ...next, outOfScope: appendIfPresent(next.outOfScope, await askRequired(rl, "Out-of-scope note to add")) };
    } else {
      console.log("Choose 1, 2, 3, 4, 5, or 6.");
    }
  }
}

function printEditActions() {
  console.log("\nEdit goal contract:");
  console.log("  1  add refinement to final goal");
  console.log("  2  rewrite final goal");
  console.log("  3  add target change");
  console.log("  4  add acceptance criterion");
  console.log("  5  add out-of-scope note");
  console.log("  6  done editing");
}

async function askRequired(rl, label) {
  while (true) {
    const answer = (await rl.question(`${label}: `)).trim();
    if (answer) return answer;
    console.log("Enter a value, or choose done from the edit menu.");
  }
}

function appendIfPresent(items = [], value) {
  return value ? [...items, value] : items;
}

function normalizeGoalContract(parsed, rawGoal, repoContext) {
  const source = parsed?.structured_output || parsed || {};
  return {
    finalGoal: source.finalGoal || rawGoal,
    intent: source.intent || `Implement: ${rawGoal}`,
    targetChanges: source.targetChanges || ["Implement the requested behavior in the target project."],
    acceptanceCriteria: source.acceptanceCriteria || (repoContext?.detected?.feedbackLoops || ["Relevant checks pass."]),
    outOfScope: source.outOfScope || [],
    assumptions: source.assumptions || [],
    questions: source.questions || [],
    riskLevel: ["low", "medium", "high"].includes(source.riskLevel) ? source.riskLevel : "medium"
  };
}

function printGoalContract(contract) {
  console.log(`Goal Contract`);
  console.log(`Final goal: ${contract.finalGoal}`);
  console.log(`Intent: ${contract.intent}`);
  console.log(`Risk: ${contract.riskLevel}`);
  printList("Target changes", contract.targetChanges);
  printList("Acceptance criteria", contract.acceptanceCriteria);
  printList("Out of scope", contract.outOfScope);
  printList("Assumptions", contract.assumptions);
  printList("Questions", contract.questions);
}

function printList(label, items = []) {
  if (!items.length) return;
  console.log(`\n${label}:`);
  for (const item of items) console.log(`- ${item}`);
}

function goalPath(config, notionUrl) {
  return path.join(specDir(config, notionUrl), "goal.json");
}

async function loadGoalContract(config, notionUrl) {
  return readJson(goalPath(config, notionUrl), undefined);
}

async function plan(flags) {
  const config = await ensureConfig();
  validateWorkerFlag(flags);
  const notionUrl = requireFlag(flags, "ntn");
  const type = optionalString(flags, "type", "feature");
  const project = normalizeProject(optionalString(flags, "project", process.cwd()));

  if (isMultiSpecType(type)) return planProgram({ config, notionUrl, type, project, flags });

  const existing = await loadSpec(config, notionUrl);
  const goal = optionalString(flags, "goal", existing?.goal);
  if (!goal) throw new Error("Missing required flag: --goal");
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
    projectRelativePath: normalizeProjectSubdir(repoContext.projectRelativePath),
    feedbackLoops: repoContext.detected.feedbackLoops,
    scannedAt: nowIso()
  };
  await saveSpec(config, notionUrl, spec);

  await writeToNotion(config, notionUrl, formatSpecMarkdown(spec), { label: "spec" });

  console.log(`Planned ${spec.tasks.length} tasks for: ${spec.title}`);
  console.log(`Local spec: .build_fast/specs/${spec.id}/spec.json`);
}

async function planProgram({ config, notionUrl, type, project, flags }) {
  const existing = await loadProgram(config, notionUrl);
  const goal = optionalString(flags, "goal", existing?.goal);
  if (!goal) throw new Error("Missing required flag: --goal");

  const repoContext = await scanRepo(project);
  let generated;
  if (flags["no-agent"]) {
    generated = normalizeProgramPlan(null, goal, repoContext);
  } else {
    const prompt = await renderPrompt("multi-spec.md", { goal, type, project, notionUrl, repoContext });
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
    generated = normalizeProgramPlan(result.parsed, goal, repoContext);
  }

  const program = makeProgram({ goal, type, project, notionUrl, plan: generated });
  await saveProgram(config, notionUrl, program);

  console.log(`Planned ${program.specs.length} specs for: ${program.title}`);
  for (const spec of program.specs) {
    const depLabel = spec.dependencies.length ? ` (depends: ${spec.dependencies.join(", ")})` : "";
    console.log(`  ${spec.id}: ${spec.title} — ${spec.tasks.length} tasks${depLabel}`);
  }
  console.log(`Local program: .build_fast/specs/${program.id}/program/program.json`);
}

function normalizeProgramPlan(parsed, goal, repoContext = undefined) {
  const source = parsed?.structured_output || parsed;
  if (source?.specs?.length) return source;
  const feedbackLoops = repoContext?.detected?.feedbackLoops?.length ? repoContext.detected.feedbackLoops : ["npm test"];
  return {
    title: goal.slice(0, 80),
    overview: `Implement: ${goal}`,
    risks: [],
    feedbackLoops,
    specs: [
      {
        id: "spec-001",
        title: "Full implementation",
        overview: goal,
        dependencies: [],
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
      }
    ]
  };
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
  validateWorkerFlag(flags);
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
  validateWorkerFlag(flags);
  const notionUrl = requireFlag(flags, "ntn");
  const autopilot = optionalString(flags, "autopilot", "junior_mode");
  const permissionProfile = optionalString(flags, "permission-profile", "managed");
  const concurrency = optionalString(flags, "concurrency", "2");
  const maxTasks = optionalString(flags, "max-tasks", concurrency);
  const parallel = optionalString(flags, "parallel", "default");

  let config = await ensureConfig();
  const goalContract = flags["from-goal"] ? await loadGoalContract(config, notionUrl) : undefined;
  if (flags["from-goal"] && !goalContract) throw new Error("No saved goal contract found. Run `build_fast goal --goal ... --ntn ... --project ...` first.");

  const requestedGoal = goalContract?.finalGoal || optionalString(flags, "goal", undefined);
  const type = goalContract?.type || optionalString(flags, "type", "feature");

  const existingProgram = await loadProgram(config, notionUrl);
  if (isMultiSpecType(type) || existingProgram) {
    return driveProgram({ config, notionUrl, goal: requestedGoal, type: existingProgram?.type || type, goalContract, flags, autopilot, permissionProfile, concurrency, maxTasks });
  }

  let spec = await loadSpec(config, notionUrl);
  if (!spec || (requestedGoal && requestedGoal !== spec.goal)) {
    if (!requestedGoal) throw new Error("No local spec found. Pass --goal, use --from-goal, or run plan first.");
    await plan({
      ...flags,
      goal: requestedGoal,
      project: goalContract?.project || flags.project,
      type
    });
    config = await loadConfig();
    spec = await loadSpec(config, notionUrl);
  }

  await sync({ ntn: notionUrl });
  if (flags["no-agent"]) {
    console.log("Drive no-agent smoke complete after plan/sync.");
    return;
  }

  let iterations = 0;
  const maxIterations = Math.max(1, Number(optionalString(flags, "max-iterations", "20")));
  while (iterations < maxIterations) {
    spec = await loadSpec(config, notionUrl);
    const pending = readyPendingTasks(spec);
    if (!pending.length) break;
    await swarm({ ntn: notionUrl, autopilot, "permission-profile": permissionProfile, concurrency, "max-tasks": maxTasks, parallel });
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
    if (parallel === "smart" && collection.overlaps.length) {
      const integrated = addParallelIntegrationTask(spec, collection);
      if (integrated) {
        await saveSpec(config, notionUrl, integrated);
        console.log(`Created ${integrated.tasks.at(-1).id} to integrate overlapping parallel outputs. Rerun drive to continue.`);
        await sync({ ntn: notionUrl });
        return;
      }
    }

    const shouldApply = shouldDriveApply(autopilot, collection);
    if (shouldApply.apply) {
      console.log(`Drive applying ${shouldApply.taskId}: ${shouldApply.reason}`);
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
    const repaired = await addFeedbackBugAndRepair(config, notionUrl, refreshed, checks, flags);
    if (repaired) {
      await saveSpec(config, notionUrl, repaired);
      console.log(`Created ${repaired.tasks.at(-1).id} to repair failed feedback checks. Rerun drive to continue.`);
      await sync({ ntn: notionUrl });
      return;
    }
    throw new Error("Drive feedback checks failed.");
  }

  if (await runDriveQaFinalPass({ config, notionUrl, target: refreshed, flags, autopilot, permissionProfile, concurrency, maxTasks })) return;

  await sync({ ntn: notionUrl });
  console.log("Drive complete.");
}

async function driveProgram({ config, notionUrl, goal, type, goalContract, flags, autopilot, permissionProfile, concurrency, maxTasks }) {
  let program = await loadProgram(config, notionUrl);
  if (!program || (goal && goal !== program.goal)) {
    if (!goal) throw new Error("No local program found. Pass --goal, use --from-goal, or run plan first.");
    await plan({
      ...flags,
      goal,
      project: goalContract?.project || flags.project,
      type
    });
    config = await loadConfig();
    program = await loadProgram(config, notionUrl);
  }

  const completedAtStart = programComplete(program);
  if (!completedAtStart) await syncProgram({ config, notionUrl, program });
  if (flags["no-agent"]) {
    console.log("Drive no-agent smoke complete after plan/sync.");
    return;
  }

  let iterations = 0;
  const maxIterations = Math.max(1, Number(optionalString(flags, "max-iterations", "20")));
  while (iterations < maxIterations) {
    program = await loadProgram(config, notionUrl);
    const ready = readyProgramSpecs(program);
    if (!ready.length) break;

    const nextSpec = ready[0];
    console.log(`\nDrive: ${nextSpec.id} ${nextSpec.title}`);

    const existingSpec = await loadSpec(config, notionUrl);
    const isResumable = existingSpec
      && existingSpec._program?.specId === nextSpec.id
      && (nextSpec.status === "in_progress" || (readyPendingTasks(existingSpec).length === 0 && await specFilesCollectable(existingSpec)));
    if (!isResumable) {
      const standalone = programToStandaloneSpec(program, nextSpec);
      const repoContext = await scanRepo(program.project);
      standalone.repoContext = {
        gitRoot: repoContext.gitRoot,
        projectRelativePath: normalizeProjectSubdir(repoContext.projectRelativePath),
        feedbackLoops: repoContext.detected.feedbackLoops,
        scannedAt: nowIso()
      };
      await saveSpec(config, notionUrl, standalone);
      program = updateProgramSpec(await loadProgram(config, notionUrl), nextSpec.id, { status: "in_progress" });
      await saveProgram(config, notionUrl, program);
    } else {
      console.log(`Resuming ${nextSpec.id} from previous run (${existingSpec.tasks.filter(t => t.status === 'completed').length}/${existingSpec.tasks.length} tasks done)`);
    }

    let specIterations = 0;
    const maxSpecIterations = Math.max(1, Number(optionalString(flags, "max-iterations", "20")));
    while (specIterations < maxSpecIterations) {
      let currentSpec = await loadSpec(config, notionUrl);
      const pending = readyPendingTasks(currentSpec);
      if (!pending.length) break;
      await swarm({ ntn: notionUrl, autopilot, "permission-profile": permissionProfile, concurrency, "max-tasks": maxTasks, parallel: optionalString(flags, "parallel", "default") });
      specIterations += 1;
    }

    let completedSpec = await loadSpec(config, notionUrl);
    if (readyPendingTasks(completedSpec).length) {
      throw new Error(`Drive stopped: ${nextSpec.id} has pending tasks after ${maxSpecIterations} swarm iterations.`);
    }

    const collection = await collectSummary(config, notionUrl, completedSpec, undefined, { uncollectedOnly: true, skipMissing: true });
    if (collection.reports.length) {
      if (optionalString(flags, "parallel", "default") === "smart" && collection.overlaps.length) {
        const integrated = addParallelIntegrationTask(completedSpec, collection);
        if (integrated) {
          await saveSpec(config, notionUrl, integrated);
          console.log(`Created ${integrated.tasks.at(-1).id} to integrate overlapping parallel outputs for ${nextSpec.id}. Continuing.`);
          continue;
        }
      }
      const projectRoot = completedSpec.project;
      const projectSubdir = normalizeProjectSubdir(completedSpec.repoContext?.projectRelativePath);
      const reportsToApply = collection.overlaps.length && collection.recommendation
        ? collection.reports.filter((report) => report.task.id === collection.recommendation.task.id)
        : collection.reports;
      if (collection.overlaps.length && collection.recommendation) {
        console.log(`Drive applying recommended integration task ${collection.recommendation.task.id}: ${collection.recommendation.reason}`);
      }
      const orderedReports = [...reportsToApply].sort((a, b) => (a.task.order || 0) - (b.task.order || 0));
      for (const report of orderedReports) {
        const worktreeProjectDir = projectSubdir ? path.join(report.worktree, projectSubdir) : report.worktree;
        if (report.changedFiles.length) {
          console.log(`Drive applying ${report.task.id} (${report.changedFiles.length} files): ${report.task.title}`);
          await applyCollectReport({ report, projectRoot, worktreeProjectDir });
        } else {
          const missingFiles = await collectMissingFiles(worktreeProjectDir, projectRoot);
          if (missingFiles.length) {
            console.log(`Drive applying ${report.task.id} (${missingFiles.length} missing files): ${report.task.title}`);
            for (const file of missingFiles) {
              await cp(path.join(worktreeProjectDir, file), path.join(projectRoot, file), { recursive: true });
            }
            report.changedFiles = missingFiles;
          } else {
            console.log(`Drive skipping ${report.task.id} (no changed or missing files)`);
          }
        }
        const collectedAt = nowIso();
        completedSpec = updateTask(completedSpec, report.task.id, { collectedAt, collectedFiles: report.changedFiles });
        for (const overlay of report.task.lastResult?.dependencyOverlays || []) {
          completedSpec = updateTask(completedSpec, overlay.taskId, { collectedAt, collectedBy: report.task.id, collectedFiles: overlay.files || [] });
        }
      }
      await saveSpec(config, notionUrl, completedSpec);
    }

    completedSpec = await loadSpec(config, notionUrl);
    const checks = await runFeedbackLoops(completedSpec);
    for (const check of checks) {
      console.log(`${check.ok ? "OK " : "ERR"} ${check.command}: ${check.detail}`);
    }
    if (checks.some((check) => !check.ok)) {
      const repaired = await addFeedbackBugAndRepair(config, notionUrl, completedSpec, checks, flags);
      if (repaired) {
        await saveSpec(config, notionUrl, repaired);
        console.log(`Created ${repaired.tasks.at(-1).id} to repair failed feedback checks for ${nextSpec.id}. Continuing.`);
        continue;
      }
      throw new Error(`Drive feedback checks failed for ${nextSpec.id}.`);
    }

    program = await loadProgram(config, notionUrl);
    const completedTasks = completedSpec.tasks.map((t) => t.id);
    let updatedSpec = program.specs.find((s) => s.id === nextSpec.id);
    updatedSpec = {
      ...updatedSpec,
      status: "completed",
      tasks: completedSpec.tasks,
      notion: completedSpec.notion,
      updatedAt: nowIso()
    };
    program = updateProgramSpec(program, nextSpec.id, updatedSpec);
    await saveProgram(config, notionUrl, program);

    await syncProgram({ config, notionUrl, program });
    console.log(`Spec ${nextSpec.id} complete.`);
    iterations += 1;
  }

  program = await loadProgram(config, notionUrl);
  const remaining = readyProgramSpecs(program);
  if (remaining.length) {
    throw new Error(`Drive stopped after ${maxIterations} spec iterations with pending specs remaining.`);
  }

  if (!completedAtStart && programComplete(program)) {
    program = { ...program, status: "completed", updatedAt: nowIso() };
    await saveProgram(config, notionUrl, program);
    await syncProgram({ config, notionUrl, program });
  }

  if (await runDriveQaFinalPass({ config, notionUrl, target: programToStandaloneSpec(program, program.specs.at(-1)), flags, autopilot, permissionProfile, concurrency, maxTasks })) return;

  console.log("Drive complete. All specs shipped.");
}

function programComplete(program) {
  return program?.status === "completed" && (program.specs || []).every((spec) => spec.status === "completed");
}

function shouldDriveApply(autopilot, collection) {
  if (!collection.reports.length) return { apply: false, reason: "no completed worktree-backed tasks found" };
  if (autopilot === "intern_mode") return { apply: false, reason: "intern_mode requires manual collection apply" };
  if (!collection.overlaps.length) {
    const latest = [...collection.reports].sort((a, b) => (b.task.order || 0) - (a.task.order || 0))[0];
    return { apply: true, taskId: latest.task.id, reason: "latest completed task output has no overlapping file conflicts" };
  }
  if (collection.recommendation && (autopilot === "junior_mode" || autopilot === "boss_mode")) {
    return { apply: true, taskId: collection.recommendation.task.id, reason: collection.recommendation.reason };
  }
  return { apply: false, reason: "overlapping task outputs need manual choice" };
}

export function addParallelIntegrationTask(spec, collection) {
  if ((spec.tasks || []).some((task) => task.kind === "parallel_integration" && task.status !== "completed")) return null;
  const reportsById = new Map(collection.reports.map((report) => [report.task.id, report]));
  const dependencyIds = [...new Set(collection.overlaps.flatMap((overlap) => overlap.taskIds))].filter((taskId) => reportsById.has(taskId));
  if (!dependencyIds.length) return null;

  const existingIds = new Set((spec.tasks || []).map((task) => task.id));
  let nextOrder = (spec.tasks || []).reduce((max, task) => Math.max(max, task.order || 0), 0) + 1;
  while (existingIds.has(`task-${String(nextOrder).padStart(3, "0")}`)) nextOrder += 1;
  const id = `task-${String(nextOrder).padStart(3, "0")}`;
  const overlapLines = collection.overlaps.map((overlap) => `- ${overlap.file}: ${overlap.taskIds.join(", ")}`);

  const task = {
    id,
    title: "Integrate overlapping parallel worker outputs",
    status: "pending",
    order: nextOrder,
    kind: "parallel_integration",
    objective: "Merge the best completed parallel worker outputs into one coherent implementation.",
    instructions: [
      "Inspect the dependency worktree overlays and integrate the overlapping outputs below.",
      "Prefer preserving all correct behavior rather than choosing one task output blindly.",
      "Keep the final implementation scoped to the original spec.",
      "Overlapping files:",
      ...overlapLines
    ].join("\n"),
    acceptanceCriteria: [
      "Overlapping parallel outputs are integrated coherently.",
      "No completed task's intended behavior is lost.",
      "Relevant feedback checks pass."
    ],
    testPlan: spec.feedbackLoops?.length ? spec.feedbackLoops : spec.repoContext?.feedbackLoops || ["Run relevant checks."],
    risk: "medium",
    dependencies: dependencyIds,
    expectedFiles: collection.overlaps.map((overlap) => overlap.file),
    parallelGroup: "serial",
    createdAt: nowIso()
  };

  return {
    ...spec,
    status: "planned",
    tasks: [...(spec.tasks || []), task],
    updatedAt: nowIso()
  };
}

function addFeedbackRepairTask(spec, checks, flags = {}) {
  const failed = checks.filter((check) => !check.ok);
  if (!failed.length) return null;
  const maxRepairs = Math.max(0, Number(optionalString(flags, "max-repairs", "2")));
  const existingRepairs = (spec.tasks || []).filter((task) => task.kind === "feedback_repair").length;
  if (existingRepairs >= maxRepairs) return null;

  const nextOrder = (spec.tasks || []).reduce((max, task) => Math.max(max, task.order || 0), 0) + 1;
  const id = `task-${String(nextOrder).padStart(3, "0")}`;
  const completedTaskIds = (spec.tasks || [])
    .filter((task) => task.status === "completed")
    .map((task) => task.id);
  const failureLines = failed.map((check) => `- ${check.command}: ${check.detail}`);
  const task = {
    id,
    title: "Repair failed feedback checks",
    status: "pending",
    order: nextOrder,
    kind: "feedback_repair",
    objective: "Fix the implementation so build_fast feedback checks pass.",
    instructions: [
      "Inspect the current project state and repair the failed feedback checks below.",
      "Do not reimplement unrelated features. Make the smallest coherent fix.",
      "Failed feedback checks:",
      ...failureLines
    ].join("\n"),
    acceptanceCriteria: [
      "All failed feedback checks now pass.",
      "Previously passing project checks still pass.",
      "No unrelated behavior is changed."
    ],
    testPlan: [...new Set(failed.map((check) => check.command).filter(Boolean))],
    risk: "medium",
    dependencies: completedTaskIds,
    createdAt: nowIso()
  };
  return {
    ...spec,
    status: "planned",
    feedbackRepairAttempts: existingRepairs + 1,
    tasks: [...(spec.tasks || []), task],
    updatedAt: nowIso()
  };
}

async function runDriveQaFinalPass({ config, notionUrl, target, flags, autopilot, permissionProfile, concurrency, maxTasks }) {
  const qaType = flags.qa === true ? "browser" : optionalString(flags, "qa", "");
  if (!qaType) return false;
  if (qaType !== "browser") throw new Error(`Unsupported drive QA type: ${qaType}. Current MVP supports --qa browser.`);

  const maxQaRepairs = Math.max(0, Number(optionalString(flags, "max-qa-repairs", "1")));
  let attempt = 0;
  let currentTarget = target;

  while (attempt <= maxQaRepairs) {
    console.log(attempt === 0 ? "Running final browser QA..." : `Rerunning final browser QA after repair attempt ${attempt}...`);
    const result = await runBrowserQa(currentTarget, flags);
    printQaChecks(result.checks);

    const failed = result.checks.filter((check) => !check.ok);
    if (!failed.length) {
      if (attempt > 0) await completeProgramSpecFromStandalone(config, notionUrl, currentTarget);
      console.log(`Final browser QA passed: ${result.url}`);
      return false;
    }

    const artifactPath = await writeBrowserQaArtifact(config, notionUrl, result, failed);
    await logBrowserQaBugs(config, notionUrl, currentTarget, failed, artifactPath);
    const updated = await addOpenBugTasks(config, notionUrl, currentTarget);
    if (!updated) {
      await sync({ ntn: notionUrl });
      throw new Error(`Final browser QA failed with ${failed.length} issue${failed.length === 1 ? "" : "s"} and no new bug tasks could be created.`);
    }

    await saveSpec(config, notionUrl, updated);
    await persistProgramSpecFromStandalone(config, notionUrl, updated);
    await sync({ ntn: notionUrl });

    if (!driveShouldAutoRepairQa(autopilot) || attempt >= maxQaRepairs) {
      console.log(`Created ${updated.tasks.at(-1).id} from final browser QA failures. Rerun drive to fix QA bugs.`);
      if (artifactPath) console.log(`QA artifact: ${artifactPath}`);
      return true;
    }

    console.log(`Created ${updated.tasks.at(-1).id} from final browser QA failures. Running QA bug repair workers.`);
    const repaired = await runQaRepairCycle({ config, notionUrl, flags, autopilot, permissionProfile, concurrency, maxTasks });
    if (!repaired.continueQa) return true;
    currentTarget = repaired.target || await loadSpec(config, notionUrl);
    attempt += 1;
  }

  return true;
}

function printQaChecks(checks) {
  for (const check of checks) console.log(`${check.ok ? "OK " : "ERR"} ${check.name}: ${check.detail}`);
}

function driveShouldAutoRepairQa(autopilot) {
  return autopilot === "junior_mode" || autopilot === "boss_mode";
}

async function runQaRepairCycle({ config, notionUrl, flags, autopilot, permissionProfile, concurrency, maxTasks }) {
  await swarm({
    ntn: notionUrl,
    autopilot,
    "permission-profile": permissionProfile,
    concurrency,
    "max-tasks": maxTasks,
    parallel: optionalString(flags, "parallel", "default")
  });

  let spec = await loadSpec(config, notionUrl);
  if (readyPendingTasks(spec).some((task) => task.kind === "bug_fix")) {
    console.log("QA bug repair workers did not finish every bug task. Rerun drive to continue.");
    return { continueQa: false, target: spec };
  }

  const collection = await collectSummary(config, notionUrl, spec, undefined, { uncollectedOnly: true, skipMissing: true });
  if (collection.reports.length) {
    printCollectReports(collection.reports, false);
    const shouldApply = shouldDriveApply(autopilot, collection);
    if (shouldApply.apply) {
      console.log(`Drive applying QA repair ${shouldApply.taskId}: ${shouldApply.reason}`);
      await collect({ ntn: notionUrl, task: shouldApply.taskId, apply: true });
    } else {
      console.log(`Drive stopped before QA repair collection apply: ${shouldApply.reason}`);
      return { continueQa: false, target: spec };
    }
  }

  spec = await loadSpec(config, notionUrl);
  const checks = await runFeedbackLoops(spec);
  for (const check of checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.command}: ${check.detail}`);
  }
  if (checks.some((check) => !check.ok)) {
    const repaired = await addFeedbackBugAndRepair(config, notionUrl, spec, checks, flags);
    if (repaired) {
      await saveSpec(config, notionUrl, repaired);
      await persistProgramSpecFromStandalone(config, notionUrl, repaired);
      await sync({ ntn: notionUrl });
      console.log(`Created ${repaired.tasks.at(-1).id} to repair feedback after QA bug fixes. Rerun drive to continue.`);
      return { continueQa: false, target: repaired };
    }
    throw new Error("QA repair feedback checks failed.");
  }

  await persistProgramSpecFromStandalone(config, notionUrl, spec);
  return { continueQa: true, target: spec };
}

async function writeBrowserQaArtifact(config, notionUrl, result, failed) {
  const safeTimestamp = nowIso().replace(/[:.]/g, "-");
  const dir = path.join(specDir(config, notionUrl), "qa-artifacts");
  await mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `browser-${safeTimestamp}.json`);
  await writeJson(artifactPath, {
    type: "browser",
    createdAt: nowIso(),
    url: result.url,
    failed,
    checks: result.checks,
    profile: result.profile,
    html: result.html || "",
    screenshotBase64: result.screenshotBase64 || ""
  });
  return artifactPath;
}

async function persistProgramSpecFromStandalone(config, notionUrl, spec) {
  if (!spec?._program?.specId) return;
  const program = await loadProgram(config, notionUrl);
  if (!program) return;
  const updatedProgram = updateProgramSpec(program, spec._program.specId, {
    status: spec.status,
    tasks: spec.tasks,
    notion: spec.notion,
    browserQa: spec.browserQa
  });
  await saveProgram(config, notionUrl, { ...updatedProgram, status: "planned", updatedAt: nowIso() });
}

async function completeProgramSpecFromStandalone(config, notionUrl, spec) {
  if (!spec?._program?.specId) return false;
  const program = await loadProgram(config, notionUrl);
  if (!program) return false;
  let updatedProgram = updateProgramSpec(program, spec._program.specId, {
    status: "completed",
    tasks: spec.tasks,
    notion: spec.notion,
    browserQa: spec.browserQa,
    updatedAt: nowIso()
  });
  if (programComplete(updatedProgram)) updatedProgram = { ...updatedProgram, status: "completed", updatedAt: nowIso() };
  await saveProgram(config, notionUrl, updatedProgram);
  await syncProgram({ config, notionUrl, program: updatedProgram });
  return true;
}

async function addFeedbackBugAndRepair(config, notionUrl, spec, checks, flags = {}) {
  const failed = checks.filter((check) => !check.ok);
  for (const check of failed) {
    await appendBug(config, notionUrl, {
      source: "feedback",
      title: `Feedback failed: ${check.command}`,
      details: check.detail,
      command: check.command,
      specId: spec.id,
      status: "open"
    });
  }
  return addFeedbackRepairTask(spec, checks, flags);
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
  let value = String(command || "").trim();
  if (!value) return "";

  const segments = value.split(/\s*(?:&&|&|;)\s*(?:then\s+)?/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments.reverse()) {
    const cleaned = segment
      .replace(/\s+[—–]\s+.*$/s, "")
      .replace(/\s+\(.*$/s, "")
      .replace(/\s+\([^)]*\)\s*$/s, "")
      .replace(/\s+-\s+.*$/s, "")
      .trim();
    if (!isRunnableFeedbackCommand(cleaned)) continue;
    if (cleaned.startsWith("node ") && !cleaned.includes("--check") && !cleaned.includes("test")) continue;
    return cleaned;
  }
  return "";
}

function isRunnableFeedbackCommand(command) {
  if (!command || command.includes("<") || command.includes(">")) return false;
  if (/\b(on|against|with)\s+the\b/i.test(command)) return false;
  if (/\b(on every|every new|new \.js file|all new)\b/i.test(command)) return false;
  if (/\b(open|browser|manual|curl|localhost|served demo|server returns)\b/i.test(command)) return false;
  if (/^npm\s+run\s+(demo|dev|start|serve)\b/.test(command)) return false;
  if (/^git\s+(diff|status|log|show)\b/.test(command)) return false;
  const executable = command.split(/\s+/)[0];
  return ["npm", "node", "git", "npx", "pnpm", "yarn", "cargo", "python", "python3", "pytest", "go", "make"].includes(executable);
}

function validateWorkerFlag(flags) {
  const worker = optionalString(flags, "worker", "claude");
  if (worker !== "claude") {
    throw new Error(`Unsupported worker adapter: ${worker}. Current MVP supports --worker claude only.`);
  }
}

async function swarm(flags) {
  const config = await loadConfig();
  validateWorkerFlag(flags);
  const notionUrl = requireFlag(flags, "ntn");
  const autopilot = optionalString(flags, "autopilot", config.defaultAutopilot);
  const permissionProfile = optionalString(flags, "permission-profile", config.permissionProfile || "inherit");
  const concurrency = Math.max(1, Number(optionalString(flags, "concurrency", "2")));
  const maxTasks = Math.max(1, Number(optionalString(flags, "max-tasks", String(concurrency))));
  const parallelMode = optionalString(flags, "parallel", "default");
  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run `build_fast plan --goal ... --ntn ... --project ...` first.");

  const candidates = selectSwarmCandidates(spec, { maxTasks, parallelMode });
  if (!candidates.length) {
    console.log("No dependency-ready pending tasks found.");
    return;
  }

  const gitContext = await resolveGitContext(spec.project);
  const assignments = [];
  for (const task of candidates) {
    const assignment = buildWorktreeAssignment(spec, task, gitContext);
    await ensureWorktree(assignment);
    await overlayProgramSnapshot(assignment);
    await overlayDependencyWorktrees(assignment);
    assignments.push(assignment);
    spec = updateTask(spec, task.id, {
      status: "in_progress",
      summary: `Swarm worker started in ${assignment.worktreeDir}`,
      lastResult: {
        branch: assignment.branch,
        worktree: assignment.worktreeDir,
        baseHead: assignment.baseHead,
        programSnapshotFiles: assignment.programSnapshotFiles,
        dependencyOverlays: assignment.dependencyOverlays
      }
    });
    await updateNotionTaskStatus(config, notionUrl, task, "In progress");
  }
  await saveSpec(config, notionUrl, spec);

  console.log(`Swarm starting ${assignments.length} task${assignments.length === 1 ? "" : "s"} with concurrency ${concurrency}.`);
  if (parallelMode === "smart") printSmartParallelPlan(spec, candidates);
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
        baseHead: result.assignment.baseHead,
        programSnapshotFiles: result.assignment.programSnapshotFiles,
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
        baseHead: result.assignment.baseHead,
        programSnapshotFiles: result.assignment.programSnapshotFiles,
        dependencyOverlays: result.assignment.dependencyOverlays
      }
    });
  }

  console.log(`Swarm finished ${results.length} task${results.length === 1 ? "" : "s"}.`);
  for (const result of results) {
    console.log(`${result.task.id} ${result.patch.status}: ${result.patch.summary || ""}`);
  }
}

export function selectSwarmCandidates(spec, { maxTasks, parallelMode = "default" }) {
  const ready = readyPendingTasks(spec);
  if (parallelMode !== "smart") return ready.slice(0, maxTasks);
  return selectSmartParallelTasks(ready, maxTasks);
}

function selectSmartParallelTasks(ready, maxTasks) {
  if (!ready.length) return [];
  const first = ready[0];
  if (isSerialTask(first)) return [first];

  const selected = [first];
  for (const task of ready.slice(1)) {
    if (selected.length >= maxTasks) break;
    if (isSerialTask(task)) break;
    if (selected.every((candidate) => tasksCanRunTogether(candidate, task))) {
      selected.push(task);
    }
  }
  return selected;
}

function tasksCanRunTogether(a, b) {
  const aGroup = normalizedParallelGroup(a);
  const bGroup = normalizedParallelGroup(b);
  if (aGroup && bGroup && aGroup !== bGroup) return false;

  const aFiles = taskExpectedFiles(a);
  const bFiles = taskExpectedFiles(b);
  if (aFiles.length && bFiles.length && fileSetsOverlap(aFiles, bFiles)) return false;

  const aArea = taskArea(a);
  const bArea = taskArea(b);
  if (!aFiles.length && !bFiles.length && aArea && bArea && aArea === bArea) return false;
  return true;
}

function isSerialTask(task) {
  const group = normalizedParallelGroup(task);
  if (group === "serial") return true;
  if (String(task.risk || "").toLowerCase() === "high") return true;
  const text = `${task.kind || ""} ${task.title || ""} ${task.objective || ""}`.toLowerCase();
  return /\b(integration|integrate|merge|final|verify|verification|test coverage|regression|repair)\b/.test(text);
}

function normalizedParallelGroup(task) {
  const value = String(task.parallelGroup || task.parallel_group || "").trim().toLowerCase();
  if (!value || value === "parallel" || value === "safe") return "";
  return value;
}

function taskExpectedFiles(task) {
  const explicit = [
    ...(Array.isArray(task.expectedFiles) ? task.expectedFiles : []),
    ...(Array.isArray(task.targetFiles) ? task.targetFiles : []),
    ...(Array.isArray(task.files) ? task.files : [])
  ].map(normalizeExpectedFile).filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  return inferExpectedFiles(task);
}

function inferExpectedFiles(task) {
  const text = `${task.title || ""}\n${task.objective || ""}\n${task.instructions || ""}\n${(task.testPlan || []).join("\n")}`.toLowerCase();
  const files = [];
  for (const match of text.matchAll(/\b([\w./-]+\.(?:js|jsx|ts|tsx|css|html|json|md|py|rb|go|rs|java|kt|swift|php|yml|yaml))\b/g)) {
    files.push(normalizeExpectedFile(match[1]));
  }
  if (/\breadme|docs?|documentation\b/.test(text)) files.push("README.md", "docs/");
  if (/\btest|tests?|coverage|spec\b/.test(text)) files.push("test/", "tests/", "__tests__/");
  if (/\b(style|css|layout|ui|browser|html|page|component)\b/.test(text)) files.push("src/", "demo/", "public/");
  return [...new Set(files.filter(Boolean))];
}

function normalizeExpectedFile(value) {
  const file = String(value || "").trim().replace(/^\.\//, "");
  if (!file || isUnsafeRelativePath(file)) return "";
  return file;
}

function fileSetsOverlap(aFiles, bFiles) {
  return aFiles.some((a) => bFiles.some((b) => filesOverlap(a, b)));
}

function filesOverlap(a, b) {
  const left = a.endsWith("/") ? a : `${a}/`;
  const right = b.endsWith("/") ? b : `${b}/`;
  return a === b || left.startsWith(right) || right.startsWith(left);
}

function taskArea(task) {
  const text = `${task.title || ""} ${task.objective || ""} ${task.instructions || ""}`.toLowerCase();
  if (/\breadme|docs?|documentation\b/.test(text)) return "docs";
  if (/\btest|tests?|coverage|spec\b/.test(text)) return "tests";
  if (/\bcss|style|layout|visual|design\b/.test(text)) return "styles";
  if (/\bhtml|browser|ui|component|page\b/.test(text)) return "ui";
  if (/\bapi|server|route|backend\b/.test(text)) return "backend";
  return "";
}

function printSmartParallelPlan(spec, candidates) {
  console.log("Smart parallel selection:");
  for (const task of candidates) {
    const files = taskExpectedFiles(task);
    const group = normalizedParallelGroup(task) || "auto";
    console.log(`  ${task.id}: group=${group} risk=${task.risk || "medium"} files=${files.length ? files.join(", ") : "unknown"}`);
  }
  const skipped = readyPendingTasks(spec).filter((task) => !candidates.some((candidate) => candidate.id === task.id));
  if (skipped.length) console.log(`  deferred: ${skipped.map((task) => task.id).join(", ")}`);
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

async function specFilesCollectable(spec) {
  const worktreeTasks = (spec.tasks || []).filter((t) => t.status === "completed" && t.lastResult?.worktree);
  if (!worktreeTasks.length) return false;
  for (const task of worktreeTasks) {
    if (await pathExists(task.lastResult.worktree)) return true;
  }
  return false;
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
  const branch = `build-fast-${spec.slug}-${task.id}`;
  const worktreeDir = path.join(os.tmpdir(), "build_fast-worktrees", path.basename(gitContext.root), spec.slug, task.id);
  return {
    spec,
    task,
    branch,
    worktreeDir,
    workerProjectDir: path.join(worktreeDir, gitContext.projectRelativePath),
    gitRoot: gitContext.root,
    baseHead: gitContext.head,
    programSnapshotFiles: [],
    dependencyOverlays: []
  };
}

async function ensureWorktree(assignment) {
  if (await pathExists(assignment.worktreeDir)) {
    try {
      await git(["-C", assignment.gitRoot, "worktree", "remove", "--force", assignment.worktreeDir]);
    } catch {
      await git(["-C", assignment.gitRoot, "worktree", "prune", "--expire=now"]);
    }
  }
  try {
    await git(["-C", assignment.gitRoot, "worktree", "add", "-B", assignment.branch, assignment.worktreeDir, "HEAD"]);
  } catch (e) {
    await git(["-C", assignment.gitRoot, "worktree", "prune", "--expire=now"]);
    try {
      await git(["-C", assignment.gitRoot, "branch", "-D", assignment.branch]);
    } catch {
      // Branch may not exist after a failed worktree add.
    }
    await git(["-C", assignment.gitRoot, "worktree", "add", "-B", assignment.branch, assignment.worktreeDir, "HEAD"]);
  }
}

async function overlayProgramSnapshot(assignment) {
  if (!assignment.spec?._program) return;
  const files = await syncDirectorySnapshot(assignment.spec.project, assignment.workerProjectDir);
  assignment.programSnapshotFiles = files;
}

async function overlayDependencyWorktrees(assignment) {
  const projectSubdir = normalizeProjectSubdir(assignment.spec.repoContext?.projectRelativePath);
  const dependencies = dependencyTasksFor(assignment.spec, assignment.task);
  for (const dependency of dependencies) {
    const dependencyWorktree = dependency.lastResult?.worktree;
    if (!dependencyWorktree || !(await pathExists(dependencyWorktree))) continue;
    const files = await worktreeChangedFiles(dependencyWorktree, dependency.lastResult?.baseHead, projectSubdir);
    const dependencyProjectDir = projectSubdir ? path.join(dependencyWorktree, projectSubdir) : dependencyWorktree;
    for (const file of files) {
      if (isUnsafeRelativePath(file)) {
        throw new Error(`Refusing to overlay unsafe dependency path from ${dependency.id}: ${file}`);
      }
      await cp(path.join(dependencyProjectDir, file), path.join(assignment.workerProjectDir, file), { recursive: true });
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
  const dependencies = (task.dependencies || []).map((dependencyId) => byId.get(dependencyId)).filter(Boolean);
  if (spec._program) {
    const seen = new Set(dependencies.map((dependency) => dependency.id));
    const priorCompleted = (spec.tasks || [])
      .filter((candidate) => candidate.status === "completed")
      .filter((candidate) => (candidate.order || 0) < (task.order || 0))
      .filter((candidate) => !seen.has(candidate.id));
    return [...dependencies, ...priorCompleted];
  }
  return dependencies;
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
  const workers = await readActiveWorkers(config);

  const program = await loadProgram(config, notionUrl);
  if (program) return programStatus(program, config, notionUrl, workers, flags);

  const spec = await loadSpec(config, notionUrl);
  if (!spec) {
    console.log("No local spec or program found.");
    return;
  }
  const counts = taskCounts(spec);
  const next = readyPendingTasks(spec)[0];
  const collection = await collectSummary(config, notionUrl, spec, undefined, { uncollectedOnly: true, skipMissing: true });

  console.log(`${spec.title} [${spec.status}]`);
  console.log(`Project: ${spec.project}`);
  console.log(`Notion: ${spec.notion?.specPageUrl || spec.notionUrl || notionUrl}`);
  console.log(`Tasks: ${counts.completed}/${counts.total} completed, ${counts.pending} pending, ${counts.inProgress} in progress, ${counts.failed} failed, ${counts.collected} collected`);
  console.log(`Next: ${next ? `${next.id} ${next.title}` : "none"}`);
  if (spec.repoContext?.feedbackLoops?.length) console.log(`Feedback: ${spec.repoContext.feedbackLoops.join(" | ")}`);
  if (spec.browserQa) console.log(`Browser QA: ${browserQaStatusLine(spec.browserQa)}`);
  if (collection.overlaps.length) {
    console.log(`Collect: overlaps detected`);
    for (const overlap of collection.overlaps) console.log(`  ${overlap.file}: ${overlap.taskIds.join(", ")}`);
    if (collection.recommendation) console.log(`  recommended: ${collection.recommendation.task.id} (${collection.recommendation.reason})`);
  } else if (collection.reports.length) {
    console.log(`Collect: ${collection.reports.length} completed worktree output${collection.reports.length === 1 ? "" : "s"} available`);
  } else {
    console.log(`Collect: no available worktree output`);
  }

  console.log(`\nTasks:`);
  for (const task of spec.tasks) {
    const collected = task.collectedAt ? " [collected]" : "";
    const branch = task.lastResult?.branch ? ` branch=${task.lastResult.branch}` : "";
    const worktreeExists = task.lastResult?.worktree ? await pathExists(task.lastResult.worktree) : false;
    const worktree = task.lastResult?.worktree ? ` worktree=${worktreeExists ? task.lastResult.worktree : "cleaned"}` : "";
    console.log(`${task.status.padEnd(11)} ${task.id} ${task.title}${collected}`);
    if (branch || worktree) console.log(`            ${branch}${worktree}`.trimEnd());
  }
  if (workers.length) {
    console.log("\nActive workers:");
    for (const worker of workers) console.log(`${worker.runId} ${worker.taskId} ${worker.status}`);
  }
}

async function programStatus(program, config, notionUrl, workers, flags) {
  const specFilter = optionalString(flags, "spec", undefined);
  if (specFilter) {
    const matched = program.specs.find((s) => s.id === specFilter);
    if (!matched) {
      console.log(`No spec found with id: ${specFilter}`);
      return;
    }
    const standalone = programToStandaloneSpec(program, matched);
    const counts = taskCounts(standalone);
    console.log(`${matched.id}: ${matched.title} [${matched.status}]`);
    console.log(`Tasks: ${counts.completed}/${counts.total} completed, ${counts.pending} pending, ${counts.inProgress} in progress, ${counts.failed} failed`);
    for (const task of matched.tasks) {
      const collected = task.collectedAt ? " [collected]" : "";
      console.log(`  ${task.status.padEnd(11)} ${task.id} ${task.title}${collected}`);
    }
    return;
  }

  const ready = readyProgramSpecs(program);
  const completedCount = program.specs.filter((s) => s.status === "completed").length;
  console.log(`${program.title} [${program.status}]`);
  console.log(`Project: ${program.project}`);
  console.log(`Specs: ${completedCount}/${program.specs.length} completed`);
  console.log(`Next: ${ready.length ? `${ready[0].id} ${ready[0].title}` : "none"}`);
  if (program.feedbackLoops?.length) console.log(`Feedback: ${program.feedbackLoops.join(" | ")}`);
  if (program.browserQa) console.log(`Browser QA: ${browserQaStatusLine(program.browserQa)}`);

  console.log(`\nSpecs:`);
  for (const spec of program.specs) {
    const depLabel = spec.dependencies.length ? ` depends=[${spec.dependencies.join(", ")}]` : "";
    const counts = taskCounts(spec);
    console.log(`${spec.status.padEnd(11)} ${spec.id} ${spec.title} (${counts.completed}/${counts.total} tasks)${depLabel}`);
  }

  if (workers.length) {
    console.log("\nActive workers:");
    for (const worker of workers) console.log(`${worker.runId} ${worker.taskId} ${worker.status}`);
  }
}

function browserQaStatusLine(profile) {
  const parts = [];
  if (profile.startCommand) parts.push(profile.startCommand);
  if (profile.url) parts.push(profile.url);
  if (profile.requiredSelectors?.length) parts.push(`${profile.requiredSelectors.length} selectors`);
  if (profile.requiredText?.length) parts.push(`${profile.requiredText.length} text checks`);
  if (profile.requiredModules?.length) parts.push(`${profile.requiredModules.length} modules`);
  if (profile.requiredAssets) parts.push("asset checks");
  return parts.join(" | ") || "configured";
}

function taskCounts(spec) {
  const tasks = spec.tasks || [];
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === "completed").length,
    pending: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    collected: tasks.filter((task) => task.collectedAt).length
  };
}

async function sync(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const program = await loadProgram(config, notionUrl);
  if (program) return syncProgram({ config, notionUrl, program });

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

async function syncProgram({ config, notionUrl, program }) {
  if (!config.notionToken) {
    console.log("Notion sync skipped: missing NOTION_API_TOKEN.");
    return;
  }
  for (const spec of program.specs) {
    const standalone = programToStandaloneSpec(program, spec);
    const result = await syncToDataSources(config, notionUrl, standalone);
    if (result.ok && result.spec) {
      const updated = {
        ...spec,
        tasks: result.spec.tasks,
        notion: result.spec.notion,
        updatedAt: nowIso()
      };
      program = updateProgramSpec(program, spec.id, updated);
    }
  }
  await saveProgram(config, notionUrl, program);
  console.log(`Synced ${program.specs.length} specs to Notion`);
}

async function compact(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const keepRuns = Math.max(0, Number(optionalString(flags, "keep-runs", "1")));
  if (!config.notionToken) throw new Error("Missing NOTION_API_TOKEN.");
  const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
  let deleted = 0;
  let refreshed = 0;

  const program = await loadProgram(config, notionUrl);
  if (program) {
    for (const spec of program.specs) {
      if (spec.notion?.specPageId) {
        await replaceManagedSection(notion, spec.notion.specPageId, "build_fast Sync Snapshot", formatSpecSnapshotMarkdown(programToStandaloneSpec(program, spec)));
        refreshed += 1;
      }
      for (const task of spec.tasks || []) {
        if (!task.notion?.taskPageId) continue;
        deleted += await compactTaskPageRuns(notion, task.notion.taskPageId, keepRuns);
        await replaceManagedSection(notion, task.notion.taskPageId, "build_fast Task Snapshot", formatTaskSnapshotMarkdown(task));
        refreshed += 1;
      }
    }
    console.log(`Compacted ${deleted} old run section${deleted === 1 ? "" : "s"} and refreshed ${refreshed} snapshot page${refreshed === 1 ? "" : "s"}.`);
    return;
  }

  const spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");

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
  const apply = flags.apply === true || flags.apply === "true";
  const force = flags.force === true || flags.force === "true";
  const patch = flags.patch === true || flags.patch === "true";
  const taskFilter = optionalString(flags, "task", undefined);

  const program = await loadProgram(config, notionUrl);
  if (program) {
    let spec = await loadSpec(config, notionUrl);
    if (!spec) throw new Error("No active spec found in program drive. Run drive first.");
    return collectSpec({ config, notionUrl, spec, apply, force, patch, taskFilter });
  }

  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");
  return collectSpec({ config, notionUrl, spec, apply, force, patch, taskFilter });
}

async function collectSpec({ config, notionUrl, spec, apply, force, patch, taskFilter }) {
  const projectRoot = spec.project;
  const projectSubdir = normalizeProjectSubdir(spec.repoContext?.projectRelativePath);
  const { reports, overlaps, recommendation } = await collectSummary(config, notionUrl, spec, taskFilter);

  if (!reports.length) {
    console.log("No completed worktree-backed tasks found to collect.");
    return;
  }

  if (patch) {
    await printCollectPatches(reports, projectRoot, projectSubdir);
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
      const worktreeProjectDir = projectSubdir ? path.join(report.worktree, projectSubdir) : report.worktree;
      await applyCollectReport({ report, projectRoot, worktreeProjectDir });
      const collectedAt = nowIso();
      nextSpec = updateTask(nextSpec, report.task.id, {
        collectedAt,
        collectedFiles: report.changedFiles
      });
      for (const overlay of report.task.lastResult?.dependencyOverlays || []) {
        nextSpec = updateTask(nextSpec, overlay.taskId, {
          collectedAt,
          collectedBy: report.task.id,
          collectedFiles: overlay.files || []
        });
      }
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

async function printCollectPatches(reports, projectRoot, projectSubdir) {
  for (const report of reports) {
    const worktreeProjectDir = projectSubdir ? path.join(report.worktree, projectSubdir) : report.worktree;
    console.log(`diff for ${report.task.id}: ${report.task.title}`);
    for (const file of report.changedFiles) {
      const targetPath = path.join(projectRoot, file);
      const sourcePath = path.join(worktreeProjectDir, file);
      const diff = await diffFilesForPreview(targetPath, sourcePath, file);
      console.log(diff || `# ${file}: no textual diff available`);
    }
  }
}

async function diffFilesForPreview(targetPath, sourcePath, label) {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--no-index", "--", targetPath, sourcePath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    return stdout.replaceAll(targetPath, `a/${label}`).replaceAll(sourcePath, `b/${label}`);
  } catch (error) {
    const output = error.stdout || "";
    if (output) return output.replaceAll(targetPath, `a/${label}`).replaceAll(sourcePath, `b/${label}`);
    return "";
  }
}

async function collectSummary(config, notionUrl, spec, taskFilter = undefined, options = {}) {
  const coveredByCollected = collectedOverlayTaskIds(spec);
  const projectRelativePath = normalizeProjectSubdir(spec.repoContext?.projectRelativePath || spec._program?.projectRelativePath);
  const tasks = (spec.tasks || [])
    .filter((task) => task.status === "completed")
    .filter((task) => !taskFilter || task.id === taskFilter)
    .filter((task) => !options.uncollectedOnly || (!task.collectedAt && !coveredByCollected.has(task.id)))
    .filter((task) => task.lastResult?.worktree);
  const reports = [];
  for (const task of tasks) {
    if (options.skipMissing && !(await pathExists(task.lastResult.worktree))) continue;
    reports.push(await inspectCollectTask(task, projectRelativePath));
  }
  const overlaps = overlappingChangedFiles(reports);
  return {
    reports,
    overlaps,
    recommendation: collectRecommendation(reports, overlaps)
  };
}

function collectedOverlayTaskIds(spec) {
  const ids = new Set();
  for (const task of spec.tasks || []) {
    if (!task.collectedAt) continue;
    for (const overlay of task.lastResult?.dependencyOverlays || []) {
      if (overlay.taskId) ids.add(overlay.taskId);
    }
  }
  return ids;
}

async function cleanup(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const apply = flags.apply === true || flags.apply === "true";
  const force = flags.force === true || flags.force === "true";
  const deleteBranches = flags.branches === true || flags.branches === "true";
  const taskFilter = optionalString(flags, "task", undefined);

  const program = await loadProgram(config, notionUrl);
  if (program) {
    let spec = await loadSpec(config, notionUrl);
    if (!spec) {
      console.log("No active spec found. Nothing to clean up.");
      return;
    }
    return cleanupSpec({ spec, apply, force, deleteBranches, taskFilter });
  }

  let spec = await loadSpec(config, notionUrl);
  if (!spec) throw new Error("No local spec found. Run plan first.");
  return cleanupSpec({ spec, apply, force, deleteBranches, taskFilter });
}

async function cleanupSpec({ spec, apply, force, deleteBranches, taskFilter }) {
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

async function inspectCollectTask(task, projectRelativePath = "") {
  const worktree = task.lastResult.worktree;
  if (!(await pathExists(worktree))) {
    throw new Error(`Worktree for ${task.id} does not exist: ${worktree}`);
  }
  const changedFiles = await worktreeChangedFiles(worktree, task.lastResult.baseHead, projectRelativePath);
  for (const file of changedFiles) {
    if (isUnsafeRelativePath(file)) {
      throw new Error(`Refusing to collect unsafe path from ${task.id}: ${file}`);
    }
  }
  return { task, worktree, changedFiles };
}

async function applyCollectReport({ report, projectRoot, worktreeProjectDir }) {
  const sourceDir = worktreeProjectDir || report.worktree;
  for (const file of report.changedFiles) {
    await cp(path.join(sourceDir, file), path.join(projectRoot, file), { recursive: true });
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

async function collectMissingFiles(worktreeProjectDir, projectRoot) {
  return diffDirectoryFiles(worktreeProjectDir, projectRoot);
}

async function syncDirectorySnapshot(sourceDir, targetDir) {
  const sourceFiles = await listDirectoryFiles(sourceDir);
  const targetFiles = await listDirectoryFiles(targetDir);
  const sourceSet = new Set(sourceFiles);
  const touched = [];

  for (const file of targetFiles) {
    if (isUnsafeRelativePath(file) || sourceSet.has(file)) continue;
    await rm(path.join(targetDir, file), { force: true });
    touched.push(file);
  }

  for (const file of sourceFiles) {
    if (isUnsafeRelativePath(file)) continue;
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true });
    touched.push(file);
  }

  return touched;
}

async function worktreeChangedFiles(worktree, baseHead = undefined, projectSubdir = "") {
  projectSubdir = normalizeProjectSubdir(projectSubdir);
  const worktreeProjectDir = projectSubdir ? path.join(worktree, projectSubdir) : worktree;
  const mainProjectDir = await findMainProjectDir(worktree, projectSubdir);
  if (!(await pathExists(worktreeProjectDir))) return [];

  if (baseHead) {
    try {
      const output = await git(["-C", worktree, "diff", "--name-only", baseHead, "--", projectSubdir || "."]);
      const committed = output.split("\n").filter((line) => line.trim());
      const untracked = await worktreeUntrackedFiles(worktree, projectSubdir);
      const gitDetected = [...new Set([...committed, ...untracked])].map((f) => (projectSubdir ? f.slice(projectSubdir.length + 1) : f)).filter(Boolean);
      if (gitDetected.length) return gitDetected;
    } catch {
      // fall through
    }
  }

  const output = await git(["-C", worktree, "status", "--short", "--", projectSubdir || "."]);
  const gitStatus = output
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3).split(" -> ").pop())
    .filter(Boolean)
    .map((f) => (projectSubdir ? f.slice(projectSubdir.length + 1) : f))
    .filter(Boolean);
  if (gitStatus.length) return gitStatus;

  if (mainProjectDir && (await pathExists(mainProjectDir))) {
    return diffDirectoryFiles(worktreeProjectDir, mainProjectDir);
  }

  return worktreeAddedFiles(worktreeProjectDir);
}

function normalizeProjectSubdir(value) {
  const normalized = String(value || "").trim();
  return normalized === "." ? "" : normalized;
}

async function findMainProjectDir(worktree, projectSubdir) {
  if (!projectSubdir) return undefined;
  const gitRoot = await resolveGitRoot(worktree);
  return path.join(gitRoot, projectSubdir);
}

async function diffDirectoryFiles(sourceDir, targetDir) {
  const { readFile } = await import("node:fs/promises");
  const sourceFiles = await listDirectoryFiles(sourceDir);
  const result = [];
  for (const file of sourceFiles) {
    if (isUnsafeRelativePath(file)) continue;
    const targetPath = path.join(targetDir, file);
    if (!(await pathExists(targetPath))) {
      result.push(file);
      continue;
    }
    const sourcePath = path.join(sourceDir, file);
    const [sourceContent, targetContent] = await Promise.all([
      readFile(sourcePath),
      readFile(targetPath)
    ]);
    if (!sourceContent.equals(targetContent)) {
      result.push(file);
    }
  }
  return result;
}

async function listDirectoryFiles(dir) {
  const { readdir } = await import("node:fs/promises");
  const skipDirs = new Set(["node_modules", ".git", ".build_fast", ".firecrawl"]);
  const results = [];
  async function walk(currentDir, relativeTo) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (skipDirs.has(name)) continue;
      const fullPath = path.join(currentDir, name);
      const relative = path.join(relativeTo, name);
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
      } else if (entry.isFile()) {
        results.push(relative);
      }
    }
  }
  await walk(dir, "");
  return results;
}

async function worktreeAddedFiles(worktreeProjectDir) {
  try {
    const output = await git(["-C", worktreeProjectDir, "status", "--short"]);
    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.slice(3).split(" -> ").pop())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function worktreeUntrackedFiles(worktree, projectSubdir = "") {
  try {
    const args = ["-C", worktree, "ls-files", "--others", "--exclude-standard"];
    if (projectSubdir) args.push("--", projectSubdir);
    const output = await git(args);
    return output.split("\n").filter((line) => line.trim());
  } catch {
    return [];
  }
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

function buildSpecProperties(spec, dataSource = {}) {
  const status = spec.status === "completed" ? "Shipped" : spec.status === "planned" ? "Draft" : "Building";
  return cleanProperties({
    Name: notionTitle(spec.title),
    Status: notionStatus(status),
    Project: notionRichText(spec.project),
    "GitHub Repo": notionUrl(spec.ship?.repoUrl || spec.githubRepoUrl || ""),
    "GitHub PR": notionUrl(spec.ship?.prUrl || spec.githubPrUrl || "")
  }, dataSource.properties);
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
  if (flags["create-tasks"] || flags["tasks"]) {
    const nextSpec = addReviewTasks(spec, result.parsed, reviewType);
    if (nextSpec.tasks.length !== spec.tasks.length) {
      await saveSpec(config, notionUrl, nextSpec);
      await sync({ ntn: notionUrl });
      console.log(`Created ${nextSpec.tasks.length - spec.tasks.length} follow-up task${nextSpec.tasks.length - spec.tasks.length === 1 ? "" : "s"} from review findings.`);
    } else {
      console.log("No review findings available for follow-up task creation.");
    }
  }
  console.log(result.parsed?.summary || result.stdout || result.stderr);
}

function addReviewTasks(spec, parsed = {}, reviewType) {
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  if (!findings.length) return spec;
  const existingIds = new Set((spec.tasks || []).map((task) => task.id));
  let nextIndex = (spec.tasks || []).length + 1;
  const tasks = [...(spec.tasks || [])];
  for (const finding of findings) {
    while (existingIds.has(`task-${String(nextIndex).padStart(3, "0")}`)) nextIndex += 1;
    const id = `task-${String(nextIndex).padStart(3, "0")}`;
    existingIds.add(id);
    nextIndex += 1;
    const severity = finding.severity || "P3";
    const title = finding.title || "Address review finding";
    tasks.push({
      id,
      title: `[${reviewType}] ${severity}: ${title}`,
      status: "pending",
      order: tasks.length + 1,
      objective: finding.details || title,
      instructions: [
        finding.recommendation || "Address the review finding.",
        finding.file ? `Relevant file: ${finding.file}` : null
      ].filter(Boolean).join("\n"),
      acceptanceCriteria: [
        "The review finding is addressed.",
        "Relevant checks pass.",
        "No unrelated behavior is changed."
      ],
      testPlan: spec.feedbackLoops?.length ? spec.feedbackLoops : spec.repoContext?.feedbackLoops || ["Run the relevant project checks."],
      risk: severity === "P0" || severity === "P1" ? "high" : severity === "P2" ? "medium" : "low",
      dependencies: []
    });
  }
  return { ...spec, tasks, status: spec.status === "completed" ? "planned" : spec.status, updatedAt: nowIso() };
}

async function qa(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const type = optionalString(flags, "type", "browser");
  const target = await loadActiveTarget(config, notionUrl);
  if (!target) throw new Error("No local spec or program found. Run plan/drive first.");
  if (type !== "browser") throw new Error(`Unsupported QA type: ${type}. Current MVP supports --type browser.`);

  const result = await runBrowserQa(target, flags);
  for (const check of result.checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.name}: ${check.detail}`);
  }

  const failed = result.checks.filter((check) => !check.ok);
  if (failed.length) {
    const artifactPath = await writeBrowserQaArtifact(config, notionUrl, result, failed);
    await logBrowserQaBugs(config, notionUrl, target, failed, artifactPath);
    if (flags["create-task"] || flags["create-tasks"]) {
      const updated = await addOpenBugTasks(config, notionUrl, target);
      if (updated) {
        await saveSpec(config, notionUrl, updated);
        await sync({ ntn: notionUrl });
      }
    }
    console.log(`QA artifact: ${artifactPath}`);
    throw new Error(`Browser QA failed with ${failed.length} issue${failed.length === 1 ? "" : "s"}.`);
  }

  console.log(`Browser QA passed: ${result.url}`);
}

async function logBrowserQaBugs(config, notionUrl, target, failed, artifactPath = "") {
  for (const check of failed) {
    await appendBug(config, notionUrl, {
      source: "browser_qa",
      title: `Browser QA failed: ${check.name}`,
      details: check.detail,
      command: check.command || "node bin/build_fast.js qa --type browser",
      artifactPath,
      specId: target.id,
      status: "open"
    });
  }
}

async function runBrowserQa(target, flags = {}) {
  const projectDir = target.project || target;
  const profile = browserQaProfile(target, flags);
  const packageJson = await readJson(path.join(projectDir, "package.json"), {});
  const checks = [];
  const startCommand = profile.startCommand || (packageJson.scripts?.demo ? "npm run demo" : "");
  if (!startCommand) {
    return {
      url: null,
      profile,
      html: "",
      checks: [{ name: "browser QA start command", ok: false, detail: "no browserQa.startCommand and package.json has no scripts.demo" }]
    };
  }

  const port = Number(optionalString(flags, "port", String(19000 + Math.floor(Math.random() * 1000))));
  const url = profile.url.replaceAll("${PORT}", String(port));
  const child = spawn("/bin/zsh", ["-lc", startCommand], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let html = "";
  let screenshotBase64 = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    const ready = await waitForHttp(url, 8000);
    checks.push({ name: "demo server", ok: ready.ok, detail: ready.detail, command: startCommand });
    if (!ready.ok) return { url, profile, html, checks };

    const htmlResponse = await fetch(url);
    html = await htmlResponse.text();
    checks.push({ name: "index.html", ok: htmlResponse.ok && /<!doctype html/i.test(html), detail: `${htmlResponse.status} ${htmlResponse.headers.get("content-type") || ""}` });
    checks.push(...await browserQaHtmlChecks(html, url, profile));
    if (profile.render !== false || flags["require-playwright"]) {
      const rendered = await runPlaywrightBrowserQa(url, profile, flags, projectDir);
      checks.push(...rendered.checks);
      if (rendered.console.length) checks.push({ name: "browser console", ok: false, detail: rendered.console.join(" | ") });
      if (rendered.pageErrors.length) checks.push({ name: "browser page errors", ok: false, detail: rendered.pageErrors.join(" | ") });
      if (rendered.screenshotBase64) screenshotBase64 = rendered.screenshotBase64;
    }
  } catch (error) {
    checks.push({ name: "browser QA runtime", ok: false, detail: error.message || String(error) });
  } finally {
    child.kill("SIGTERM");
  }

  if (output && checks.some((check) => !check.ok)) {
    checks.push({ name: "server output", ok: true, detail: firstOutputLine(output) });
  }

  return { url, profile, html, screenshotBase64, checks };
}

export function browserQaProfile(target = {}, flags = {}) {
  const configured = normalizeRuntimeBrowserQa(target.browserQa || target.browser_qa);
  if (configured) return configured;
  return {
    startCommand: optionalString(flags, "start-command", "npm run demo"),
    url: optionalString(flags, "url", "http://127.0.0.1:${PORT}/"),
    requiredText: [],
    requiredSelectors: ["#note-title", "#note-body", "#note-tags", "#create-form", "#search-input", "#tag-filter", "#notes-list"],
    requiredAssets: true,
    requiredModules: ["/src/orbit-notes.js", "/demo/app.js"],
    manualChecks: [],
    render: true,
    interactions: []
  };
}

function normalizeRuntimeBrowserQa(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    startCommand: String(value.startCommand || value.start_command || "").trim(),
    url: String(value.url || "http://127.0.0.1:${PORT}/").trim(),
    requiredText: toStringList(value.requiredText || value.required_text),
    requiredSelectors: toStringList(value.requiredSelectors || value.required_selectors),
    requiredAssets: value.requiredAssets !== false && value.required_assets !== false,
    requiredModules: toStringList(value.requiredModules || value.required_modules),
    manualChecks: toStringList(value.manualChecks || value.manual_checks),
    render: value.render !== false && value.playwright !== false,
    interactions: normalizeBrowserInteractions(value.interactions || value.interactionChecks || value.interaction_checks)
  };
}

function normalizeBrowserInteractions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((interaction, index) => {
    if (!interaction || typeof interaction !== "object") return null;
    return {
      name: String(interaction.name || `interaction ${index + 1}`).trim(),
      steps: Array.isArray(interaction.steps) ? interaction.steps.map(normalizeBrowserInteractionStep).filter(Boolean) : []
    };
  }).filter((interaction) => interaction && interaction.steps.length);
}

function normalizeBrowserInteractionStep(step) {
  if (!step || typeof step !== "object") return null;
  const action = String(step.action || "").trim();
  if (!action) return null;
  return {
    action,
    selector: step.selector ? String(step.selector).trim() : "",
    value: step.value === undefined ? "" : String(step.value),
    text: step.text === undefined ? "" : String(step.text),
    timeout: Number(step.timeout || 2000)
  };
}

export async function browserQaHtmlChecks(html, url, profile, fetchImpl = fetch) {
  const checks = [];
  for (const text of profile.requiredText || []) {
    checks.push({ name: `required text ${text}`, ok: html.includes(text), detail: text });
  }
  for (const selector of profile.requiredSelectors || []) {
    checks.push({ name: `required selector ${selector}`, ok: htmlHasSelectorAnchor(html, selector), detail: selector });
  }
  if (profile.requiredModules?.length) {
    for (const modulePath of profile.requiredModules) {
      checks.push(await checkServedJavaScriptModule(modulePath, url, fetchImpl));
    }
  }
  if (profile.requiredAssets) {
    checks.push(...await checkHtmlAssets(html, url, fetchImpl));
  }
  return checks;
}

async function runPlaywrightBrowserQa(url, profile, flags = {}, projectDir = process.cwd()) {
  const requirePlaywright = flags["require-playwright"] === true || flags["require-playwright"] === "true";
  let playwright;
  try {
    playwright = createRequire(path.join(projectDir, "package.json"))("playwright");
  } catch {
    return {
      checks: [{ name: "playwright render", ok: !requirePlaywright, detail: requirePlaywright ? "playwright is not installed" : "skipped; playwright is not installed" }],
      console: [],
      pageErrors: [],
      screenshotBase64: ""
    };
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];
  let screenshotBase64 = "";
  const checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));

    await page.goto(url, { waitUntil: "networkidle", timeout: 10000 });
    checks.push({ name: "playwright render", ok: true, detail: "page loaded" });

    for (const selector of profile.requiredSelectors || []) {
      const count = await page.locator(selector).count();
      checks.push({ name: `rendered selector ${selector}`, ok: count > 0, detail: `${count} match${count === 1 ? "" : "es"}` });
    }

    for (const text of profile.requiredText || []) {
      const count = await page.getByText(text, { exact: false }).count();
      checks.push({ name: `rendered text ${text}`, ok: count > 0, detail: `${count} match${count === 1 ? "" : "es"}` });
    }

    for (const interaction of profile.interactions || []) {
      const result = await runBrowserInteraction(page, interaction);
      checks.push(result);
    }

    if (checks.some((check) => !check.ok) || consoleErrors.length || pageErrors.length) {
      screenshotBase64 = await page.screenshot({ fullPage: true, type: "png", encoding: "base64" });
    }
  } catch (error) {
    checks.push({ name: "playwright render", ok: false, detail: error.message || String(error) });
  } finally {
    await browser.close();
  }
  return { checks, console: consoleErrors, pageErrors, screenshotBase64 };
}

async function runBrowserInteraction(page, interaction) {
  try {
    for (const step of interaction.steps) {
      if (step.action === "fill") {
        await page.locator(step.selector).fill(step.value, { timeout: step.timeout });
      } else if (step.action === "click") {
        await page.locator(step.selector).click({ timeout: step.timeout });
      } else if (step.action === "expectText") {
        const count = await page.getByText(step.text || step.value, { exact: false }).count();
        if (!count) throw new Error(`missing text: ${step.text || step.value}`);
      } else if (step.action === "expectSelector") {
        const count = await page.locator(step.selector).count();
        if (!count) throw new Error(`missing selector: ${step.selector}`);
      } else {
        throw new Error(`unsupported action: ${step.action}`);
      }
    }
    return { name: `interaction ${interaction.name}`, ok: true, detail: `${interaction.steps.length} steps passed` };
  } catch (error) {
    return { name: `interaction ${interaction.name}`, ok: false, detail: error.message || String(error) };
  }
}

async function checkServedJavaScriptModule(modulePath, baseUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(new URL(modulePath, baseUrl));
    const contentType = response.headers?.get?.("content-type") || "";
    return {
      name: `served module ${modulePath}`,
      ok: response.ok && assetContentTypeOk("script", contentType),
      detail: `${response.status} ${contentType || "missing content-type"}`
    };
  } catch (error) {
    return {
      name: `served module ${modulePath}`,
      ok: false,
      detail: error.message || String(error)
    };
  }
}

function hasAll(value, needles) {
  return needles.every((needle) => value.includes(needle));
}

function htmlHasSelectorAnchor(html, selector) {
  const value = String(selector || "").trim();
  if (!value) return false;
  if (value.startsWith("#")) return html.includes(`id="${value.slice(1)}"`) || html.includes(`id='${value.slice(1)}'`);
  if (value.startsWith(".")) return htmlClassExists(html, value.slice(1));
  return new RegExp(`<${value}(\\s|>|/)`, "i").test(html);
}

function htmlClassExists(html, className) {
  for (const match of html.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const classes = (match[1] || match[2] || match[3] || "").split(/\s+/);
    if (classes.includes(className)) return true;
  }
  return false;
}

function toStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function hasModuleScript(html, src) {
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  return scripts.some((script) => {
    const hasType = /\btype=["']module["']/.test(script);
    const hasSrc = new RegExp(`\\bsrc=["']${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(script);
    return hasType && hasSrc;
  });
}

export async function checkHtmlAssets(html, baseUrl, fetchImpl = fetch) {
  const assets = htmlAssetReferences(html, baseUrl);
  if (!assets.length) {
    return [{ name: "linked assets", ok: false, detail: "no stylesheet or script assets found" }];
  }
  const checks = [];
  for (const asset of assets) {
    try {
      const response = await fetchImpl(asset.url);
      const contentType = response.headers?.get?.("content-type") || "";
      checks.push({
        name: `${asset.kind} asset ${asset.pathname}`,
        ok: response.ok && assetContentTypeOk(asset.kind, contentType),
        detail: `${response.status} ${contentType || "missing content-type"}`
      });
    } catch (error) {
      checks.push({
        name: `${asset.kind} asset ${asset.pathname}`,
        ok: false,
        detail: error.message || String(error)
      });
    }
  }
  return checks;
}

export function htmlAssetReferences(html, baseUrl) {
  const assets = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = tagAttribute(tag, "rel").toLowerCase();
    const href = tagAttribute(tag, "href");
    if (!href || !rel.split(/\s+/).includes("stylesheet")) continue;
    assets.push(assetReference("stylesheet", href, baseUrl));
  }
  for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
    const src = tagAttribute(tag, "src");
    if (!src) continue;
    assets.push(assetReference("script", src, baseUrl));
  }
  return assets.filter(Boolean);
}

function assetReference(kind, rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl, baseUrl);
    return { kind, url, pathname: url.pathname };
  } catch {
    return null;
  }
}

function assetContentTypeOk(kind, contentType) {
  const value = String(contentType || "").toLowerCase();
  if (kind === "stylesheet") return value.includes("text/css");
  if (kind === "script") return value.includes("javascript") || value.includes("ecmascript");
  return false;
}

function tagAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      return { ok: response.ok, detail: `${response.status} ${response.headers.get("content-type") || ""}` };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return { ok: false, detail: `server did not respond at ${url}` };
}

async function bugs(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const items = await readBugs(config, notionUrl);
  if (flags["create-tasks"] || flags["create-task"]) {
    const target = await loadActiveTarget(config, notionUrl);
    if (!target) throw new Error("No active spec found. Run plan/drive first.");
    const updated = await addOpenBugTasks(config, notionUrl, target);
    if (updated) {
      await saveSpec(config, notionUrl, updated);
      await sync({ ntn: notionUrl });
      console.log("Created bug repair tasks from open bugs.");
      return;
    }
    console.log("No open bugs without tasks.");
    return;
  }

  if (!items.length) {
    console.log("No bugs logged.");
    return;
  }
  for (const bug of items) {
    const task = bug.taskId ? ` task=${bug.taskId}` : "";
    console.log(`${bug.status || "open"} ${bug.id} [${bug.source}] ${bug.title}${task}`);
    if (bug.details) console.log(`  ${bug.details}`);
  }
}

async function loadActiveTarget(config, notionUrl) {
  const spec = await loadSpec(config, notionUrl);
  if (spec) return spec;
  const program = await loadProgram(config, notionUrl);
  if (!program?.specs?.length) return undefined;
  const active = program.specs.find((candidate) => candidate.status === "in_progress")
    || program.specs.find((candidate) => candidate.status === "planned")
    || program.specs.at(-1);
  return programToStandaloneSpec(program, active);
}

function bugsPath(config, notionUrl) {
  return path.join(specDir(config, notionUrl), "bugs.json");
}

async function readBugs(config, notionUrl) {
  return readJson(bugsPath(config, notionUrl), []);
}

async function saveBugs(config, notionUrl, bugs) {
  await writeJson(bugsPath(config, notionUrl), bugs);
}

async function appendBug(config, notionUrl, bug) {
  const bugs = await readBugs(config, notionUrl);
  const existing = bugs.find((candidate) =>
    candidate.source === bug.source
    && candidate.title === bug.title
    && candidate.details === bug.details
    && candidate.command === bug.command
    && candidate.specId === bug.specId
  );
  if (existing) return existing;
  const id = `bug-${String(bugs.length + 1).padStart(3, "0")}`;
  const next = {
    id,
    status: "open",
    createdAt: nowIso(),
    ...bug
  };
  await saveBugs(config, notionUrl, [...bugs, next]);
  return next;
}

async function addOpenBugTasks(config, notionUrl, spec) {
  const bugs = await readBugs(config, notionUrl);
  const open = bugs.filter((bug) => (bug.status || "open") === "open" && !bug.taskId);
  if (!open.length) return null;
  let nextSpec = spec;
  let nextOrder = (nextSpec.tasks || []).reduce((max, task) => Math.max(max, task.order || 0), 0) + 1;
  const updatedBugs = bugs.map((bug) => {
    if (!open.some((candidate) => candidate.id === bug.id)) return bug;
    const taskId = `task-${String(nextOrder).padStart(3, "0")}`;
    const dependencies = (nextSpec.tasks || []).filter((task) => task.status === "completed").map((task) => task.id);
    const task = {
      id: taskId,
      title: `[bug] ${bug.title}`,
      status: "pending",
      order: nextOrder,
      kind: "bug_fix",
      objective: bug.details || bug.title,
      instructions: [
        "Fix the logged bug below with a fresh focused pass.",
        `Source: ${bug.source || "unknown"}`,
        bug.command ? `Command/check: ${bug.command}` : null,
        bug.artifactPath ? `Artifact: ${bug.artifactPath}` : null,
        bug.details ? `Details: ${bug.details}` : null,
        "Make the smallest coherent fix and rerun the relevant checks."
      ].filter(Boolean).join("\n"),
      acceptanceCriteria: [
        "The logged bug is fixed.",
        "Relevant automated checks pass.",
        "No unrelated behavior is changed."
      ],
      testPlan: bug.command ? [bug.command] : nextSpec.feedbackLoops || nextSpec.repoContext?.feedbackLoops || ["Run relevant checks."],
      risk: "medium",
      dependencies,
      createdAt: nowIso()
    };
    nextSpec = { ...nextSpec, status: "planned", tasks: [...(nextSpec.tasks || []), task], updatedAt: nowIso() };
    nextOrder += 1;
    return { ...bug, taskId, status: "task_created", updatedAt: nowIso() };
  });
  await saveBugs(config, notionUrl, updatedBugs);
  return nextSpec;
}

async function workers(flags) {
  const config = await loadConfig();
  const requested = optionalString(flags, "worker", config.defaultAgent || "claude");
  const supported = ["claude"];
  console.log("Worker adapters");
  for (const worker of supported) {
    const selected = worker === requested ? " (selected)" : "";
    console.log(`- ${worker}${selected}`);
  }
  if (!supported.includes(requested)) {
    console.log(`Unsupported worker: ${requested}`);
    console.log("Current MVP supports Claude Code only. Codex/OpenCode adapters are planned.");
  }
}

async function ship(flags) {
  const config = await loadConfig();
  const notionUrl = requireFlag(flags, "ntn");
  const spec = await loadSpec(config, notionUrl);
  const program = await loadProgram(config, notionUrl);
  const programSpec = program?.specs?.at(-1);
  const target = spec || (program && programSpec ? programToStandaloneSpec(program, programSpec) : undefined);
  if (!target) throw new Error("No local spec or program found. Run plan/drive first.");

  const projectRoot = await resolveGitRoot(target.project);
  const branch = optionalString(flags, "branch", `build-fast/${target.slug || "changes"}`);
  const message = optionalString(flags, "message", `build_fast: ${target.title}`);
  const apply = flags.apply === true || flags.apply === "true";
  const createPr = flags.pr === true || flags.pr === "true";
  const force = flags.force === true || flags.force === "true";
  const projectPathspec = await gitPathspec(projectRoot, target.project);
  const collection = await collectSummary(config, notionUrl, target, undefined, { uncollectedOnly: true, skipMissing: true });
  const changedFiles = await gitChangedFiles(projectRoot, projectPathspec);
  const repoUrl = await gitRemoteUrl(projectRoot);

  if (!apply) {
    console.log("Ship preview");
    console.log(`Project git root: ${projectRoot}`);
    console.log(`Project pathspec: ${projectPathspec}`);
    console.log(`Branch: ${branch}`);
    console.log(`Commit message: ${message}`);
    console.log(`Changed files: ${changedFiles.length}`);
    for (const file of changedFiles) console.log(`  ${file}`);
    if (collection.reports.length) {
      console.log("Uncollected completed worktree output:");
      for (const report of collection.reports) console.log(`  ${report.task.id}: ${report.changedFiles.length} file${report.changedFiles.length === 1 ? "" : "s"}`);
    }
    console.log("Commands:");
    console.log(`  git -C ${projectRoot} switch -c ${branch}  # or switch existing branch`);
    console.log(`  git -C ${projectRoot} add -- ${projectPathspec}`);
    console.log(`  git -C ${projectRoot} commit -m ${JSON.stringify(message)}`);
    console.log(`  git -C ${projectRoot} push -u origin ${branch}`);
    if (createPr) console.log(`  gh pr create --draft --title ${JSON.stringify(target.title)} --body <generated body>`);
    console.log("Dry run only. Rerun with --apply to create branch/commit/push.");
    return;
  }

  if (collection.reports.length && !force) {
    throw new Error(
      [
        "Ship refused because completed worktree output has not been collected.",
        "Run `build_fast collect --ntn <page>` to inspect it, then collect/apply the intended task.",
        "Use --force only if you intentionally want to ship the current checkout without collecting those outputs."
      ].join("\n")
    );
  }
  if (!changedFiles.length) {
    throw new Error(`No git changes found under ${projectPathspec}. Nothing to ship.`);
  }

  await switchShipBranch(projectRoot, branch);
  await git(["-C", projectRoot, "add", "--", projectPathspec]);
  const staged = await gitChangedFiles(projectRoot, projectPathspec, { staged: true });
  if (!staged.length) throw new Error(`No staged changes found under ${projectPathspec}. Nothing to commit.`);
  await git(["-C", projectRoot, "commit", "-m", message]);
  await git(["-C", projectRoot, "push", "-u", "origin", branch]);
  console.log(`Pushed ${branch}.`);

  let prUrl = "";
  if (createPr) {
    const body = shipPrBody(target);
    try {
      const { stdout } = await execFileAsync("gh", ["pr", "create", "--draft", "--title", target.title, "--body", body], {
        cwd: projectRoot,
        timeout: 30000
      });
      prUrl = stdout.trim().split("\n").find((line) => /^https?:\/\//.test(line.trim()))?.trim() || "";
      console.log(stdout.trim());
    } catch (error) {
      console.log(`PR creation failed: ${firstOutputLine(error.stderr || error.stdout || error.message)}`);
      prUrl = await existingPrUrl(projectRoot, branch);
      if (prUrl) console.log(`Using existing PR: ${prUrl}`);
    }
  }

  const shippedAt = nowIso();
  const shipPatch = {
    branch,
    commit: (await git(["-C", projectRoot, "rev-parse", "--short", "HEAD"])).trim(),
    repoUrl,
    prUrl,
    message,
    shippedAt
  };
  await saveShipMetadata({ config, notionUrl, spec, program, programSpec, shipPatch });
  await sync({ ntn: notionUrl });
  const syncedTarget = await loadShipSummaryTarget(config, notionUrl, spec ? undefined : programSpec?.id);
  await writeShipSummary(config, syncedTarget?.notion?.specPageUrl || target.notion?.specPageUrl || notionUrl, syncedTarget || target, shipPatch);
  console.log(`Ship metadata synced${prUrl ? `: ${prUrl}` : "."}`);
}

function shipPrBody(spec) {
  const tasks = (spec.tasks || []).map((task) => `- ${task.status}: ${task.id} ${task.title}`).join("\n") || "- No tasks recorded.";
  return [
    `Spec: ${spec.title}`,
    "",
    "Goal:",
    spec.goal,
    "",
    "Tasks:",
    tasks,
    "",
    "Generated by build_fast."
  ].join("\n");
}

async function switchShipBranch(projectRoot, branch) {
  const localBranches = (await git(["-C", projectRoot, "branch", "--list", branch])).trim();
  if (localBranches) {
    await git(["-C", projectRoot, "switch", branch]);
    return;
  }
  await git(["-C", projectRoot, "switch", "-c", branch]);
}

async function gitPathspec(projectRoot, projectDir) {
  const relative = path.relative(projectRoot, projectDir) || ".";
  if (isUnsafeRelativePath(relative)) throw new Error(`Unsafe project path outside git root: ${projectDir}`);
  return relative;
}

async function gitChangedFiles(projectRoot, pathspec, options = {}) {
  const args = ["-C", projectRoot, "diff", "--name-only"];
  if (options.staged) args.push("--cached");
  args.push("--", pathspec);
  const tracked = (await git(args)).split("\n").map((line) => line.trim()).filter(Boolean);
  if (options.staged) return tracked;
  const untracked = (await git(["-C", projectRoot, "ls-files", "--others", "--exclude-standard", "--", pathspec]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

async function gitRemoteUrl(projectRoot) {
  try {
    return (await git(["-C", projectRoot, "remote", "get-url", "origin"])).trim();
  } catch {
    return "";
  }
}

async function existingPrUrl(projectRoot, branch) {
  try {
    const { stdout } = await execFileAsync("gh", ["pr", "view", branch, "--json", "url", "--jq", ".url"], {
      cwd: projectRoot,
      timeout: 30000
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function saveShipMetadata({ config, notionUrl, spec, program, programSpec, shipPatch }) {
  if (spec) {
    await saveSpec(config, notionUrl, {
      ...spec,
      status: "completed",
      ship: shipPatch,
      githubRepoUrl: shipPatch.repoUrl,
      githubPrUrl: shipPatch.prUrl,
      updatedAt: nowIso()
    });
    return;
  }
  if (!program || !programSpec) return;
  const updatedProgram = updateProgramSpec(program, programSpec.id, {
    status: "completed",
    ship: shipPatch,
    githubRepoUrl: shipPatch.repoUrl,
    githubPrUrl: shipPatch.prUrl
  });
  await saveProgram(config, notionUrl, updatedProgram);
}

async function loadShipSummaryTarget(config, notionUrl, programSpecId) {
  if (!programSpecId) return loadSpec(config, notionUrl);
  const program = await loadProgram(config, notionUrl);
  const spec = program?.specs?.find((candidate) => candidate.id === programSpecId);
  return program && spec ? programToStandaloneSpec(program, spec) : undefined;
}

async function writeShipSummary(config, notionTarget, spec, shipPatch) {
  const lines = [
    "## build_fast Ship",
    `Branch: ${shipPatch.branch}`,
    `Commit: ${shipPatch.commit}`,
    shipPatch.repoUrl ? `Repo: ${shipPatch.repoUrl}` : null,
    shipPatch.prUrl ? `PR: ${shipPatch.prUrl}` : "PR: not created",
    `Shipped: ${shipPatch.shippedAt}`
  ].filter(Boolean);
  await writeToNotion(config, notionTarget, lines.join("\n\n"), { label: `ship ${spec.title}` });
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
