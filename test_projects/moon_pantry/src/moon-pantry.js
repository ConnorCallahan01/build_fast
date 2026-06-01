const DEFAULT_SNACKS = [
  "moon cheese cubes",
  "stardust trail mix",
  "lunar oat bites",
  "comet crackers",
  "gravity-free grapes"
];

const SNACK_CATEGORIES = [
  ["drink", ["tea", "water", "soup", "juice"]],
  ["fruit", ["grape", "mango", "fruit", "berry"]],
  ["crunchy", ["cracker", "chip", "mix", "nut", "crisp"]],
  ["savory", ["cheese", "miso"]]
];

function categorizeSnack(name) {
  const lower = String(name).toLowerCase();
  for (const [category, keywords] of SNACK_CATEGORIES) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return category;
    }
  }
  return "other";
}

export function createSnackPlan({ crewSize, mood, pantry }) {
  const size = Number.isInteger(crewSize) && crewSize > 0 ? crewSize : 1;

  const sanitized = [];
  if (Array.isArray(pantry)) {
    for (const entry of pantry) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      if (!sanitized.includes(trimmed)) sanitized.push(trimmed);
    }
  }

  const available = sanitized.length > 0 ? sanitized : DEFAULT_SNACKS;

  const snacks = [];
  for (let i = 0; i < size; i++) {
    snacks.push(available[i % available.length]);
  }

  const distinctSnacks = [...new Set(snacks)];
  const varietyScore = distinctSnacks.length;

  const categoryBreakdown = {};
  for (const snack of snacks) {
    const category = categorizeSnack(snack);
    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
  }

  const categoryOrder = [...SNACK_CATEGORIES.map(([category]) => category), "other"];
  let dominantCategory = categoryOrder[categoryOrder.length - 1];
  let dominantCount = -1;
  for (const category of categoryOrder) {
    const count = categoryBreakdown[category] || 0;
    if (count > dominantCount) {
      dominantCount = count;
      dominantCategory = category;
    }
  }

  const varietyLabel = varietyScore >= size ? "good variety" : "low variety";
  const recommendation = `For your crew of ${size} feeling ${mood}, expect ${varietyLabel} (${varietyScore} distinct snacks) with mostly ${dominantCategory} snacks.`;

  return {
    crewSize: size,
    mood,
    snacks,
    hydrationReminder: "Remember to sip water or warm tea to stay hydrated.",
    summary: `A calm, quiet snack plan to help the ${mood} moon crew rest easy.`,
    varietyScore,
    distinctSnacks,
    categoryBreakdown,
    recommendation
  };
}

export function createShoppingList(plan) {
  const snacks = Array.isArray(plan.snacks) ? plan.snacks : [];
  const crewSize = plan.crewSize;
  const hydrationReminder = plan.hydrationReminder;

  const quantities = new Map();
  const firstSeenOrder = [];
  for (const snack of snacks) {
    if (!quantities.has(snack)) {
      quantities.set(snack, 0);
      firstSeenOrder.push(snack);
    }
    quantities.set(snack, quantities.get(snack) + 1);
  }

  const categoryOrder = [...SNACK_CATEGORIES.map(([category]) => category), "other"];

  const items = [];
  for (const category of categoryOrder) {
    for (const name of firstSeenOrder) {
      if (categorizeSnack(name) === category) {
        items.push({ name, quantity: quantities.get(name), category });
      }
    }
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const lines = [];
  lines.push(`Moon crew shopping list for a crew of ${crewSize}`);
  for (const item of items) {
    lines.push(`- ${item.quantity}x ${item.name}`);
  }
  lines.push(`Total items: ${totalItems}`);
  lines.push(hydrationReminder);
  const printable = lines.join("\n");

  return { items, totalItems, printable };
}
