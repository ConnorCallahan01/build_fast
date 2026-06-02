import assert from "node:assert/strict";
import { animatedBanner, banner, keyValue, line, section, select, wrapBlock } from "../src/terminal.js";

const wrapped = wrapBlock("This is a long worker summary that should wrap into several readable terminal lines.", {
  width: 38,
  indent: "    ",
  maxLines: 3
});

const lines = wrapped.split("\n");
assert.ok(lines.length > 1);
assert.ok(lines.length <= 3);
for (const line of lines) {
  assert.ok(line.length <= 42);
}
assert.match(lines[0], /^\s+This is a long/);

const selected = await select("Harness", ["claude", "codex"], "codex", {
  input: { isTTY: false },
  output: { isTTY: false }
});
assert.equal(selected, "codex");

const writes = [];
const originalLog = console.log;
console.log = (...args) => writes.push(args.join(" "));
try {
  banner("build_fast", "Project setup");
  await animatedBanner("build_fast", "Project setup", { output: { isTTY: false } });
  section("Workspace");
  keyValue("project", "/tmp/app");
  line("Planned 3 tasks for: Example");
} finally {
  console.log = originalLog;
}
const output = writes.join("\n");
assert.match(output, /____  _   _ ___ _/);
assert.match(output, /plan \/ swarm \/ verify \/ ship/);
assert.equal((output.match(/plan \/ swarm \/ verify \/ ship/g) || []).length, 2);
assert.match(output, /Workspace/);
assert.match(output, /project:/);
assert.match(output, /Planned 3 tasks/);

console.log("terminal tests passed");
