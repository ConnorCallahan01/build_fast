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
