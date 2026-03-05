// [Input] Provider采集到的原始会话与消息字段。
// [Output] 统一化的角色、标题、文本与安全文件名。
// [Pos] 导出领域模型基础工具层。
const ROLE_ALIASES = {
  user: "user",
  human: "user",
  assistant: "assistant",
  ai: "assistant",
  bot: "assistant",
  system: "system"
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function normalizeRole(rawRole) {
  const key = String(rawRole ?? "").trim().toLowerCase();
  if (ROLE_ALIASES[key]) {
    return ROLE_ALIASES[key];
  }
  return "assistant";
}

export function normalizeTitle(rawTitle, fallback = "Untitled Conversation") {
  const value = normalizeText(rawTitle).replace(/\s+/g, " ").trim();
  return value || fallback;
}

export function normalizeText(rawValue) {
  const base = typeof rawValue === "string" ? rawValue : rawValue == null ? "" : String(rawValue);
  return base
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

export function toSafeFileStem(title, index = 0) {
  const normalized = normalizeTitle(title)
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized) {
    return normalized.slice(0, 80);
  }

  return `conversation-${String(index).padStart(3, "0")}`;
}
