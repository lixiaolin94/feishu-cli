# Feishu CLI 开发计划

## Context

开发一个尽可能与飞书官方 API 对齐的 CLI 工具（`feishu-cli`），支持飞书（中国版）和 Lark（国际版）。

**关键决策**：使用 TypeScript/Node.js 开发，可直接 import MCP 项目的 1332 个 zod 工具定义，无需代码生成器。

**参考项目**：
- `ref/feishu-cli-main`：Go CLI，架构和用户体验参考
- `ref/openclaw-lark-main`：官方插件，API 封装模式参考
- `ref/lark-openapi-mcp-main`：官方 MCP，**核心数据源**——61 个命名空间的 zod 工具定义直接复用

## Step 1: 创建 CLAUDE.md + 项目初始化

### 1.1 创建 `/Users/lixiaolin/Documents/GitHub/feishu-cli/CLAUDE.md`

### 1.2 项目初始化

```bash
npm init
# 安装核心依赖
npm install commander @larksuiteoapi/node-sdk zod
npm install -D typescript @types/node tsup
```

### 1.3 目录结构

```
feishu-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts                    # 打包配置
├── CLAUDE.md
├── bin/
│   └── feishu-cli.js                 # CLI 入口 (#!/usr/bin/env node)
│
├── src/
│   ├── cli.ts                        # Commander 根命令 + 全局 flags
│   ├── index.ts                      # 程序入口
│   │
│   ├── commands/                     # 手工命令
│   │   ├── auth/
│   │   │   ├── login.ts              # OAuth 登录
│   │   │   ├── status.ts             # Token 状态
│   │   │   └── logout.ts             # 退出
│   │   ├── config/
│   │   │   ├── init.ts               # 配置初始化
│   │   │   └── show.ts               # 显示配置
│   │   └── custom/                   # 高级手工命令
│   │       ├── doc-import.ts         # Markdown 导入
│   │       ├── doc-export.ts         # Markdown 导出
│   │       └── msg-send.ts           # 便捷消息发送
│   │
│   ├── generated/                    # 动态命令注册
│   │   ├── loader.ts                 # 从 zod 定义加载工具 → 注册 Commander 命令
│   │   └── registry.ts              # 工具定义索引（import 所有 zod 文件）
│   │
│   ├── core/
│   │   ├── client.ts                 # Lark SDK 客户端管理
│   │   ├── config.ts                 # 配置加载（YAML + env）
│   │   ├── auth/
│   │   │   ├── oauth.ts              # OAuth 2.0 流程
│   │   │   ├── token-store.ts        # Token 持久化
│   │   │   └── resolve.ts            # Token 优先级链
│   │   ├── executor.ts               # 通用 API 执行器（复用 MCP handler.ts 模式）
│   │   └── output.ts                 # 输出格式化（JSON/Table/YAML）
│   │
│   └── tools/                        # 直接复用/引用 MCP 的 zod 定义
│       └── index.ts                  # re-export MCP 工具定义
│
└── ref/                              # 参考项目（.gitignore）
```

## Step 2: 核心基础设施

### 2.1 配置系统 (`src/core/config.ts`)

```yaml
# ~/.feishu-cli/config.yaml
app_id: "cli_xxx"
app_secret: "xxx"
base_url: "https://open.feishu.cn"    # 国际版: https://open.larksuite.com
debug: false
output:
  format: json     # json | table | yaml
profiles:
  staging:
    app_id: "cli_staging_xxx"
    app_secret: "xxx"
```

- 优先级：CLI flag > 环境变量 (`FEISHU_*`) > 配置文件 > 默认值
- 多 profile 支持：`--profile staging`

### 2.2 SDK 客户端 (`src/core/client.ts`)

- 使用 `@larksuiteoapi/node-sdk` 创建 `lark.Client`
- 懒初始化，配置变更重建
- 支持 App Token 和 User Token

### 2.3 认证系统 (`src/core/auth/`)

参考 `ref/feishu-cli-main/internal/auth/`：
- OAuth 2.0 Authorization Code Flow
- Token 持久化 (`~/.feishu-cli/token.json`)
- Token 优先级链：`--user-token` > `FEISHU_USER_ACCESS_TOKEN` > token.json (auto-refresh) > config.yaml > App Token
- 三种模式：本地浏览器回调 / 手动粘贴 / 非交互 (--print-url + callback)

### 2.4 通用 API 执行器 (`src/core/executor.ts`)

