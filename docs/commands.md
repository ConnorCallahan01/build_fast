# Command Reference

All commands are currently run through the local Node entrypoint:

```bash
node bin/build_fast.js <command>
```

## Common Commands

```bash
node bin/build_fast.js doctor --ntn "$NTN"
node bin/build_fast.js inspect --ntn "$NTN"
node bin/build_fast.js status --ntn "$NTN"
```

## Goal And Planning

```bash
node bin/build_fast.js goal \
  --goal "..." \
  --ntn "$NTN" \
  --project /path/to/your/project \
  --type feature
```

```bash
node bin/build_fast.js plan \
  --goal "..." \
  --ntn "$NTN" \
  --project /path/to/your/project \
  --type feature
```

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
node bin/build_fast.js program \
  --goal "..." \
  --ntn "$NTN" \
  --project /path/to/your/project
```

Drive a program directly:

```bash
node bin/build_fast.js program \
  --goal "..." \
  --ntn "$NTN" \
  --project /path/to/your/project \
  --drive \
  --autopilot junior_mode
```

## Full Loop

```bash
node bin/build_fast.js drive \
  --ntn "$NTN" \
  --from-goal \
  --parallel smart \
  --autopilot junior_mode \
  --permission-profile managed \
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
| `--parallel smart` | Group ready tasks conservatively using expected files, parallel groups, risk, and task type |
| `--qa browser` | Run browser QA as the final drive pass; failures become bug-fix tasks |

You can also drive directly from a goal string:

```bash
node bin/build_fast.js drive \
  --goal "..." \
  --ntn "$NTN" \
  --project /path/to/your/project \
  --type feature
```

## Worker Execution

```bash
node bin/build_fast.js swarm \
  --ntn "$NTN" \
  --concurrency 2 \
  --max-tasks 2 \
  --parallel smart \
  --autopilot junior_mode \
  --permission-profile managed
```

`--parallel smart` only changes which ready tasks are selected for a swarm batch. It does not change the worker runtime. Smart mode defers serial/high-risk/integration tasks, avoids known expected-file overlaps, and prints the selected group before workers start.

## Collect Output

Dry run:

```bash
node bin/build_fast.js collect --ntn "$NTN"
```

Patch preview:

```bash
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --patch
```

Apply a task:

```bash
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --apply
```

Force an apply when you understand the overlap risk:

```bash
node bin/build_fast.js collect --ntn "$NTN" --task task-003 --apply --force
```

## Maintenance

```bash
node bin/build_fast.js compact --ntn "$NTN" --keep-runs 1
node bin/build_fast.js cleanup --ntn "$NTN" --apply --force --branches
node bin/build_fast.js stop --ntn "$NTN"
```

## Reviews

```bash
node bin/build_fast.js review --ntn "$NTN" --type pr_readiness
```

Create follow-up tasks from review findings:

```bash
node bin/build_fast.js review --ntn "$NTN" --type pr_readiness --create-tasks
```

## QA And Bug Ledger

Run browser QA against the active spec/program project:

```bash
node bin/build_fast.js qa --ntn "$NTN" --type browser
```

Check whether the active target project is ready for rendered Playwright QA:

```bash
node bin/build_fast.js qa-setup --ntn "$NTN"
```

Install missing Playwright package/browser files into the target project:

```bash
node bin/build_fast.js qa-setup --ntn "$NTN" --install
```

Run browser QA automatically after `drive` completes feedback checks:

```bash
node bin/build_fast.js drive --ntn "$NTN" --qa browser
```

When final QA fails, `drive` logs bugs, writes a JSON artifact, creates `[bug]` Spec Tasks, and syncs Notion. In `junior_mode` and `boss_mode`, it runs one automatic QA repair cycle by default, then reruns browser QA. In `intern_mode`, or with `--max-qa-repairs 0`, it stops after creating the bug tasks.

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
node bin/build_fast.js qa --ntn "$NTN" --type browser --create-task
```

List logged bugs:

```bash
node bin/build_fast.js bugs --ntn "$NTN"
```

Convert open bugs into pending Spec Tasks and sync them to Notion:

```bash
node bin/build_fast.js bugs --ntn "$NTN" --create-tasks
```

The bug ledger is stored at `.build_fast/specs/<target>/bugs.json`. Browser QA failure artifacts are stored at `.build_fast/specs/<target>/qa-artifacts/` and are referenced in generated bug-task prompts. Today those bugs become normal Spec Tasks in Notion. A dedicated Notion Bugs database is planned.

## Workers

```bash
node bin/build_fast.js workers
node bin/build_fast.js drive --ntn "$NTN" --from-goal --worker claude
```

Claude Code is the only supported adapter today. Unsupported adapters fail clearly.

## Ship Preview

Preview branch/commit/push/PR commands:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature --pr
```

The preview prints the target git root, pathspec, changed files, uncollected completed worktree output, and the commands it would run.

Apply the branch/commit/push flow and create a draft PR:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature --apply --pr
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--branch` | Branch to create or reuse |
| `--message` | Commit message |
| `--pr` | Open a draft PR through `gh pr create` |
| `--force` | Allow shipping current checkout even when uncollected worktree output exists |

On success, `ship` records branch, commit, repo URL, PR URL, and shipped timestamp in local spec state, syncs Notion `GitHub Repo`/`GitHub PR` properties when present, and appends a ship summary.
