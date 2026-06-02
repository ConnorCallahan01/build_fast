import assert from "node:assert/strict";
import { select, wrapBlock } from "../src/terminal.js";

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

console.log("terminal tests passed");
