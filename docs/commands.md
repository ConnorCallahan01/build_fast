# Command Reference

When the package is linked locally, use the CLI binary:

```bash
build_fast <command>
```

You can also run through the local Node entrypoint:

```bash
node bin/build_fast.js <command>
```

## Common Commands

```bash
build_fast init --ntn "$NTN" --install-qa
build_fast align
build_fast doctor
build_fast inspect
build_fast start
build_fast pickup
build_fast status
```

`init` saves defaults for the current project, Notion page, harness, autopilot, permission profile, Claude permission behavior, smart parallel settings, and browser QA. Commands run from that project use the saved Notion page automatically; pass `--ntn` only to override it. The interactive wizard uses an orange animated banner and arrow-key selectors for choices. Claude Code and `junior_mode` are available now; Codex, OpenCode, `intern_mode`, and `boss_mode` are shown as planned and are not saved as active defaults yet. If the target Notion page is missing the build_fast schema, init creates the `Specs`, `Spec Tasks`, `Bugs`, and `User Tests` data sources automatically unless you pass `--no-create-schema`. Pass `--init-git` to initialize a git repository non-interactively when one is missing. Set `BUILD_FAST_ANIMATION=0` to disable the banner animation.

To make workers use your normal Claude Code global/project settings by default:

```bash
build_fast init --permission-profile inherit
```

To save a default per-run Claude permission override:

```bash
build_fast init --permission-profile inherit --permission-mode bypassPermissions
```

## Agent Alignment

Run `align` once per project when you want durable worker guidance:

```bash
build_fast align
build_fast align --yes
```

It writes managed sections to `AGENTS.md` and `CLAUDE.md`, saves `.build_fast/agent-profile.json`, and includes that profile in future worker prompts. Existing manual content in those markdown files is preserved outside the managed build_fast section.

## Pipeline Nudges

Pipeline commands print a `Recommended Next` section when there is an obvious follow-up command. `build_fast start` with no goal and `build_fast pickup` both inspect local state and show where to resume, while also showing how to start a new goal/program from the current project. `build_fast start --goal` without text stays in orientation mode and prints the correct `start --goal "..."` form. Add `--status` to supported commands when you want a full status report printed after the command completes.

```bash
build_fast start
build_fast start --goal "..." --type feature
build_fast pickup --status
```

## Goal And Planning

```bash
build_fast goal \
  --goal "..." \
  --project /path/to/your/project \
  --type feature
```

```bash
build_fast plan \
  --goal "..." \
  --project /path/to/your/project \
  --type feature
```

After `init`, you can also run `plan` with no flags and answer the prompts.
The interactive goal prompt accepts pasted multi-line text. Finish the paste with `/done` on its own line, or use `/cancel` to abort that prompt.
Completed or shipped local specs/programs are not reused as the default goal, so bare `build_fast plan` starts a fresh interactive plan after a pipeline finishes.

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--yes` | Skip interactive goal approval |
| `--no-agent` | Use deterministic local planning where supported |
| `--type` | Goal/spec type, such as `feature`, `bug`, `chore`, or `refactor` |
| `--project` | Target project directory |
| `--skip-questions` | Skip goal intake questions in interactive mode |

## Program Mode

Use `program` for larger goals that should be split into multiple specs/phases:

```bash
build_fast program \
  --goal "..." \
  --project /path/to/your/project
```

Drive a program directly:

```bash
build_fast program \
  --goal "..." \
  --project /path/to/your/project \
  --drive \
  --autopilot junior_mode
```

## Full Loop

After `init`, use the friendly defaulted command:

```bash
build_fast go
```

`go` runs `drive` using saved defaults.

```bash
build_fast drive \
  --from-goal \
  --parallel smart \
  --autopilot junior_mode \
  --permission-profile inherit \
  --concurrency 2 \
  --max-tasks 2
