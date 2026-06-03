# build_fast

> A Notion-backed CLI for turning product goals into scoped specs, agent tasks, isolated worktrees, and verified code changes.

`build_fast` is an early development partner CLI. It treats Notion as the human control plane, your local git repo as the source of truth, and Claude Code as the current worker runtime.

```text
goal contract -> repo-aware plan -> Notion sync -> worker swarm -> collect -> checks -> Notion sync
```

Interactive setup opens with a fast orange terminal banner:

```text
==== ==== ==== ==== ==== ==== ==== ====>
 ____  _   _ ___ _     ____      _____  _    ____ _____
| __ )| | | |_ _| |   |  _ \    |  ___|/ \  / ___|_   _|
|  _ \| | | || || |   | | | |   | |_  / _ \ \___ \ | |
| |_) | |_| || || |___| |_| |   |  _|/ ___ \ ___) || |
|____/ \___/|___|_____|____/    |_| /_/   \_\____/ |_|
-------------> plan / swarm / verify / ship
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

This is an MVP. It works locally, supports live Notion sync through the current Notion Data Sources API, can run Claude Code workers non-interactively, can create repair tasks from failed feedback checks, and includes a browser QA/bug-ledger path for final-pass fixes. Claude Code and `junior_mode` are available now. Codex, OpenCode, `intern_mode`, and `boss_mode` are visible in setup as planned modes, but are not active defaults yet. Deeper GitHub/CI automation is still on the roadmap.

## Requirements

- Node.js 20+
- Git repo with at least one commit for worktree swarms
- Claude Code CLI available as `claude`
- Notion integration token for live sync
- Notion page shared with the integration

Install the local binary during development:

```bash
npm link
```

Check your setup:

```bash
build_fast doctor --ntn "<notion-page-url>"
```

Set Notion access:

```bash
export NOTION_API_TOKEN=secret_...
```

## Quick Start

Initialize the current project:

```bash
build_fast init --ntn "https://www.notion.so/your-page-id" --install-qa
```

This starts an interactive setup flow with arrow-key choices, saves project defaults in `.build_fast/config.json`, checks Notion/Git/Claude Code, and optionally installs Playwright browser QA dependencies.
If the Notion parent page is blank, `init` creates the required build_fast data sources automatically.
If the current folder is not a git repo, interactive init offers to run `git init`; non-interactive setup can pass `--init-git`. Init also ensures `.build_fast/` and `node_modules/` are listed in `.gitignore`.
The banner animation only runs in a real TTY and can be disabled with `BUILD_FAST_ANIMATION=0`.
After `init`, commands use the saved Notion page by default. Pass `--ntn` only when you want to override that target.

Create a plan:

```bash
build_fast plan
```

For long goals, paste the full text into the interactive plan prompt and finish with `/done` on its own line.

Run the full agent loop:

```bash
build_fast go
```

Check state:

```bash
build_fast status
```

Clean worktrees after a successful run:

```bash
build_fast cleanup --ntn "$NTN" --apply --force --branches
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `init` | Configure the current project, Notion target, worker harness, defaults, and QA setup |
| `doctor` | Verify local tools, config, Notion token, and target page access |
| `inspect` | Print Notion child databases/data sources and properties |
| `goal` | Create an interactive, editable goal contract |
| `program` | Create or drive a multi-spec phased program |
| `plan` | Generate a repo-aware spec and task plan |
| `sync` | Push local spec/task state to Notion |
| `drive` | Run planning, sync, swarm, collect, checks, and final sync |
| `go` | Run `drive` with defaults saved by `init` |
| `swarm` | Run dependency-ready tasks in isolated worktrees, optionally with smart parallel grouping |
| `collect` | Inspect or apply completed task output |
| `status` | Show spec, task, feedback, worker, and collect state |
| `compact` | Keep Notion task pages readable by refreshing managed snapshots |
| `cleanup` | Remove recorded worktrees and branches |
| `review` | Run a Claude-backed review prompt |
| `qa` | Run structured QA checks, currently browser demo checks |
| `qa-setup` | Check or install Playwright browser QA dependencies in a target project |
| `user-test` | Walk through a human acceptance checklist after `go`/QA, with optional follow-up tasks |
| `bugs` | Inspect logged QA/feedback bugs or convert them into fix tasks |
| `stop` | Mark active workers stopped in local state |
| `ship` | Preview or apply guarded branch/commit/push/PR handoff |
| `workers` | List supported worker adapters |

## Final QA And Bug Fix Pass

After a feature/program run, use browser QA when the target project exposes a static demo through `npm run demo`:

```bash
build_fast qa --ntn "$NTN" --type browser
```

If QA fails, `build_fast` writes bugs to the local ledger for that Notion target:

```bash
build_fast bugs --ntn "$NTN"
```

When the Notion page has a `Bugs` data source, `sync`, `qa`, and `drive --qa` upsert local bug ledger entries into Notion. The expected Bugs properties are `Name`, `Status`, `Source`, `Severity`, `Spec`, `Task`, `Local ID`, `Command`, `Artifact`, and `Details`.

Convert open bugs into normal pending Spec Tasks, sync them to Notion, then drive fresh workers to fix them:

```bash
build_fast bugs --ntn "$NTN" --create-tasks
build_fast drive --ntn "$NTN" --autopilot junior_mode --permission-profile managed
```

