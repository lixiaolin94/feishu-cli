# feishu-cli

Command-line access to Feishu / Lark Open Platform APIs, built as a pure Node.js CLI on top of the official generated tool definitions.

## Install

```bash
npm install -g feishu-cli
```

Or run locally from the repo:

```bash
npm install
npm run build
node bin/feishu-cli.js --help
```

## Quick Start

1. Initialize config:

```bash
feishu-cli config init
```

2. Fill in `app_id` / `app_secret` in `~/.feishu-cli/config.yaml`, or use environment variables:

```bash
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
```

3. Authorize a user token when you need user-only APIs:

```bash
feishu-cli auth login
feishu-cli auth status
```

4. Make your first call:

```bash
feishu-cli api search chat
feishu-cli api info im.v1.chat.list
feishu-cli im chat list --page-size 5
feishu-cli --token-mode user search message create --query test
feishu-cli drive file list --page-size 50 --all
```

## Command Overview

Find commands before you memorize them:

- `feishu-cli api list`
  List every namespace and how many APIs it contains.
- `feishu-cli api list im`
  List every API inside a namespace.
- `feishu-cli api search chat`
  Search by keyword across names, descriptions, paths, and SDK methods.
- `feishu-cli api info im.v1.chat.list`
  Inspect one API, including token type, HTTP path, SDK method, and parameters.
- `feishu-cli api dump`
  Dump the full tool catalog with JSON schema, suitable for agent-side caching.

Generated API commands are created from official tool definitions:

- `im.v1.chat.list` -> `feishu-cli im chat list`
- `search.v2.message.create` -> `feishu-cli search message create`
- `docx.builtin.import` -> `feishu-cli docx builtin import`

Custom high-level commands:

- `feishu-cli auth login|status|logout|callback`
- `feishu-cli config init|show|set`
- `feishu-cli exec`
- `feishu-cli msg send`
- `feishu-cli doc import`
- `feishu-cli doc export`

## Configuration

Priority order:

1. CLI flags
2. Environment variables
3. `config.yaml` and selected profile
4. Defaults

Supported environment variables:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_USER_ACCESS_TOKEN`
- `FEISHU_BASE_URL`
- `FEISHU_TOKEN_MODE`
- `FEISHU_MAX_RETRIES`
- `FEISHU_OUTPUT_FORMAT`
- `FEISHU_DEBUG`

Useful global flags:

- `--output json|table|yaml`
- `--token-mode auto|user|tenant`
- `--max-retries <number>`
- `--debug`

Example `config.yaml`:

```yaml
app_id: cli_xxx
app_secret: xxx
token_mode: auto
max_retries: 2
output:
  format: json
profiles:
  prod:
    base_url: https://open.feishu.cn
```

## Token Routing

`feishu-cli` supports three token modes:

- `auto`
  Use tenant token by default. Commands that support user token can opt in with `--use-uat`.
- `user`
  Force user token for commands that support it.
- `tenant`
  Force tenant token for commands that support it.

Examples:

```bash
feishu-cli im chat list
feishu-cli im chat list --use-uat true
feishu-cli --token-mode user search message create --query test
feishu-cli drive file list --page-size 50 --all
feishu-cli --token-mode tenant msg send --to user@example.com --text hello
```

Use `feishu-cli auth status` to check whether your stored user token is still valid before calling user-only APIs.

## Pagination

For generated APIs that accept `page_token`, the CLI adds `--all` automatically:

```bash
feishu-cli im chat list --page-size 100 --all
```

`--all` keeps following `page_token` until `has_more` is false. To avoid accidental infinite loops, the CLI stops after 100 pages and prints a warning to stderr.

## Document Workflows

Import Markdown into Feishu Docs using the official Drive import flow:

```bash
feishu-cli doc import README.md --title "Imported README"
```

Append plain text blocks into an existing document with legacy mode:

```bash
feishu-cli doc import notes.md --document-id Rnxxxxxxxxx --legacy
```

Export raw document content:

```bash
feishu-cli doc export Rnxxxxxxxxx
```

## Programmatic API

Use the same execution engine from Node.js without shelling out:

```ts
import { FeishuClient } from "feishu-cli/sdk";

const client = new FeishuClient({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  userAccessToken: process.env.FEISHU_USER_ACCESS_TOKEN,
});

const tools = client.searchTools("chat");
const info = client.describeTool("im.v1.chat.list");
const result = await client.execute("im.v1.chat.list", {
  params: { page_size: 5 },
});

if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error?.code, result.error?.message);
}
```

`FeishuClient` exposes:

- `listTools(namespace?)`
- `searchTools(keyword)`
- `describeTool(toolName)`
- `validate(toolName, params?)`
- `execute(toolName, params?)`
- `executeAll(toolName, params?)`
- `executeBatch(requests)`

All execution methods return structured `{ ok, data, error }` results instead of throwing, which makes the SDK easier to use from agents and automation.

## Agent Integration

For non-Node agents or shell pipelines, use structured execution mode:

```bash
echo '{"tool":"im.v1.chat.list","params":{"params":{"page_size":5}}}' | feishu-cli exec --stdin
feishu-cli exec im.v1.chat.list --params '{"params":{"page_size":5}}'
echo '[{"tool":"im.v1.chat.list","params":{"params":{"page_size":1}}}]' | feishu-cli exec --stdin --batch
feishu-cli exec im.v1.chat.list --dry-run --params '{"params":{"page_size":5}}'
```

`exec` always returns structured JSON:

```json
{
  "ok": true,
  "data": {
    "code": 0
  }
}
```

Use `feishu-cli api dump` when an agent wants to cache the entire tool catalog up front instead of calling `api info` repeatedly.

## Output Formats

By default, output is JSON. You can switch per command:

```bash
feishu-cli api list --output table
feishu-cli auth status --output yaml
```

Or set it globally in config:

```yaml
output:
  format: table
```

## Troubleshooting

- Missing permission
  If the API returns a scope error, open the permission link from the error message, enable the required scope in the Feishu developer console, and retry after reauthorization if the API is user-scoped.
- User token expired
  Run `feishu-cli auth status` first. If the stored token is invalid, run `feishu-cli auth login`.
- Browser cannot be opened during login
  Run `feishu-cli auth login --manual` and paste the callback URL back into the terminal.

## Development

```bash
npm run typecheck
npm run build
npm test
```

Check the generated CLI help:

```bash
node bin/feishu-cli.js --help
node bin/feishu-cli.js docx builtin --help
```
