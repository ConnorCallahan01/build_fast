# build_fast

`build_fast` is a Notion-backed development partner CLI for running autonomous coding loops against a project repo.

It uses Notion as the human control plane, local git worktrees as isolated agent workspaces, and Claude Code as the current worker runtime. The intended loop is:

```text
goal contract -> repo-aware plan -> Notion sync -> swarm workers -> collect integrated result -> feedback checks -> Notion sync
```

## Requirements

- Node.js 20+
- Git repo with at least one commit
- Claude Code CLI available as `claude`
- A Notion integration token for live sync
- A Notion page shared with the integration

Check the local setup:

```bash
node bin/build_fast.js doctor --ntn "<notion-page-url>"
```

Set Notion access:

```bash
export NOTION_API_TOKEN=secret_...
```

`build_fast` uses Notion API version `2026-03-11` by default.

## Notion Setup

The CLI accepts a Notion target on every command:

```bash
NTN="https://www.notion.so/your-page-id"
```

The target page should be a regular Notion page shared with your integration. Inside that page, create two inline databases.

### Specs Database

Create an inline database named `Build Specs`. Its primary data source should be named `Specs`.

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Spec title |
| `Status` | Status | Use options `Draft`, `Ready`, `Building`, `Shipped` |
| `Project` | Text | Absolute or relative project path |

Recommended optional properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Spec ID` | Unique ID | Helpful for display |
| `GitHub Repo` | URL | Reserved for future repo linking |
| `GitHub PR` | URL | Reserved for future PR automation |

### Tasks Database

Create a second inline database named `Spec Tasks`. Its primary data source should be named `Spec Tasks`.

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Task title |
| `Status` | Status | Use options `Not started`, `In progress`, `Done` |
| `Spec` | Relation | Relates to the `Specs` data source |
| `Branch` | Text | Branch/worktree used by the task |

Recommended optional properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Order` | Unique ID | Helpful for sorting |

### Integration Access

In Notion:

1. Create an internal integration and copy its API token.
2. Share the parent Notion page with that integration.
3. Make sure both inline databases are visible on the shared page.
4. Export the token in your shell:

```bash
export NOTION_API_TOKEN=secret_...
```

Then inspect the page:

Inspect a page:

```bash
node bin/build_fast.js inspect --ntn "$NTN"
```

You should see both data sources and their properties. If `sync` cannot find the data sources, check the data source names and property names first.

Local state is keyed by the parsed Notion page ID under `.build_fast/specs/<id>/`.

## Recommended Workflow

### 1. Shape The Goal

Start with the interactive goal contract. This is the main human checkpoint before agents plan or write code.

```bash
node bin/build_fast.js goal \
  --goal "Add a small CLI demo mode that prints a sample workflow" \
  --type feature \
  --project /path/to/your/project \
  --ntn "$NTN"
```

The CLI drafts a repo-aware contract, then asks:

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

### 2. Run The Full Loop

After approving the goal:

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --from-goal \
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
- overlay completed dependency outputs into dependent task worktrees
- collect the recommended integrated task
- run feedback checks
- sync final status back to Notion

Autopilot behavior:

- `intern_mode`: stops before applying collection
- `junior_mode`: applies the recommended integrated task when clear
- `boss_mode`: intended for more aggressive automation, currently similar to `junior_mode` for collection

### 3. Verify The Project

Run the target project’s checks yourself after `drive`:

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

## Notion Page Maintenance

Task pages keep append-only run summaries by default. To keep pages readable:

```bash
node bin/build_fast.js compact --ntn "$NTN" --keep-runs 1
```

This keeps recent run history and refreshes managed snapshots.

## Reviews

Run a Claude-backed review prompt:

```bash
node bin/build_fast.js review --ntn "$NTN" --type pr_readiness
```

Review support is still basic. Integration review is a good next improvement.

## Command Reference

```bash
node bin/build_fast.js doctor --ntn "$NTN"
node bin/build_fast.js goal --goal "..." --ntn "$NTN" --project /path/to/your/project --type feature
node bin/build_fast.js plan --goal "..." --ntn "$NTN" --project /path/to/your/project --type feature
node bin/build_fast.js drive --ntn "$NTN" --from-goal --autopilot junior_mode
node bin/build_fast.js drive --goal "..." --ntn "$NTN" --project /path/to/your/project --type feature
node bin/build_fast.js swarm --ntn "$NTN" --concurrency 2 --max-tasks 2
node bin/build_fast.js collect --ntn "$NTN"
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --apply
node bin/build_fast.js cleanup --ntn "$NTN" --apply --force --branches
node bin/build_fast.js status --ntn "$NTN"
node bin/build_fast.js compact --ntn "$NTN" --keep-runs 1
node bin/build_fast.js inspect --ntn "$NTN"
node bin/build_fast.js stop --ntn "$NTN"
```

## Smoke Tests

Local planning without agents:

```bash
node bin/build_fast.js goal \
  --goal "Smoke test" \
  --type chore \
  --project /path/to/your/project \
  --ntn local-smoke \
  --no-agent \
  --yes

node bin/build_fast.js drive --ntn local-smoke --from-goal --no-agent
```

Target project checks:

```bash
cd /path/to/your/project
npm test
```

Root checks:

```bash
npm run check
npm test
```

Local throwaway fixtures should live outside the published repo or under ignored paths. This repo ignores `test_projects/` by default.

## Troubleshooting

### `missing NOTION_API_TOKEN`

Set:

```bash
export NOTION_API_TOKEN=secret_...
```

Also make sure the Notion page is shared with the integration.

### Worktree Requires A Commit

`swarm` needs a git repo with a real `HEAD`.

```bash
git add .
git commit -m "Initial commit"
```

### Stale Worktrees

Clean recorded worktrees and branches:

```bash
node bin/build_fast.js cleanup --ntn "$NTN" --apply --force --branches
```

### Feedback Checks Run Bad Commands

`drive` normalizes common generated feedback loop text, but plans can still include poor commands. Inspect the spec with:

```bash
node bin/build_fast.js status --ntn "$NTN"
```

Then run the project checks manually.

## Current Limits

- Claude Code is the only worker adapter.
- Notion mapping expects the current `Specs` and `Spec Tasks` data-source shape.
- Merge/PR automation is not implemented.
- Integration review is still basic.
- TypeScript/package distribution is deferred.
