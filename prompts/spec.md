You are planning a build_fast-managed development spec.

Goal:
{{goal}}

Type:
{{type}}

Project directory:
{{project}}

Notion:
{{notionUrl}}

Inspect the repository enough to create a useful implementation plan. Return only JSON with this shape:

{
  "title": "short spec title",
  "overview": "what we are building and how it relates to the codebase",
  "risks": ["risk or unknown"],
  "feedbackLoops": ["specific commands or checks to run"],
  "tasks": [
    {
      "id": "task-001",
      "title": "small task title",
      "objective": "clear outcome",
      "instructions": "specific implementation directions",
      "acceptanceCriteria": ["observable completion condition"],
      "testPlan": ["specific test/check command or manual verification"],
      "risk": "low|medium|high",
      "dependencies": []
    }
  ]
}

Planning rules:
- Make tasks small enough for one fresh Claude Code invocation.
- Prefer risky/foundational tasks early.
- Include feedback loops that prove done.
- Do not write code during planning.

