// [Input] Kimi页面DOM结构、可点击入口与history页面HTML内容。
// [Output] 标准化会话引用列表（含UUID兜底发现）与当前会话消息提取结果。
// [Pos] UIProvider依赖的页面结构适配层。
import { createLogger } from "../core/logger.js";
import { normalizeRole, normalizeText, normalizeTitle } from "../core/models.js";

const HISTORY_HINT = "历史会话";
const NAV_BLACKLIST = new Set([
  "新建会话",
  "网站",
  "文档",
  "PPT",
  "表格",
  "深度研究",
  "Kimi Code",
  "Kimi Claw",
  "Agent",
  "Agent 集群",
  "历史会话",
  "登录",
  "查看手机应用",
  "关于我们",
  "Language",
  "用户反馈"
]);

const MESSAGE_NOISE = ["重新生成", "复制", "赞同", "反对", "分享", "停止生成", "继续生成"];
const CHAT_PATH_PATTERN =
  /^https:\/\/www\.kimi\.com\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#].*)?$/i;
const CHAT_URL_MATCH_PATTERN =
  /(?:https?:\/\/www\.kimi\.com)?\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#][^\s"'<>)]*)?/gi;

export class DOMAdapter {
  constructor(documentObj = document, logger = createLogger("DOMAdapter")) {
    this.documentObj = documentObj;
    this.logger = logger;
  }

  findHistorySidebar() {
    const candidates = [
      ...this.documentObj.querySelectorAll("aside"),
      ...this.documentObj.querySelectorAll("[role='complementary']"),
      ...this.documentObj.querySelectorAll("nav")
    ];

    for (const candidate of candidates) {
      const text = normalizeText(candidate.textContent || "");
      if (text.includes(HISTORY_HINT)) {
        return candidate;
      }
    }

    return null;
  }

  async expandHistoryList(sidebar, rounds = 30) {
    const scroller = findScrollableContainer(sidebar) || sidebar;

    let stableRounds = 0;
    let lastScrollHeight = -1;

    for (let index = 0; index < rounds; index += 1) {
      scroller.scrollTop = scroller.scrollHeight;
      await sleep(180);

      if (scroller.scrollHeight === lastScrollHeight) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      lastScrollHeight = scroller.scrollHeight;
      if (stableRounds >= 3) {
        break;
      }
    }
  }

  collectConversationEntries(root, { source = "sidebar", includeHistoryPortal = false } = {}) {
    const interactive = collectInteractiveElements(root);
    const seenKeys = new Set();
    const entries = [];

    for (const element of interactive) {
      const entry = buildConversationEntry(element, { source, includeHistoryPortal });
      if (!entry || seenKeys.has(entry.key)) {
        continue;
      }

      seenKeys.add(entry.key);
      entries.push(entry);
    }

    return entries.sort((left, right) => compareTop(left.element, right.element));
  }

  collectConversationEntriesFromDocument({ source = "history" } = {}) {
    const root = this.documentObj.body || this.documentObj.documentElement;
    if (!root) {
      return [];
    }

    const seenKeys = new Set();
    const entries = [];
    const candidateSelector = [
      "a[href*='/chat/']",
      "[data-chat-id]",
      "[data-id]",
      "[data-conversation-id]",
      "[data-chat-uuid]"
    ].join(", ");

    for (const element of root.querySelectorAll(candidateSelector)) {
      const entry = buildConversationEntryByRef(element, {
        source,
        documentObj: this.documentObj
      });
      if (!entry || seenKeys.has(entry.key)) {
        continue;
      }

      seenKeys.add(entry.key);
      entries.push(entry);
    }

    const html = this.documentObj.documentElement?.innerHTML || "";
    for (const ref of extractConversationRefsFromText(html, this.documentObj)) {
      if (seenKeys.has(ref.url)) {
        continue;
      }

      seenKeys.add(ref.url);
      entries.push({
        key: ref.url,
        title: ref.id,
        href: ref.url,
        dataId: ref.id,
        id: ref.id,
        url: ref.url,
        source
      });
    }

    return entries;
  }

  findHistoryPortalEntry(sidebar) {
    const interactive = collectInteractiveElements(sidebar);
    for (const element of interactive) {
      const entry = buildConversationEntry(element, {
        source: "history-portal",
        includeHistoryPortal: true
      });
      if (entry && isHistoryPortalEntry(entry.title, entry.href)) {
        return entry;
      }
    }

    return null;
  }

