import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectPackageManager, playwrightBrowserInstallCommand, playwrightPackageInstallCommand } from "../src/commands.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "build-fast-qa-setup-"));

assert.deepEqual(playwrightPackageInstallCommand("npm"), ["npm", "install", "-D", "playwright"]);
assert.deepEqual(playwrightPackageInstallCommand("pnpm"), ["pnpm", "add", "-D", "playwright"]);
assert.deepEqual(playwrightPackageInstallCommand("yarn"), ["yarn", "add", "-D", "playwright"]);
assert.deepEqual(playwrightPackageInstallCommand("bun"), ["bun", "add", "-d", "playwright"]);

assert.deepEqual(playwrightBrowserInstallCommand("npm"), ["npx", "playwright", "install", "chromium"]);
assert.deepEqual(playwrightBrowserInstallCommand("pnpm"), ["pnpm", "exec", "playwright", "install", "chromium"]);
assert.deepEqual(playwrightBrowserInstallCommand("yarn"), ["yarn", "playwright", "install", "chromium"]);
assert.deepEqual(playwrightBrowserInstallCommand("bun"), ["bunx", "playwright", "install", "chromium"]);

assert.equal(await detectPackageManager(tmp), "npm");
await writeFile(path.join(tmp, "pnpm-lock.yaml"), "");
assert.equal(await detectPackageManager(tmp), "pnpm");

console.log("qa setup tests passed");
