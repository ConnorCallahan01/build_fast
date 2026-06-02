import { shortHash } from "./util.js";

export function parseNotionId(input) {
  if (!input) return undefined;
  const value = String(input).trim();
  const withoutQuery = value.split(/[?#]/)[0];
  const lastPathPart = withoutQuery.split("/").filter(Boolean).at(-1) || withoutQuery;

  const hyphenated = value.match(/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/);
  const trailingHexRun = lastPathPart.match(/([a-fA-F0-9]{32,})$/)?.[1];
  const raw = hyphenated?.[1] || trailingHexRun?.slice(-32);
  if (!raw) return undefined;
  const compact = raw.replace(/-/g, "");
  return compact.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

export function specKeyFromNotion(input) {
  return parseNotionId(input) || shortHash(input || "local");
}

export class NotionClient {
  constructor({ token, version }) {
    this.token = token;
    this.version = version || "2022-06-28";
  }

  get enabled() {
    return Boolean(this.token);
  }

  async request(method, endpoint, body, options = {}) {
    if (!this.enabled) {
      throw new Error("Notion token is not configured. Set NOTION_API_TOKEN or .build_fast/config.json.");
    }

    const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": options.version || this.version,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`Notion ${method} ${endpoint} failed (${response.status}): ${json.message || text}`);
    }
    return json;
  }

  retrievePage(pageId) {
    return this.request("GET", `/pages/${pageId}`);
  }

  retrieveDatabase(databaseId) {
    return this.request("GET", `/databases/${databaseId}`);
  }

  retrieveDatabaseDataSources(databaseId) {
    return this.request("GET", `/databases/${databaseId}`, undefined, { version: "2026-03-11" });
  }

  retrieveDataSource(dataSourceId) {
    return this.request("GET", `/data_sources/${dataSourceId}`, undefined, { version: "2026-03-11" });
  }

  queryDataSource(dataSourceId, body = {}) {
    return this.request("POST", `/data_sources/${dataSourceId}/query`, body, { version: "2026-03-11" });
  }

  createDatabase(parentPageId, title, properties, options = {}) {
    return this.request("POST", "/databases", {
      parent: {
        type: "page_id",
        page_id: parentPageId
      },
      title: [{ type: "text", text: { content: title.slice(0, 200) } }],
      is_inline: options.inline !== false,
      initial_data_source: {
        title: [{ type: "text", text: { content: title.slice(0, 200) } }],
        properties
      }
    }, { version: "2026-03-11" });
  }

  async listBlockChildren(blockId) {
    const results = [];
    let startCursor;
    do {
      const query = startCursor ? `?page_size=100&start_cursor=${encodeURIComponent(startCursor)}` : "?page_size=100";
      const page = await this.request("GET", `/blocks/${blockId}/children${query}`);
      results.push(...(page.results || []));
      startCursor = page.has_more ? page.next_cursor : undefined;
    } while (startCursor);
    return results;
  }

  appendBlocks(blockId, children) {
    return this.request("PATCH", `/blocks/${blockId}/children`, { children });
  }

  deleteBlock(blockId) {
    return this.request("DELETE", `/blocks/${blockId}`);
  }

  updatePage(pageId, properties) {
    return this.request("PATCH", `/pages/${pageId}`, { properties });
  }

  createDataSourcePage(dataSourceId, properties, children = []) {
    return this.request("POST", "/pages", {
      parent: {
        type: "data_source_id",
        data_source_id: dataSourceId
      },
      properties,
      children
    });
  }

  createChildPage(parentPageId, title, children = []) {
    return this.request("POST", "/pages", {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title.slice(0, 200) } }]
        }
      },
      children
    });
  }
}

export async function checkNotionPage(config, notionUrl) {
  const pageId = parseNotionId(notionUrl);
  if (!pageId) {
    return { ok: false, pageId: null, detail: "could not parse a Notion page ID from --ntn" };
  }
  if (!config.notionToken) {
    return { ok: false, pageId, detail: "missing NOTION_API_TOKEN" };
  }

  try {
    const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
    const page = await notion.retrievePage(pageId);
    return { ok: true, pageId, detail: page.url || "page reachable" };
  } catch (error) {
    return { ok: false, pageId, detail: error.message };
  }
}

export async function inspectNotionPage(config, notionUrl) {
  const pageId = parseNotionId(notionUrl);
  if (!pageId) {
    return { ok: false, pageId: null, detail: "could not parse a Notion page ID from --ntn" };
  }
  if (!config.notionToken) {
    return { ok: false, pageId, detail: "missing NOTION_API_TOKEN" };
  }

  const notion = new NotionClient({ token: config.notionToken, version: config.notionVersion });
  const page = await notion.retrievePage(pageId);
  const children = await notion.listBlockChildren(pageId);
  const databases = [];

  for (const child of children) {
    if (child.type !== "child_database") continue;
    databases.push(await inspectDatabaseDataSources(notion, child));
  }

  return {
    ok: true,
    pageId,
    page: {
      id: page.id,
      url: page.url,
      properties: summarizeProperties(page.properties || {})
    },
    childBlocks: children.map(summarizeBlock),
    databases
  };
}

