const DEFAULT_SNACKS = [
  "moon cheese cubes",
  "stardust trail mix",
  "lunar oat bites",
  "comet crackers",
  "gravity-free grapes"
];

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

  return {
    crewSize: size,
    mood,
    snacks,
    hydrationReminder: "Remember to sip water or warm tea to stay hydrated.",
    summary: `A calm, quiet snack plan to help the ${mood} moon crew rest easy.`,
    varietyScore,
    distinctSnacks
  };
}
