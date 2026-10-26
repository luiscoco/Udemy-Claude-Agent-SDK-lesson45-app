import { resolve } from "node:path";
import { FILES } from "./scaling.js";
export function allowedTool(
  cwd: string,
  name: string,
  value: unknown,
  names: string[],
) {
  if (!value || typeof value !== "object") return false;
  const i = value as Record<string, unknown>;
  if (name === "Agent" || name === "Task")
    return (
      typeof i.subagent_type === "string" &&
      names.includes(i.subagent_type) &&
      typeof i.prompt === "string"
    );
  if (name === "Read")
    return (
      typeof i.file_path === "string" &&
      [...FILES, "CLAUDE.md"].some(
        (file) => resolve(cwd, i.file_path as string) === resolve(cwd, file),
      )
    );
  return false;
}
