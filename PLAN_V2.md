# Feishu CLI v2 计划 — 对齐官方实现 + 完善核心功能

## Context

项目已完成 Step 1-4（骨架、基础设施、动态命令注册、基础命令验证）及部分 Step 5（msg send、doc import/export 最小版）。

经过与官方 MCP（`ref/lark-openapi-mcp-main`）和 OpenClaw 插件（`ref/openclaw-lark-main`）的详细对比，发现以下**关键差距**需要修复：

### 发现的问题

1. **`useUAT` 标志失效**：GenTools 中的 zod 定义没有 `schema.useUAT` 字段（只有 builtin-tools 有），导致 `loader.ts:244` 的 `if (tool.schema.useUAT)` 永远为 false，**所有生成命令都没有 `--use-uat` 选项**。用户无法为生成命令切换到 User Token。
2. **缺少 `accessTokens` 感知**：MCP 通过 `tool.accessTokens` 判断该 API 支持哪种 Token，feishu-cli 完全忽略了这个字段。
3. **缺少 builtin tools**：MCP 有 `docx.builtin.import`（通过 drive.media.uploadAll 上传 Markdown）和 `docx.builtin.search`（文档搜索），feishu-cli 只导入了 GenTools，没有导入 BuiltinTools。
4. **`doc import` 实现与官方不同**：当前用 `markdownToSimpleBlocks()`（按空行分段为纯文本块），官方 MCP 用 `drive.media.uploadAll` + `drive.importTask.create`（支持完整 Markdown 格式）。
5. **缺少错误码处理和自动重授权**：MCP 检测 `USER_ACCESS_TOKEN_UNAUTHORIZED` / `USER_ACCESS_TOKEN_INVALID` 错误码并触发重授权流程。
6. **缺少 Token Mode 全局配置**：MCP 支持 `TokenMode.AUTO | USER_ACCESS_TOKEN | TENANT_ACCESS_TOKEN`。
7. **缺少 customHandler 支持**：ToolDef 接口未包含 `customHandler` 字段。
8. **CLAUDE.md 过于简陋**：缺少开发规范、命令结构、配置方式等核心信息。

---

## Step 1: 修复 `--use-uat` 和 Token 路由

**问题**：GenTools 的 schema 没有 `useUAT` 字段，但每个工具都有 `accessTokens: ['tenant'] | ['tenant', 'user'] | ['user']` 字段。

**方案**：基于 `accessTokens` 自动判断是否添加 `--use-uat` 选项。

### 修改文件

**`src/generated/loader.ts`**（核心修改）：
- 移除对 `tool.schema.useUAT` 的依赖
- 如果 `tool.accessTokens` 包含 `'user'`，自动添加 `--use-uat` 选项
- 如果 `tool.accessTokens` **只有** `['user']`（无 tenant），自动设置 `useUAT = true`

```typescript
// 替换 loader.ts:244-248
const supportsUser = tool.accessTokens?.includes('user');
const requiresUser = supportsUser && !tool.accessTokens?.includes('tenant');

if (supportsUser) {
  actionCommand.addOption(
    new Option("--use-uat", "Use user access token for this API call")
      .default(requiresUser ? true : undefined)
  );
}
```

**`src/generated/loader.ts`** `buildParams` 函数：
- 移除 `if (tool.schema.useUAT)` 检查
- 改为从命令选项中直接读取 `useUat`

```typescript
// 替换 loader.ts:183-188
const useUat = command.opts().useUat;
if (useUat !== undefined) {
  payload.useUAT = useUat;
}
```

**`src/tools/index.ts`** — 同步更新 `ToolDef` 接口：
- 确认 `accessTokens` 已存在（已有）

### 验证
```bash
feishu-cli im chat list --help  # 应显示 --use-uat 选项
feishu-cli search v2 message create --help  # 应显示 --use-uat 默认 true（accessTokens: ['user']）
```

---

## Step 2: 添加 Token Mode 全局配置

参考 MCP 的 `TokenMode` 枚举，增加全局 token-mode 支持。

### 修改文件

**`src/core/config.ts`**：
- 在 `FileConfig` / `ResolvedConfig` 中增加 `token_mode` / `tokenMode` 字段
- 支持值：`auto`（默认）、`user`、`tenant`
- 支持环境变量 `FEISHU_TOKEN_MODE`

