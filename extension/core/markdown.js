// [Input] 标准化会话对象与失败项集合。
// [Output] Markdown文本，供单会话文件与失败报告写入。
// [Pos] 导出内容序列化层。
import { normalizeRole, normalizeText, normalizeTitle } from "./models.js";

export function toMarkdown(conversation) {
  const lines = [
    `# ${normalizeTitle(conversation.title)}`,
    "",
    `- ConversationId: ${normalizeText(conversation.id || "unknown") || "unknown"}`,
    `- ExportedAt: ${normalizeText(conversation.exportedAt || new Date().toISOString())}`,
    `- Provider: ${normalizeText(conversation.provider || "unknown") || "unknown"}`,
    "",
    "---",
    ""
  ];

  for (const message of conversation.messages || []) {
    const role = normalizeRole(message.role).toUpperCase();
    const text = normalizeText(message.text);
    if (!text) {
      continue;
    }

    lines.push(`## ${role}`);
    lines.push("");
    lines.push(text);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function toFailuresMarkdown(failures, providerErrors = []) {
  const lines = ["# FAILED_ITEMS", "", `- ExportedAt: ${new Date().toISOString()}`, ""];

  if (providerErrors.length) {
    lines.push("## ProviderErrors");
    lines.push("");
    for (const item of providerErrors) {
      lines.push(`- ${normalizeText(item)}`);
    }
    lines.push("");
  }

  lines.push("## ConversationFailures");
  lines.push("");

  if (!failures.length) {
    lines.push("- None");
  } else {
    for (const failure of failures) {
      lines.push(`- [${normalizeText(failure.id || "unknown")}] ${normalizeTitle(failure.title || "Untitled")}: ${normalizeText(failure.reason || "Unknown error")}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
