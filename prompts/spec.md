You are planning a build_fast-managed development spec.

Goal:
{{goal}}

Type:
{{type}}

Project directory:
{{project}}

Notion:
{{notionUrl}}

Repository first-pass context:
{{repoContext}}

Use the repository context to create a useful implementation plan. Return only JSON with this shape:

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
      "dependencies": [],
      "expectedFiles": ["likely relative files or directories this task will touch"],
      "parallelGroup": "short group label for tasks that can safely run together, or serial"
    }
  ]
}

Planning rules:
- Make tasks small enough for one fresh Claude Code invocation.
- Prefer risky/foundational tasks early.
- Include feedback loops that prove done.
- Use the detected project scripts and files instead of generic test instructions.
- Include dependencies when later tasks need earlier task output.
- Include expectedFiles for each task so build_fast can avoid parallel workers editing the same files.
- Use parallelGroup to mark safe parallel batches. Use "serial" for integration, shared-file, risky, or final verification tasks.
- Avoid creating tasks that only restate the goal without codebase-specific guidance.
- Do not write code during planning.
