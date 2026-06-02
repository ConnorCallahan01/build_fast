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
- Add expected-file and parallel-group hints for workers. MVP added.
- Add explicit integration tasks when parallel workers touch shared files. MVP added for smart parallel mode.
- Add plan quality checks before workers start. MVP warnings/errors added with `drive --dry-run` and `--strict-plan`.
- Improve planner prompts for parallelizable plans. MVP prompts now ask for minimal dependencies, precise expected files, and serial-only hard blockers.

### Safer Drive Mode

- Add smart parallel execution for independent tasks. MVP `--parallel smart` added.
- Run browser QA as an optional final drive pass. MVP `--qa browser` added.
- Improve feedback-loop command validation.
- Make failed feedback checks easier to inspect and rerun. MVP repair-task loop added.
- Log feedback and QA bugs into a ledger and convert them into final-pass fix tasks. MVP added.
- Sync bug ledger entries into a Notion `Bugs` data source when present. MVP added.
- Run final-pass bug workers automatically at the end of `drive`. MVP added for browser QA in `junior_mode`.
- Add clearer recovery commands after partial drive runs.
- Add a `--dry-run` preview for drive orchestration. MVP added.

### Browser QA

- Add structured browser QA for static demo apps. MVP added.
- Add project/spec-specific browser QA profiles. MVP added.
- Capture failure artifacts for failed UI checks. MVP JSON artifacts added.
- Add Playwright-backed render and interaction checks when dependencies are available. MVP added.
- Capture screenshots for failed rendered UI checks. MVP base64 artifact capture added.
- Capture richer DOM snapshots for failed UI checks.

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

- Create branches and PRs from collected output. Guarded `ship --apply --pr` MVP added, with generated PR bodies, Bugs context, `--base`, and draft/ready control.
- Link Notion specs to GitHub PRs. MVP writes repo/PR URLs when the Notion properties exist.
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
- Add an optional dedicated Bugs data source for QA/final-pass failures.

## Non-Goals For Now

- Replacing a human approval step for high-risk changes.
- Running destructive git operations automatically.
- Becoming a general-purpose project management tool.
- Supporting every Notion schema shape before the core loop is stable.
