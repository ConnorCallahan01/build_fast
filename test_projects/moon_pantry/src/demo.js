import { createSnackPlan, createShoppingList } from "./moon-pantry.js";

const input = {
  crewSize: 3,
  mood: "sleepy",
  pantry: ["mint tea", "sesame crackers", "dried mango", "miso soup"]
};

const plan = createSnackPlan(input);
const list = createShoppingList(plan);

console.log("     _..._");
console.log("   .:::::::.   Moon Pantry");
console.log("  :::::::::::  snack demo");
console.log("   ':::::::'");
console.log("     `'::'");
console.log("");
console.log("=== Moon Pantry Snack Plan ===");
console.log(plan.summary);
console.log(plan.recommendation);
console.log(`Crew size: ${plan.crewSize}`);
console.log(`Mood: ${plan.mood}`);
console.log("Snacks:");
for (const snack of plan.snacks) {
  console.log(`- ${snack}`);
}
console.log("Category breakdown:");
for (const [category, count] of Object.entries(plan.categoryBreakdown)) {
  console.log(`  ${category}: ${count}`);
}
console.log(`Variety score: ${plan.varietyScore}`);

console.log("");
console.log("=== Shopping List ===");
console.log(list.printable);
