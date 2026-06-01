import assert from "node:assert/strict";
import { createSnackPlan } from "../src/moon-pantry.js";

const plan = createSnackPlan({
  crewSize: 3,
  mood: "sleepy",
  pantry: ["sesame crackers", "dried mango", "mint tea", "miso soup"]
});

assert.equal(plan.crewSize, 3);
assert.equal(plan.mood, "sleepy");
assert.ok(Array.isArray(plan.snacks), "snacks should be an array");
assert.ok(plan.snacks.length >= 3, "there should be at least one snack per crew member");
assert.ok(plan.snacks.every((snack) => typeof snack === "string" && snack.length > 0), "snacks should be named");
assert.match(plan.hydrationReminder, /water|hydrate|tea/i);
assert.match(plan.summary, /calm|quiet|rest|sleep|moon/i);

const fallback = createSnackPlan({
  crewSize: 2,
  mood: "curious",
  pantry: []
});

assert.equal(fallback.crewSize, 2);
assert.ok(fallback.snacks.length >= 2, "fallback pantry should still produce snacks");
assert.match(fallback.summary, /curious|moon|crew/i);

console.log("moon-pantry tests passed");