**直接复用 MCP 项目的 `handler.ts` 模式**：
- 从 zod 工具定义获取 `sdkName`（如 `im.v1.message.create`）
- 通过 SDK 方法链动态调用：`client[chain[0]][chain[1]]...`
- fallback：SDK 方法不存在时用 `client.request()` raw HTTP 请求

```typescript
// 核心逻辑（参考 ref/lark-openapi-mcp-main/src/mcp-tool/utils/handler.ts）
async function executeAPI(client: lark.Client, tool: ToolDef, params: Record<string, any>, userToken?: string) {
  const chain = tool.sdkName.split('.');
  let func: any = client;
  for (const key of chain) {
    func = func[key];
    if (!func) {
      // fallback to raw HTTP
      return client.request({ method: tool.httpMethod, url: tool.path, ...params });
    }
  }
  if (userToken) {
    return func(params, lark.withUserAccessToken(userToken));
  }
  return func(params);
}
```

### 2.5 输出格式化 (`src/core/output.ts`)

- JSON（默认，缩进美化）
- Table（tablewriter/cli-table3）
- YAML
- `--compact`（紧凑 JSON）
- `--no-color`

## Step 3: 动态命令注册（核心创新）

这是 TypeScript 方案的最大优势——**无需代码生成**。

### 3.1 工具定义加载 (`src/tools/index.ts`)

直接 import MCP 项目的 zod 文件（或将其复制到项目中）：

```typescript
// 方案 A：直接引用（需要 MCP 项目在 ref/ 中）
import * as imV1 from '../ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/gen-tools/zod/im_v1';
// ...61 个命名空间

// 方案 B（推荐）：将 zod 文件复制到 src/tools/zod/ 目录
// 可通过脚本定期同步更新
```

### 3.2 命令动态注册 (`src/generated/loader.ts`)

将每个 zod 工具定义转换为 Commander 命令：

```typescript
function registerToolAsCommand(parent: Command, tool: ToolDef) {
  // tool.name: "im.v1.message.create"
  // → CLI: feishu-cli im message create [flags]

  const [project, version, resource, action] = parseName(tool.name);

  // 确保父命令组存在
  const projectCmd = getOrCreateSubcommand(parent, project, `${project} API`);
  const resourceCmd = getOrCreateSubcommand(projectCmd, toKebab(resource), `${resource} 操作`);

  // 创建 action 命令
  const actionCmd = resourceCmd.command(action).description(tool.description);

  // 从 zod schema 提取参数 → 注册为 CLI flags
  if (tool.schema.path) registerFlags(actionCmd, tool.schema.path, 'path');
  if (tool.schema.params) registerFlags(actionCmd, tool.schema.params, 'query');
  if (tool.schema.data) registerFlags(actionCmd, tool.schema.data, 'body');

  // 执行逻辑
  actionCmd.action(async (opts) => {
    const client = getClient();
    const params = buildParams(opts, tool);
    const result = await executeAPI(client, tool, params);
    output(result);
  });
}
```

### 3.3 命令命名映射

```
MCP tool name: im.v1.message.create
→ CLI:         feishu-cli im message create [flags]

MCP tool name: im.v1.chatMembers.create
→ CLI:         feishu-cli im chat-members create [flags]

MCP tool name: bitable.v1.appTableRecord.search
→ CLI:         feishu-cli bitable app-table-record search [flags]

规则:
  {project}.{version}.{resource}.{action}
  → feishu-cli {project} {kebab(resource)} {action}
  version 不暴露给用户
```

### 3.4 Zod Schema → CLI Flags 映射

```typescript
function registerFlags(cmd: Command, zodSchema: z.ZodObject, paramType: 'path' | 'query' | 'body') {
  const shape = zodSchema.shape;
  for (const [key, schema] of Object.entries(shape)) {
    const flag = toKebab(key);           // receive_id → receive-id
    const desc = schema.description || '';
    const required = !schema.isOptional();

    if (schema instanceof z.ZodString) cmd.option(`--${flag} <value>`, desc);
    else if (schema instanceof z.ZodNumber) cmd.option(`--${flag} <number>`, desc);
    else if (schema instanceof z.ZodBoolean) cmd.option(`--${flag}`, desc);
    else if (schema instanceof z.ZodArray) cmd.option(`--${flag} <values...>`, desc);
    else cmd.option(`--${flag} <json>`, `${desc} (JSON 格式)`);

    if (required) cmd.requiredOption(`--${flag} <value>`, desc);
  }
}
```

## Step 4: 基础命令 + 验证

### 4.1 auth 命令组

- `feishu-cli auth login [--manual] [--print-url] [--port 9768] [--scopes "..."]`
- `feishu-cli auth status [-o json]`
- `feishu-cli auth logout`
- `feishu-cli auth callback <url> --state <state>`（非交互模式）