For one-command QA-to-task creation:

```bash
build_fast qa --ntn "$NTN" --type browser --create-task
```

Browser QA fetches the served HTML, verifies expected UI anchors, resolves linked stylesheets/scripts the same way a browser does, and checks those assets return `200` with CSS/JavaScript MIME types. This catches broken paths like a page served at `/` linking to `./styles.css` when the stylesheet actually lives under `/demo/styles.css`. If `playwright` is installed in the project, QA also renders the page in Chromium, checks for console/page errors, verifies rendered selectors/text, and can run configured interaction steps. Use `--require-playwright` when rendered QA must be enforced instead of skipped.

Check Playwright readiness for rendered QA:

```bash
build_fast qa-setup --ntn "$NTN"
```

Install missing Playwright pieces into the target project:

```bash
build_fast qa-setup --ntn "$NTN" --install
```

Run browser QA automatically at the end of `drive`:

```bash
build_fast drive --ntn "$NTN" --qa browser
```

If final QA fails, `drive` logs bugs, writes a JSON artifact under `.build_fast/specs/<target>/qa-artifacts/`, creates `[bug]` Spec Tasks, and syncs them to Notion. In `junior_mode`, `drive` automatically runs one QA repair pass by default, applies the fix output when safe, reruns QA, and then stops only if failures remain. Use `--max-qa-repairs 0` to only create bug tasks, or increase the limit for more retry cycles.

## Human User Test Pass

Automated QA checks whether the app loads and key behavior still works. `user-test` is the human acceptance layer after `go`:

```bash
build_fast user-test
```

It uses the Notion/project defaults saved by `init`, shows setup commands and URLs from the active spec/program, walks through a checklist, and writes a local artifact under `.build_fast/specs/<target>/user-tests/`.

Useful options:

```bash
build_fast user-test --run-setup
build_fast user-test --create-tasks
build_fast user-test --keep-running
build_fast user-test --no-sync
build_fast user-test --full-sync
```

After the checklist finishes, build_fast writes a managed `build_fast User Test` summary on already-synced Notion spec pages when `NOTION_API_TOKEN` is available. It only does an initial full sync if those pages do not exist yet; use `--full-sync` to explicitly refresh spec/task pages too. Use `--create-tasks` when a check fails or needs tweaks; build_fast appends `[user-test]` follow-up tasks to the active spec/program so the next `go` can repair them. A passed user test is ready for `build_fast ship`.

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
    "manualChecks": ["Create a note", "Search by text", "Filter by tag"],
    "render": true,
    "interactions": [
      {
        "name": "create note",
        "steps": [
          { "action": "fill", "selector": "#note-title", "value": "Launch plan" },
          { "action": "click", "selector": "button[type='submit']" },
          { "action": "expectText", "text": "Launch plan" }
        ]
      }
    ]
  }
}
```

## Smart Parallel Runs

Use smart parallel mode when you want more agents running at once without blindly launching tasks that are likely to edit the same files:

```bash
build_fast drive \
  --ntn "$NTN" \
  --from-goal \
  --parallel smart \
  --concurrency 4 \
  --max-tasks 4 \
  --autopilot junior_mode \
  --permission-profile managed
```

In smart mode, planners include `expectedFiles` and `parallelGroup` hints. `swarm` uses those hints plus file/area heuristics to defer risky, high-risk, serial, or overlapping tasks. If completed parallel workers still overlap, `drive` creates a serial integration task so a fresh worker can merge the outputs deliberately.

Preview the orchestration before launching workers:

```bash
build_fast drive --ntn "$NTN" --dry-run --parallel smart --concurrency 4 --max-tasks 4
```

The dry run prints plan-quality warnings, selected/deferred smart-parallel tasks, feedback checks, browser QA settings, and repair limits without syncing Notion or starting agents. `parallelGroup: "serial"` still forces one-at-a-time execution; other group names are treated as hints, so independent tasks with different groups can run together when their expected files do not overlap.

## Ship To GitHub

Preview the release handoff first:

```bash
build_fast ship --branch build-fast/my-feature --pr --base main
```

Apply it when the preview is right:

```bash
build_fast ship --branch build-fast/my-feature --apply --pr --base main
```

If there is no `origin` remote yet, publish the repo first-class through ship:

```bash
build_fast ship --apply --publish
```

`ship` refuses to apply when completed worktree output is still uncollected, commits only the target project path, pushes the branch, opens a draft PR through `gh` when requested, then syncs repo/PR metadata back to Notion. For program runs, the same ship metadata is attached to every spec in the run so the PR audit trail is complete. The preview prints the generated PR body so you can inspect the summary, tasks, changed files, checks, and linked bugs before pushing. Add `--ready` if you want a non-draft PR.

## Notion Setup

`build_fast` expects a parent Notion page containing build_fast data sources. The easiest path is to run `build_fast init` against a blank shared page and let the CLI create them:

- `Specs`
- `Spec Tasks`
- `Bugs`

The CLI uses Notion API version `2026-03-11` by default and writes current Data Source schemas.

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
- Logged bugs are stored locally and can sync into a Notion `Bugs` data source when present.
- Merge/PR automation is currently a `ship` preview/apply handoff rather than a full release manager.
- Review support is still basic.
- TypeScript/package distribution is deferred.

## License

No license has been selected yet.
