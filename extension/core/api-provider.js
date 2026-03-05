// [Input] Kimi页面上下文的fetch能力与鉴权相关本地状态。
// [Output] 通过私有接口抓取的标准化会话与消息集合。
// [Pos] 方案C的API优先数据源实现。
import { createLogger } from "./logger.js";
import { normalizeRole, normalizeText, normalizeTitle } from "./models.js";
import { ConversationProvider, ProviderError } from "./provider.js";

const LIST_CHATS_PATH = "/apiv2/kimi.chat.v1.ChatService/ListChats";
const LIST_MESSAGES_PATH = "/apiv2/kimi.chat.v1.ChatService/ListMessages";
const GET_CHAT_PATH = "/apiv2/kimi.chat.v1.ChatService/GetChat";
const REQUEST_TIMEOUT_MS = 15000;

export class APIProvider extends ConversationProvider {
  constructor({
    windowObj = window,
    fetchImpl,
    baseUrl = "https://www.kimi.com",
    chatPageSize = 200,
    messagePageSize = 1000,
    logger = createLogger("APIProvider")
  } = {}) {
    super("api", logger);
    this.windowObj = windowObj;
    this.fetchImpl = fetchImpl || windowObj.fetch.bind(windowObj);
    this.baseUrl = baseUrl;
    this.chatPageSize = chatPageSize;
    this.messagePageSize = messagePageSize;
    this.defaultHeaders = buildDefaultHeaders(windowObj);
  }

  async collectAll(onProgress) {
    const payload = await this._request(LIST_CHATS_PATH, {
      project_id: "",
      page_size: this.chatPageSize,
      query: ""
    });

    const chats = extractChatMetas(payload);
    if (!chats.length) {
      throw new ProviderError(this.name, "API returned no chat metadata");
    }

    const conversations = [];
    const failures = [];

    for (let index = 0; index < chats.length; index += 1) {
      const chat = chats[index];
      onProgress?.({ provider: this.name, phase: "collect", current: index + 1, total: chats.length, title: chat.title });

      try {
        const messagesPayload = await this._loadMessagesPayload(chat.id);
        const messages = extractMessages(messagesPayload);
        if (!messages.length) {
          throw new Error("No messages extracted from API payload");
        }

        conversations.push({
          id: chat.id,
          title: normalizeTitle(chat.title),
          provider: this.name,
          messages
        });
      } catch (error) {
        failures.push({
          id: chat.id,
          title: normalizeTitle(chat.title),
          reason: error instanceof Error ? error.message : "Unknown API chat failure"
        });
        this.logger.warn("api_chat_failed", { chatId: chat.id, error: failures[failures.length - 1].reason });
      }
    }

    if (!conversations.length) {
      throw new ProviderError(this.name, "API provider failed for all chats", failures);
    }

    return { provider: this.name, conversations, failures };
  }