async function inspectDatabaseDataSources(notion, child) {
  try {
    const database = await notion.retrieveDatabaseDataSources(child.id);
    const dataSources = [];
    for (const source of database.data_sources || []) {
      try {
        const dataSource = await notion.retrieveDataSource(source.id);
        dataSources.push(summarizeDataSource(dataSource));
      } catch (error) {
        dataSources.push({
          id: source.id,
          title: source.name || "Untitled data source",
          error: error.message
        });
      }
    }

    return {
      id: database.id || child.id,
      blockId: child.id,
      title: plainText(database.title) || child.child_database?.title || "Untitled database",
      object: database.object || "database",
      dataSources
    };
  } catch (dataSourceError) {
    return inspectLegacyDatabase(notion, child, dataSourceError);
  }
}

async function inspectLegacyDatabase(notion, child, dataSourceError) {
  try {
    const database = await notion.retrieveDatabase(child.id);
    return {
      ...summarizeDatabase(database, child),
      dataSourceError: dataSourceError.message
    };
  } catch (legacyError) {
    return {
      id: child.id,
      title: child.child_database?.title || "Untitled database",
      error: dataSourceError.message,
      legacyError: legacyError.message
    };
  }
}

function summarizeDatabase(database, block) {
  return {
    id: database.id,
    blockId: block.id,
    title: plainText(database.title) || block.child_database?.title || "Untitled database",
    url: database.url,
    properties: summarizeProperties(database.properties || {})
  };
}

function summarizeDataSource(dataSource) {
  return {
    id: dataSource.id,
    object: dataSource.object,
    title: plainText(dataSource.title) || "Untitled data source",
    url: dataSource.url,
    parent: dataSource.parent,
    properties: summarizeProperties(dataSource.properties || {})
  };
}

function summarizeProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties).map(([name, property]) => [
      name,
      {
        id: property.id,
        type: property.type,
        options: property[property.type]?.options?.map((option) => option.name)
      }
    ])
  );
}

function summarizeBlock(blockValue) {
  return {
    id: blockValue.id,
    type: blockValue.type,
    title: blockValue.type === "child_database" ? blockValue.child_database?.title : plainText(blockValue[blockValue.type]?.rich_text)
  };
}

function plainText(richText = []) {
  return richText.map((part) => part.plain_text || part.text?.content || "").join("");
}

export function notionTitle(content) {
  return { title: richText(content) };
}

export function notionRichText(content) {
  return { rich_text: richText(content) };
}

export function notionStatus(name) {
  return { status: { name } };
}

export function notionUrl(url) {
  return { url: url || null };
}

export function notionRelation(pageIds) {
  return { relation: pageIds.filter(Boolean).map((id) => ({ id })) };
}

export function pageTitle(page) {
  const titleProperty = Object.values(page.properties || {}).find((property) => property.type === "title");
  return (titleProperty?.title || []).map((part) => part.plain_text || part.text?.content || "").join("");
}

function richText(content) {
  const text = String(content || "").slice(0, 1900);
  return text ? [{ type: "text", text: { content: text } }] : [];
}

export function markdownBlocks(markdown) {
  const lines = String(markdown).split("\n");
  const blocks = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("### ")) {
      blocks.push(block("heading_3", line.slice(4)));
    } else if (line.startsWith("## ")) {
      blocks.push(block("heading_2", line.slice(3)));
    } else if (line.startsWith("# ")) {
      blocks.push(block("heading_1", line.slice(2)));
    } else if (line.startsWith("- [ ] ")) {
      blocks.push(toDoBlock(line.slice(6), false));
    } else if (line.startsWith("- [x] ")) {
      blocks.push(toDoBlock(line.slice(6), true));
    } else if (line.startsWith("- ")) {
      blocks.push(block("bulleted_list_item", line.slice(2)));
    } else {
      blocks.push(block("paragraph", line));
    }
  }
  return blocks.slice(0, 90);
}

function block(type, content) {
  return {
    object: "block",
    type,
    [type]: {
      rich_text: [{ type: "text", text: { content: String(content).slice(0, 1900) } }]
    }
  };
}

function toDoBlock(content, checked) {
  return {
    object: "block",
    type: "to_do",
    to_do: {
      checked,
      rich_text: [{ type: "text", text: { content: String(content).slice(0, 1900) } }]
    }
  };
}
