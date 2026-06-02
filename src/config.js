import path from "node:path";
import { ensureDir, readJson, writeJson } from "./util.js";

const DEFAULT_CONFIG = {
  defaultAgent: "claude",
  defaultAutopilot: "junior_mode",
  permissionProfile: "managed",
  defaultParallel: "smart",
  defaultQa: "browser",
  defaultConcurrency: 4,
  defaultMaxTasks: 5,
  defaultMaxQaRepairs: 1,
  defaultProject: ".",
  defaultNotion: "",
  notionVersion: "2026-03-11",
  ledgerDir: ".build_fast",
  claude: {
    command: "claude",
    outputFormat: "json",
    maxTurns: {
      intern_mode: 12,
      junior_mode: 30,
      boss_mode: 60
    },
    permissionMode: {
      intern_mode: "plan",
      junior_mode: "acceptEdits",
      boss_mode: "auto"
    }
  }
};

export async function loadConfig(cwd = process.cwd()) {
  const configPath = path.join(cwd, ".build_fast", "config.json");
  const fileConfig = await readJson(configPath, {});
  const configuredNotionVersion = process.env.NOTION_VERSION || fileConfig.notionVersion;
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    claude: {
      ...DEFAULT_CONFIG.claude,
      ...(fileConfig.claude || {}),
      maxTurns: {
        ...DEFAULT_CONFIG.claude.maxTurns,
        ...((fileConfig.claude || {}).maxTurns || {})
      },
      permissionMode: {
        ...DEFAULT_CONFIG.claude.permissionMode,
        ...((fileConfig.claude || {}).permissionMode || {})
      }
    },
    notionToken: process.env.NOTION_API_TOKEN || process.env.NOTION_TOKEN || fileConfig.notionToken,
    notionVersion: configuredNotionVersion === "2022-06-28" ? DEFAULT_CONFIG.notionVersion : configuredNotionVersion || DEFAULT_CONFIG.notionVersion
  };
}

export async function ensureConfig(cwd = process.cwd()) {
  const configDir = path.join(cwd, ".build_fast");
  const configPath = path.join(configDir, "config.json");
  await ensureDir(configDir);
  const existing = await readJson(configPath, undefined);
  if (!existing) {
    await writeJson(configPath, DEFAULT_CONFIG);
  }
  return loadConfig(cwd);
}

export async function saveConfigPatch(patch, cwd = process.cwd()) {
  const configDir = path.join(cwd, ".build_fast");
  const configPath = path.join(configDir, "config.json");
  await ensureDir(configDir);
  const existing = await readJson(configPath, {});
  const next = {
    ...existing,
    ...patch,
    claude: {
      ...(existing.claude || {}),
      ...(patch.claude || {})
    }
  };
  await writeJson(configPath, next);
  return loadConfig(cwd);
}
