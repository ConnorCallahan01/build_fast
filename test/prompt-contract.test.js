import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const specPrompt = await readFile("prompts/spec.md", "utf8");
const multiSpecPrompt = await readFile("prompts/multi-spec.md", "utf8");

for (const prompt of [specPrompt, multiSpecPrompt]) {
  assert.match(prompt, /Prefer parallelizable decomposition/);
  assert.match(prompt, /Minimize (task )?dependencies/);
  assert.match(prompt, /Use precise expectedFiles/);
  assert.match(prompt, /Use "serial" only/);
}

assert.match(multiSpecPrompt, /Do not make every spec depend on the previous spec/);
assert.match(multiSpecPrompt, /smart parallel mode can select 2 or more ready tasks/);
assert.match(specPrompt, /The first ready batch should contain multiple independent low-risk tasks/);

console.log("prompt contract tests passed");
