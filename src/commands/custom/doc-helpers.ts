import fs from "node:fs/promises";
import path from "node:path";

export interface ParsedDocTarget {
  documentId: string;
  source: string;
}

export interface DocImportOptions {
  title?: string;
  folderToken?: string;
}

export interface SimpleBlock {
  block_type: number;
  text?: {
    style?: Record<string, unknown>;
    elements: Array<{
      text_run: {
        content: string;
      };
    }>;
  };
}

function textBlock(content: string, blockType = 2, style?: Record<string, unknown>): SimpleBlock {
  return {
    block_type: blockType,
    text: {
      ...(style ? { style } : {}),
      elements: [
        {
          text_run: {
            content,
          },
        },
      ],
    },
  };
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function parseCodeFenceLanguage(line: string): number | undefined {
  const language = line.slice(3).trim().toLowerCase();
  const languageMap: Record<string, number> = {
    plaintext: 1,
    text: 1,
    bash: 7,
    sh: 60,
    shell: 60,
    zsh: 60,
    javascript: 30,
    js: 30,
    json: 28,
    typescript: 63,
    ts: 63,
    go: 22,
    html: 24,
    css: 12,
    python: 49,
    py: 49,
    markdown: 39,
    md: 39,
    yaml: 67,
    yml: 67,
    sql: 56,
    rust: 53,
    java: 29,
    kotlin: 32,
    swift: 61,
    c: 10,
    cpp: 9,
    csharp: 8,
  };

  return language ? languageMap[language] ?? 1 : undefined;
}

function parseTodo(line: string): SimpleBlock | null {
  const match = /^[-*]\s+\[( |x|X)\]\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return textBlock(match[2], 17, { done: match[1].toLowerCase() === "x" });
}

export function markdownToSimpleBlocks(markdown: string): SimpleBlock[] {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.map((segment) => textBlock(segment));
}

export function chunkBlocks<T>(items: T[], size = 50): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function readMarkdownFile(filePath: string): Promise<{ absolutePath: string; content: string }> {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf8");
  return { absolutePath, content };
}

export function deriveTitle(filePath: string, explicitTitle?: string): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }
  return path.basename(filePath, path.extname(filePath));
}

export function parseDocumentId(input: string): ParsedDocTarget {
  const trimmed = input.trim();
  if (/^https?:\/\//.test(trimmed)) {
    const match = trimmed.match(/\/docx\/([A-Za-z0-9]+)/);
    if (!match) {
      throw new Error("Could not extract document_id from URL.");
    }
    return { documentId: match[1], source: trimmed };
  }
  return { documentId: trimmed, source: trimmed };
}
