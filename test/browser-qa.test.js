import assert from "node:assert/strict";
import { browserQaHtmlChecks, browserQaProfile, checkHtmlAssets, htmlAssetReferences, reconcileRenderedBrowserQaChecks } from "../src/commands.js";

const baseUrl = "http://127.0.0.1:8080/";

const relativeHtml = `
<!doctype html>
<link rel="stylesheet" href="./styles.css">
<script type="module" src="./app.js"></script>
`;

const relativeAssets = htmlAssetReferences(relativeHtml, baseUrl);
assert.deepEqual(relativeAssets.map((asset) => asset.pathname), ["/styles.css", "/app.js"]);

const absoluteHtml = `
<!doctype html>
<link href="/demo/styles.css" rel="stylesheet">
<script src="/demo/app.js" type="module"></script>
`;

const absoluteAssets = htmlAssetReferences(absoluteHtml, baseUrl);
assert.deepEqual(absoluteAssets.map((asset) => asset.pathname), ["/demo/styles.css", "/demo/app.js"]);

function fakeFetch(url) {
  const pathname = new URL(url).pathname;
  const okAssets = {
    "/demo/styles.css": "text/css",
    "/demo/app.js": "text/javascript"
  };
  const contentType = okAssets[pathname] || "text/plain";
  return {
    ok: Boolean(okAssets[pathname]),
    status: okAssets[pathname] ? 200 : 404,
    headers: {
      get(name) {
        return name === "content-type" ? contentType : "";
      }
    }
  };
}

const failedChecks = await checkHtmlAssets(relativeHtml, baseUrl, fakeFetch);
assert.equal(failedChecks.length, 2);
assert.equal(failedChecks.every((check) => !check.ok), true);
assert.match(failedChecks[0].detail, /404/);

const passedChecks = await checkHtmlAssets(absoluteHtml, baseUrl, fakeFetch);
assert.equal(passedChecks.length, 2);
assert.equal(passedChecks.every((check) => check.ok), true);

const wrongMimeChecks = await checkHtmlAssets(`
<!doctype html>
<link rel="stylesheet" href="/demo/app.js">
`, baseUrl, fakeFetch);
assert.equal(wrongMimeChecks[0].ok, false);
assert.match(wrongMimeChecks[0].detail, /text\/javascript/);

const profile = browserQaProfile({
  browserQa: {
    startCommand: "npm run preview",
    url: "http://127.0.0.1:${PORT}/demo/",
    requiredText: ["Orbit Notes"],
    requiredSelectors: ["#app", ".hero"],
    requiredAssets: true,
    requiredModules: ["/demo/app.js"],
    interactions: [
      {
        name: "create note",
        steps: [
          { action: "fill", selector: "#note-title", value: "Launch plan" },
          { action: "selectOption", selector: "#note-theme", value: "teal" },
          { action: "click", selector: "button[type='submit']" },
          { action: "expectText", text: "Launch plan" }
        ]
      }
    ]
  }
});

assert.equal(profile.startCommand, "npm run preview");
assert.equal(profile.url, "http://127.0.0.1:${PORT}/demo/");
assert.deepEqual(profile.requiredSelectors, ["#app", ".hero"]);
assert.equal(profile.render, true);
assert.deepEqual(profile.interactions[0], {
  name: "create note",
  steps: [
    { action: "fill", selector: "#note-title", value: "Launch plan", text: "", timeout: 2000 },
    { action: "selectOption", selector: "#note-theme", value: "teal", text: "", timeout: 2000 },
    { action: "click", selector: "button[type='submit']", value: "", text: "", timeout: 2000 },
    { action: "expectText", selector: "", value: "", text: "Launch plan", timeout: 2000 }
  ]
});

const profileChecks = await browserQaHtmlChecks(`
<!doctype html>
<link rel="stylesheet" href="/demo/styles.css">
<main id="app" class="shell hero">Orbit Notes</main>
<script type="module" src="/demo/app.js"></script>
`, baseUrl, profile, fakeFetch);
assert.equal(profileChecks.every((check) => check.ok), true);

const missingSelectorChecks = await browserQaHtmlChecks(`
<!doctype html>
<link rel="stylesheet" href="/demo/styles.css">
<main id="app">Orbit Notes</main>
<script type="module" src="/demo/app.js"></script>
`, baseUrl, profile, fakeFetch);
assert.equal(missingSelectorChecks.find((check) => check.name === "required selector .hero").ok, false);

const reconciledChecks = reconcileRenderedBrowserQaChecks([
  { name: "required text Temperature deviation", ok: false, detail: "Temperature deviation" },
  { name: "required selector .patient-row", ok: false, detail: ".patient-row" },
  { name: "rendered text Temperature deviation", ok: true, detail: "1 match" },
  { name: "rendered selector .patient-row", ok: true, detail: "3 matches" }
]);
assert.equal(reconciledChecks.find((check) => check.name === "required text Temperature deviation").ok, true);
assert.equal(reconciledChecks.find((check) => check.name === "required selector .patient-row").ok, true);

console.log("browser QA tests passed");
