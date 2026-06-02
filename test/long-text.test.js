import assert from "node:assert/strict";
import { askLongText } from "../src/commands.js";

const questions = [];
const answers = [
  "Create a working prototype",
  "",
  "Patient view should answer:",
  "1. Am I close to baseline?",
  "2. What changed overnight?",
  "/done"
];

const rl = {
  async question(prompt) {
    questions.push(prompt);
    return answers.shift();
  }
};

const originalLog = console.log;
console.log = () => {};

let value;
let fallback;
try {
  value = await askLongText(rl, "What do you want to build?");
  fallback = await askLongText({ question: async () => "" }, "Goal", "Existing goal");
} finally {
  console.log = originalLog;
}

assert.equal(value, [
  "Create a working prototype",
  "",
  "Patient view should answer:",
  "1. Am I close to baseline?",
  "2. What changed overnight?"
].join("\n"));
assert.deepEqual(questions, ["> ", "", "", "", "", ""]);

assert.equal(fallback, "Existing goal");

console.log("long text tests passed");