**`src/cli.ts`**：
- 添加全局 flag `--token-mode <mode>`，choices: auto/user/tenant

**`src/generated/loader.ts`**：
- Action handler 中读取 `config.tokenMode`
- 实现 `getShouldUseUAT(tokenMode, useUat)` 逻辑（复用 MCP 的逻辑）
- 当 `tokenMode === 'user'` 时，所有命令自动使用 user token
- 当 `tokenMode === 'tenant'` 时，忽略 `--use-uat`

**`src/core/executor.ts`**：
- `executeTool` 使用传入的 `useUAT` 结果（已由 loader 计算好）

### 验证
```bash
feishu-cli --token-mode user im chat list  # 强制使用 User Token
FEISHU_TOKEN_MODE=user feishu-cli im chat list  # 环境变量方式
```

---

## Step 3: 导入 Builtin Tools + customHandler 支持

MCP 有两个 builtin tools 不在 GenTools 中：
- `docx.builtin.search`：文档搜索（仅 user token）
- `docx.builtin.import`：Markdown 导入（通过 drive.media.uploadAll + importTask）

### 修改文件

**`src/tools/index.ts`**：
- 同时导入 `BuiltinTools`
- 更新 `ToolDef` 接口，增加 `customHandler?`、`supportFileUpload?`、`supportFileDownload?` 字段
- `allTools = [...GenTools, ...BuiltinTools] as ToolDef[]`

```typescript
import { GenTools } from "../../ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/gen-tools";
import { BuiltinTools } from "../../ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/builtin-tools";

export interface ToolDef {
  // ... existing fields ...
  supportFileUpload?: boolean;
  supportFileDownload?: boolean;
  customHandler?: (client: any, params: any, options?: any) => Promise<any>;
}

export const allTools = [...GenTools, ...BuiltinTools] as ToolDef[];
```

**`src/core/executor.ts`**：
- 在 `executeTool` 开头检查 `tool.customHandler`
- 如果存在 customHandler，调用它而非 SDK 方法链
- 将 customHandler 的 MCP 格式响应（`{ content: [{text}] }`）转换为 CLI 友好格式

```typescript
if (tool.customHandler) {
  const result = await tool.customHandler(client, params, { userAccessToken, tool });
  // MCP 返回 { content: [{type: 'text', text: JSON}] }，提取 text 并 JSON.parse
  if (result?.content?.[0]?.text) {
    return JSON.parse(result.content[0].text);
  }
  return result;
}
```

### 验证
```bash
feishu-cli docx builtin import --help  # 应存在
feishu-cli docx builtin search --search-key "test" --use-uat  # 应调用搜索
```

---

## Step 4: 升级 `doc import` 为官方导入方式

当前 `doc-import.ts` 用 `markdownToSimpleBlocks()`（仅纯文本），应改为官方的 `drive.media.uploadAll` + `drive.importTask` 方式，支持完整 Markdown 格式转换。

### 修改文件

**`src/commands/custom/doc-import.ts`**：
- 重写为使用 `client.drive.media.uploadAll()` 上传 Markdown 内容
- 然后 `client.drive.importTask.create()` 创建导入任务
- 轮询 `client.drive.importTask.get()` 等待完成
- 参考 `ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/builtin-tools/docx/builtin.ts:98-206`

```typescript
// 核心流程（参考 builtin.ts）
// 1. 将 Markdown 内容转为 ReadStream
const file = Readable.from(markdownContent) as ReadStream;
// 2. 上传到 drive.media.uploadAll
const uploadResult = await client.drive.media.uploadAll({
  data: {
    file_name: 'docx.md',
    parent_type: 'ccm_import_open',
    parent_node: '/',
    size: Buffer.byteLength(markdownContent),
    file,
    extra: JSON.stringify({ obj_type: 'docx', file_extension: 'md' }),
  }
}, ...(useUat ? [lark.withUserAccessToken(userAccessToken)] : []));
// 3. 创建导入任务
const importResult = await client.drive.importTask.create({
  data: {
    file_extension: 'md', file_name: title,
    file_token: uploadResult.file_token,
    type: 'docx',
    point: { mount_type: 1, mount_key: folderToken || '' },
  }
}, ...);
// 4. 轮询等待完成
```

- 保留旧的 `markdownToSimpleBlocks` 逻辑作为 `--legacy` fallback
- 新增 `--folder-token` 支持（已有）
- 新增 `--file-name` 选项

