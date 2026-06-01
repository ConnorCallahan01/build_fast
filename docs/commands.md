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

Review support is still basic. Integration review is a planned improvement.
