import assert from "node:assert/strict";
import { createSnackPlan, createShoppingList } from "../src/moon-pantry.js";

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

// invalid crewSize values should all coerce to a positive integer >= 1
for (const badCrewSize of [0, -1, 1.5, "three", undefined]) {
  const coerced = createSnackPlan({ crewSize: badCrewSize, mood: "x", pantry: ["a"] });
  assert.ok(
    Number.isInteger(coerced.crewSize) && coerced.crewSize >= 1,
    `crewSize ${JSON.stringify(badCrewSize)} should coerce to a positive integer >= 1`
  );
  assert.equal(coerced.crewSize, 1, `invalid crewSize ${JSON.stringify(badCrewSize)} should coerce to 1`);
  assert.ok(
    coerced.snacks.length >= coerced.crewSize,
    `there should be at least crewSize snacks for crewSize ${JSON.stringify(badCrewSize)}`
  );
}

// messy pantry input should be sanitized: trim, drop non-strings/empties, de-duplicate (first-seen order)
const messy = createSnackPlan({ crewSize: 6, mood: "x", pantry: ["a", "a", "", " b ", 5, null, "  ", "c", "b"] });
assert.ok(
  messy.snacks.every((snack) => ["a", "b", "c"].includes(snack)),
  "snacks should be drawn only from the sanitized pantry ['a','b','c']"
);
assert.deepEqual(messy.distinctSnacks, ["a", "b", "c"], "sanitized distinct snacks should be ['a','b','c'] in first-seen order");

// empty / missing / all-invalid pantry should fall back to DEFAULT_SNACKS and still yield at least crewSize snacks
for (const badPantry of [undefined, [], "not-an-array", [5, null, "", "   ", {}]]) {
  const fb = createSnackPlan({ crewSize: 4, mood: "x", pantry: badPantry });
  assert.ok(
    fb.snacks.length >= 4,
    `fallback for pantry ${JSON.stringify(badPantry)} should yield at least crewSize snacks`
  );
  assert.ok(
    fb.snacks.every((snack) => typeof snack === "string" && snack.length > 0),
    `fallback snacks for pantry ${JSON.stringify(badPantry)} should be non-empty strings`
  );
}

// varietyScore should be an integer equal to distinctSnacks.length, with no duplicate distinct snacks
for (const sample of [plan, fallback, messy]) {
  assert.ok(Number.isInteger(sample.varietyScore), "varietyScore should be an integer");
  assert.ok(Array.isArray(sample.distinctSnacks), "distinctSnacks should be an array");
  assert.equal(
    sample.varietyScore,
    sample.distinctSnacks.length,
    "varietyScore should equal distinctSnacks.length"
  );
  assert.equal(
    sample.distinctSnacks.length,
    new Set(sample.distinctSnacks).size,
    "distinctSnacks should contain no duplicates"
  );
  if (sample.snacks.length > 0) {
    assert.ok(sample.varietyScore >= 1, "varietyScore should be >= 1 when snacks is non-empty");
  }
}

const CATEGORIES = ["drink", "fruit", "crunchy", "savory", "other"];

for (const sample of [plan, fallback, messy]) {
  assert.equal(typeof sample.recommendation, "string", "recommendation should be a string");
  assert.ok(sample.recommendation.length > 0, "recommendation should be non-empty");
  assert.ok(
    sample.recommendation.includes(String(sample.crewSize)),
    "recommendation should reference crew size"
  );
  assert.match(sample.recommendation, /variety/i, "recommendation should reference variety");
  assert.ok(
    sample.recommendation.includes(String(sample.varietyScore)),
    "recommendation should reference the variety score"
  );

  assert.ok(
    sample.categoryBreakdown && typeof sample.categoryBreakdown === "object" && !Array.isArray(sample.categoryBreakdown),
    "categoryBreakdown should be a plain object"
  );
  const keys = Object.keys(sample.categoryBreakdown);
  assert.ok(keys.length > 0, "categoryBreakdown should have at least one category");
  for (const key of keys) {
    assert.ok(CATEGORIES.includes(key), `categoryBreakdown key ${key} should be a defined category`);
    const count = sample.categoryBreakdown[key];
    assert.ok(Number.isInteger(count) && count > 0, `categoryBreakdown count for ${key} should be a positive integer`);
  }
  const total = Object.values(sample.categoryBreakdown).reduce((a, b) => a + b, 0);
  assert.equal(total, sample.snacks.length, "categoryBreakdown counts should sum to snacks.length");

  let dominant = CATEGORIES[CATEGORIES.length - 1];
  let dominantCount = -1;
  for (const category of CATEGORIES) {
    const count = sample.categoryBreakdown[category] || 0;
    if (count > dominantCount) {
      dominantCount = count;
      dominant = category;
    }
  }
  assert.ok(
    sample.recommendation.includes(dominant),
    "recommendation should name a category present in categoryBreakdown"
  );
  assert.ok(dominant in sample.categoryBreakdown, "dominant category should appear in categoryBreakdown");
}

for (const sample of [plan, fallback, messy]) {
  const result = createShoppingList(sample);

  assert.ok(Array.isArray(result.items), "shopping list items should be an array");
  for (const item of result.items) {
    assert.equal(typeof item.name, "string", "item.name should be a string");
    assert.ok(item.name.length > 0, "item.name should be non-empty");
    assert.ok(
      Number.isInteger(item.quantity) && item.quantity > 0,
      "item.quantity should be a positive integer"
    );
    assert.ok(CATEGORIES.includes(item.category), `item.category ${item.category} should be a defined category`);
  }

  const quantitySum = result.items.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(quantitySum, sample.snacks.length, "item quantities should sum to snacks.length");
  assert.equal(quantitySum, result.totalItems, "item quantities should sum to totalItems");
  assert.equal(result.totalItems, sample.snacks.length, "totalItems should equal snacks.length");

  assert.equal(typeof result.printable, "string", "printable should be a string");
  assert.ok(result.printable.length > 0, "printable should be non-empty");
  assert.ok(
    result.printable.includes(String(sample.crewSize)),
    "printable should reference crew size"
  );
  for (const name of new Set(sample.snacks)) {
    assert.ok(result.printable.includes(name), `printable should list snack ${name}`);
  }
  assert.match(result.printable, /water|hydrate|tea/i, "printable should include a hydration reminder");

  const again = createShoppingList(sample);
  assert.deepEqual(result, again, "createShoppingList should be deterministic for the same plan");
}

console.log("moon-pantry tests passed");
