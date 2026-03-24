# TODO

本文件对照 [PLAN.md](/Users/lixiaolin/Documents/GitHub/feishu-cli/PLAN.md) 记录当前进展。

## 已完成

### Step 1: 项目初始化

- 已创建 TypeScript CLI 项目骨架
- 已创建 [CLAUDE.md](/Users/lixiaolin/Documents/GitHub/feishu-cli/CLAUDE.md)
- 已配置 `package.json`、`tsconfig.json`、`tsup.config.ts`
- 已创建 `bin/feishu-cli.js` 入口
- 已接入 `.env` / `.env.example`

### Step 2: 核心基础设施

- 已实现配置系统
  - 文件: [src/core/config.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/config.ts)
  - 支持 `--config`、`--profile`、环境变量、配置文件、默认值
- 已实现 SDK 客户端管理
  - 文件: [src/core/client.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/client.ts)
  - 支持配置变更时重建 client
- 已实现认证基础能力
  - 文件:
    - [src/core/auth/oauth.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/auth/oauth.ts)
    - [src/core/auth/token-store.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/auth/token-store.ts)
    - [src/core/auth/resolve.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/auth/resolve.ts)
  - 支持 `auth login/status/logout/callback`
  - 支持本地 token 文件 `~/.feishu-cli/token.json`
- 已实现通用 API 执行器
  - 文件: [src/core/executor.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/executor.ts)
  - 支持 SDK 方法链调用和 raw HTTP fallback
- 已实现输出格式化
  - 文件: [src/core/output.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/core/output.ts)
  - 支持 `json` / `table` / `yaml`

### Step 3: 动态命令注册

- 已复用 MCP `GenTools`
  - 文件: [src/tools/index.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/tools/index.ts)
- 已实现工具注册与命令树生成
  - 文件:
    - [src/generated/registry.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/generated/registry.ts)
    - [src/generated/loader.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/generated/loader.ts)
- 已处理：
  - 命令名冲突
  - 参数名冲突
  - `app_id` / `app_secret` 自动从全局配置注入

### Step 4: 基础命令 + 验证

- 已实现根命令和全局 flags
  - 文件: [src/cli.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/cli.ts)
- 已实现命令
  - `auth login`
  - `auth status`
  - `auth logout`
  - `auth callback`
  - `config init`
  - `config show`
  - `config set`
- 已完成真实 API 验证
  - `auth-api auth tenantAccessTokenInternal`
  - `im chat list --use-uat`
  - `msg send`
  - `drive file list --use-uat`
  - `wiki space list --use-uat`
  - `docx document create/get/rawContent --use-uat`

### Step 5: 手工优化命令

- 已实现 `msg send`
  - 文件: [src/commands/custom/msg-send.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/commands/custom/msg-send.ts)
- 已实现最小可用版 `doc import`
  - 文件: [src/commands/custom/doc-import.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/commands/custom/doc-import.ts)
  - 当前策略：Markdown 作为纯文本段落块导入 docx
- 已实现最小可用版 `doc export`
  - 文件: [src/commands/custom/doc-export.ts](/Users/lixiaolin/Documents/GitHub/feishu-cli/src/commands/custom/doc-export.ts)
  - 当前策略：基于 `docx document rawContent` 导出
- 已完成导入导出真实闭环验证
  - `doc import` 成功创建文档
  - `doc export` 成功导出到 stdout 和文件

## 未完成

### Step 5 仍待补强

- `doc import` 高保真 Markdown 导入
  - 当前未保留标题、列表、引用、表格、图片、图表的真实 block 结构
  - 原计划参考的 `document.convert` 路径仍不可用
- `doc export` 高保真 Markdown 导出
  - 当前仅基于 `rawContent`
  - 未做 block tree -> Markdown 转换
- `wiki export <node_token> -o doc.md`
- `doc export` URL/资源下载增强
  - front matter 以外的导出增强
  - 图片下载
  - 资源目录管理

### Step 6 未开始

- Shell completion
- README.md
- npm publish / `npx feishu-cli`
- 单文件二进制打包

## 当前阻塞

- 应用后台虽然已显示相关权限，但当前用户 token scope 仍不包含：
  - `docx:document.block:convert`
- 因此暂时无法把 `doc import` 升级到基于 `docx document convert` 的更高保真实现
- 判断标准：
  - `node bin/feishu-cli.js auth status` 的 `scope` 里必须出现 `docx:document.block:convert`

## 建议下一步

1. 在飞书开放平台继续核对 `docx:document.block:convert` 是否真正进入用户授权 scope。
2. 一旦 scope 生效，优先升级 `doc import` 为 `document.convert + block create`。
3. 再实现高保真 `doc export`，必要时参考 Go 版 converter 逐步移植。
4. 最后补 `wiki export`、README 和发布流程。
