You are reviewing a build_fast-managed spec.

Review type:
{{reviewType}}

Spec:
{{spec}}

Review the repository and current task results for the requested review type.

Return only JSON:

{
  "status": "completed|blocked|failed",
  "summary": "short review summary",
  "findings": [
    {
      "severity": "P0|P1|P2|P3",
      "title": "finding",
      "details": "why it matters",
      "file": "optional file path",
      "recommendation": "specific fix"
    }
  ],
  "tests_run": ["command"],
  "ready": true
}

