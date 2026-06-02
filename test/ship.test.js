import assert from "node:assert/strict";
import { shipPrBody } from "../src/commands.js";

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

console.log("ship tests passed");
