import assert from "node:assert/strict";
import {
  buildBugsDataSourceProperties,
  buildSpecsDataSourceProperties,
  buildSpecTasksDataSourceProperties,
  buildUserTestsDataSourceProperties,
  resolveBuildFastDataSources
} from "../src/commands.js";

const specs = buildSpecsDataSourceProperties();
assert.deepEqual(Object.keys(specs), ["Name", "Status", "Project", "GitHub Repo", "GitHub PR", "Spec ID", "Created", "Updated"]);
assert.deepEqual(specs.Name, { title: {} });
assert.deepEqual(specs.Status.status.options.map((option) => option.name), ["Draft", "Ready", "Building", "Shipped"]);
assert.deepEqual(specs["Spec ID"], { unique_id: { prefix: "SPEC" } });

const tasks = buildSpecTasksDataSourceProperties("spec-source-id");
assert.deepEqual(tasks.Spec, {
  relation: {
    data_source_id: "spec-source-id",
    type: "single_property",
    single_property: {}
  }
});
assert.deepEqual(tasks.Order, { unique_id: { prefix: "TASK" } });
assert.deepEqual(tasks.Status.status.options.map((option) => option.name), ["Not started", "In progress", "Done"]);

const bugs = buildBugsDataSourceProperties("spec-source-id", "task-source-id");
assert.deepEqual(bugs.Spec.relation.type, "single_property");
assert.deepEqual(bugs.Spec.relation.data_source_id, "spec-source-id");
assert.deepEqual(bugs.Task.relation.type, "single_property");
assert.deepEqual(bugs.Task.relation.data_source_id, "task-source-id");
assert.deepEqual(bugs.Source.select.options.map((option) => option.name), ["browser_qa", "manual", "feedback", "worker"]);

const userTests = buildUserTestsDataSourceProperties("task-source-id");
assert.deepEqual(userTests.Completed, { date: {} });
assert.deepEqual(userTests["Follow-up Tasks"].relation.data_source_id, "task-source-id");
assert.deepEqual(userTests.Result.select.options.map((option) => option.name), ["passed", "failed", "needs_tweaks"]);

const mapping = resolveBuildFastDataSources({
  databases: [
    { dataSources: [{ id: "spec-source-id", title: "Specs", properties: specs }] },
    { dataSources: [{ id: "task-source-id", title: "Spec Tasks", properties: tasks }] },
    { dataSources: [{ id: "bug-source-id", title: "Bugs", properties: bugs }] },
    { dataSources: [{ id: "user-test-source-id", title: "User Tests", properties: userTests }] }
  ]
});
assert.equal(mapping.specs.id, "spec-source-id");
assert.equal(mapping.specTasks.id, "task-source-id");
assert.equal(mapping.bugs.id, "bug-source-id");
assert.equal(mapping.userTests.id, "user-test-source-id");

console.log("notion schema tests passed");
