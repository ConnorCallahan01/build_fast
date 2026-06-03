# Workflow Guide

`build_fast` is organized around one loop:

```text
align -> plan -> go -> user-test -> ship -> cleanup
```

Notion is the audit/control plane. The local git repo and worker worktrees are the implementation surface.

## First-Time Setup

Initialize the project and save defaults:

```bash
build_fast init
```

Use `inherit` when workers should use your normal Claude Code global/project settings:

```bash
build_fast init --permission-profile inherit
```

If you want a saved Claude permission override:

```bash
build_fast init --permission-profile inherit --permission-mode bypassPermissions
```

Then align agents once for the repo:

```bash
build_fast align
```

`align` writes managed guidance to `AGENTS.md` and `CLAUDE.md`, saves `.build_fast/agent-profile.json`, and includes that profile in future worker prompts. Existing manual content outside the managed section is preserved.

## Starting Work

For a fresh interactive plan:

```bash
build_fast plan
```

For a one-command start from a goal:

```bash
build_fast start --goal "Describe what you want built" --type feature
```

Use program mode for larger phased work:

```bash
build_fast plan --goal "Build the MVP in phases" --type project
```

Completed or shipped local specs/programs are not reused as the default goal, so bare `build_fast plan` starts a fresh interactive plan after a pipeline finishes.

## Running The Build

Preview first when you want to inspect orchestration:

```bash
build_fast go --dry-run
```

Run the default loop:

```bash
build_fast go
```

`go` uses defaults saved by `init`: Notion target, project, smart parallel, QA mode, concurrency, max tasks, and Claude permission behavior.

During the loop, build_fast will:

- sync local spec/task state to Notion
- launch dependency-ready tasks in isolated worktrees
- apply completed worktree output when safe
- create integration tasks when parallel outputs overlap
- run feedback checks
- create repair tasks for failed checks
- run browser QA when configured
- sync final state back to Notion

## Returning Later

Use pickup instead of guessing:

```bash
build_fast pickup --status
```

It shows the current pipeline state and a `Recommended Next` section. Most pipeline commands also print `Recommended Next` after finishing.

## Human Acceptance

After implementation and automated checks:

```bash
build_fast user-test --run-setup
```

If checks fail or need tweaks:

```bash
build_fast user-test --create-tasks
build_fast go
```

User-test sync is fast by default. It updates the User Tests data source and managed user-test sections without full spec/task refresh unless a first sync is needed or `--full-sync` is passed.

## Shipping

Preview the release handoff:

```bash
build_fast ship
```

Apply branch/commit/push and optionally open a PR:

```bash
build_fast ship --apply --pr
```

If the repo has no `origin` yet:

```bash
build_fast ship --apply --publish
```

Program ships attach the same repo/PR metadata to every spec in the program so Notion has a clean audit trail.

## Cleanup

After a successful ship:

```bash
build_fast cleanup --apply --force --branches
```

Without `--apply`, cleanup is a dry run.

## Manual Controls

Inspect or apply worker outputs manually:

```bash
build_fast collect
build_fast collect --task task-003 --apply
build_fast collect --task task-003 --patch
```

Run lower-level workers directly:

```bash
build_fast swarm --concurrency 2 --max-tasks 2 --parallel smart
```

Run status or sync:

```bash
build_fast status
build_fast sync
```

## Claude Permissions

Use inherited settings when you want workers to behave like Claude Code launched by you:

```bash
build_fast go --permission-profile inherit
```

Override per run:

```bash
build_fast go --permission-profile inherit --permission-mode bypassPermissions
build_fast go --permission-profile inherit --dangerously-skip-permissions
```

`--permission-mode` accepts Claude Code's documented values: `default`, `acceptEdits`, `bypassPermissions`, and `plan`. Do not combine `--permission-mode` with `--dangerously-skip-permissions`.

## Common Recovery

```bash
build_fast pickup --status
build_fast collect --task <task-id> --apply
build_fast go
build_fast user-test --create-tasks
build_fast cleanup --apply --force --branches
```
