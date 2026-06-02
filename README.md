# build_fast

> A Notion-backed CLI for turning product goals into scoped specs, agent tasks, isolated worktrees, and verified code changes.

`build_fast` is an early development partner CLI. It treats Notion as the human control plane, your local git repo as the source of truth, and Claude Code as the current worker runtime.

```text
goal contract -> repo-aware plan -> Notion sync -> worker swarm -> collect -> checks -> Notion sync
```

## Why This Exists

Modern coding agents are powerful, but they still need good direction, clean task boundaries, and a way to report what changed. `build_fast` is built around that loop:

- shape the user's intent before code is written
- generate a repo-aware implementation plan
- create Notion specs and tasks automatically
- run tasks in isolated git worktrees
- collect the best integrated output
- run feedback checks before calling the work done
- create focused repair tasks when automated feedback fails
- log QA/feedback bugs for a final fix pass
- keep Notion updated with status, summaries, and task pages

## Current Status

This is an MVP. It works locally, supports live Notion sync through the current Notion Data Sources API, can run Claude Code workers non-interactively, can create repair tasks from failed feedback checks, and includes a browser QA/bug-ledger path for final-pass fixes. In `junior_mode` and `boss_mode`, final browser QA can now create bug tasks and run a bounded repair pass automatically. It is not yet a packaged npm binary, and deeper GitHub/CI automation is still on the roadmap.

## Requirements

- Node.js 20+
- Git repo with at least one commit
- Claude Code CLI available as `claude`
- Notion integration token for live sync
- Notion page shared with the integration

Check your setup:

```bash
node bin/build_fast.js doctor --ntn "<notion-page-url>"
```

Set Notion access:

```bash
export NOTION_API_TOKEN=secret_...
```

## Quick Start

Set your Notion page URL:

```bash
NTN="https://www.notion.so/your-page-id"
```

Create an interactive goal contract:

```bash
node bin/build_fast.js goal \
  --goal "Add a small CLI demo mode that prints a sample workflow" \
  --type feature \
  --project /path/to/your/project \
  --ntn "$NTN"
```

Run the full agent loop from that approved goal:

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --from-goal \
  --autopilot junior_mode \
  --permission-profile managed \
  --parallel smart \
  --concurrency 2 \
  --max-tasks 2
```

Check state:

```bash
node bin/build_fast.js status --ntn "$NTN"
```

Clean worktrees after a successful run:

```bash
node bin/build_fast.js cleanup --ntn "$NTN" --apply --force --branches
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `doctor` | Verify local tools, config, Notion token, and target page access |
| `inspect` | Print Notion child databases/data sources and properties |
| `goal` | Create an interactive, editable goal contract |
| `program` | Create or drive a multi-spec phased program |
| `plan` | Generate a repo-aware spec and task plan |
| `sync` | Push local spec/task state to Notion |
| `drive` | Run planning, sync, swarm, collect, checks, and final sync |
| `swarm` | Run dependency-ready tasks in isolated worktrees, optionally with smart parallel grouping |
| `collect` | Inspect or apply completed task output |
| `status` | Show spec, task, feedback, worker, and collect state |
| `compact` | Keep Notion task pages readable by refreshing managed snapshots |
| `cleanup` | Remove recorded worktrees and branches |
| `review` | Run a Claude-backed review prompt |
| `qa` | Run structured QA checks, currently browser demo checks |
| `bugs` | Inspect logged QA/feedback bugs or convert them into fix tasks |
| `stop` | Mark active workers stopped in local state |
| `ship` | Preview or apply guarded branch/commit/push/PR handoff |
| `workers` | List supported worker adapters |

## Final QA And Bug Fix Pass

After a feature/program run, use browser QA when the target project exposes a static demo through `npm run demo`:

```bash
node bin/build_fast.js qa --ntn "$NTN" --type browser
```

If QA fails, `build_fast` writes bugs to the local ledger for that Notion target:

```bash
node bin/build_fast.js bugs --ntn "$NTN"
```

Convert open bugs into normal pending Spec Tasks, sync them to Notion, then drive fresh workers to fix them:

```bash
node bin/build_fast.js bugs --ntn "$NTN" --create-tasks
node bin/build_fast.js drive --ntn "$NTN" --autopilot junior_mode --permission-profile managed
```

For one-command QA-to-task creation:

```bash
node bin/build_fast.js qa --ntn "$NTN" --type browser --create-task
```

Browser QA fetches the served HTML, verifies expected UI anchors, resolves linked stylesheets/scripts the same way a browser does, and checks those assets return `200` with CSS/JavaScript MIME types. This catches broken paths like a page served at `/` linking to `./styles.css` when the stylesheet actually lives under `/demo/styles.css`.

Run browser QA automatically at the end of `drive`:

```bash
node bin/build_fast.js drive --ntn "$NTN" --qa browser
```

If final QA fails, `drive` logs bugs, writes a JSON artifact under `.build_fast/specs/<target>/qa-artifacts/`, creates `[bug]` Spec Tasks, and syncs them to Notion. In `junior_mode` and `boss_mode`, `drive` automatically runs one QA repair pass by default, applies the fix output when safe, reruns QA, and then stops only if failures remain. Use `--max-qa-repairs 0` to only create bug tasks, or increase the limit for more retry cycles.

Specs can define a browser QA profile so the checks are project-specific instead of Orbit-specific:

```json
{
  "browserQa": {
    "startCommand": "npm run demo",
    "url": "http://127.0.0.1:${PORT}/",
    "requiredText": ["Orbit Notes"],
    "requiredSelectors": ["#create-form", "#notes-list"],
    "requiredAssets": true,
    "requiredModules": ["/demo/app.js"],
    "manualChecks": ["Create a note", "Search by text", "Filter by tag"]
  }
}
```

## Smart Parallel Runs

Use smart parallel mode when you want more agents running at once without blindly launching tasks that are likely to edit the same files:

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

In smart mode, planners include `expectedFiles` and `parallelGroup` hints. `swarm` uses those hints plus file/area heuristics to defer risky, high-risk, serial, or overlapping tasks. If completed parallel workers still overlap, `drive` creates a serial integration task so a fresh worker can merge the outputs deliberately.

## Ship To GitHub

Preview the release handoff first:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature --pr
```

Apply it when the preview is right:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature --apply --pr
```

`ship` refuses to apply when completed worktree output is still uncollected, commits only the target project path, pushes the branch, opens a draft PR through `gh` when requested, then syncs repo/PR metadata back to Notion.

## Notion Setup

`build_fast` expects a parent Notion page containing two inline databases:

- `Build Specs`, with primary data source `Specs`
- `Spec Tasks`, with primary data source `Spec Tasks`

The CLI uses Notion API version `2026-03-11` by default.

See [docs/notion-setup.md](docs/notion-setup.md) for the exact properties and integration setup.

## Documentation

- [Workflow Guide](docs/workflow.md): recommended and manual workflows
- [Notion Setup](docs/notion-setup.md): database/data source structure
- [Command Reference](docs/commands.md): command examples and common flags
- [Roadmap](docs/roadmap.md): planned features and priorities

## Smoke Tests

Root checks:

```bash
npm run check
npm test
```

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

## Current Limits

- Claude Code is the only worker adapter.
- Notion mapping expects the current `Specs` and `Spec Tasks` data-source shape.
- Logged bugs are stored locally and converted into Notion Spec Tasks; a dedicated Notion Bugs database is planned.
- Merge/PR automation is currently a `ship` preview/apply handoff rather than a full release manager.
- Review support is still basic.
- TypeScript/package distribution is deferred.

## License

No license has been selected yet.
