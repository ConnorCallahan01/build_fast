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
