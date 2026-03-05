// [Input] Kimi页面DOM结构与可点击会话入口元素。
// [Output] 标准化的会话列表与当前会话消息提取结果（兼容浏览器/JSDOM）。
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

  collectConversationEntries(sidebar) {
    const interactive = [...sidebar.querySelectorAll("a[href], button, [role='button']")];
    const seenKeys = new Set();
    const entries = [];

    for (const element of interactive) {
      const title = normalizeTitle(element.textContent || "", "");
      if (!isValidConversationTitle(title)) {
        continue;
      }

      const href = element.getAttribute("href") || "";
      const dataId = element.getAttribute("data-chat-id") || element.getAttribute("data-id") || "";
      const key = href || dataId || title;

      if (!key || seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      entries.push({ key, title, element });
    }

    return entries.sort((left, right) => compareTop(left.element, right.element));
  }

  async openConversation(entry) {
    entry.element.scrollIntoView({ block: "center" });
    entry.element.click();
    await sleep(600);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
