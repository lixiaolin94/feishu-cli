import { allTools, ToolDef } from "../tools";
import { getShouldUseUAT, TokenMode } from "../core/config";
import { toKebab } from "../core/utils";

export const RESERVED_TOP_LEVEL_COMMANDS = new Set(["auth", "config", "msg", "doc", "cal", "task", "table"]);

type AccessTokenKind = "tenant" | "user";

function getAccessTokens(tool: ToolDef): Set<AccessTokenKind> {
  return new Set((tool.accessTokens ?? []).filter((token): token is AccessTokenKind => token === "tenant" || token === "user"));
}

export function supportsUserToken(tool: ToolDef): boolean {
  return getAccessTokens(tool).has("user");
}

export function supportsTenantToken(tool: ToolDef): boolean {
  const accessTokens = getAccessTokens(tool);
  return accessTokens.size === 0 || accessTokens.has("tenant");
}

export function requiresUserToken(tool: ToolDef): boolean {
  return supportsUserToken(tool) && !supportsTenantToken(tool);
}

export function resolveToolUseUAT(tool: ToolDef, tokenMode: TokenMode, requestedUseUAT?: boolean): boolean | undefined {
  if (requiresUserToken(tool)) {
    if (tokenMode === "tenant") {
      throw new Error(
        `Tool ${tool.name} only supports user access token, but token mode is set to tenant. Use \`--token-mode user\` or remove the tenant override.`,
      );
    }
    return true;
  }

  const shouldUseUAT = getShouldUseUAT(tokenMode, requestedUseUAT);
  if (shouldUseUAT && !supportsUserToken(tool)) {
    throw new Error(`Tool ${tool.name} does not support user access token. Use tenant mode or remove --use-uat.`);
  }
  if (shouldUseUAT === false && !supportsTenantToken(tool)) {
    throw new Error(`Tool ${tool.name} requires user access token. Re-run with --use-uat or --token-mode user.`);
  }
  return shouldUseUAT;
}

export function getAllTools(): ToolDef[] {
  return allTools;
}

export function parseToolName(toolName: string) {
  const segments = toolName.split(".");
  if (segments.length < 3) {
    throw new Error(`Unsupported tool name: ${toolName}`);
  }

  const project = segments[0];
  const action = segments.at(-1) as string;
  const middleSegments = segments.slice(1, -1);
  return {
    project,
    middleSegments,
    resourceKey: middleSegments.length > 1 ? middleSegments.slice(1).join("/") : middleSegments[0],
    action,
  };
}

export function findToolByName(name: string): ToolDef | undefined {
  return allTools.find((tool) => tool.name === name);
}

export function getToolsByProject(project: string): ToolDef[] {
  return allTools.filter((tool) => tool.project === project);
}

export function searchTools(keyword: string): ToolDef[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return allTools.filter((tool) => {
    const haystacks = [tool.name, tool.project, tool.description, tool.path, tool.sdkName]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    return haystacks.some((value) => value.includes(normalized));
  });
}

export function getCollisionKeys(): Set<string> {
  const seen = new Map<string, number>();
  for (const tool of allTools) {
    const parts = parseToolName(tool.name);
    const key = `${parts.project}:${parts.resourceKey}:${parts.action}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function getCliCommand(toolName: string): string {
  const parts = parseToolName(toolName);
  const collisions = getCollisionKeys();
  const usesReservedNamespace = RESERVED_TOP_LEVEL_COMMANDS.has(parts.project);
  const projectBaseName = usesReservedNamespace ? `${parts.project}-api` : parts.project;
  const collisionKey = `${parts.project}:${parts.resourceKey}:${parts.action}`;
  const resourceSegments =
    parts.middleSegments.length === 1
      ? parts.middleSegments
      : collisions.has(collisionKey)
        ? parts.middleSegments
        : parts.middleSegments.slice(1);

  return `feishu-cli ${[projectBaseName, ...resourceSegments, parts.action].map((segment) => toKebab(segment)).join(" ")}`;
}

export function getProjectSummaries(): Array<{ project: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tool of allTools) {
    counts.set(tool.project, (counts.get(tool.project) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([project, count]) => ({ project, count }))
    .sort((left, right) => left.project.localeCompare(right.project));
}