```

Useful drive flags:

| Flag | Purpose |
| --- | --- |
| `--max-iterations` | Maximum swarm/spec iterations before stopping |
| `--max-repairs` | Maximum feedback repair tasks per spec, default `2` |
| `--max-qa-repairs` | Maximum final browser QA repair cycles, default `1`; use `0` to only create bug tasks |
| `--worker claude` | Select the current worker adapter |
| `--parallel smart` | Group ready tasks conservatively using expected files, serial hints, risk, and task type |
| `--dry-run` | Preview orchestration, plan quality, selected tasks, deferred tasks, feedback checks, and QA settings without syncing or running workers |
| `--strict-plan` | Treat plan-quality warnings as blockers before launching workers |
| `--qa browser` | Run browser QA as the final drive pass; failures become bug-fix tasks |
| `--permission-profile inherit` | Do not pass build_fast managed settings or default permission mode; let Claude Code load your normal global/project settings |
| `--permission-profile managed` | Use build_fast's temporary managed Claude settings and autopilot permission defaults |
| `--permission-mode default\|acceptEdits\|bypassPermissions\|plan` | Pass Claude Code's documented permission mode for this run; overrides the mode from settings |
| `--dangerously-skip-permissions` | Pass Claude Code's documented skip-permissions flag for this run; cannot be combined with `--permission-mode` |

You can also drive directly from a goal string:

```bash
build_fast drive \
  --goal "..." \
  --project /path/to/your/project \
  --type feature
```

## Worker Execution

```bash
build_fast swarm \
  --concurrency 2 \
  --max-tasks 2 \
  --parallel smart \
  --autopilot junior_mode \
  --permission-profile inherit
```

`--parallel smart` only changes which ready tasks are selected for a swarm batch. It does not change the worker runtime. Smart mode defers serial/high-risk/integration tasks, avoids known expected-file overlaps, and prints selected/deferred reasons before workers start. `parallelGroup: "serial"` forces serialization; other group names are treated as planner hints, not automatic blockers, so independent tasks with different groups can still run together.

Use `--permission-profile inherit` when you want build_fast workers to behave most like a Claude session you launched yourself. In inherit mode, build_fast does not pass `--settings` or a default `--permission-mode`, so Claude Code can apply your normal settings hierarchy. Add `--permission-mode ...` only when you intentionally want a per-run override.

## Collect Output

Dry run:

```bash
build_fast collect
```

Patch preview:

```bash
build_fast collect --task task-003 --patch
```

Apply a task:

```bash
build_fast collect --task task-003 --apply
```

Force an apply when you understand the overlap risk:

```bash
build_fast collect --task task-003 --apply --force
```

## Maintenance

```bash
build_fast compact --keep-runs 1
build_fast cleanup --apply --force --branches
build_fast stop
```

## Reviews

```bash
build_fast review --type pr_readiness
```

Create follow-up tasks from review findings:

```bash
build_fast review --type pr_readiness --create-tasks
```

## QA And Bug Ledger

Run browser QA against the active spec/program project:

```bash
build_fast qa --type browser
```

Check whether the active target project is ready for rendered Playwright QA:

```bash
build_fast qa-setup
```

Install missing Playwright package/browser files into the target project:

```bash
build_fast qa-setup --install
```

Run browser QA automatically after `drive` completes feedback checks:

```bash
build_fast drive --qa browser
```

When final QA fails, `drive` logs bugs, writes a JSON artifact, creates `[bug]` Spec Tasks, and syncs Notion. In `junior_mode`, it runs one automatic QA repair cycle by default, then reruns browser QA. With `--max-qa-repairs 0`, it stops after creating the bug tasks.

## User Test

Run a human acceptance pass after `go` and automated QA:

```bash
build_fast user-test
```

The command derives a checklist from the active spec/program, browser QA manual checks, and expected UI anchors. It saves each run under `.build_fast/specs/<target>/user-tests/`.

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--dry-run` | Preview the checklist without saving a run |
| `--run-setup` | Start configured setup commands, such as `npm run demo`, while the checklist runs |
| `--keep-running` | Leave started setup processes running after the checklist exits |
| `--create-tasks` | Add `[user-test]` follow-up tasks for failed/tweak checks |
| `--no-sync` | Skip the automatic Notion sync after the checklist finishes |
| `--full-sync` | Refresh spec/task Notion pages before writing the user-test summary |
| `--yes` | Non-interactive pass-all mode for smoke tests |
| `--fail-checks 1,3` | Non-interactively mark selected checklist numbers as failed |
| `--tweak-checks 2` | Non-interactively mark selected checklist numbers as needing tweaks |

After the checklist finishes, `user-test` saves the local artifact and, when `NOTION_API_TOKEN` is available, writes a managed `build_fast User Test` summary section on already-synced spec pages. If the spec pages do not exist yet, it performs an initial full sync first. A passed run is ready for `build_fast ship`; a failed or tweak-needed run should be rerun with `--create-tasks`, then repaired with `build_fast go`.

