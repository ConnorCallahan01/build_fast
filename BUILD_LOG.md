# build_fast Build Log

This file is the durable trail for what we build, why we built it, and what remains.

## MVP Checklist

- [x] Create repo-local build log and checklist.
- [x] Scaffold a runnable Node CLI.
- [x] Add local `.build_fast/` run ledger conventions.
- [x] Add prompt templates for planning, worker execution, review, and Stop hook policy.
- [x] Add Notion URL parsing and API helper.
- [x] Add config loading from file and environment.
- [x] Add Claude Code worker adapter.
- [x] Add `doctor`, `plan`, `run`, `start`, `status`, `stop`, and `review` commands.
- [x] Add `sync` command for pushing the current local spec to a Notion page.
- [x] Make `sync` default to data-source rows instead of append-only blocks.
- [x] Add `inspect` command to discover child Notion databases and their properties.
- [x] Add `--no-agent` planning path for deterministic smoke tests.
- [x] Initialize this directory as a git repository.
- [x] Add README with current MVP usage and limits.
- [ ] Exercise against a real Notion integration.
- [ ] Exercise against a real target project.
- [x] Exercise against the local `test_projects/moon_pantry` fixture.
- [x] Add first git worktree-backed `swarm`.
- [ ] Add stronger Notion database/schema mapping.
- [ ] Add TypeScript build once package tooling is installed.

## 2026-06-01

### Step 1: MVP Shape

The CLI is being built as a Ralph loop controller:

- Notion is the human-readable spec/task/status layer.
- `.build_fast/` is the local machine-readable run ledger.
- Claude Code is the first-class worker runtime for the MVP.
- Each worker receives a complete prompt packet and exits with structured JSON.
- `build_fast` owns orchestration, logging, status, and process supervision.

Initial implementation avoids external npm dependencies so the fresh directory can run immediately.

### Step 2: First Runnable CLI

Implemented a Node ESM CLI with:

- `doctor` for environment checks.
- `plan`/`start` for spec generation.
- `run` for one-task Ralph loop execution through Claude Code.
- `status` for local task state.
- `stop` for recorded worker PIDs.
- `review` for Claude-backed review prompts.

The first implementation stores machine state under `.build_fast/`, which is gitignored.

Initialized git after the sandbox blocked the first `git init`; retrying with approval succeeded.

### Step 3: Smoke Tests

Verified:

- `npm run check`
- `node bin/build_fast.js doctor`
- `node bin/build_fast.js plan --goal "Create a sample MVP smoke-test spec" --ntn local-smoke-test --project . --type chore --no-agent`
- `node bin/build_fast.js status --ntn local-smoke-test`
- `./bin/build_fast.js status --ntn local-smoke-test` outside the sandbox after marking the bin executable.

Not verified yet:

- Live Notion writes, because no `NOTION_API_TOKEN` is configured in this shell.

### Step 5: End-to-End Fixture Run

Verified the local integration path against `test_projects/moon_pantry`:

1. Baseline `npm test` failed as expected because `createSnackPlan` returned no snacks.
2. `build_fast plan --no-agent` created a local spec for `moon-pantry-local`.
3. First sandboxed worker run failed because Claude Code could not create its normal session directory under `~/.claude/projects`.
4. Rerunning with approved external permissions succeeded.
5. Claude implemented `src/moon-pantry.js`.
6. `npm test` now passes.
7. `build_fast status --ntn moon-pantry-local` reports the spec and task as completed.

This confirms the MVP loop works locally:

- local spec ledger
- worker prompt generation
- Claude Code process launch
- structured result parsing
- task status update
- active worker cleanup
- testable code change in a target project

Still not verified:

- Live Notion writes, because no `NOTION_API_TOKEN` is configured in this shell.

### Step 6: Fluid Notion Page Validation

User provided Notion page:

`https://www.notion.so/TEMP-build_fast-notion-sync-372f7118384a80babbdff7546ea18fbc?source=copy_link`

Fixed Notion URL parsing so titled slugs ending in a page ID resolve to the final 32 hex characters. The parsed page ID is:

`372f7118-384a-80ba-bbdf-f7546ea18fbc`

Important product clarification: this page is not wired into config or code. It is just one example target passed through `--ntn`. The intended model is:

- Every command receives the active Notion target from `--ntn`.
- The URL is normalized into a page ID.
- Local state is keyed by that page ID under `.build_fast/specs/`.
- Different projects/specs can use different Notion pages without changing config.

