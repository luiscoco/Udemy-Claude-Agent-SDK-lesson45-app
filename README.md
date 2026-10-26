# Claude Agent SDK · Lesson 45 · Scaling multi-agent workflows

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Bound the whole agent tree: Each child makes model requests and can request descendants. Use independent depth, concurrency and estimated spend limits instead of assuming a short prompt bounds the work.
- Understand depth versus concurrency: Depth 1 removes child spawning from the bottom layer. Depth 2 permits a coordinator and grandchild auditor. Concurrency caps simultaneously admitted Agent children and returns native refusals when full.
- Handle native budget results: A tiny maxBudgetUsd produces error_max_budget_usd. Retain the native result before handling the SDK exception. The spend estimate includes child requests and can be crossed by an in-flight request.
- Preserve and extend the environment: Spread process.env in TypeScript options.env to preserve PATH and private model credentials. Set explicit string-valued depth and concurrency caps for each run.
- Control Opus 5 delegation: Compare a custom orchestration instruction with the claude_code preset using an explicit delegation request. Prompts steer choices; configured runtime limits enforce the admitted work.
- Move orchestration into Workflow: Use the actual Workflow tool and a reviewed JavaScript script to audit three files. Compare pipeline fan-out with serial awaits, inspect native hooks and reports, and understand how script variables keep intermediate results out of the main conversation.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson45-app.git
cd .\Udemy-Claude-Agent-SDK-lesson45-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson45-scaling-workflows`. Open http://127.0.0.1:3145 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3145
# Windows only, if needed:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Compare depth and concurrency

Bounded requests three service reviewers. Depth1 makes the coordinator do its own read; Depth2 permits its grandchild. Concurrency requests three background launches with a cap of one and reports refused services honestly.

```powershell
npm run sample:env -- bounded
npm run sample:env -- depth1
npm run sample:env -- depth2
npm run sample:env -- concurrency
```

### Observe budget and Opus 5 behavior

Budget intentionally stops at a tiny SDK threshold. Preserve the native error result and observe the expected exception. Opus and Preset explicitly request the same finite audit under the same caps; neither is a latency or quality benchmark.

```powershell
npm run sample:env -- budget
npm run sample:env -- opus
npm run sample:env -- preset
```

### Compare Workflow fan-out and serial coordination

Workflow executes the reviewed three-file pipeline script. Serial awaits one audit at a time. Both run the native Workflow tool, retain real task completion evidence and independently verify unchanged fixtures. The scripts use globals provided by the Workflow runtime; do not run them directly with node.

```powershell
npm run sample:env -- workflow
npm run sample:env -- serial
npm test
```

## How the app was built

### 1. Choose explicit classroom limits

Select depth, concurrency and estimated spend independently. This three-service teaching example uses smaller explicit caps rather than relying on runtime defaults.

Source: `src/scaling.ts`, selected lines 3–11. Surrounding code omitted.

```typescript
export function limitsFor(mode: Mode) {
  return {
    depth: mode === "depth2" ? 2 : 1,
    concurrency: mode === "concurrency" ? 1 : 3,
    budgetUsd: mode === "budget" ? 0.00001 : 0.8,
    workflowConcurrency: mode === "serial" ? 1 : 2,
  };
}
export function capEnvironment(mode: Mode) {
```

### 2. Build string-valued cap environment

Pass depth and Agent concurrency through env strings. Workflow has a separate concurrency setting; a serial workflow uses one slot.

Source: `src/scaling.ts`, selected lines 11–20. Surrounding code omitted.

```typescript
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
```

### 3. Apply the native spend cap

maxBudgetUsd bounds estimated spend for the query and child requests. It is not a prepaid currency reservation; a request can cross the threshold before the SDK stops.

Source: `src/agent.ts`, selected lines 88–91. Surrounding code omitted.

```typescript
maxBudgetUsd: limits.budgetUsd,
    effort: "low",
    thinking: { type: "disabled" },
    abortController: controller,
```

### 4. Preserve the launching environment

TypeScript env replaces the subprocess environment. Spread process.env, keep private credentials on the server, isolate settings, and append the explicit caps.

Source: `src/agent.ts`, selected lines 101–109. Surrounding code omitted.

```typescript
env: {
      ...process.env,
      HOME: w.home,
      USERPROFILE: w.home,
      CLAUDE_CONFIG_DIR: w.sdkHome,
      ANTHROPIC_AUTH_TOKEN: undefined,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ...capEnvironment(c.mode),
    },
```

### 5. Define a coordinator that can request a grandchild

The coordinator declares Agent and Read. The runtime depth limit can remove Agent from the bottom layer; depth 1 and depth 2 produce different native trees.

Source: `src/agents.ts`, selected lines 12–19. Surrounding code omitted.

```typescript
coordinator: {
      description:
        "Delegates one service review if depth permits, otherwise performs the read-only audit itself.",
      prompt:
        "Use Agent to delegate the supplied service file to auditor if Agent is available. If depth restrictions removed Agent, Read the file yourself and explicitly report that Agent is unavailable. Never invent delegation or modify files. Report under 50 words.",
      tools: ["Agent", "Read"],
      model: "inherit",
      maxTurns: 6,
```

### 6. Detect actual direct and nested Agent calls

Retain all real Agent tool-use blocks, including nested delegations with a parent tool-use ID. A parent report alone does not prove a grandchild ran.

Source: `src/agent.ts`, selected lines 237–241. Surrounding code omitted.

```typescript
if (b.name === "Agent" || b.name === "Task") {
                delegations.push(r);
                observe("delegation", r);
              } else if (b.name === "Workflow") observe("workflow-launch", r);
              else if (parentId) {
```

### 7. Retain native tool refusal results

Record actual tool-return content and is_error. Concurrency refusal is a native result, not a host-invented simulation, and refused services remain unaudited.

Source: `src/agent.ts`, selected lines 264–268. Surrounding code omitted.

```typescript
toolUseId: b.tool_use_id,
                parentId: message.parent_tool_use_id,
                content: b.content,
                isError: b.is_error,
              };
```

### 8. Handle the native budget result before the exception

Retain result subtype, errors and estimated cost even when the SDK then raises. Budget mode expects error_max_budget_usd rather than treating it as a successful audit.

Source: `src/agent.ts`, selected lines 284–291. Surrounding code omitted.

```typescript
status: message.subtype,
            text:
              message.subtype === "success"
                ? message.result
                : message.errors.join("\n"),
            costUsd: message.total_cost_usd,
            modelUsage: message.modelUsage,
          };
```

### 9. Scope file access independently

Permit only the three disposable service files and classroom instructions. Reviewers and workflow agents cannot edit source, execute shell commands or inspect .env.

Source: `src/policy.ts`, selected lines 17–24. Surrounding code omitted.

```typescript
if (name === "Read")
    return (
      typeof i.file_path === "string" &&
      [...FILES, "CLAUDE.md"].some(
        (file) => resolve(cwd, i.file_path as string) === resolve(cwd, file),
      )
    );
  return false;
```

### 10. Launch the reviewed Workflow script

The host supplies its fixed reviewed script through the native hook. Workflow is enabled in allowedTools, and repeat or unrelated launches are not approved.

Source: `src/agent.ts`, selected lines 126–134. Surrounding code omitted.

```typescript
const script = workflowScript(c.mode);
                observe("workflow-script", { script });
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "allow",
                    updatedInput: { script },
                  },
                };
