import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir, newId, nowIso, readJson, slugify, writeJson } from "./util.js";
import { specKeyFromNotion as keyFromNotion } from "./notion.js";

export function ledgerRoot(config, cwd = process.cwd()) {
  return path.resolve(cwd, config.ledgerDir || ".build_fast");
}

export function specDir(config, notionUrl, cwd = process.cwd()) {
  return path.join(ledgerRoot(config, cwd), "specs", keyFromNotion(notionUrl));
}

export async function loadSpec(config, notionUrl, cwd = process.cwd()) {
  return readJson(path.join(specDir(config, notionUrl, cwd), "spec.json"), undefined);
}

export async function saveSpec(config, notionUrl, spec, cwd = process.cwd()) {
  const dir = specDir(config, notionUrl, cwd);
  await ensureDir(dir);
  await writeJson(path.join(dir, "spec.json"), spec);
}

export async function createRun(config, notionUrl, task, cwd = process.cwd()) {
  const run = {
    id: newId("run"),
    taskId: task?.id,
    status: "running",
    startedAt: nowIso(),
    completedAt: null
  };
  const dir = path.join(specDir(config, notionUrl, cwd), "runs", run.id);
  await ensureDir(dir);
  await writeJson(path.join(dir, "run.json"), run);
  return { run, dir };
}

export async function finishRun(runDir, patch) {
  const filePath = path.join(runDir, "run.json");
  const run = await readJson(filePath, {});
  await writeJson(filePath, { ...run, ...patch, completedAt: nowIso() });
}

export async function savePrompt(runDir, prompt) {
  await writeFile(path.join(runDir, "prompt.md"), prompt);
}

export async function saveText(runDir, name, content) {
  await writeFile(path.join(runDir, name), String(content || ""));
}

export async function readTemplate(name) {
  const filePath = path.resolve(process.cwd(), "prompts", name);
  return readFile(filePath, "utf8");
}

export function makeSpec({ goal, type, project, notionUrl, plan }) {
  const title = plan?.title || goal.slice(0, 80);
  return {
    id: keyFromNotion(notionUrl),
    title,
    slug: slugify(title),
    goal,
    type,
    project,
    notionUrl,
    status: "planned",
    overview: plan?.overview || "",
    risks: plan?.risks || [],
    feedbackLoops: plan?.feedbackLoops || [],
    tasks: (plan?.tasks || []).map((task, index) => ({
      id: task.id || `task-${String(index + 1).padStart(3, "0")}`,
      title: task.title || `Task ${index + 1}`,
      status: "pending",
      order: index + 1,
      objective: task.objective || "",
      instructions: task.instructions || "",
      acceptanceCriteria: task.acceptanceCriteria || [],
      testPlan: task.testPlan || [],
      risk: task.risk || "medium",
      dependencies: task.dependencies || []
    })),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    notion: {}
  };
}

export const MULTI_SPEC_TYPES = new Set(["project", "refactor", "init", "overhaul"]);

export function isMultiSpecType(type) {
  return MULTI_SPEC_TYPES.has(String(type || "").toLowerCase());
}

export function programDir(config, notionUrl, cwd = process.cwd()) {
  return path.join(specDir(config, notionUrl, cwd), "program");
}

