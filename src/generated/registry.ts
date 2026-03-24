import { allTools, ToolDef } from "../tools";

export function getAllTools(): ToolDef[] {
  return allTools;
}

export function findToolByName(name: string): ToolDef | undefined {
  return allTools.find((tool) => tool.name === name);
}