Added `doctor --ntn` to validate parsed page IDs and page access for whichever page URL is passed. Current result for the example page:

- Page ID parses correctly.
- Live access is blocked because `NOTION_API_TOKEN` is not configured in this shell.

Commands run:

- `node bin/build_fast.js doctor --ntn "https://www.notion.so/TEMP-build_fast-notion-sync-372f7118384a80babbdff7546ea18fbc?source=copy_link"`
- `node bin/build_fast.js plan --goal "Verify build_fast can sync a spec, tasks, and run summaries to this Notion page" --ntn "https://www.notion.so/TEMP-build_fast-notion-sync-372f7118384a80babbdff7546ea18fbc?source=copy_link" --project test_projects/moon_pantry --type chore --no-agent`
- `node bin/build_fast.js sync --ntn "https://www.notion.so/TEMP-build_fast-notion-sync-372f7118384a80babbdff7546ea18fbc?source=copy_link"`

The local spec for this page is stored at:

`.build_fast/specs/372f7118-384a-80ba-bbdf-f7546ea18fbc/spec.json`

### Step 7: Notion Database Inspection

The synced page has two child databases, so append-only markdown is not the correct long-term model. Added:

`node bin/build_fast.js inspect --ntn "<notion-page-url>"`

The command:

- retrieves the target page
- lists child database blocks
- uses Notion-Version `2026-03-11`
- treats Notion data sources as the primary schema model
- falls back to legacy database schema retrieval only if data source discovery fails
- prints property names, types, and select/status options
- writes the full inspection JSON to `.build_fast/notion-inspect/<page-id>.json`

This gives us deterministic schema discovery for each fluid `--ntn` target. The agent can still help infer which database is "Specs" vs "Tasks", but the CLI should own the API writes once the mapping is known.

### Step 8: Latest Notion API Version

Reviewed official Notion docs:

- `https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11`
- `https://developers.notion.com/reference/data-source`

Updated the CLI to default to Notion API version `2026-03-11`. Existing generated configs that still contain the old `2022-06-28` default are migrated at load time unless `NOTION_VERSION` overrides it.

The 2026-03-11 guide introduces breaking changes around block insertion (`after` -> `position`), trash/archive naming (`archived` -> `in_trash`), and transcription blocks (`transcription` -> `meeting_notes`). The current `build_fast` API usage does not rely on the removed fields, so the upgrade is compatible.

### Step 9: Data Source Sync

Updated `sync` so the default mode writes structured rows instead of appending markdown blocks:

- `Specs` data source receives the spec row.
- `Spec Tasks` data source receives task rows.
- Task rows relate back to the created spec page through the `Spec` relation.
- Created Notion page IDs are stored back into local `.build_fast/specs/<page-id>/spec.json`.

The old append-only behavior is still available for debugging:

`node bin/build_fast.js sync --ntn "<page>" --mode blocks`

### Step 10: Run Status Sync

Updated `run` to treat synced Notion rows as the live dashboard:

- Before a worker starts, spec status is set to `Building`.
- Before a worker starts, task status is set to `In progress`.
- After a worker completes, task status is set to `Done` for completed tasks, otherwise `In progress`.
- Run summaries are appended to the synced task page.
- When all local tasks are complete, spec status is set to `Shipped`.

If a spec has not been synced to data sources yet, these updates are skipped and local execution still works.

### Step 11: Database Page Content Refresh

Updated `sync` to refresh database page content, not only row properties:

- Existing spec pages receive a `build_fast Sync Snapshot` section.
- Existing task pages receive a `build_fast Task Snapshot` section.
- New pages still receive their full initial spec/task content at creation.

This keeps the Notion database row page bodies useful when rows are updated repeatedly.

### Step 12: Run-Time Snapshot Refresh

Updated `run` so it does not need a broad full sync after every worker:

- After each task run, the task page receives both the run summary and a fresh `build_fast Task Snapshot`.
- When the spec is complete, the spec page receives a fresh `build_fast Sync Snapshot`.

This keeps the live Notion pages current while avoiding duplicate snapshots on unrelated task pages.

### Step 13: Idempotent Snapshot Sections

Changed snapshot writing from append-only to replace-in-place:

- `build_fast Sync Snapshot` is treated as a managed section on spec pages.
- `build_fast Task Snapshot` is treated as a managed section on task pages.
- Before writing a fresh snapshot, `build_fast` deletes the previous managed section and appends the new one.
- Run summaries remain append-only so task pages keep durable execution history.

