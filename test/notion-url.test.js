import assert from "node:assert/strict";
import { NotionClient, parseNotionId, specKeyFromNotion } from "../src/notion.js";

const tempPage =
  "https://www.notion.so/TEMP-build_fast-notion-sync-372f7118384a80babbdff7546ea18fbc?source=copy_link";
const roadmapPage =
  "https://www.notion.so/Roadmap-36cf7118384a802d9954c8387b1dac0a?source=copy_link";
const hyphenated = "36cf7118-384a-802d-9954-c8387b1dac0a";

assert.equal(parseNotionId(tempPage), "372f7118-384a-80ba-bbdf-f7546ea18fbc");
assert.equal(parseNotionId(roadmapPage), "36cf7118-384a-802d-9954-c8387b1dac0a");
assert.equal(parseNotionId(hyphenated), "36cf7118-384a-802d-9954-c8387b1dac0a");

assert.notEqual(specKeyFromNotion(tempPage), specKeyFromNotion(roadmapPage));

const originalFetch = globalThis.fetch;
let capturedRequest;
globalThis.fetch = async (url, options) => {
  capturedRequest = { url, options };
  return {
    ok: true,
    text: async () => JSON.stringify({ results: [] })
  };
};

try {
  const notion = new NotionClient({ token: "test-token", version: "2026-03-11" });
  await notion.queryDataSource("abc123", { page_size: 1 });
  assert.equal(capturedRequest.url, "https://api.notion.com/v1/data_sources/abc123/query");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.headers["Notion-Version"], "2026-03-11");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("notion URL tests passed");
