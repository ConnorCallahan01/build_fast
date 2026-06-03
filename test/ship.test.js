import assert from "node:assert/strict";
import { applyProgramShipMetadata, shipMissingRemoteMessage, shipPrBody } from "../src/commands.js";

const body = shipPrBody(
  {
    id: "spec-001",
    title: "Orbit Notes UI polish",
    goal: "Make the browser demo visually stronger and verify it.",
    notion: {
      specPageUrl: "https://notion.so/spec-page"
    },
    tasks: [
      {
        id: "task-001",
        title: "Polish the UI",
        status: "completed",
        lastResult: {
          tests_run: ["npm test", "node bin/build_fast.js qa --type browser"]
        }
      },
      {
        id: "task-002",
        title: "Fix browser QA issue",
        status: "completed",
        testPlan: ["npm test"]
      }
    ]
  },
  {
    changedFiles: ["demo/index.html", "demo/styles.css"],
    repoUrl: "https://github.com/example/build_fast",
    bugs: [
      {
        id: "bug-001",
        title: "Stylesheet returned 404",
        status: "done",
        specId: "spec-001",
        taskId: "task-002",
        notion: {
          bugPageUrl: "https://notion.so/bug-page"
        }
      },
      {
        id: "bug-ignored",
        title: "Unrelated bug",
        status: "open",
        specId: "spec-999"
      }
    ]
  }
);

assert.match(body, /## Summary/);
assert.match(body, /Implements build_fast spec: Orbit Notes UI polish/);
assert.match(body, /Notion: https:\/\/notion\.so\/spec-page/);
assert.match(body, /Repo: https:\/\/github\.com\/example\/build_fast/);
assert.match(body, /2\/2 completed/);
assert.match(body, /- completed: task-001 Polish the UI/);
assert.match(body, /- demo\/index\.html/);
assert.match(body, /- demo\/styles\.css/);
assert.match(body, /- npm test/);
assert.match(body, /- node bin\/build_fast\.js qa --type browser/);
assert.match(body, /- done: bug-001 Stylesheet returned 404 \(https:\/\/notion\.so\/bug-page\)/);
assert.doesNotMatch(body, /bug-ignored/);

const missingRemote = shipMissingRemoteMessage({
  projectRoot: "/tmp/project",
  branch: "build-fast/example"
});
assert.match(missingRemote, /stopped before commit/);
assert.match(missingRemote, /build_fast ship --apply --publish/);
assert.match(missingRemote, /git -C \/tmp\/project remote add origin <git-url>/);
assert.match(missingRemote, /build_fast ship --apply --branch build-fast\/example/);

const shippedProgram = applyProgramShipMetadata({
  status: "planned",
  specs: [
    { id: "spec-001", status: "completed" },
    { id: "spec-002", status: "planned" }
  ]
}, {
  branch: "build-fast/example",
  commit: "abc123",
  repoUrl: "https://github.com/example/project.git",
  prUrl: "",
  changedFiles: ["index.js"],
  shippedAt: "2026-01-01T00:00:00.000Z"
});
assert.equal(shippedProgram.status, "completed");
assert.equal(shippedProgram.specs.every((spec) => spec.status === "completed"), true);
assert.equal(shippedProgram.specs.every((spec) => spec.ship.branch === "build-fast/example"), true);
assert.equal(shippedProgram.specs.every((spec) => spec.githubRepoUrl === "https://github.com/example/project.git"), true);
assert.equal(shippedProgram.specs.every((spec) => spec.githubPrUrl === ""), true);

console.log("ship tests passed");