Fixed a deletion bug from the first idempotency attempt: the old collector stopped at inner headings such as `Objective`, leaving orphan snapshot content behind. The collector now treats only top-level managed headings as section boundaries and cleans up legacy orphan `Objective / Latest Summary / Test Result` groups on task pages.

### Step 14: Notion Upsert/Dedupe

Added data-source query support and made `sync` recover existing Notion rows before creating new ones:

- Spec row lookup uses `Specs` data source with `Name == spec.title` and `Project == spec.project`.
- Task row lookup uses `Spec Tasks` data source with `Name == task.title` and `Spec` relation containing the spec page.
- If existing rows are found, their page IDs are attached to local state and updated.
- If no rows are found, new pages are created as before.

This prevents duplicate rows if local `.build_fast` state is missing or incomplete.

### Step 4: Local Integration Fixture

Added `test_projects/moon_pantry`, a tiny no-dependency Node project with intentionally failing tests. It gives `build_fast` a safe target for end-to-end planning and worker execution.

### Step 15: Notion Page Compaction

Added an explicit `compact` command for noisy task pages:

- `compact --ntn <page> --keep-runs 1` keeps the latest `build_fast Run:` section per task page.
- Older run sections are deleted only when this command is requested.
- Managed spec and task snapshots are refreshed during compaction.

This keeps normal `run` history durable by default while giving the user a cleanup command for Notion pages.

### Step 16: First Worktree Swarm

Added `swarm` as the first parallel worker command:

- Selects dependency-ready pending or failed tasks.
- Creates one git branch and worktree per selected task.
- Runs Claude in the matching project subdirectory inside each worktree.
- Supports `--concurrency` and `--max-tasks`.
- Records branch/worktree metadata in local task state and Notion run summaries.
- Places worktrees under the OS temp directory instead of nesting them inside the main checkout.

This is the execution primitive for multi-agent work. Merge, PR, and conflict handling are still future work.

### Step 17: Data Source Query Fix

Fixed live Notion sync after the first multi-task spec exposed an endpoint bug:

- `queryDataSource` now uses `POST /v1/data_sources/{id}/query`.
- Added a regression test that captures the Notion client method, URL, and API version.

The official Notion API reference documents data source query as a POST endpoint.

### Step 18: Swarm Git Readiness Check

The first live swarm test hit an unborn `HEAD` because the repo had been initialized but never committed. Git worktrees need a real commit as their base.

Updated `swarm` to fail with a clear setup error when:

- the project is not inside a git repository
- the repository has no initial commit

Also changed the CLI wrapper to print concise error messages by default. Full stacks are still available with `BUILD_FAST_DEBUG=1`.

The next live test should create an initial commit before rerunning swarm.

### Step 19: Worktree Collection

The first full swarm run completed all three Moon Pantry tasks, but task changes stayed isolated in their worktrees. Task 003 independently reimplemented task 001/002 behavior because earlier task worktrees were not merged into its base.

Added `collect`:

- Default mode reports changed files from completed worktree-backed tasks.
- `--task <id>` scopes collection to one task.
- `--apply` copies changed files from the task worktree into the main checkout.
- Paths are checked before copying so absolute paths or `..` traversal are refused.

This gives the user a manual integration step before we build smarter merge/conflict automation.

Fixed a dry-run parsing bug where trimming `git status --short` output before removing the two status columns dropped the first character from file paths.

After applying task 003 with `collect --apply`, the Moon Pantry fixture passed `npm test` from the main checkout. This verifies the loop from spec creation through Notion sync, swarm execution, collection, and target-project feedback.

Collection now records `collectedAt` and `collectedFiles` on applied tasks, and `status` displays `[collected]` for those tasks.

### Step 20: Collection Overlap Guard

Made `collect` safer for parallel worktree output:

- Dry runs now report overlapping changed files across completed task worktrees.
- `collect --apply` refuses to apply multiple tasks when they changed the same file.
- Users can choose a single task with `--task <id>` or explicitly apply all in task order with `--force`.

This prevents accidental last-writer-wins collection when parallel agents touched the same file.

### Step 21: Dependency-Aware Swarm Bases

Updated `swarm` so dependent tasks can start with completed dependency output:

- When a task has completed dependencies, `swarm` copies changed files from each dependency worktree into the new task worktree before Claude starts.
- The copied dependency files are recorded in task metadata as `dependencyOverlays`.
- This avoids the earlier behavior where task 003 had to reimplement task 001/002 because its worktree started from the original `HEAD`.

