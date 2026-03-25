---
name: feishu
description: |
  Interact with Feishu/Lark Open Platform APIs via feishu-cli.
  Use when the user asks to send messages on Feishu/Lark, manage chats/groups,
  create or read documents, search content, manage calendar events, approve workflows,
  upload files to drive, or perform any Feishu/Lark API operation.
  Trigger phrases: "send a Feishu message", "create a Lark doc", "list my chats",
  "search Feishu", "飞书", "发消息", "查群", "创建文档", "飞书审批",
  "Feishu API", "Lark API", "feishu-cli".
user-invokable: true
args:
  - name: task
    description: What you want to do with Feishu (e.g. "send a message", "list chats")
    required: false
---

# Feishu/Lark Agent Skill

You have access to `feishu-cli`, a CLI that wraps 1300+ Feishu/Lark Open Platform APIs. Use it to execute any Feishu API call directly from the terminal.

## Quick Reference

```bash
# Discovery
feishu-cli api list                       # List all API namespaces
feishu-cli api list im                    # List APIs in a namespace
feishu-cli api search <keyword>           # Search APIs by keyword
feishu-cli api info <tool-name>           # Full metadata + parameter schema

# Execution (structured JSON I/O, never throws)
feishu-cli exec <tool-name> --params '<json>' --output json
feishu-cli exec <tool-name> --dry-run --params '<json>'   # Validate only
echo '<json>' | feishu-cli exec --stdin --output json      # Pipe input
feishu-cli exec --batch --params '[...]' --output json     # Batch execute

# High-level commands
feishu-cli msg send --to <email> --text "Hello"
feishu-cli doc import <file> --title "Title"
feishu-cli doc export <document-id> -o output.md
feishu-cli auth status                    # Check token validity
```

## Workflow: Discover → Validate → Execute

Always follow this pattern. Do NOT guess tool names or parameter shapes.

### Step 1: Discover the Right Tool

```bash
# Start with keyword search
feishu-cli api search "chat list"

# Browse a namespace
feishu-cli api list im

# Inspect parameters before calling
feishu-cli api info im.v1.chat.list
```

Tool names follow the pattern: `<project>.<version>.<resource>.<action>`
- `im.v1.chat.list` — List chats
- `im.v1.message.create` — Send a message
- `docx.v1.document.rawContent` — Get document content
- `drive.v1.file.list` — List Drive files

### Step 2: Validate (Optional but Recommended)

```bash
feishu-cli exec im.v1.chat.list --dry-run --params '{"params":{"page_size":5}}' --output json
```

Dry-run checks tool existence, parameter validity, and token compatibility without making an API call.

### Step 3: Execute

```bash
feishu-cli exec im.v1.chat.list --params '{"params":{"page_size":20}}' --output json
```

Output is always structured JSON:
```json
{"ok": true, "data": {"items": [...], "has_more": false}}
{"ok": false, "error": {"code": "AUTH_REQUIRED", "message": "..."}}
```

### Pagination

For paginated APIs, add `--all` to automatically fetch every page:

```bash
feishu-cli exec im.v1.chat.list --params '{"params":{"page_size":100}}' --all --output json
```

## Parameter Structure

API parameters are organized into three layers. Use `feishu-cli api info <tool>` to see which layers a tool accepts.

```json
{
  "path": {},
  "params": {},
  "data": {}
}
```

| Layer    | Maps to          | Example                                      |
|----------|------------------|----------------------------------------------|
| `path`   | URL path params  | `{"chat_id": "oc_xxx"}`                      |
| `params` | Query string     | `{"page_size": 20, "page_token": "..."}`     |
| `data`   | Request body     | `{"receive_id": "ou_xxx", "content": "..."}` |

## Token Routing

feishu-cli supports two token types:

| Mode       | Flag              | When to use                              |
|------------|-------------------|------------------------------------------|
| **Tenant** | (default)         | Bot operations, app-level access         |
| **User**   | `--token-mode user` or `--use-uat` | User-scoped data (personal docs, search) |

- If a tool only supports user tokens, feishu-cli auto-switches. No action needed.
- If you get `AUTH_REQUIRED`, run `feishu-cli auth status` to check, then `feishu-cli auth login` if needed.
- For user-scoped operations (search, personal docs), explicitly add `--token-mode user`.

## Error Handling

All errors are structured. Check `error.code` to decide recovery:

