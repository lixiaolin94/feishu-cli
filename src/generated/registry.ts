import { allTools, ToolDef } from "../tools";

export function getAllTools(): ToolDef[] {
  return allTools;
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

export function getProjectSummaries(): Array<{ project: string; count: number }> {
  const counts = new Map<string, number>();
  for (const tool of allTools) {
    counts.set(tool.project, (counts.get(tool.project) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([project, count]) => ({ project, count }))
    .sort((left, right) => left.project.localeCompare(right.project));
}