This is still file-overlay based, not a full merge engine. Overlap handling remains part of `collect`.

### Step 22: Worktree Cleanup

Added `cleanup`:

- Dry-run by default, listing recorded swarm worktrees.
- `--apply` removes worktrees.
- `--task <id>` scopes cleanup to one task.
- `--force` passes through to `git worktree remove --force`.
- `--branches` also deletes task branches when combined with `--apply`.

This gives each big run a way to reset local swarm artifacts.

### Step 23: Collection Recommendation

The second big run showed dependency overlays working: task 005's worktree contained the integrated source, tests, and docs from its dependency chain. `collect` still reported overlaps across task worktrees, which is correct, but it left the user to infer which task should be applied.

Added a collection recommendation:

- Dry-run `collect` now recommends the latest dependency-chain task that contains every overlapped file.
- Refused multi-task `collect --apply` includes the recommended `--task <id> --apply` command.

For the Moon Pantry recommendation/category run, this should recommend task 005.

### Step 24: Repo-Aware Planning

Added a deterministic repository scan before planning:

- Captures git root, branch, head, and short status.
- Reads package scripts and README content.
- Lists tracked project files.
- Detects likely runtimes, source directories, test directories, and feedback loops.
- Feeds this context into the spec planning prompt.
- Stores a compact repo context summary on the local spec.

This should make generated plans more codebase-specific and improve task ordering/test quality.

### Step 25: Drive Command

Added `drive` as the first end-to-end runner:

- Plans if no local spec exists and `--goal` is provided.
- Syncs to Notion.
- Runs `swarm` until no dependency-ready pending tasks remain.
- Uses `collect` recommendation logic to choose the integration task.
- Applies automatically for `junior_mode` and `boss_mode`; `intern_mode` stops before apply.
- Runs repo feedback loops after collection.
- Syncs to Notion again when checks pass.

Also made cleanup tolerate already-deleted task branches so repeated cleanup runs are less brittle.

### Step 26: Drive Fresh-Goal Detection

The first real `drive --goal ...` test reused the existing completed spec for the same Notion page and ignored the newly supplied goal. That made `drive` run feedback checks for the previous spec instead of planning new work.

Fixed `drive` so:

- `drive --ntn <page>` resumes the existing local spec.
- `drive --ntn <page> --goal "new goal"` replans when the supplied goal differs from the stored spec goal.
- `drive --no-agent` now stops after plan/sync for a local smoke test instead of continuing into swarm.
- Swarm branch names are now flat (`build-fast-<slug>-<task>`) to avoid nested git ref/path issues.

This preserves resume behavior while making explicit goals authoritative.

### Step 27: Goal Contract Stage

Added a structured goal-shaping stage:

- `goal --goal ... --ntn <page> --project <dir> --type <type>` scans the repo and asks Claude to produce a goal contract.
- The contract captures finalGoal, intent, targetChanges, acceptanceCriteria, outOfScope, assumptions, questions, and riskLevel.
- The contract is saved under the Notion-keyed local spec directory as `goal.json`.
- `drive --from-goal --ntn <page>` uses the saved `finalGoal` as the authoritative goal.
- `goal --no-agent` provides a deterministic local smoke path.

This separates "what the user wants" from planning/execution and gives the user a confirmation artifact before agents start coding.

Updated the goal stage to be interactive in TTY terminals:

- After drafting the contract, the CLI asks the user to approve, edit, or quit.
- Edit mode can revise the final goal and append target-change, acceptance, out-of-scope, and assumption notes.
- `--yes` or `--non-interactive` skips prompting for automation.

This makes the goal contract an explicit user-confirmed checkpoint before `drive --from-goal`.

Refined the interactive edit UX after testing:

- The approval prompt now shows clear actions before asking for input.
- Edit mode is a numbered menu instead of a sequence of ambiguous fields.
- Adding a refinement preserves the drafted final goal and appends the new requirement, instead of accidentally replacing the whole goal.
- Full final-goal rewrite is still available as an explicit separate action.
- `--interactive` can force the prompt flow for test harnesses or piped input; `--yes` remains the non-interactive approval path.

### Step 28: Status Dashboard

Expanded `status` from a task list into a lightweight dashboard:

- Shows project path and Notion spec URL.
- Shows task counts by state and collected count.
- Shows the next runnable task.
- Shows feedback loops from repo-aware planning.
- Shows collection overlap warnings and recommended integration task.
- Shows task branch/worktree metadata when present.

### Step 29: Program Mode Stabilization

