# Kimi 历史会话导出插件设计

## 1. 目标与边界
- 目标：在 `https://www.kimi.com/` 内一键导出“全部历史会话”为多个 Markdown 文件，并打包成一个 ZIP 下载。
- 必须满足：
  - 支持中文内容、代码块、多段对话。
  - 导出文件名可读且去重（含会话标题与时间）。
  - 失败可见（用户能知道哪条会话失败）。
- 非目标（首版不做）：
  - 不处理附件二进制下载。
  - 不做云端同步，只做本地导出。

## 2. 三种可行路径对比
### 方案 A：纯私有 API 抓取
- 做法：直接调用前端接口（已观测到 `ListChats / GetChat / ListMessages`）。
- 优点：速度快，不依赖页面渲染。
- 风险：鉴权头、cookie、反爬策略变化会直接失效。

### 方案 B：纯 UI 自动遍历（推荐主链路）
- 做法：在 content script 内滚动历史列表、逐条点击会话、读取当前消息 DOM 并转 Markdown。
- 优点：不依赖私有接口协议，贴近真实用户操作。
- 风险：页面结构变化后需更新选择器；速度相对慢。

### 方案 C：API 优先 + UI 回退（推荐整体架构）
- 做法：定义 `ConversationProvider` 抽象，先尝试 APIProvider，失败自动退回 UIProvider。
- 优点：兼顾速度与韧性；便于后续维护。
- 风险：实现成本高于单链路。

## 3. 推荐架构（C，首版双链路实装）
- 核心模块：
  - `APIProvider`: 优先尝试私有接口抓取，失败可回退。
  - `UIProvider`: 遍历会话并产出标准化对话对象。
  - `MarkdownSerializer`: 将标准对象转 `.md`。
  - `ZipBuilder`: 将多份 Markdown 打包为 `.zip`。
  - `ExportOrchestrator`: 串联抓取、转换、打包、下载、进度上报。
- 首版策略：
  - Provider 顺序固定为 `API -> UI`，当 API 全量失败时自动回退 UI。
  - 失败会话写入 `FAILED_ITEMS.md`，确保部分失败仍可下载完整 ZIP。

## 4. 验收标准
- 在已登录 Kimi 页面，点击扩展按钮后：
  - 能下载 `kimi-history-YYYYMMDD-HHmmss.zip`。
  - ZIP 内每条会话一个 `.md` 文件。
  - Markdown 至少包含：标题、导出时间、消息角色、消息内容。
  - 当部分会话失败时，ZIP 仍生成，并额外包含 `FAILED_ITEMS.md`。
