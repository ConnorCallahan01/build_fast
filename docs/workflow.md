# Workflow Guide

The recommended loop is:

```text
goal contract -> repo-aware plan -> Notion sync -> worker swarm -> collect -> feedback checks -> Notion sync
```

The failure recovery path is:

```text
feedback/QA failure
  -> local bug ledger
  -> pending bug-fix Spec Task
  -> fresh worker worktree
  -> collect + checks
  -> Notion sync
```

## Recommended Workflow

### 1. Shape The Goal

Start with an interactive goal contract. This is the main human checkpoint before agents plan or write code.

```bash
node bin/build_fast.js goal \
  --goal "Add a small CLI demo mode that prints a sample workflow" \
  --type feature \
  --project /path/to/your/project \
  --ntn "$NTN"
```

The CLI drafts a repo-aware contract, then asks:

Before drafting, interactive terminals may ask targeted intake questions based on the work type. Use `--skip-questions` to bypass this and go straight to the goal contract.

```text
Goal contract actions:
  a  approve and save
  e  edit/refine
  q  quit without saving
```

Edit mode supports:

```text
1  add refinement to final goal
2  rewrite final goal
3  add target change
4  add acceptance criterion
5  add out-of-scope note
6  done editing
```

For automation or smoke tests, skip the prompt:

```bash
node bin/build_fast.js goal \
  --goal "..." \
  --type feature \
  --project /path/to/your/project \
  --ntn "$NTN" \
  --yes
```

### 2. Drive The Full Loop

After approving the goal:

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --from-goal \
  --parallel smart \
  --qa browser \
  --autopilot junior_mode \
  --permission-profile managed \
  --concurrency 2 \
  --max-tasks 2
```

`drive` will:

- plan from the saved goal contract
- scan the repo and feed project context into planning
- sync spec/tasks to Notion
- run dependency-ready tasks in worktrees
- group ready tasks conservatively when `--parallel smart` is enabled
- overlay completed dependency outputs into dependent task worktrees
- collect the recommended integrated task
- run feedback checks
- run browser QA when `--qa browser` is enabled
- create a focused repair task when feedback checks fail, up to the configured repair limit
- create `[bug]` tasks when final browser QA fails
- sync final status back to Notion

Autopilot behavior:

| Mode | Behavior |
| --- | --- |
| `intern_mode` | Stops before applying collection |
| `junior_mode` | Applies the recommended integrated task when clear |
| `boss_mode` | Intended for more aggressive automation; currently similar to `junior_mode` for collection |

## Smart Parallel Execution

Use smart parallel mode when a spec has multiple independent tasks and you want faster worker throughput:

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --from-goal \
  --parallel smart \
  --concurrency 4 \
  --max-tasks 4 \
  --autopilot junior_mode \
  --permission-profile managed
```

Smart mode uses three layers of protection:

- planner hints: `expectedFiles` and `parallelGroup`
- local heuristics: high-risk, integration, final verification, and repair tasks are serialized
- collect recovery: if parallel outputs overlap anyway, `drive` creates a serial integration task instead of choosing one output blindly

The default mode remains unchanged. Use plain `drive` or `swarm` without `--parallel smart` when you want the existing dependency-ready batching behavior.

### 3. Verify The Target Project

Run the target project's checks yourself after `drive`:

```bash
cd /path/to/your/project
npm test
```

Check build_fast state:

```bash
node bin/build_fast.js status --ntn "$NTN"
```

### 4. Clean Worktrees

After a successful run:

```bash
node bin/build_fast.js cleanup --ntn "$NTN" --apply --force --branches
```

Without `--apply`, cleanup is a dry run.

## Manual Workflow

Use this when you want control over each stage.

Create a repo-aware plan directly:

```bash
node bin/build_fast.js plan \
  --goal "..." \
  --type feature \
  --project /path/to/your/project \
  --ntn "$NTN"
```

Sync to Notion:

```bash
node bin/build_fast.js sync --ntn "$NTN"
```

Run available tasks:

