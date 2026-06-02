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
| `--worker claude` | Select the current worker adapter |

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
  --autopilot junior_mode \
  --permission-profile managed
```

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

## Workers

```bash
node bin/build_fast.js workers
node bin/build_fast.js drive --ntn "$NTN" --from-goal --worker claude
```

Claude Code is the only supported adapter today. Unsupported adapters fail clearly.

## Ship Preview

Preview branch/commit/push commands:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature
```

Apply the branch/commit/push flow:

```bash
node bin/build_fast.js ship --ntn "$NTN" --branch build-fast/my-feature --apply
```

Add `--pr` to attempt draft PR creation through `gh`.
