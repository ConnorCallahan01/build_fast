import assert from "node:assert/strict";
import { addParallelIntegrationTask, selectSwarmCandidates } from "../src/commands.js";

const baseTask = {
  status: "pending",
  risk: "low",
  dependencies: []
};

const spec = {
  feedbackLoops: ["npm test"],
  tasks: [
    {
      ...baseTask,
      id: "task-001",
      order: 1,
      title: "Add docs",
      expectedFiles: ["README.md"],
      parallelGroup: "content"
    },
    {
      ...baseTask,
      id: "task-002",
      order: 2,
      title: "Add docs tests",
      expectedFiles: ["test/docs.test.js"],
      parallelGroup: "content"
    },
    {
      ...baseTask,
      id: "task-003",
      order: 3,
      title: "Update README again",
      expectedFiles: ["README.md"],
      parallelGroup: "content"
    }
  ]
};

const smart = selectSwarmCandidates(spec, { maxTasks: 3, parallelMode: "smart" });
assert.deepEqual(smart.map((task) => task.id), ["task-001", "task-002"]);

const defaultMode = selectSwarmCandidates(spec, { maxTasks: 3, parallelMode: "default" });
assert.deepEqual(defaultMode.map((task) => task.id), ["task-001", "task-002", "task-003"]);

const serial = selectSwarmCandidates({
  tasks: [
    { ...baseTask, id: "task-001", order: 1, title: "Integrate outputs", parallelGroup: "serial" },
    { ...baseTask, id: "task-002", order: 2, title: "Safe follow-up", expectedFiles: ["docs/foo.md"] }
  ]
}, { maxTasks: 2, parallelMode: "smart" });
assert.deepEqual(serial.map((task) => task.id), ["task-001"]);

const integrated = addParallelIntegrationTask({
  feedbackLoops: ["npm test"],
  tasks: [
    { ...baseTask, id: "task-001", order: 1, title: "A", status: "completed" },
    { ...baseTask, id: "task-002", order: 2, title: "B", status: "completed" }
  ]
}, {
  reports: [
    { task: { id: "task-001" } },
    { task: { id: "task-002" } }
  ],
  overlaps: [
    { file: "src/app.js", taskIds: ["task-001", "task-002"] }
  ]
});

assert.equal(integrated.tasks.length, 3);
assert.equal(integrated.tasks[2].kind, "parallel_integration");
assert.deepEqual(integrated.tasks[2].dependencies, ["task-001", "task-002"]);
assert.deepEqual(integrated.tasks[2].expectedFiles, ["src/app.js"]);

console.log("parallel smart tests passed");