```bash
node bin/build_fast.js swarm \
  --ntn "$NTN" \
  --concurrency 2 \
  --max-tasks 2 \
  --autopilot junior_mode \
  --permission-profile managed
```

Repeat `swarm` until no pending tasks remain.

Inspect worktree outputs:

```bash
node bin/build_fast.js collect --ntn "$NTN"
```

Apply the recommended task:

```bash
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --apply
```

If multiple tasks changed the same file, `collect --apply` refuses by default and prints a recommendation. You can override with `--force`, but choosing the recommended task is usually safer.

Preview a patch before applying:

```bash
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --patch
```

## Program Workflow

Use program mode for larger goals that should become multiple specs/phases:

```bash
node bin/build_fast.js program \
  --goal "Build the MVP in phases" \
  --project /path/to/your/project \
  --ntn "$NTN"
```

Then drive the program:

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --type project \
  --autopilot junior_mode
```

Program mode runs one dependency-ready spec at a time. Later specs receive the current target project snapshot so they can build on earlier collected output.

## Feedback Repair

When automated feedback checks fail, `drive` creates a new pending repair task instead of only stopping with an error. The repair task includes:

- failed command
- captured output/error detail
- instructions to make the smallest coherent fix
- acceptance criteria requiring the failed checks to pass

Then rerun `drive`:

```bash
node bin/build_fast.js drive --ntn "$NTN" --autopilot junior_mode
```

The default repair limit is 2 attempts per spec. Override it with:

```bash
node bin/build_fast.js drive --ntn "$NTN" --max-repairs 3
```

Manual/browser/server checks are filtered from automated feedback where possible. Keep truly manual QA in the spec or Notion page, then verify it yourself after `drive`.

## Browser QA And Final Bug Pass

Use this after a UI/demo-oriented run. The current browser QA MVP assumes the target project has an `npm run demo` script that starts a local static server and honors the `PORT` environment variable.

```bash
node bin/build_fast.js qa --ntn "$NTN" --type browser
```

To make browser QA part of the main drive loop:

```bash
node bin/build_fast.js drive --ntn "$NTN" --qa browser
```

If final QA fails, `drive` logs the failures to the bug ledger, creates `[bug]` Spec Tasks, syncs them to Notion, and stops. Rerun `drive` to fix those QA bugs with fresh workers.

The QA command starts the demo, waits for the page, fetches the HTML, and checks for:

- a valid HTML page
- expected form/list/search/tag anchors
- a module script for the browser app
- served core and app JavaScript modules
- linked stylesheet/script assets resolved from the served page URL, with `200` responses and CSS/JavaScript MIME types

Plans can include a `browserQa` profile to make these checks project-specific:

```json
{
  "startCommand": "npm run demo",
  "url": "http://127.0.0.1:${PORT}/",
  "requiredText": ["Orbit Notes"],
  "requiredSelectors": ["#create-form", "#notes-list"],
  "requiredAssets": true,
  "requiredModules": ["/demo/app.js"],
  "manualChecks": ["Create a note", "Search by text", "Filter by tag"]
}
```

When no profile exists, `qa --type browser` falls back to the Orbit Notes fixture anchors so older local tests still work.

If checks fail, bugs are logged locally:

```bash
node bin/build_fast.js bugs --ntn "$NTN"
```

Turn those bugs into Notion-backed repair work:

```bash
node bin/build_fast.js bugs --ntn "$NTN" --create-tasks
node bin/build_fast.js drive --ntn "$NTN" --autopilot junior_mode --permission-profile managed
```

You can combine QA failure logging and task creation:

```bash
node bin/build_fast.js qa --ntn "$NTN" --type browser --create-task
```

This gives failed UI/server checks their own fresh worker instances instead of asking the same worker to keep patching in place.

## Status Dashboard

```bash
node bin/build_fast.js status --ntn "$NTN"
```

The dashboard shows:

- spec title and status
- project path
- Notion spec URL
- task counts
- next runnable task
- feedback loops
- collect state and overlap warnings
- task branch/worktree metadata
- active workers
