import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

const bulletWrapped = wrapBlock("A long active bug title that should wrap without creating another bullet marker.", {
  width: 42,
  indent: "  - ",
  continuationIndent: "    ",
  maxLines: 4
});
const bulletLines = bulletWrapped.split("\n");
assert.match(bulletLines[0], /^\s+- /);
assert.match(bulletLines[1], /^\s{4}\S/);

const selected = await select("Harness", ["claude", "codex"], "codex", {
  input: { isTTY: false },
  output: { isTTY: false }
});
assert.equal(selected, "codex");

const fakeInput = new EventEmitter();
fakeInput.isTTY = true;
fakeInput.isRaw = false;
fakeInput.setRawMode = (value) => {
  fakeInput.isRaw = value;
};
fakeInput.resume = () => {};

let fakeOutput = "";
const fakeStream = {
  isTTY: true,
  columns: 80,
  write(value) {
    fakeOutput += value;
  }
};

const selectPromise = select("Work type", ["feature", "project"], "feature", {
  input: fakeInput,
  output: fakeStream
});
setTimeout(() => {
  fakeInput.emit("data", Buffer.from("\u001b[B"));
  fakeInput.emit("data", Buffer.from("\r"));
}, 0);
assert.equal(await selectPromise, "project");
assert.match(fakeOutput, /Work type/);
assert.equal(fakeInput.isRaw, false);

const enterInput = new EventEmitter();
enterInput.isTTY = true;
enterInput.isRaw = false;
enterInput.setRawMode = (value) => {
  enterInput.isRaw = value;
};
enterInput.resume = () => {};
const enterPromise = select("Work type", ["feature", "project"], "project", {
  input: enterInput,
  output: fakeStream
});
setTimeout(() => {
  enterInput.emit("data", Buffer.from("\r\n"));
}, 0);
assert.equal(await enterPromise, "project");
assert.equal(enterInput.isRaw, false);

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
