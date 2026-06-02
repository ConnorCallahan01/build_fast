# Roadmap

`build_fast` is intentionally small right now. The next work should make the loop safer, clearer, and easier to trust.

## Near Term

### Better Goal Intake

- Ask targeted clarifying questions before drafting a goal contract. MVP added.
- Add reusable question sets by work type: feature, bug, chore, refactor, review.
- Make acceptance criteria more measurable by default.
- Preserve the original user intent alongside the refined contract.

### Stronger Planning

- Improve repo scanning with better framework/test detection.
- Generate task dependencies more reliably.
- Add explicit integration tasks when parallel workers touch shared files.
- Add plan quality checks before workers start.

### Safer Drive Mode

- Improve feedback-loop command validation.
- Make failed feedback checks easier to inspect and rerun.
- Add clearer recovery commands after partial drive runs.
- Add a `--dry-run` preview for drive orchestration.

### Better Collection

- Add structured summaries of file overlaps.
- Support patch-based collection instead of whole-file copy. MVP patch preview added.
- Add conflict previews and merge guidance.
- Track which completed task is the integrated candidate.

## Medium Term

### Worker Adapters

- Add adapters for Codex and OpenCode.
- Let specs choose preferred worker runtimes.
- Support per-task permission profiles.
- Add worker logs and artifacts to Notion pages.

### Review Workflows

- Expand review types: `pr_readiness`, `security`, `user_qa`, `regression`, `docs`.
- Create review findings as Notion tasks. MVP local/Notion sync path added.
- Add automated fix loops from review findings.

### GitHub Integration

- Create branches and PRs from collected output. MVP `ship` preview/apply path added.
- Link Notion specs to GitHub PRs.
- Pull CI status back into Notion.
- Support PR review comments as follow-up tasks.

### Packaging

- Publish as an npm package with a real `build_fast` binary.
- Add install docs and versioned releases.
- Add config initialization.

## Longer Term

### Multi-Project Control Plane

- Support multiple Notion workspaces/pages from one config.
- Add project presets and default command profiles.
- Add cross-project status views.

### Agent Quality

- Add prompt evaluation fixtures.
- Track task success/failure metrics.
- Compare worker outputs before collection.
- Add configurable risk budgets by autopilot mode.

### Notion Templates

- Generate the Notion database structure automatically where possible.
- Provide importable Notion templates.
- Validate and repair property mismatches.

## Non-Goals For Now

- Replacing a human approval step for high-risk changes.
- Running destructive git operations automatically.
- Becoming a general-purpose project management tool.
- Supporting every Notion schema shape before the core loop is stable.