```

### 11. Declare native workflow metadata and inputs

A Workflow script begins with literal metadata, then a phase and fixed service inputs. The runtime provides agent and pipeline globals outside the parent conversation.

Source: `workflows/audit-parallel.js`, selected lines 1–7. Surrounding code omitted.

```typescript
export const meta = {
  name: "classroom-audit-45",
  description: "Audit three classroom service files",
  phases: ["Audit"],
};
phase("Audit");
const files = ["services/catalog.txt", "services/orders.txt", "services/billing.txt"];
```

### 12. Coordinate reviewers and return one result

Use agent for each read-only audit, pipeline to fan out over the list and script variables to retain intermediate reports. Return the consolidated result after completion.

Source: `workflows/audit-parallel.js`, selected lines 8–13. Surrounding code omitted.

```typescript
const audit = (file) => agent(
  "Read " + file + ". Report service, auth policy and any AUTH-MISSING-45 finding under 30 words. Do not edit files or use shell.",
  { label: file, model: "haiku", tools: ["Read"] },
);
const reports = await pipeline(files, audit);
return { services: files, reports };
```

### 13. Independently verify fixture integrity

Hash all three real service fixtures after the run. Native limits, observed child activity and unchanged files are separate pieces of evidence.

Source: `src/agent.ts`, selected lines 334–338. Surrounding code omitted.

```typescript
fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
      scaling: {
```

## Reference topics and limits

- Version and defaults: The lesson documents default depth 3, Agent concurrency 20 and no spend cap. This app pins the SDK and sets every cap explicitly. It uses three files rather than spending tokens on hundreds of workers; the same list/loop pattern illustrates larger runs.
- Depth versus a refusal: At depth 1 a child may not receive Agent at all and can perform its own permitted work. Depth2 demonstrates a real grandchild. Do not claim an error string must appear when the capability was removed before a call.
- Concurrency and incomplete work: The cap-one experiment asks for three background launches together. Native errors identify refused spawns. Reports must distinguish the admitted service from files that were never audited; do not infer complete coverage from a parent success result.
- Spend estimate and expected SDK exception: Budget mode is intentionally tiny. It retains error_max_budget_usd and the following SDK exception as expected evidence. An in-flight request can exceed the estimate before enforcement; maxBudgetUsd is not an exact billing guarantee. Do not blindly sum cumulative result frames.
- Opus 5 prompts and caps: The two Opus scenarios use an available Opus 5 model with either a custom instruction or claude_code preset plus an explicit user task. The model-specific delegation instruction steers behavior; depth/concurrency/spend controls remain necessary and explicit.
- Native Workflow evidence: The actual Workflow tool launches the reviewed script. Native lifecycle hooks observe child starts and stops, PreToolUse hooks observe real service reads, and task_notification reports workflow completion. Workflow child messages are not all forwarded as assistant events; do not mistake an empty direct-Agent catalog for no workflow work.
- Two concurrency mechanisms: CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS applies to direct Agent spawning. Workflow has its own CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS resource setting. Fan-out uses two workflow slots; the serial script awaits each task and uses one. Inspect native lifecycle timing without promising a speedup.
- Script execution context: workflows/audit-parallel.js and audit-serial.js run inside the native Workflow runtime, which supplies agent, pipeline, phase and top-level return semantics. They are not standalone Node modules. The host reads only those packaged scripts and supplies one fixed script to the tool; students never need to paste arbitrary code.
- Primary documentation: See https://code.claude.com/docs/en/agent-sdk/subagents and https://code.claude.com/docs/en/workflows for native caps, Workflow execution and version-dependent behavior.

## References

- [Official SDK subagents documentation](https://code.claude.com/docs/en/agent-sdk/subagents)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for specialist definitions, bounded delegation, scoped tools, actual fixture behavior and startup checks.