  async _loadMessagesPayload(chatId) {
    const attempts = [
      { path: LIST_MESSAGES_PATH, body: { chat_id: chatId, page_size: this.messagePageSize, offset: 0 } },
      { path: LIST_MESSAGES_PATH, body: { id: chatId, page_size: this.messagePageSize, offset: 0 } },
      { path: GET_CHAT_PATH, body: { chat_id: chatId } },
      { path: GET_CHAT_PATH, body: { id: chatId } }
    ];

    let lastError = null;

    for (const attempt of attempts) {
      try {
        const payload = await this._request(attempt.path, attempt.body);
        if (extractMessages(payload).length > 0) {
          return payload;
        }
      } catch (error) {
        lastError = error;
        this.logger.debug("api_attempt_failed", {
          path: attempt.path,
          chatId,
          reason: error instanceof Error ? error.message : "Unknown"
        });
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new ProviderError(this.name, `Cannot load messages for chat ${chatId}`);
  }

  async _request(path, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...this.defaultHeaders,
          "x-traffic-id": `ext-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const snippet = await safeReadText(response);
        throw new ProviderError(this.name, `HTTP ${response.status} from ${path}: ${snippet.slice(0, 180)}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (error && typeof error === "object" && error.name === "AbortError") {
        throw new ProviderError(this.name, `Request timeout for ${path}`);
      }
      throw new ProviderError(this.name, `Request failed for ${path}: ${error instanceof Error ? error.message : "Unknown"}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function buildDefaultHeaders(windowObj = window) {
  const headers = {
    "x-language": windowObj.navigator?.language || "zh-CN",
    "r-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    "x-msh-platform": "web",
    "x-msh-version": "1.0.0"
  };

  try {
    const storage = windowObj.localStorage;
    if (!storage) {
      return headers;
    }

    const pairs = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) {
        continue;
      }
      pairs.push([key, storage.getItem(key)]);
    }

    const device = findStorageValue(pairs, /device/i);
    const session = findStorageValue(pairs, /(session|token)/i);

    if (device) {
      headers["x-msh-device-id"] = device;
    }
    if (session) {
      headers["x-msh-session-id"] = session;
    }
  } catch (_error) {
    // localStorage 读取失败时继续使用默认请求头。
  }

  return headers;
}

export function extractChatMetas(payload) {
  const results = [];
  const seen = new Set();

  deepWalk(payload, (node) => {
    if (!isPlainObject(node)) {
      return;
    }

    const keys = Object.keys(node);
    const keyBlob = keys.join("|");
    const hasChatSignal = /(chat|conversation)/i.test(keyBlob);

    const idCandidate = pickString(node, ["chat_id", "chatId", "conversation_id", "conversationId", "id"]);
    const titleCandidate = pickString(node, ["title", "name", "chat_name", "topic", "summary"]);

    if (!idCandidate) {
      return;
    }

    if (!hasChatSignal && !titleCandidate) {
      return;
    }

    const id = String(idCandidate);
    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    results.push({ id, title: normalizeTitle(titleCandidate || `chat-${id}`) });
  });

  return results;
}

export function extractMessages(payload) {
  const results = [];
  const seen = new Set();

  deepWalk(payload, (node) => {
    if (!isPlainObject(node)) {
      return;
    }

    const roleValue =
      node.role ??
      node.sender_role ??
      node.author_role ??
      node.author ??
      node.message_role ??
      node.type;

    const textValue =
      node.content ??
      node.text ??
      node.message ??
      node.answer ??
      node.output ??
      node.value ??
      node.delta;

    if (!roleValue || textValue == null) {
      return;
    }

    const text = extractTextValue(textValue);
    if (!text) {
      return;
    }

    const role = normalizeRole(roleValue);
    const fingerprint = `${role}:${text}`;
    if (seen.has(fingerprint)) {
      return;
    }

    seen.add(fingerprint);
    results.push({ role, text });
  });

  return results;
}

function extractTextValue(rawValue) {
  if (typeof rawValue === "string") {
    return normalizeText(rawValue);
  }

  if (Array.isArray(rawValue)) {
    const parts = rawValue
      .map((item) => extractTextValue(item))
      .filter((item) => Boolean(item));
    return normalizeText(parts.join("\n"));
  }

  if (!isPlainObject(rawValue)) {
    return normalizeText(rawValue);
  }

  const directText = pickString(rawValue, ["text", "content", "value", "answer", "delta", "output_text"]);
  if (directText) {
    return normalizeText(directText);
  }

  const nested = [];
  for (const value of Object.values(rawValue)) {
    const part = extractTextValue(value);
    if (part) {
      nested.push(part);
    }
  }

  return normalizeText(nested.join("\n"));
}

function findStorageValue(pairs, pattern) {
  for (const [key, value] of pairs) {
    if (!pattern.test(key)) {
      continue;
    }
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function pickString(source, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(source, key)) {
      continue;
    }
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function deepWalk(node, visitor, seen = new WeakSet()) {
  if (node == null || typeof node !== "object") {
    return;
  }

  if (seen.has(node)) {
    return;
  }
  seen.add(node);

  visitor(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      deepWalk(item, visitor, seen);
    }
    return;
  }

  for (const value of Object.values(node)) {
    deepWalk(value, visitor, seen);
  }
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch (_error) {
    return "";
  }
}
