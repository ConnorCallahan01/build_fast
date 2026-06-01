#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(`Error: ${error?.message || String(error)}`);
  if (process.env.BUILD_FAST_DEBUG && error?.stack) console.error(error.stack);
  process.exitCode = 1;
});