  findHistoryPortalRoot() {
    const headingNodes = [
      ...this.documentObj.querySelectorAll("h1, h2, h3, [role='heading']"),
      ...this.documentObj.querySelectorAll("[aria-label]")
    ];

    for (const headingNode of headingNodes) {
      const text = normalizeTitle(
        headingNode.getAttribute?.("aria-label") || headingNode.textContent || "",
        ""
      );
      if (text !== HISTORY_HINT) {
        continue;
      }

      const container = findPortalContainer(headingNode);
      if (container) {
        return container;
      }
    }

    return null;
  }

  async ensureHistoryPortalVisible(portalEntry) {
    const existingRoot = this.findHistoryPortalRoot();
    if (existingRoot) {
      return existingRoot;
    }

    if (!portalEntry) {
      throw new Error("History portal entry not found");
    }

    await this.openConversation(portalEntry);
    await sleep(600);

    const nextRoot = this.findHistoryPortalRoot();
    if (!nextRoot) {
      throw new Error("History portal root not found after opening");
    }

    return nextRoot;
  }

  async openConversation(entry) {
    const element = this.resolveConversationEntry(entry);
    element.scrollIntoView?.({ block: "center" });
    element.click();
    await sleep(600);
  }

  resolveConversationEntry(entry) {
    if (entry?.element?.isConnected) {
      return entry.element;
    }

    const scopes = [];
    const historyRoot = this.findHistoryPortalRoot();
    if (entry?.source === "history" && historyRoot) {
      scopes.push(historyRoot);
    }

    const sidebar = this.findHistorySidebar();
    if (sidebar) {
      scopes.push(sidebar);
    }

    scopes.push(this.documentObj);

    for (const scope of scopes) {
      const matched = findMatchingEntryElement(scope, entry);
      if (matched) {
        entry.element = matched;
        return matched;
      }
    }

    throw new Error(`Conversation entry not found: ${entry?.title || entry?.key || "unknown"}`);
  }

  extractCurrentConversation(fallbackTitle = "Untitled Conversation") {
    const root = this.documentObj.querySelector("main") || this.documentObj.body;
    const titleNode = root.querySelector("h1, h2, h3");
    const title = normalizeTitle(titleNode?.textContent || fallbackTitle, fallbackTitle);

    const messageNodes = collectMessageNodes(root);
    const messages = [];
    const fingerprints = new Set();

    let lastRole = "assistant";

    for (const node of messageNodes) {
      const text = normalizeText(node.innerText || node.textContent || "");
      if (!text || isNoiseText(text)) {
        continue;
      }

      let role = detectRole(node);
      if (role === "unknown") {
        role = lastRole === "assistant" ? "user" : "assistant";
      }

      const normalizedRole = normalizeRole(role);
      const key = `${normalizedRole}:${text}`;
      if (fingerprints.has(key)) {
        continue;
      }

      fingerprints.add(key);
      messages.push({ role: normalizedRole, text });
      lastRole = normalizedRole;
    }

    return { title, messages };
  }
}

function collectMessageNodes(root) {
  const selectors = [
    "[data-role]",
    "[data-message-id]",
    "[data-testid*='message']",
    "article",
    "[class*='message']"
  ];

  const all = [];
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) {
      if (!isElementNode(node)) {
        continue;
      }
      if (normalizeText(node.textContent || "").length < 2) {
        continue;
      }
      all.push(node);
    }
  }

  const unique = Array.from(new Set(all));
  const depthSorted = unique.sort((left, right) => depth(right) - depth(left));

  const pruned = [];
  for (const candidate of depthSorted) {
    if (pruned.some((node) => candidate.contains(node))) {
      continue;
    }
    pruned.push(candidate);
  }

  return pruned.sort((left, right) => compareDocumentOrder(left, right));
}

function collectInteractiveElements(root) {
  return [...root.querySelectorAll("a[href], button, [role='button'], [tabindex='0']")];
}

