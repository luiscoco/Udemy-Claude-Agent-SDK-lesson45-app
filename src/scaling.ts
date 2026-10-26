import { readFileSync } from "node:fs";
import type { Mode } from "./protocol.js";
export function limitsFor(mode: Mode) {
  return {
    depth: mode === "depth2" ? 2 : 1,
    concurrency: mode === "concurrency" ? 1 : 3,
    budgetUsd: mode === "budget" ? 0.00001 : 0.8,
    workflowConcurrency: mode === "serial" ? 1 : 2,
  };
}
export function capEnvironment(mode: Mode) {
  const limits = limitsFor(mode);
  return {
    CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(limits.depth),
    CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(limits.concurrency),
    CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS: String(
      limits.workflowConcurrency,
    ),
  };
}
export const FILES = [
  "services/catalog.txt",
  "services/orders.txt",
  "services/billing.txt",
];
export function workflowScript(mode: Mode) {
  const name = mode === "serial" ? "audit-serial.js" : "audit-parallel.js";
  return readFileSync(new URL("../workflows/" + name, import.meta.url), "utf8");
}