The next product push is larger goals that break into multiple specs/phases instead of one flat task list. An uncommitted program-mode attempt existed, but the key bug was that later spec worktrees were still created from git `HEAD`. If spec 1 had been collected into the main checkout but not committed, spec 2 workers could miss that previous spec output.

Stabilized the direction by:

- Treating `project`, `refactor`, `init`, and `overhaul` as multi-spec program types.
- Adding a `multi-spec.md` planning prompt for phased programs.
- Adding program ledger helpers under `.build_fast/specs/<id>/program/program.json`.
- Adding program-aware `plan`, `drive`, `status`, `sync`, `compact`, `collect`, and `cleanup` paths.
- Carrying the current target project snapshot into each program worktree before workers run, so later specs can build on collected-but-uncommitted earlier spec output.
- Marking programs completed when every spec completes.
- Adding a no-agent regression test for program plan/status/drive ledger behavior.

This still needs a live agent-backed program run before it should be considered fully proven.

### Step 30: Live Program-Mode Smoke

Ran a live agent-backed program-mode smoke against an ignored `test_projects/orbit_notes` fixture.

The run proved the right high-level shape:

- `drive --type project` generated a two-spec program.
- Spec 2 correctly depended on Spec 1.
- Workers ran through Claude Code in worktrees.
- Program `status` showed `2/2` specs completed.
- The target fixture passed `npm test` and `node --check src/orbit-notes.js`.

The live run also exposed important orchestration bugs:

- Worktree recovery aborted when deleting a branch that did not exist.
- Ignored target projects were invisible to git-based collection, so worker changes could be missed.
- Program collection applied overlapping task outputs in task order, which could lose earlier task work.
- Dependency overlays copied from repo root paths instead of the target project subdir.
- Program tasks without explicit dependencies did not inherit prior completed task output inside the same spec.
- Generated feedback-loop prose such as `npm test (must stay green...)` could be executed literally.
- `git diff --stat` style generated inspection commands are not reliable feedback checks for ignored fixtures.

Fixed those issues by:

- Making worktree branch cleanup tolerant.
- Falling back to content comparison for collection when git sees no changes.
- Applying the recommended integration task when program collection sees overlapping outputs.
- Using the target project subdir for dependency overlays.
- Overlaying prior completed tasks for program specs, even when the planner omits explicit task dependencies.
- Tightening feedback command normalization and rejecting git inspection commands as automated feedback loops.

Remaining caveat: the first live run collected some output before the overlap fix landed, so later workers recovered additively. A fresh run after the fixes generated the right program shape and completed, but we should add automated tests for overlay propagation before calling program mode production-grade.

### Step 31: Power Workflow MVPs

Added first-pass versions of the next high-leverage product features:

- `program` command as an explicit multi-spec entrypoint.
- Goal intake questions before contract drafting in interactive terminals.
- `collect --patch` for patch previews before applying worktree output.
- `review --create-tasks` to turn review findings into follow-up implementation tasks and sync them.
- `workers` command and explicit `--worker claude` validation so unsupported adapters fail clearly.
- `ship` dry-run/apply command for branch, commit, push, and optional draft PR creation through `gh`.

These are intentionally MVP-grade surfaces. They make the workflow more powerful without changing the core Claude/worktree/Notion execution model.

### Step 32: Feedback Repair Loop

The Orbit Notes browser UI program exposed a missing recovery path: feedback checks could fail because generated feedback text contained non-runnable/manual commands, and `drive` stopped instead of handing the failure back to an agent.

Added:

- Feedback failures now create a `feedback_repair` task with the failed command/output as instructions.
- Program mode can continue after adding the repair task instead of losing the active spec.
- Active in-progress program specs resume from the active `spec.json` instead of being overwritten from stale `program.json`.
- Feedback command filtering now rejects server/manual/browser/curl/localhost checks and prose like `node --check on every new .js file`.

This let the UI demo program recover from malformed feedback commands and continue through all three specs.

### Step 33: Browser QA And Bug Ledger MVP

Added the first explicit final-pass QA path:

- `qa --type browser` starts the target project's `npm run demo` with a temporary `PORT`, waits for the local page, and checks for a browser-ready HTML demo with expected UI anchors and served JavaScript modules.
- QA failures are logged to `.build_fast/specs/<target>/bugs.json`.
- Feedback-loop failures are also logged to the same bug ledger before creating repair tasks.
- `bugs --ntn <target>` lists logged bugs.
- `bugs --ntn <target> --create-tasks` converts open bugs into pending `[bug]` Spec Tasks and syncs them to Notion, giving each bug a fresh worker pass.
- Duplicate bug entries are deduped across reruns by source/title/details/command/spec.