| Code             | Meaning                  | Recovery                                       |
|------------------|--------------------------|-------------------------------------------------|
| `TOOL_NOT_FOUND` | Wrong tool name          | Re-search with `feishu-cli api search`          |
| `AUTH_REQUIRED`  | Token missing or expired | `feishu-cli auth login` or check credentials    |
| `INVALID_PARAMS` | Bad parameters           | Check schema with `feishu-cli api info <tool>`  |
| `API_ERROR`      | Feishu API error         | Read `message` and `apiCode` for details        |
| `RATE_LIMITED`   | Too many requests        | Wait and retry, or use `--max-retries`          |

## Common Recipes

### Get Current User

When you need to know who is logged in (e.g. to send them a message), use `authen.v1.userInfo.get`:

```bash
feishu-cli exec authen.v1.userInfo.get --token-mode user --output json
```

Returns `open_id`, `user_id`, `name`, `union_id`, etc. Use the `open_id` as the recipient for messaging APIs.

### Send a Message

```bash
# Via high-level command — by email
feishu-cli msg send --to user@example.com --text "Hello from CLI"

# Via high-level command — by open_id
feishu-cli msg send --to ou_xxx --receive-id-type open_id --text "Hello"

# Via exec (more control)
feishu-cli exec im.v1.message.create --params '{
  "params": {"receive_id_type": "open_id"},
  "data": {
    "receive_id": "ou_xxx",
    "msg_type": "text",
    "content": "{\"text\": \"Hello from CLI\"}"
  }
}' --output json
```

Note: `content` is a **JSON-encoded string** inside the data object.

**To message the current user**: first call `authen.v1.userInfo.get` to get their `open_id`, then use it as the recipient.

### List Chats

```bash
feishu-cli exec im.v1.chat.list --params '{"params":{"page_size":20}}' --all --output json
```

### Search Messages

```bash
feishu-cli exec search.v2.message.create --params '{
  "data": {"query": "keyword"}
}' --token-mode user --output json
```

### Create a Document

```bash
# Import a local file
feishu-cli doc import README.md --title "My Document"

# Create empty doc via API
feishu-cli exec docx.v1.document.create --params '{
  "data": {"title": "New Document", "folder_token": "fldcnXXX"}
}' --output json
```

### Read Document Content

```bash
# Export to markdown
feishu-cli doc export <document_id> -o output.md

# Raw content via API
feishu-cli exec docx.v1.document.rawContent --params '{
  "path": {"document_id": "Rnxxxxxxxxx"}
}' --output json
```

### List Drive Files

```bash
feishu-cli exec drive.v1.file.list --params '{
  "params": {"folder_token": "fldcnXXX", "page_size": 50}
}' --output json
```

### Get User Info

```bash
# Current logged-in user (requires user token)
feishu-cli exec authen.v1.userInfo.get --token-mode user --output json

# Look up another user by open_id
feishu-cli exec contact.v3.user.get --params '{
  "path": {"user_id": "ou_xxx"},
  "params": {"user_id_type": "open_id"}
}' --output json
```

### Batch Operations

```bash
feishu-cli exec --batch --params '[
  {"tool": "im.v1.chat.list", "params": {"params": {"page_size": 5}}},
  {"tool": "contact.v3.user.get", "params": {"path": {"user_id": "ou_xxx"}, "params": {"user_id_type": "open_id"}}}
]' --output json
```

## Prerequisites

Before first use, ensure credentials are configured:

```bash
# Check current auth state
feishu-cli auth status

# If not configured, set app credentials
feishu-cli config init              # Interactive setup
# Or set environment variables:
# FEISHU_APP_ID, FEISHU_APP_SECRET

# For user-scoped APIs, authenticate via OAuth
feishu-cli auth login
```

## Tips for Agents

1. **Always use `--output json`** for machine-readable output.
2. **Prefer `exec` over generated subcommands** — it has structured I/O and never throws.
3. **Use `--dry-run` first** when unsure about parameters.
4. **Use `--all` for list APIs** to avoid manual pagination.
5. **Check `feishu-cli api info`** before constructing params — don't guess schemas.
6. **Use `--compact`** to reduce output size when processing large results.
7. **Content fields are double-encoded** — message `content` is a JSON string inside JSON.
8. **Batch when possible** — `--batch` reduces round-trips for independent operations.
