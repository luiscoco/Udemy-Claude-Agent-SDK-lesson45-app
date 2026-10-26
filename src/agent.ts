import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorkspace } from "./workspace.js";
import { definitions } from "./agents.js";
import { allowedTool } from "./policy.js";
import { limitsFor, capEnvironment, workflowScript } from "./scaling.js";
import { MODES, validateConfig } from "./modes.js";
import type {
  Mode,
  RunConfig,
  RunResult,
  Observation,
  Catalog,
  LabEvent,
  Evidence,
} from "./protocol.js";
export { MODES, validateConfig };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "bounded" };
const three =
  "Use Agent exactly three times, once per service: services/catalog.txt, services/orders.txt, services/billing.txt. Use auditor and wait for all completed reports. Do not read the files yourself. Summarize actual findings under 100 words.";
export const PROMPTS: Record<Mode, string> = {
  bounded: three,
  depth1:
    "Use coordinator once to audit services/orders.txt. Ask it to delegate to auditor if Agent is available; otherwise audit the file itself and report Agent is unavailable. Wait for completion. Do not read files yourself.",
  depth2:
    "Use coordinator once to delegate services/orders.txt to auditor. Wait for the nested report. Do not inspect the file yourself.",
  concurrency:
    "In a single assistant turn call Agent three times for auditor, one per service (services/catalog.txt, services/orders.txt, services/billing.txt), ALL with run_in_background=true. Do not wait between launches. If the runtime refuses any concurrent spawn, report its actual error; do not retry. Wait for the admitted child report.",
  budget: three,
  opus: three,
  preset: three,
  workflow:
    "Use Workflow exactly once to audit the three service files using a script. The host supplies the reviewed classroom script through the hook. Wait for the workflow completion and report all findings; do not use Agent, read files yourself or run other tools.",
  serial:
    "Use Workflow exactly once to run the serial three-service audit. The host supplies the reviewed classroom script through the hook. Wait for its completed findings; do not run other tools.",
};
export function redact(text: string) {
  for (const key of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(key).join("[REDACTED]");
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]");
}
export async function runAgent(
  value: RunConfig,
  emit: (e: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(value),
    limits = limitsFor(c.mode),
    w = await prepareWorkspace(),
    before = await w.snapshot(),
    started = Date.now();
  const results: RunResult[] = [],
    delegations: any[] = [],
    childTools: any[] = [],
    reports: any[] = [],
    lifecycle: any[] = [],
    observations: Observation[] = [],
    exceptions: string[] = [],
    models = new Set<string>();
  let workflowCalls = 0;
  const observe = (kind: string, detail: any) => {
    const record = {
      sequence: observations.length + 1,
      atMs: Date.now() - started,
      kind,
      detail,
    };
    observations.push(record);
    emit({ type: "observation", record });
  };
  const isWorkflow = c.mode === "workflow" || c.mode === "serial";
  const model =
    c.mode === "opus" || c.mode === "preset" ? "claude-opus-5-5" : MODEL;
  const tools = isWorkflow ? ["Workflow", "Read"] : ["Agent", "Read"];
  const options: Options = {
    cwd: w.cwd,
    model,
    agents: definitions(),
    tools,
    allowedTools: tools,
    permissionMode: "dontAsk",
    settingSources: [],
    forwardSubagentText: true,
    maxTurns: 10,
    maxBudgetUsd: limits.budgetUsd,
    effort: "low",
    thinking: { type: "disabled" },
    abortController: controller,
    systemPrompt:
      c.mode === "preset"
        ? {
            type: "preset",
            preset: "claude_code",
            append:
              "Classroom audit. Delegate only when the user task explicitly asks. Never modify files. Reports under 100 words.",
          }
        : "Classroom audit coordinator. Delegate only the explicitly requested finite task, respect runtime limit errors, never modify files, and report actual findings under 100 words.",
    env: {
      ...process.env,
      HOME: w.home,
      USERPROFILE: w.home,
      CLAUDE_CONFIG_DIR: w.sdkHome,
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ...capEnvironment(c.mode),
    },
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (i) => {
              if (i.hook_event_name !== "PreToolUse") return {};
              observe("tool-policy", {
                name: i.tool_name,
                input: i.tool_input,
                agentId: i.agent_id ?? null,
              });
              if (
                i.tool_name === "Workflow" &&
                isWorkflow &&
                workflowCalls++ === 0
              ) {
                const script = workflowScript(c.mode);
                observe("workflow-script", { script });
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "allow",
                    updatedInput: { script },
                  },
                };
              }
              if (
                allowedTool(
                  w.cwd,
                  i.tool_name,
                  i.tool_input,
                  Object.keys(definitions()),
                )
              )
                return {};
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "deny",
                  permissionDecisionReason:
                    "Only declared classroom agents, one reviewed Workflow script and fixed service reads are permitted.",
                },
              };
            },
          ],
        },
      ],
      SubagentStart: [
        {
          hooks: [
            async (i) => {
              if (i.hook_event_name === "SubagentStart") {
                const e = {
                  kind: "start",
                  atMs: Date.now() - started,
                  agentId: i.agent_id,
                  agentType: i.agent_type,
                };
                lifecycle.push(e);
                observe("subagent-start", e);
              }
              return {};
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            async (i) => {
              if (i.hook_event_name === "SubagentStop") {
                const e = {
                  kind: "stop",
                  atMs: Date.now() - started,
                  agentId: i.agent_id,
                  agentType: i.agent_type,
                  report: i.last_assistant_message ?? null,
                };
                lifecycle.push(e);
                reports.push({ ...e, kind: "stop-report" });
                observe("subagent-stop", e);
              }
              return {};
            },
          ],
        },
      ],
    },
  };
  emit({
    type: "options",
    config: c,
    options: {
      model,
      limits,
      environment: capEnvironment(c.mode),
      definitions: definitions(),
      tools,
      systemPrompt: options.systemPrompt,
      workflowScript: isWorkflow ? workflowScript(c.mode) : null,
      scope:
        "Three disposable classroom files; no edits, shell commands or remote services.",
    },
  });
  observe("query-options", {
    model,
    limits,
    env: capEnvironment(c.mode),
    maxBudgetUsd: options.maxBudgetUsd,
    tools: options.tools,
    systemPrompt: options.systemPrompt,
  });
  try {
    try {
      for await (const message of query({ prompt: PROMPTS[c.mode], options })) {
        if (message.type === "assistant") {
          const parentId = message.parent_tool_use_id;
          models.add(message.message.model);
          for (const b of message.message.content) {
            if (b.type === "tool_use") {
              const r = {
                id: b.id,
                name: b.name,
                input: b.input,
                parentId,
                agentId: message.agent_id ?? null,
              };
              if (b.name === "Agent" || b.name === "Task") {
                delegations.push(r);
                observe("delegation", r);
              } else if (b.name === "Workflow") observe("workflow-launch", r);
              else if (parentId) {
                childTools.push(r);
                observe("child-tool", r);
              } else observe("parent-tool", r);
            }
            if (b.type === "text") {
              if (parentId)
                observe("child-text", {
                  parentId,
                  agentId: message.agent_id ?? null,
                  text: b.text,
                });
              else emit({ type: "answer", text: redact(b.text) });
            }
          }
        }
        if (
          message.type === "user" &&
          typeof message.message.content !== "string"
        )
          for (const b of message.message.content)
            if (b.type === "tool_result") {
              const r = {
                toolUseId: b.tool_use_id,
                parentId: message.parent_tool_use_id,
                content: b.content,
                isError: b.is_error,
              };
              reports.push(r);
              observe("tool-return", r);
            }
        if (
          message.type === "system" &&
          ["task_started", "task_notification", "task_progress"].includes(
            message.subtype,
          )
        )
          observe(message.subtype, message);
        if (message.type === "result") {
          const r = {
            index: results.length + 1,
            label: c.mode + " · native result",
            sessionId: message.session_id,
            status: message.subtype,
            text:
              message.subtype === "success"
                ? message.result
                : message.errors.join("\n"),
            costUsd: message.total_cost_usd,
            modelUsage: message.modelUsage,
          };
          results.push(r);
          emit({ type: "result", record: r });
        }
      }
    } catch (error) {
      const text = redact(
        error instanceof Error ? error.message : String(error),
      );
      exceptions.push(text);
      observe("exception", text);
    }
    const catalog: Catalog = {
      delegations: delegations.map((d) => ({
        id: d.id,
        title: d.input.subagent_type || d.name,
      })),
      messages: delegations.map((d) => ({
        parentToolUseId: d.id,
        messages: observations.filter(
          (o) => o.detail?.parentId === d.id || o.detail?.toolUseId === d.id,
        ),
      })),
    };
    emit({ type: "catalog", catalog });
    const after = await w.snapshot();
    const active = new Set<string>();
    let peakActive = 0;
    for (const event of lifecycle) {
      if (event.kind === "start") active.add(event.agentId);
      else active.delete(event.agentId);
      peakActive = Math.max(peakActive, active.size);
    }
    const evidence: Evidence = {
      mode: c.mode,
      results,
      delegations,
      childTools,
      reports,
      lifecycle,
      models: [...models],
      catalog,
      definitions: definitions(),
      fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
      scaling: {
        limits,
        environment: capEnvironment(c.mode),
        observedPeakChildren: peakActive,
        nativeRefusals: reports.filter(r => r.isError),
        hookReads: observations
          .filter((o) => o.kind === "tool-policy" && o.detail.name === "Read")
          .map((o) => o.detail),
        workflowLaunches: observations.filter(
          (o) => o.kind === "workflow-launch",
        ).length,
        nativeTaskEvents: observations
          .filter((o) => o.kind.startsWith("task_"))
          .map((o) => o.detail),
        expectedBudgetStop:
          c.mode === "budget" &&
          results.some((r) => r.status === "error_max_budget_usd"),
      },
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    await w.cleanup();
  }
}
