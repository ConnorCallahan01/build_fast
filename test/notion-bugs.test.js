import assert from "node:assert/strict";
import { buildBugProperties, resolveBuildFastDataSources } from "../src/commands.js";

const schema = {
  databases: [
    {
      title: "Build Specs",
      dataSources: [
        {
          id: "specs-ds",
          title: "Specs",
          properties: {
            Name: { type: "title" },
            Status: { type: "status" },
            Project: { type: "rich_text" }
          }
        }
      ]
    },
    {
      title: "Spec Tasks",
      dataSources: [
        {
          id: "tasks-ds",
          title: "Spec Tasks",
          properties: {
            Name: { type: "title" },
            Status: { type: "status" },
            Spec: { type: "relation" },
            Branch: { type: "rich_text" }
          }
        }
      ]
    },
    {
      title: "Bugs",
      dataSources: [
        {
          id: "bugs-ds",
          title: "Bugs",
          properties: {
            Name: { type: "title" },
            Status: { type: "status" },
            Source: { type: "select" },
            Severity: { type: "select" },
            Spec: { type: "relation" },
            Task: { type: "relation" },
            "Local ID": { type: "rich_text" },
            Command: { type: "rich_text" },
            Artifact: { type: "rich_text" },
            Details: { type: "rich_text" }
          }
        }
      ]
    }
  ]
};

const mapping = resolveBuildFastDataSources(schema);
assert.equal(mapping.specs.id, "specs-ds");
assert.equal(mapping.specTasks.id, "tasks-ds");
assert.equal(mapping.bugs.id, "bugs-ds");

const properties = buildBugProperties(
  {
    id: "bug-001",
    title: "Browser QA failed: stylesheet asset",
    source: "browser_qa",
    severity: "P1",
    status: "task_created",
    specId: "spec-001",
    taskId: "task-003",
    command: "node bin/build_fast.js qa --type browser",
    artifactPath: ".build_fast/specs/x/qa-artifacts/browser.json",
    details: "stylesheet returned 404"
  },
  mapping.bugs,
  {
    id: "spec-001",
    tasks: [
      {
        id: "task-003",
        status: "completed",
        notion: { taskPageId: "task-page-id" }
      }
    ]
  },
  "spec-page-id"
);

assert.equal(properties.Name.title[0].text.content, "Browser QA failed: stylesheet asset");
assert.equal(properties.Status.status.name, "Done");
assert.equal(properties.Source.select.name, "browser_qa");
assert.equal(properties.Severity.select.name, "P1");
assert.deepEqual(properties.Spec.relation, [{ id: "spec-page-id" }]);
assert.deepEqual(properties.Task.relation, [{ id: "task-page-id" }]);
assert.equal(properties["Local ID"].rich_text[0].text.content, "bug-001");
assert.match(properties.Details.rich_text[0].text.content, /stylesheet returned 404/);

console.log("notion bugs tests passed");
