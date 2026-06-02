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
- keep Notion updated with status, summaries, and task pages

## Current Status

This is an MVP. It works locally, supports live Notion sync through the current Notion Data Sources API, can run Claude Code workers non-interactively, and can create repair tasks from failed feedback checks. It is not yet a packaged npm binary, and merge/PR automation is still on the roadmap.

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
| `swarm` | Run dependency-ready tasks in isolated worktrees |
| `collect` | Inspect or apply completed task output |
| `status` | Show spec, task, feedback, worker, and collect state |
| `compact` | Keep Notion task pages readable by refreshing managed snapshots |
| `cleanup` | Remove recorded worktrees and branches |
| `review` | Run a Claude-backed review prompt |
| `stop` | Mark active workers stopped in local state |
| `ship` | Preview or apply branch/commit/push/PR handoff |
| `workers` | List supported worker adapters |

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
- Merge/PR automation is not implemented.
- Review support is still basic.
- TypeScript/package distribution is deferred.

## License

No license has been selected yet.
