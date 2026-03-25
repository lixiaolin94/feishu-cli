# feishu-cli

TypeScript CLI for Feishu / Lark Open Platform APIs. The project reuses the official MCP repo's generated tool definitions and exposes them as Commander commands, with a small set of custom high-frequency commands on top.

## Architecture

- `src/cli.ts`
  Registers global options, built-in top-level commands, and generated API commands.
- `src/generated/loader.ts`
  Converts tool definitions into Commander subcommands. This is the core of command generation, token routing, and config injection for generated APIs.
- `src/generated/registry.ts`
  Provides lookup helpers over the imported tool list.
- `src/tools/index.ts`
  Imports both official `GenTools` and `BuiltinTools` from `ref/lark-openapi-mcp-main`.
- `src/core/client.ts`
  Creates the Lark SDK client and suppresses SDK log noise so stdout stays script-friendly.
- `src/core/config.ts`
  Resolves config from `config.yaml`, profile overrides, environment variables, and global CLI flags.
- `src/core/executor.ts`
  Executes generated SDK methods, raw HTTP fallbacks, and builtin `customHandler` tools. Also normalizes common API errors.
- `src/commands/**`
  Custom user-facing commands such as `auth`, `config`, `msg send`, and `doc import/export`.

## Command Model

Generated commands come from official tool names:

- `im.v1.chat.list` -> `feishu-cli im chat list`
- `search.v2.message.create` -> `feishu-cli search v2 message create`
- Reserved namespaces are remapped:
  - `auth.*` -> `feishu-cli auth-api ...`
  - `config.*` -> `feishu-cli config-api ...`
  - `msg` stays custom at top level

For generated commands:

- Path / params / data schemas are turned into CLI options automatically.
- `app_id` and `app_secret` default from config or `.env` when omitted.
- If a tool supports user tokens, the loader adds `--use-uat`.
- If a tool is user-only, `--use-uat` defaults to `true`.

## Token Routing

The CLI supports three token modes:

- `auto`
  Default behavior. Generated commands use tenant token unless `--use-uat` is set.
- `user`
  Forces user token for tools that support it.
- `tenant`
  Forces tenant token for tools that support it.

Configuration priority:

1. CLI flags
2. Environment variables
3. `config.yaml` / profile
4. Defaults

Relevant settings:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_USER_ACCESS_TOKEN`
- `FEISHU_BASE_URL`
- `FEISHU_TOKEN_MODE`
- `FEISHU_OUTPUT_FORMAT`
- `FEISHU_DEBUG`

## Custom Commands

- `auth login|status|logout|callback`
  OAuth helper flow and token persistence.
- `config init|show|set`
  Manage local config and profiles.
- `msg send`
  High-level bot message send helper.
- `doc import`
  Defaults to official Drive import flow (`drive.media.uploadAll` + `drive.importTask`). Use `--legacy` for the plain-text block fallback, or when appending to an existing document with `--document-id`.
- `doc export`
  Current implementation uses `docx document rawContent`, which is useful but not yet high-fidelity Markdown export.

## Development Notes

- Prefer generated tools unless a command needs higher-level UX or multi-step orchestration.
- When debugging token problems, check `feishu-cli auth status` first and verify the scope list on the stored user token.
- Keep stdout machine-friendly. Human guidance and transient diagnostics should go to stderr or structured error messages.
- `ref/` is reference material only and is excluded from git tracking.

## Verification

Common local checks:

```bash
npm run typecheck
npm run build
node bin/feishu-cli.js --help
node bin/feishu-cli.js im chat list --help
node bin/feishu-cli.js docx builtin import --help
```