### 4.2 config 命令组

- `feishu-cli config init`（交互式创建配置文件）
- `feishu-cli config show`（显示当前配置）
- `feishu-cli config set <key> <value>`

### 4.3 全局 flags

```
--config <path>       配置文件路径（默认 ~/.feishu-cli/config.yaml）
--profile <name>      使用指定配置 profile
--output <format>     输出格式：json | table | yaml（默认 json）
--user-token <token>  指定 User Access Token
--base-url <url>      API 基础 URL
--debug               调试模式
--compact             紧凑输出
--no-color            禁用颜色
```

### 4.4 验证

```bash
feishu-cli config init
feishu-cli auth login
feishu-cli im message create --receive-id-type email --receive-id user@example.com --msg-type text --content '{"text":"hello"}'
feishu-cli im chat list --page-size 5
feishu-cli docx document create --title "Test"
feishu-cli drive file list
```

## Step 5: 手工优化命令

为高频场景提供更好的用户体验：

- `feishu-cli doc import <file.md> --title "标题"`（Markdown 导入，参考 feishu-cli-main 的三阶段管道）
- `feishu-cli doc export <doc_id> -o output.md`（Markdown 导出）
- `feishu-cli msg send --to user@example.com --text "Hi"`（便捷发消息）
- `feishu-cli wiki export <node_token> -o doc.md`

## Step 6: 完善和发布

- Shell 补全（bash/zsh/fish）
- `npx feishu-cli` 直接使用（无需安装）
- npm publish
- 可选：用 `pkg` 或 `bun compile` 打包为单二进制
- README.md

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 语言 | TypeScript | 直接复用 MCP zod 定义，无需代码生成 |
| 二进制名 | feishu-cli | 用户选择 |
| CLI 框架 | Commander.js | 轻量成熟，MCP 项目也在用 |
| SDK | @larksuiteoapi/node-sdk | 官方 SDK，与 MCP/OpenClaw 一致 |
| API 定义 | 复用 MCP zod 文件 | 61 命名空间 1332 API，运行时动态加载 |
| API 调用 | SDK 方法链 + raw HTTP fallback | 复用 MCP handler.ts 模式 |
| 配置 | YAML + env | 与 feishu-cli-main 兼容 |
| 版本 | 飞书 + Lark 双版本 | 通过 base_url 切换 |

## 关键参考文件

| 文件 | 用途 |
|------|------|
| `ref/lark-openapi-mcp-main/src/mcp-tool/tools/en/gen-tools/zod/*.ts` | 1332 个 API 的 zod 定义（直接 import） |
| `ref/lark-openapi-mcp-main/src/mcp-tool/utils/handler.ts` | 通用 API 执行器（SDK 方法链模式） |
| `ref/lark-openapi-mcp-main/src/mcp-tool/mcp-tool.ts` | 工具注册和过滤模式 |
| `ref/lark-openapi-mcp-main/src/mcp-tool/constants.ts` | Preset 定义（工具分组） |
| `ref/feishu-cli-main/internal/auth/` | OAuth 认证流程参考 |
| `ref/feishu-cli-main/cmd/root.go` | CLI 结构和全局 flags 参考 |
| `ref/feishu-cli-main/internal/converter/` | Markdown 双向转换参考（Phase 5） |

## 验证方案

### Phase 1（Step 2-4）验证

```bash
# 基础设施
feishu-cli config init && feishu-cli config show
feishu-cli auth login && feishu-cli auth status

# 动态命令 - 检查命令树
feishu-cli --help         # 应显示 ~20+ 顶级命令（im, docx, drive, bitable...）
feishu-cli im --help      # 应显示 message, chat, pin 等子命令
feishu-cli im message --help  # 应显示 create, list, get, delete 等

# 实际 API 调用
feishu-cli im message create --receive-id-type email --receive-id user@example.com --msg-type text --content '{"text":"hello"}'
feishu-cli im chat list --page-size 5
feishu-cli docx document create --title "Test"
```

### Phase 2（Step 5）验证

```bash
feishu-cli doc import README.md --title "Test Doc"
feishu-cli doc export <doc_id> -o output.md
feishu-cli msg send --to user@example.com --text "Hello"
```

## 实现优先级

1. **Step 1-2**：项目骨架 + 核心基础设施（config, auth, client, executor, output）
2. **Step 3**：动态命令注册（这是核心，完成后即覆盖 1332 个 API）
3. **Step 4**：基础命令 + 端到端验证
4. **Step 5**：手工优化命令（按需）
5. **Step 6**：发布
