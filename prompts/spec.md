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
  "browserQa": {
    "startCommand": "command to start a local browser demo, or empty string",
    "url": "http://127.0.0.1:${PORT}/",
    "requiredText": ["text that must appear in the served HTML"],
    "requiredSelectors": ["#id or .class anchors that must appear in HTML"],
    "requiredAssets": true,
    "requiredModules": ["served JavaScript module paths such as /demo/app.js"],
    "manualChecks": ["browser behavior for the user to verify manually"],
    "render": true,
    "interactions": [
      {
        "name": "short rendered behavior check name",
        "steps": [
          { "action": "fill", "selector": "#field-id", "value": "sample value" },
          { "action": "click", "selector": "button[type='submit']" },
          { "action": "expectText", "text": "text visible after the action" }
        ]
      }
    ]
  },
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
- Prefer parallelizable decomposition over broad sequential tasks. The first ready batch should contain multiple independent low-risk tasks whenever the codebase allows it.
- Minimize dependencies. Add a dependency only when a task truly requires another task's output, not merely because it is conceptually later.
- Prefer risky/foundational tasks early, but isolate them into the smallest possible shared-file task so independent docs, tests, fixtures, styles, or demo-data tasks can still run in parallel.
- Include feedback loops that prove done.
- Use the detected project scripts and files instead of generic test instructions.
- If the project has a browser demo or UI, include browserQa. Use empty startCommand when no browser QA applies.
- For browser UI work, include rendered interaction steps when selectors are predictable. Supported actions are fill, click, expectText, and expectSelector.
- Include dependencies only when later tasks need earlier task output.
- Include expectedFiles for each task so build_fast can avoid parallel workers editing the same files.
- Use precise expectedFiles. Prefer exact files over broad directories such as src/ or demo/ when you can predict them.
- Use parallelGroup as a human-readable area label such as core, ui, tests, docs, data, or styles. Use "serial" only for integration, shared-file migration, high-risk, or final verification tasks that must run alone.
- If several tasks would edit the same source file, consider making one source-file task plus separate independent tests/docs/demo-data tasks instead of chaining every task.
- Do not make a final verification task the only runnable task in a batch when independent implementation tasks can be planned first.
- Avoid creating tasks that only restate the goal without codebase-specific guidance.
- Do not write code during planning.