The current Notion behavior uses the existing Spec Tasks data source for bug-fix work. A dedicated Notion Bugs database remains a roadmap item.

### Step 34: Guarded GitHub Ship Flow

Hardened the `ship` command so it can complete the handoff from local collected work to GitHub review:

- Preview mode now shows the git root, target pathspec, changed files, and any uncollected completed worktree output.
- Apply mode refuses to ship when uncollected completed worktree output still exists unless `--force` is supplied.
- Apply mode creates or reuses the requested branch, stages only the target project path, commits, pushes, and optionally opens a draft PR with `gh pr create`.
- If PR creation fails because a PR already exists, `ship` attempts to recover the existing PR URL.
- Ship metadata now records branch, commit, repo URL, PR URL, message, and timestamp in local spec/program state.
- Notion sync now writes `GitHub Repo` and `GitHub PR` properties when those fields exist, then appends a ship summary.

### Step 35: Smart Parallel Execution MVP

Added a conservative smart parallel mode for faster worker runs without blindly increasing merge risk:

- Planner prompts now request `expectedFiles` and `parallelGroup` for every task.
- The ledger preserves those fields for single-spec and program tasks.
- `drive` and `swarm` accept `--parallel smart`.
- Smart mode selects dependency-ready tasks using expected-file overlap, parallel group, risk, and task-type heuristics.
- High-risk, serial, integration, final verification, repair, and same-area unknown-file tasks are deferred instead of batched.
- Smart swarm prints the selected group and deferred tasks before workers start.
- If completed smart-parallel outputs overlap during collect, `drive` creates a serial `parallel_integration` task with the overlapping files and dependency task IDs.
- Added regression coverage for smart task selection and integration-task creation.

### Step 36: Browser QA Served Asset Checks

The Orbit Notes redesign initially looked unstyled in the browser even though the generated CSS existed. Root cause: the server served `demo/index.html` at `/`, so relative links like `./styles.css` resolved to `/styles.css` instead of `/demo/styles.css`.

Added browser QA checks that:

- parse stylesheet and script tags from the served HTML,
- resolve URLs using browser-equivalent `new URL(asset, pageUrl)` behavior,
- fetch each linked asset,
- require `200` responses and CSS/JavaScript MIME types,
- cover the broken relative-path case with a fake-fetch regression test.

### Step 37: Configurable Browser QA Profiles

Generalized browser QA beyond the Orbit Notes fixture:

- Planner prompts now ask for a `browserQa` profile when browser/UI work is present.
- Single-spec and program ledgers preserve `browserQa`.
- Program specs inherit the program-level profile when driven as standalone specs.
- `qa --type browser` now uses configured `startCommand`, `url`, `requiredText`, `requiredSelectors`, `requiredAssets`, `requiredModules`, and `manualChecks`.
- Status output shows when browser QA is configured.
- The old Orbit Notes assumptions remain as a fallback for existing local tests.
- Added regression coverage for profile selector/text/module/asset checks.

### Step 38: Drive Final Browser QA

Added `drive --qa browser` as an optional final QA pass:

- After normal feedback checks pass, single-spec drive can run browser QA automatically.
- Program drive runs browser QA after all specs complete.
- QA failures are logged to the bug ledger and converted into `[bug]` Spec Tasks.
- Program-mode QA bug tasks are written back into the active program spec so rerunning `drive` can launch fresh fix workers.
- `--qa` without a value is treated as `--qa browser`.

### Step 39: Final QA Repair Loop And Artifacts

Tightened the end-of-drive QA loop:

- Completed programs no longer do redundant Notion syncs before final QA.
- Browser QA failures now write JSON artifacts under `.build_fast/specs/<target>/qa-artifacts/` with failed checks, all checks, QA profile, served URL, and captured HTML.
- Logged browser QA bugs include the artifact path.
- Generated `[bug]` Spec Tasks include the artifact path in their worker instructions.
- In `junior_mode` and `boss_mode`, `drive --qa browser` creates bug tasks, runs one automatic fresh-worker repair cycle by default, applies safe repair output, reruns feedback checks, and reruns browser QA.
- `--max-qa-repairs <n>` controls the bounded repair loop; `0` keeps the older create-task-and-stop behavior.
- Standalone `qa --type browser` also writes artifacts when failures occur.
