import { readFile } from "node:fs/promises";
import path from "node:path";

export async function renderPrompt(templateName, context) {
  const template = await readFile(path.resolve(process.cwd(), "prompts", templateName), "utf8");
  return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key) => {
    const value = get(context, key);
    if (Array.isArray(value) || (value && typeof value === "object")) return JSON.stringify(value, null, 2);
    return value === undefined || value === null ? "" : String(value);
  });
}

function get(object, dottedKey) {
  return dottedKey.split(".").reduce((current, key) => current?.[key], object);
}

