# feishu-cli

TypeScript/Node.js CLI for Feishu and Lark Open Platform APIs.

## Goals

- Reuse the official MCP project's generated zod tool definitions.
- Provide a Commander-based CLI with dynamic command registration.
- Support both tenant token and user token flows.
- Keep stdout script-friendly and stderr for guidance/errors when possible.