export function makeProgram({ goal, type, project, notionUrl, plan }) {
  const specs = (plan?.specs || []).map((raw, index) => {
    const specSlug = slugify(raw.title || `spec-${index + 1}`);
    const specId = raw.id || `spec-${String(index + 1).padStart(3, "0")}`;
    return {
      id: specId,
      title: raw.title || `Spec ${index + 1}`,
      slug: specSlug,
      overview: raw.overview || "",
      dependencies: raw.dependencies || [],
      order: index + 1,
      status: "planned",
      notion: {},
      tasks: (raw.tasks || []).map((task, taskIndex) => ({
        id: task.id || `task-${String(taskIndex + 1).padStart(3, "0")}`,
        title: task.title || `Task ${taskIndex + 1}`,
        status: "pending",
        order: taskIndex + 1,
        objective: task.objective || "",
        instructions: task.instructions || "",
        acceptanceCriteria: task.acceptanceCriteria || [],
        testPlan: task.testPlan || [],
        risk: task.risk || "medium",
        dependencies: task.dependencies || []
      })),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  });

  return {
    id: keyFromNotion(notionUrl),
    title: plan?.title || goal.slice(0, 80),
    slug: slugify(plan?.title || goal.slice(0, 60)),
    goal,
    type,
    project,
    notionUrl,
    overview: plan?.overview || "",
    risks: plan?.risks || [],
    feedbackLoops: plan?.feedbackLoops || [],
    specs,
    status: "planned",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

export async function saveProgram(config, notionUrl, program, cwd = process.cwd()) {
  const dir = programDir(config, notionUrl, cwd);
  await ensureDir(dir);
  await writeJson(path.join(dir, "program.json"), program);
}

export async function loadProgram(config, notionUrl, cwd = process.cwd()) {
  return readJson(path.join(programDir(config, notionUrl, cwd), "program.json"), undefined);
}

export async function loadProgramSpec(config, notionUrl, specId, cwd = process.cwd()) {
  const program = await loadProgram(config, notionUrl, cwd);
  if (!program) return undefined;
  return program.specs.find((s) => s.id === specId);
}

export async function saveProgramSpec(config, notionUrl, updatedSpec, cwd = process.cwd()) {
  const program = await loadProgram(config, notionUrl, cwd);
  if (!program) throw new Error("No program found.");
  program.specs = program.specs.map((s) => (s.id === updatedSpec.id ? updatedSpec : s));
  program.updatedAt = nowIso();
  await saveProgram(config, notionUrl, program, cwd);
}

export function readyProgramSpecs(program) {
  const completedIds = new Set(
    (program.specs || []).filter((s) => s.status === "completed").map((s) => s.id)
  );
  return [...(program.specs || [])]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.status === "planned" || s.status === "in_progress")
    .filter((s) => (s.dependencies || []).every((dep) => completedIds.has(dep)));
}

export function programToStandaloneSpec(program, spec) {
  const specTaskIds = new Set((spec.tasks || []).map((t) => t.id));
  const resolvedDeps = new Set();
  for (const ancestor of program.specs || []) {
    if (ancestor.id === spec.id) break;
    for (const t of ancestor.tasks || []) {
      resolvedDeps.add(t.id);
    }
  }
  return {
    id: `${program.id}-${spec.id}`,
    title: spec.title,
    slug: spec.slug,
    goal: program.goal,
    type: program.type,
    project: program.project,
    notionUrl: program.notionUrl,
    status: spec.status,
    overview: spec.overview,
    risks: program.risks || [],
    feedbackLoops: program.feedbackLoops || [],
    tasks: (spec.tasks || []).map((task) => {
      const deps = (task.dependencies || []).filter((dep) => specTaskIds.has(dep));
      const resolved = (task.dependencies || []).filter((dep) => !specTaskIds.has(dep) && resolvedDeps.has(dep));
      return {
        ...task,
        dependencies: deps,
        _resolvedCrossSpecDeps: resolved.length ? resolved : undefined
      };
    }),
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
    notion: spec.notion || {},
    _program: { id: program.id, specId: spec.id }
  };
}

export function updateProgramSpec(program, specId, specPatch) {
  return {
    ...program,
    updatedAt: nowIso(),
    specs: program.specs.map((s) =>
      s.id === specId ? { ...s, ...specPatch, updatedAt: nowIso() } : s
    )
  };
}

export function updateProgramSpecTask(program, specId, taskId, taskPatch) {
  const spec = program.specs.find((s) => s.id === specId);
  if (!spec) return program;
  const updatedTasks = spec.tasks.map((t) =>
    t.id === taskId ? { ...t, ...taskPatch, updatedAt: nowIso() } : t
  );
  const allDone = updatedTasks.every((t) => t.status === "completed");
  return updateProgramSpec(program, specId, {
    tasks: updatedTasks,
    status: allDone ? "completed" : spec.status
  });
}

export function attachNotionSpecPage(spec, page) {
  return {
    ...spec,
    notion: {
      ...(spec.notion || {}),
      specPageId: page.id,
      specPageUrl: page.url
    },
    updatedAt: nowIso()
  };
}

export function clearNotionSpecPage(spec) {
  return {
    ...spec,
    notion: {},
    tasks: spec.tasks.map((task) => ({
      ...task,
      notion: undefined
    })),
    updatedAt: nowIso()
  };
}

export function attachNotionTaskPage(spec, taskId, page) {
  return {
    ...spec,
    updatedAt: nowIso(),
    tasks: spec.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            notion: {
              ...(task.notion || {}),
              taskPageId: page.id,
              taskPageUrl: page.url
            },
            updatedAt: nowIso()
          }
        : task
    )
  };
}

export function nextPendingTask(spec) {
  return [...(spec.tasks || [])]
    .sort((a, b) => a.order - b.order)
    .find((task) => task.status === "pending" || task.status === "failed");
}

export function updateTask(spec, taskId, patch) {
  return {
    ...spec,
    status: patch.status === "completed" && allTasksCompleted(spec, taskId) ? "completed" : spec.status,
    updatedAt: nowIso(),
    tasks: spec.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: nowIso() } : task))
  };
}

function allTasksCompleted(spec, completingTaskId) {
  return spec.tasks.every((task) => task.id === completingTaskId || task.status === "completed");
}

export async function activeWorkersPath(config, cwd = process.cwd()) {
  return path.join(ledgerRoot(config, cwd), "state", "active-workers.json");
}

export async function readActiveWorkers(config, cwd = process.cwd()) {
  return readJson(await activeWorkersPath(config, cwd), []);
}

export async function writeActiveWorkers(config, workers, cwd = process.cwd()) {
  await writeJson(await activeWorkersPath(config, cwd), workers);
}
