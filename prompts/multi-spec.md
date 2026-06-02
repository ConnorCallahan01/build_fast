You are planning a build_fast-managed development program with multiple specs (phases).

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

The user has given a large goal that needs to be broken into multiple sequential or dependency-ordered specs (phases). Each spec is a self-contained unit of work with its own tasks. Return only JSON with this shape:

{
  "title": "short program title",
  "overview": "what we are building and how the phases relate",
  "risks": ["risk or unknown"],
  "feedbackLoops": ["specific commands or checks to run after every spec"],
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
  "specs": [
    {
      "id": "spec-001",
      "title": "short spec title",
      "overview": "what this phase accomplishes and why it comes first",
      "dependencies": [],
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
  ]
}

Planning rules:
- Break the goal into the fewest specs that make sense. Typically 2-5 specs for a new project: setup, backbone/core, features, polish.
- Each spec must be independently verifiable. A spec should be shippable on its own even if later specs haven't started.
- Prefer a dependency graph that enables safe parallel execution. Do not make every spec depend on the previous spec unless the later spec truly requires completed output from the earlier spec.
- Use the dependencies array on each spec only for hard dependencies. Independent docs, demo-data, styling, tests, and isolated UI polish specs should usually have fewer dependencies.
- Order foundational work early, but keep it narrow. Avoid putting all shared-file edits, all tests, and all docs into one serial chain.
- Early specs may establish infrastructure: project scaffold, tooling, configuration, base types, test setup.
- Middle specs should build core behavior: data models, APIs, business logic, key UI.
- Late specs should add integration polish and final verification. Keep final verification serial, but avoid making implementation tasks serial just because they will be verified later.
- Within each spec, make tasks small enough for one fresh Claude Code invocation.
- Prefer parallelizable decomposition within each spec. The first ready task batch should contain multiple independent low-risk tasks whenever the codebase allows it.
- Minimize task dependencies. Add a dependency only when a task truly requires another task's output, not merely because it is conceptually later.
- Prefer risky/foundational tasks early within each spec, but isolate them into the smallest possible shared-file task so independent docs, tests, fixtures, styles, or demo-data tasks can still run in parallel.
- If the program has a browser demo or UI, include browserQa at the program level. Use empty startCommand when no browser QA applies.
- For browser UI work, include rendered interaction steps when selectors are predictable. Supported actions are fill, selectOption, click, expectText, and expectSelector.
- Use selectOption for <select> controls. Use specific selectors for repeated controls when possible; if a selector matches multiple elements, browser QA clicks the first match.
- Include expectedFiles for each task so build_fast can avoid parallel workers editing the same files.
- Use precise expectedFiles. Prefer exact files over broad directories such as src/ or demo/ when you can predict them.
- Use parallelGroup as a human-readable area label such as core, ui, tests, docs, data, or styles. Use "serial" only for integration, shared-file migration, high-risk, or final verification tasks that must run alone.
- If several tasks would edit the same source file, consider making one source-file task plus separate independent tests/docs/demo-data tasks instead of chaining every task.
- A healthy plan should usually have at least one spec where smart parallel mode can select 2 or more ready tasks, unless the goal is intrinsically single-file or high-risk.
- Include feedback loops that prove done at the program level.
- Use the detected project scripts and files instead of generic test instructions.
- Do not write code during planning.
