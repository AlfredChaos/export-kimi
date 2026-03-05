// [Input] Provider列表、会话数据与导出进度回调。
// [Output] ZIP二进制、文件名、统计信息与选中Provider。
// [Pos] 方案C总编排与回退决策层。
import { createLogger } from "./logger.js";
import { normalizeTitle, toSafeFileStem } from "./models.js";
import { toFailuresMarkdown, toMarkdown } from "./markdown.js";
import { createZipBytes } from "./zip.js";

export class ExportOrchestrator {
  constructor({ providers, logger = createLogger("Orchestrator") } = {}) {
    this.providers = Array.isArray(providers) ? providers : [];
    this.logger = logger;
  }

  async run(onProgress) {
    if (!this.providers.length) {
      throw new Error("No providers configured for export orchestration");
    }

    const providerErrors = [];
    let selected = null;

    for (const provider of this.providers) {
      this.logger.info("provider_start", { provider: provider.name });

      try {
        const result = await provider.collectAll((progress) => {
          onProgress?.({ stage: "collect", provider: provider.name, ...progress });
        });

        if (!result.conversations || !result.conversations.length) {
          providerErrors.push(`${provider.name}: empty conversation set`);
          continue;
        }

        selected = { providerName: provider.name, ...result };
        break;
      } catch (error) {
        const message = `${provider.name}: ${error instanceof Error ? error.message : "Unknown provider error"}`;
        providerErrors.push(message);
        this.logger.warn("provider_failed", { provider: provider.name, error: message });
      }
    }

    if (!selected) {
      throw new Error(`All providers failed. ${providerErrors.join(" | ")}`);
    }

    const exportedAt = new Date().toISOString();
    const markdownFiles = selected.conversations.map((conversation, index) => {
      const title = normalizeTitle(conversation.title, `Conversation-${index + 1}`);
      const fileName = `${String(index + 1).padStart(3, "0")}-${toSafeFileStem(title, index + 1)}.md`;

      return {
        name: fileName,
        content: toMarkdown({
          ...conversation,
          title,
          exportedAt
        })
      };
    });

    const failures = selected.failures || [];
    if (failures.length || providerErrors.length) {
      markdownFiles.push({
        name: "FAILED_ITEMS.md",
        content: toFailuresMarkdown(failures, providerErrors)
      });
    }

    onProgress?.({ stage: "zip", provider: selected.providerName, totalFiles: markdownFiles.length });
    const bytes = createZipBytes(markdownFiles);

    return {
      provider: selected.providerName,
      fileName: buildArchiveName(new Date()),
      bytes,
      stats: {
        total: selected.conversations.length + failures.length,
        success: selected.conversations.length,
        failed: failures.length
      },
      providerErrors
    };
  }
}

export function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function buildArchiveName(now) {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `kimi-history-${yyyy}${mm}${dd}-${hh}${min}${sec}.zip`;
}
