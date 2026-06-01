You are shaping a build_fast development goal before planning or implementation.

Raw user goal:
{{goal}}

Type:
{{type}}

Project directory:
{{project}}

Notion:
{{notionUrl}}

Repository context:
{{repoContext}}

Return only JSON with this shape:

{
  "finalGoal": "clear confirmed goal statement, specific enough to plan from",
  "intent": "what the user is trying to accomplish",
  "targetChanges": ["concrete behavior, files, UI, API, docs, tests, or data changes expected"],
  "acceptanceCriteria": ["observable condition that proves the goal is done"],
  "outOfScope": ["things that should not be changed"],
  "assumptions": ["safe assumptions you made"],
  "questions": ["short question only if the answer would materially change implementation"],
  "riskLevel": "low|medium|high"
}

Rules:
- Be concrete and repo-aware.
- Prefer a finalGoal that can be handed directly to autonomous coding agents.
- Do not invent product requirements beyond the user's goal and repository context.
- Keep questions few; ask only for decisions that materially affect implementation.
- Include test expectations in acceptanceCriteria.