function buildConversationEntry(element, { source = "sidebar", includeHistoryPortal = false } = {}) {
  const title = extractEntryTitle(element);
  if (!isValidConversationTitle(title)) {
    return null;
  }

  const href = element.getAttribute("href") || "";
  const historyPortal = isHistoryPortalEntry(title, href);
  if (!includeHistoryPortal && historyPortal) {
    return null;
  }

  const dataId = element.getAttribute("data-chat-id") || element.getAttribute("data-id") || "";
  const conversationRef = historyPortal ? null : extractConversationRef(href, dataId, element.ownerDocument);
  if (!historyPortal && !conversationRef) {
    return null;
  }

  const key = conversationRef?.url || href || dataId || title;
  if (!key) {
    return null;
  }

  return {
    key,
    title,
    href,
    dataId,
    id: conversationRef?.id,
    url: conversationRef?.url,
    source,
    element
  };
}

function buildConversationEntryByRef(element, { source = "history", documentObj } = {}) {
  const href = element.getAttribute("href") || "";
  const dataIdCandidates = [
    element.getAttribute("data-chat-id") || "",
    element.getAttribute("data-conversation-id") || "",
    element.getAttribute("data-chat-uuid") || "",
    element.getAttribute("data-id") || ""
  ];
  const dataId = dataIdCandidates.find((candidate) => isUuid(candidate)) || "";
  const conversationRef = extractConversationRef(href, dataId, documentObj || element.ownerDocument);
  if (!conversationRef) {
    return null;
  }

  const title = normalizeConversationTitle(extractEntryTitle(element), conversationRef.id);
  return {
    key: conversationRef.url,
    title,
    href,
    dataId,
    id: conversationRef.id,
    url: conversationRef.url,
    source,
    element
  };
}

function extractEntryTitle(element) {
  const attributeTitle = normalizeTitle(
    element.getAttribute("data-title") || element.getAttribute("title") || "",
    ""
  );
  if (isLikelyConversationTitle(attributeTitle)) {
    return attributeTitle;
  }

  const descendants = [
    ...element.querySelectorAll("h1, h2, h3, h4, strong, b, [class*='title'], [data-title]")
  ];
  for (const node of descendants) {
    const title = firstMeaningfulLine(node.textContent || "");
    if (isLikelyConversationTitle(title)) {
      return title;
    }
  }

  const lines = normalizeText(element.textContent || "")
    .split("\n")
    .map((line) => normalizeTitle(line, ""))
    .filter(Boolean);

  for (const line of lines) {
    if (isLikelyConversationTitle(line)) {
      return line;
    }
  }

  return normalizeTitle(element.textContent || "", "");
}

function firstMeaningfulLine(rawText) {
  const lines = normalizeText(rawText)
    .split("\n")
    .map((line) => normalizeTitle(line, ""))
    .filter(Boolean);

  return lines.find((line) => isLikelyConversationTitle(line)) || "";
}

function isLikelyConversationTitle(title) {
  if (!isValidConversationTitle(title)) {
    return false;
  }

  if (looksLikeDateText(title)) {
    return false;
  }

  return true;
}

function normalizeConversationTitle(rawTitle, fallbackId) {
  if (isLikelyConversationTitle(rawTitle)) {
    return rawTitle;
  }

  return fallbackId || rawTitle || "Untitled Conversation";
}

function detectRole(node) {
  const roleHint = normalizeText(node.getAttribute("data-role") || node.getAttribute("aria-label") || "").toLowerCase();
  if (roleHint.includes("user") || roleHint.includes("human") || roleHint.includes("你")) {
    return "user";
  }
  if (roleHint.includes("assistant") || roleHint.includes("ai") || roleHint.includes("kimi")) {
    return "assistant";
  }

  const classHint = (node.className || "").toString().toLowerCase();
  if (classHint.includes("user") || classHint.includes("human")) {
    return "user";
  }
  if (classHint.includes("assistant") || classHint.includes("ai") || classHint.includes("kimi")) {
    return "assistant";
  }

  const text = normalizeText(node.textContent || "");
  if (text.startsWith("你：") || text.startsWith("你:")) {
    return "user";
  }

  return "unknown";
}

function findScrollableContainer(root) {
  const nodes = [root, ...root.querySelectorAll("*")];
  for (const node of nodes) {
    if (!isElementNode(node)) {
      continue;
    }

    if (typeof node.scrollHeight !== "number" || typeof node.clientHeight !== "number") {
      continue;
    }

    if (node.scrollHeight > node.clientHeight + 8) {
      return node;
    }
  }

  return null;
}

