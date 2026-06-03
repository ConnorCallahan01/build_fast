# Notion Setup

`build_fast` uses Notion as the control plane for specs, tasks, status, and run summaries. Each CLI command accepts a Notion target:

```bash
NTN="https://www.notion.so/your-page-id"
```

Local state is keyed by the parsed Notion page ID under `.build_fast/specs/<id>/`.

## 1. Create The Parent Page

Create a regular Notion page for the project or workspace. This page is the target you pass with `--ntn`.

Share the page with your Notion integration. Then run init:

```bash
build_fast init --ntn "$NTN"
```

If the page has no build_fast schema yet, init creates the required inline databases/data sources automatically. The same schema bootstrap also runs during `sync` and `drive`, so a blank parent page is a valid starting point.

After `init`, commands run from the project directory use the saved Notion target by default, so `--ntn` is only needed when you want to override the target.

## 2. Created Schema

The automatic setup creates inline databases with primary data sources named:

- `Specs`
- `Spec Tasks`
- `Bugs`
- `User Tests`

The CLI maps by data source name and required properties, not by the visual database block title.

### Specs

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Spec title |
| `Status` | Status | Use options `Draft`, `Ready`, `Building`, `Shipped` |
| `Project` | Text | Absolute or relative project path |
| `Spec ID` | Unique ID | Helpful for display |
| `GitHub Repo` | URL | Repo link from `ship` |
| `GitHub PR` | URL | PR link from `ship` |
| `Created` | Created time | Automatic |
| `Updated` | Last edited time | Automatic |

### Spec Tasks

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Task title |
| `Status` | Status | Use options `Not started`, `In progress`, `Done` |
| `Spec` | Relation | Relates to the `Specs` data source |
| `Branch` | Text | Branch/worktree used by the task |
| `Order` | Unique ID | Helpful for sorting |
| `Created` | Created time | Automatic |
| `Updated` | Last edited time | Automatic |

### Bugs

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Bug title |
| `Status` | Status | Use options `Not started`, `In progress`, `Done` |
| `Source` | Select | Commonly `browser_qa`, `manual`, `feedback`, `worker` |
| `Severity` | Select | Use options `P0`, `P1`, `P2`, `P3` |
| `Spec` | Relation | Relates to the `Specs` data source |
| `Task` | Relation | Relates to the `Spec Tasks` data source |
| `Local ID` | Text | Local bug id used for dedupe |
| `Command` | Text | Command/check that failed |
| `Artifact` | Text | QA artifact path when available |
| `Details` | Text | Failure details |
| `Created` | Created time | Automatic |
| `Updated` | Last edited time | Automatic |

### User Tests

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | User-test run id |
| `Completed` | Date | Completed timestamp |
| `Follow-up Tasks` | Relation | Relates to created follow-up task pages when available |
| `Notes` | Text | Summary of pass/fail/tweak/skip counts |
| `Project` | Text | Project path |
| `Result` | Select | `passed`, `failed`, or `needs_tweaks` |
| `Artifact` | Text | Local JSON artifact path |
| `Run ID` | Text | Stable run id for upsert/dedupe |

## 3. Configure The Integration

In Notion:

1. Create an internal integration.
2. Copy its API token.
3. Share the parent page with that integration.
4. Make sure the inline databases are visible on the shared page.

In your shell:

```bash
export NOTION_API_TOKEN=secret_...
```

`build_fast` uses Notion API version `2026-03-11` by default.

## 4. Verify The Page

Inspect the page:

```bash
build_fast inspect
```

You should see the build_fast data sources and their properties. If `sync` cannot find the data sources, check the data source names and property names first.

Run a sync after creating a goal or plan:

```bash
build_fast sync
```

`user-test` uses a fast sync path by default: it updates the User Tests data source and managed user-test summary sections without refreshing every spec/task page unless the pages do not exist yet or you pass `--full-sync`.

## Page Hygiene

Task pages keep run history. To avoid long append-only pages:

```bash
build_fast compact --keep-runs 1
```

This keeps recent run history and refreshes managed snapshots.