### 验证
```bash
feishu-cli doc import README.md --title "Test" --use-uat
# 应创建保留完整格式的飞书文档
```

---

## Step 5: 增强错误处理

### 修改文件

**`src/core/executor.ts`**：
- 捕获 API 错误，检查错误码
- 对 `99991663`（token 过期）/ `99991664`（token 无效）给出明确提示
- 对 `99991400`（频率限制）提示重试
- 提取飞书 API 的 `code` / `msg` / `log_id` 输出

```typescript
// 响应处理
const response = await func(params, ...opts);
if (response?.code && response.code !== 0) {
  const error = {
    code: response.code,
    msg: response.msg,
    log_id: response.log_id,
  };
  if ([99991663, 99991664].includes(response.code)) {
    throw new Error(`Token expired or invalid (code: ${response.code}). Run \`feishu-cli auth login\` to re-authorize.\n${JSON.stringify(error)}`);
  }
  throw new Error(`API error: ${JSON.stringify(error)}`);
}
```

**`src/generated/loader.ts`** action handler：
- 包装 try-catch，格式化错误输出到 stderr

---

## Step 6: 完善 CLAUDE.md

更新 `/Users/lixiaolin/Documents/GitHub/feishu-cli/CLAUDE.md`，包含：
- 项目概述和架构
- 技术栈和目录结构
- 命令结构说明（生成命令映射规则）
- 开发规范（隐私安全、代码风格）
- 构建和测试命令
- 配置方式和认证流程
- API 执行器工作原理
- 已知限制

---

## Step 7: 其他对齐改进

### 7.1 `doc export` 增强
- 当前基于 `rawContent` API，只返回纯文本
- 增加 `--format` 选项支持 `pdf` / `docx`（通过 `drive.exportTask`）
- 保留当前 rawContent 作为默认快速模式

### 7.2 分页自动遍历
- 添加 `--all` 全局 flag
- 当 API 返回 `has_more: true` + `page_token` 时自动翻页
- 合并所有页的 `items` 数组

### 7.3 `--from-file` 支持
- 对于 body 参数较复杂的 API，支持 `--data-file <path>` 从 JSON 文件读取
- 在 loader.ts 的 action handler 中增加

---

## 关键参考文件

| 修改文件 | 参考文件 |
|---------|---------|
| `src/generated/loader.ts` | `ref/lark-openapi-mcp-main/src/mcp-tool/mcp-tool.ts:186` (getShouldUseUAT) |
| `src/core/executor.ts` | `ref/lark-openapi-mcp-main/src/mcp-tool/utils/handler.ts` (sdkFuncCall) |
| `src/tools/index.ts` | `ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/builtin-tools/index.ts` (BuiltinTools) |
| `src/commands/custom/doc-import.ts` | `ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/builtin-tools/docx/builtin.ts:84-206` |
| `src/core/config.ts` | `ref/lark-openapi-mcp-main/src/mcp-tool/types/index.ts` (TokenMode) |
| `CLAUDE.md` | `ref/feishu-cli-main/CLAUDE.md` (结构参考) |

## 验证方案

### 全流程验证
```bash
# 1. 构建
npx tsup

# 2. useUAT 修复验证
node bin/feishu-cli.js im chat list --help          # 应有 --use-uat
node bin/feishu-cli.js im chat list --use-uat       # 应使用 user token

# 3. Token Mode 验证
node bin/feishu-cli.js --token-mode user im chat list

# 4. Builtin tools 验证
node bin/feishu-cli.js docx builtin --help           # 应有 search 和 import

# 5. doc import 升级验证
echo "# Hello\n\nWorld" > /tmp/test.md
node bin/feishu-cli.js doc import /tmp/test.md --title "Test" --use-uat
# 应创建保留标题格式的文档

# 6. 错误处理验证
node bin/feishu-cli.js im chat list --use-uat --user-token "invalid_token"
# 应显示友好错误信息
```

## 实现优先级

1. **Step 1**（修复 useUAT）— 最关键，影响所有 1332 个生成命令
2. **Step 3**（Builtin tools）— 补全 MCP 的完整 API 覆盖
3. **Step 4**（doc import 升级）— 核心用户场景
4. **Step 5**（错误处理）— 用户体验
5. **Step 2**（Token Mode）— 便利性提升
6. **Step 6**（CLAUDE.md）— 项目规范
7. **Step 7**（其他改进）— 按需
