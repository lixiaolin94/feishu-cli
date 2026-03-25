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
```

4. Make your first call:

```bash
feishu-cli im chat list --page-size 5
feishu-cli --token-mode user search message create --query test
```

## Command Overview

Generated API commands are created from official tool definitions:

- `im.v1.chat.list` -> `feishu-cli im chat list`
- `search.v2.message.create` -> `feishu-cli search message create`
- `docx.builtin.import` -> `feishu-cli docx builtin import`

Custom high-level commands:

- `feishu-cli auth login|status|logout|callback`
- `feishu-cli config init|show|set`
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
- `FEISHU_OUTPUT_FORMAT`
- `FEISHU_DEBUG`

Example `config.yaml`:

```yaml
app_id: cli_xxx
app_secret: xxx
token_mode: auto
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
feishu-cli --token-mode tenant msg send --to user@example.com --text hello
```

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
