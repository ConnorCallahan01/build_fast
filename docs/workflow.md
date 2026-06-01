# Workflow Guide

The recommended loop is:

```text
goal contract -> repo-aware plan -> Notion sync -> worker swarm -> collect -> feedback checks -> Notion sync
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

| Mode | Behavior |
| --- | --- |
| `intern_mode` | Stops before applying collection |
| `junior_mode` | Applies the recommended integrated task when clear |
| `boss_mode` | Intended for more aggressive automation; currently similar to `junior_mode` for collection |

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