function isValidConversationTitle(title) {
  if (!title) {
    return false;
  }

  if (title.length < 2 || title.length > 120) {
    return false;
  }

  if (NAV_BLACKLIST.has(title)) {
    return false;
  }

  return true;
}

function isHistoryPortalEntry(title, href) {
  if (title === "查看全部") {
    return true;
  }

  return href.toLowerCase().includes("/chat/history");
}

function looksLikeDateText(text) {
  return (
    /^\d{4}年\d{1,2}月\d{1,2}日$/.test(text) ||
    /^\d{1,2}月\d{1,2}日$/.test(text) ||
    /^(今天|昨天|今年|更早|本周|本月)$/.test(text)
  );
}

function isNoiseText(text) {
  if (text.length > 16000) {
    return true;
  }

  return MESSAGE_NOISE.some((token) => text === token || text.endsWith(`\n${token}`));
}

function depth(node) {
  let level = 0;
  let current = node;
  while (current.parentElement) {
    level += 1;
    current = current.parentElement;
  }
  return level;
}

function compareTop(left, right) {
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  return leftRect.top - rightRect.top;
}

function compareDocumentOrder(left, right) {
  if (left === right) {
    return 0;
  }

  const position = left.compareDocumentPosition(right);
  if (position & 0x04) {
    return -1;
  }
  if (position & 0x02) {
    return 1;
  }
  return 0;
}

function isElementNode(node) {
  return Boolean(node && typeof node === "object" && node.nodeType === 1);
}

function extractConversationRef(href, dataId, documentObj) {
  const absoluteHref = toAbsoluteKimiUrl(href, documentObj);
  const hrefMatch = absoluteHref.match(CHAT_PATH_PATTERN);
  if (hrefMatch) {
    return {
      id: hrefMatch[1],
      url: absoluteHref
    };
  }

  if (isUuid(dataId)) {
    return {
      id: dataId,
      url: `https://www.kimi.com/chat/${dataId}`
    };
  }

  return null;
}

function extractConversationRefsFromText(rawText, documentObj) {
  const refs = [];
  const seen = new Set();
  for (const match of rawText.matchAll(CHAT_URL_MATCH_PATTERN)) {
    const rawUrl = match[0];
    const absoluteUrl = toAbsoluteKimiUrl(rawUrl, documentObj);
    const ref = extractConversationRef(absoluteUrl, "", documentObj);
    if (!ref || seen.has(ref.url)) {
      continue;
    }

    seen.add(ref.url);
    refs.push(ref);
  }

  return refs;
}

function toAbsoluteKimiUrl(href, documentObj) {
  if (!href) {
    return "";
  }

  try {
    return new URL(href, documentObj?.location?.href || "https://www.kimi.com/").toString();
  } catch (_error) {
    return "";
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
}

function findPortalContainer(node) {
  let current = node;
  while (current && isElementNode(current)) {
    const tagName = current.tagName.toLowerCase();
    if ((tagName === "aside" || tagName === "nav") && current !== node) {
      return null;
    }

    const text = normalizeText(current.textContent || "");
    const hasSearch = Boolean(
      current.querySelector("input[placeholder*='搜索'], input[placeholder*='history'], [type='search']")
    );
    const interactiveCount = collectInteractiveElements(current).length;
    if (
      text.includes(HISTORY_HINT) &&
      interactiveCount >= 2 &&
      !current.closest("aside, nav") &&
      (hasSearch || interactiveCount >= 3)
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function findMatchingEntryElement(scope, entry) {
  const interactive = collectInteractiveElements(scope);
  for (const element of interactive) {
    const href = element.getAttribute("href") || "";
    const dataId = element.getAttribute("data-chat-id") || element.getAttribute("data-id") || "";
    const title = extractEntryTitle(element);
    const url = toAbsoluteKimiUrl(href, element.ownerDocument);

    if (entry?.url && url === entry.url) {
      return element;
    }
    if (entry?.href && href === entry.href) {
      return element;
    }
    if (entry?.id && dataId === entry.id) {
      return element;
    }
    if (entry?.dataId && dataId === entry.dataId) {
      return element;
    }
    if (entry?.title && title === entry.title) {
      return element;
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
