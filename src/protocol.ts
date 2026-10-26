export const MODES = [
  "bounded",
  "depth1",
  "depth2",
  "concurrency",
  "budget",
  "opus",
  "preset",
  "workflow",
  "serial",
] as const;
export type Mode = (typeof MODES)[number];
export interface RunConfig {
  mode: Mode;
}
export interface RunResult {
  index: number;
  label: string;
  sessionId: string;
  status: string;
  text: string;
  costUsd: number;
  modelUsage: unknown;
}
export interface Observation {
  sequence: number;
  atMs: number;
  kind: string;
  detail: any;
}
export interface Catalog {
  delegations: { id: string; title: string }[];
  messages: { parentToolUseId: string; messages: unknown[] }[];
}
export interface Evidence {
  mode: Mode;
  results: RunResult[];
  delegations: any[];
  childTools: any[];
  reports: any[];
  lifecycle: any[];
  models: string[];
  catalog: Catalog;
  definitions: unknown;
  scaling: unknown;
  fixtureUnchanged: boolean;
  fixture: unknown;
  observations: Observation[];
  exceptions: string[];
}
export type LabEvent =
  | { type: "options"; config: RunConfig; options: unknown }
  | { type: "observation"; record: Observation }
  | { type: "result"; record: RunResult }
  | { type: "catalog"; catalog: Catalog }
  | {
      type: "choose";
      id: string;
      preferred: string;
      sessions: Catalog["delegations"];
    }
  | { type: "answer"; text: string }
  | ({ type: "evidence" } & Evidence)
  | { type: "error" | "notice"; text: string };
