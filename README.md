# build_fast

`build_fast` is a Notion-backed Ralph loop controller for autonomous coding agents.

The MVP treats Claude Code as the first-class worker runtime:

- Notion holds human-readable specs, tasks, and run summaries.
- `.build_fast/` holds local machine-readable state, prompts, logs, and run results.
- Claude Code workers receive complete prompt packets and return structured JSON.

Notion targets are fluid. The CLI does not have one hardcoded project page. Every command that accepts `--ntn` targets the Notion page URL provided for that invocation:

```bash
node bin/build_fast.js plan --goal "..." --ntn "https://www.notion.so/some-project-page-..." --project ./repo-a
node bin/build_fast.js plan --goal "..." --ntn "https://www.notion.so/another-parent-page-..." --project ./repo-b
```

Locally, `build_fast` keys state by the parsed Notion page ID. Different Notion pages get different local spec folders under `.build_fast/specs/`.

## Commands

```bash
node bin/build_fast.js doctor
node bin/build_fast.js goal --goal "..." --ntn "<notion-url>" --project ./repo --type feature
node bin/build_fast.js plan --goal "..." --ntn "<notion-url>" --project ./repo --type feature
node bin/build_fast.js drive --goal "..." --ntn "<notion-url>" --project ./repo --type feature --autopilot junior_mode
node bin/build_fast.js drive --ntn "<notion-url>" --from-goal --autopilot junior_mode
node bin/build_fast.js start --goal "..." --ntn "<notion-url>" --project ./repo --type feature --autopilot junior_mode
node bin/build_fast.js run --ntn "<notion-url>" --autopilot boss_mode
node bin/build_fast.js swarm --ntn "<notion-url>" --concurrency 2 --max-tasks 2
node bin/build_fast.js status --ntn "<notion-url>"
node bin/build_fast.js sync --ntn "<notion-url>" [--mode data-source|blocks]
node bin/build_fast.js compact --ntn "<notion-url>" [--keep-runs 1]
node bin/build_fast.js collect --ntn "<notion-url>" [--task task-003] [--apply] [--force]
node bin/build_fast.js cleanup --ntn "<notion-url>" [--task task-003] [--apply] [--force] [--branches]
node bin/build_fast.js inspect --ntn "<notion-url>"
node bin/build_fast.js stop --ntn "<notion-url>"
node bin/build_fast.js review --ntn "<notion-url>" --type pr_readiness
```

Use `--no-agent` with `plan` or `tasks` for a deterministic local smoke test:

```bash
node bin/build_fast.js plan --goal "Smoke test" --ntn local-smoke-test --project . --type chore --no-agent
node bin/build_fast.js status --ntn local-smoke-test
```

## Configuration

`doctor` creates `.build_fast/config.json` if it does not exist.

Set Notion access with:

```bash
export NOTION_API_TOKEN=secret_...
```

`build_fast` defaults to Notion API version `2026-03-11` and treats data sources as the primary schema model. You can override the version for debugging with `NOTION_VERSION`.

The Notion page passed via `--ntn` must be shared with the integration. Without a token, the CLI still works locally and skips Notion writes.

## Current MVP Limits

- `goal` creates a saved goal contract before planning; use `drive --from-goal` to run from that confirmed goal.
- `status` is a dashboard with project, Notion link, task counts, next task, collection state, and branch/worktree details.
- `swarm` can run dependency-ready pending tasks in separate git worktrees, but merge/PR automation is not implemented yet.
- Swarm worktrees are created under the OS temp directory and their paths are recorded in task state.
- Swarm requires the target repository to have at least one commit because git worktrees cannot be created from an unborn `HEAD`.
- `collect` reports completed task worktree changes by default; `--apply` copies those changed files into the main checkout. If multiple tasks changed the same file, apply requires `--task <id>` or `--force`.
- When overlapping task outputs exist, `collect` recommends the latest dependency-chain task that contains every overlapped file.
- `plan` performs a deterministic repo scan first and feeds project scripts, files, README, git state, and likely feedback loops into the planning prompt.
- `drive` runs the loop end to end: plan if needed, sync, swarm until complete, collect the recommended integration task, run feedback checks, and sync again.
- `cleanup` reports recorded swarm worktrees by default; `--apply` removes them, and `--branches` also deletes task branches.
- Notion data-source mapping currently expects `Specs` and `Spec Tasks` data sources with the MVP property names.
- Claude Code is the only worker adapter implemented.
- TypeScript is deferred until package tooling is installed.