The browser QA MVP expects the target project to expose a demo through `npm run demo`. It starts that script with a temporary `PORT`, waits for the local page, then checks for a browser-ready HTML demo, expected UI anchors, served JavaScript modules, and linked stylesheet/script assets that resolve to `200` with the expected MIME types. If `playwright` is installed, QA also renders the page in Chromium, checks console/page errors, verifies rendered selectors/text, and runs configured interaction steps. Add `--require-playwright` to fail when Playwright is unavailable.

When a spec or program has `browserQa`, QA uses that profile:

```json
{
  "startCommand": "npm run demo",
  "url": "http://127.0.0.1:${PORT}/",
  "requiredText": ["Dashboard"],
  "requiredSelectors": ["#app", ".hero"],
  "requiredAssets": true,
  "requiredModules": ["/demo/app.js"],
  "manualChecks": ["Create an item", "Filter the list"],
  "render": true,
  "interactions": [
    {
      "name": "create item",
      "steps": [
        { "action": "fill", "selector": "#title", "value": "Launch plan" },
        { "action": "click", "selector": "button[type='submit']" },
        { "action": "expectText", "text": "Launch plan" }
      ]
    }
  ]
}
```

Without a profile, QA falls back to the Orbit Notes fixture assumptions.

Create bug-fix tasks immediately when QA fails:

```bash
build_fast qa --type browser --create-task
```

List logged bugs:

```bash
build_fast bugs
```

Convert open bugs into pending Spec Tasks and sync them to Notion:

```bash
build_fast bugs --create-tasks
```

The bug ledger is stored at `.build_fast/specs/<target>/bugs.json`. Browser QA failure artifacts are stored at `.build_fast/specs/<target>/qa-artifacts/` and are referenced in generated bug-task prompts. Bugs can become normal Spec Tasks for repair work, and they also sync to a Notion `Bugs` data source when one is present.

If the target Notion page has a `Bugs` data source, bug rows are also synced there. `init`, `sync`, and `drive` can create this data source automatically on blank pages. Required properties:

| Property | Type |
| --- | --- |
| `Name` | Title |
| `Status` | Status with `Not started`, `In progress`, `Done` |
| `Source` | Select, commonly `browser_qa`, `feedback`, `manual` |
| `Severity` | Select, commonly `P0`, `P1`, `P2`, `P3` |
| `Spec` | Relation to the Specs data source |
| `Task` | Relation to the Spec Tasks data source |
| `Local ID` | Rich text for local bug id dedupe |
| `Command` | Rich text |
| `Artifact` | Rich text |
| `Details` | Rich text |

## Workers

```bash
build_fast workers
build_fast drive --from-goal --worker claude
```

Claude Code is the only supported adapter today. Unsupported adapters fail clearly.

## Ship Preview

Preview branch/commit/push/PR commands:

```bash
build_fast ship --branch build-fast/my-feature --pr --base main
```

The preview prints the target git root, pathspec, changed files, uncollected completed worktree output, commands it would run, and the generated PR body.
If ship finds uncollected completed worktree output, run the printed `build_fast collect ... --apply` command first, then rerun `build_fast ship --apply`. Use `--force` only when you intentionally want to ship the current checkout without collecting recorded worker output.
After a successful program ship, `build_fast cleanup --apply --force --branches` removes recorded worktrees and their task branches across all program specs.

Apply the branch/commit/push flow and create a draft PR:

```bash
build_fast ship --branch build-fast/my-feature --apply --pr --base main
```

If the project has no `origin` remote yet, publish it through GitHub CLI:

```bash
build_fast ship --apply --publish
build_fast ship --apply --publish --repo owner/name --public
```

`--publish` creates a private GitHub repo by default, configures it as `origin`, and pushes the ship branch. Use `--public` or `--internal` to change visibility.

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--branch` | Branch to create or reuse |
| `--message` | Commit message |
| `--pr` | Open a draft PR through `gh pr create` |
| `--base` | Base branch for `gh pr create` |
| `--ready` | Create a non-draft PR |
| `--force` | Allow shipping current checkout even when uncollected worktree output exists |

On success, `ship` records branch, commit, repo URL, PR URL, changed files, and shipped timestamp in local spec state, syncs Notion `GitHub Repo`/`GitHub PR` properties when present, and appends a ship summary. Program ships attach the same repo/PR metadata to every spec in the program so the Notion audit trail points back to the shipped PR. PR bodies include the spec goal, Notion link, task status, changed files, recorded checks, and related Bugs ledger entries.
