# Notion Setup

`build_fast` uses Notion as the control plane for specs, tasks, status, and run summaries. Each CLI command accepts a Notion target:

```bash
NTN="https://www.notion.so/your-page-id"
```

Local state is keyed by the parsed Notion page ID under `.build_fast/specs/<id>/`.

## 1. Create The Parent Page

Create a regular Notion page for the project or workspace. This page is the target you pass with `--ntn`.

Share the page with your Notion integration. Both inline databases below must be visible on the shared page.

## 2. Create The Specs Database

Create an inline database named `Build Specs`.

Its primary data source should be named `Specs`.

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Spec title |
| `Status` | Status | Use options `Draft`, `Ready`, `Building`, `Shipped` |
| `Project` | Text | Absolute or relative project path |

Recommended optional properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Spec ID` | Unique ID | Helpful for display |
| `GitHub Repo` | URL | Reserved for future repo linking |
| `GitHub PR` | URL | Reserved for future PR automation |

## 3. Create The Tasks Database

Create a second inline database named `Spec Tasks`.

Its primary data source should be named `Spec Tasks`.

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Task title |
| `Status` | Status | Use options `Not started`, `In progress`, `Done` |
| `Spec` | Relation | Relates to the `Specs` data source |
| `Branch` | Text | Branch/worktree used by the task |

Recommended optional properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Order` | Unique ID | Helpful for sorting |

## 4. Configure The Integration

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

## 5. Verify The Page

Inspect the page:

```bash
node bin/build_fast.js inspect --ntn "$NTN"
```

You should see both data sources and their properties. If `sync` cannot find the data sources, check the data source names and property names first.

Run a sync after creating a goal or plan:

```bash
node bin/build_fast.js sync --ntn "$NTN"
```

## Page Hygiene

Task pages keep run history. To avoid long append-only pages:

```bash
node bin/build_fast.js compact --ntn "$NTN" --keep-runs 1
```

This keeps recent run history and refreshes managed snapshots.
