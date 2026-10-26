import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
export function definitions(): Record<string, AgentDefinition> {
  return {
    auditor: {
      description: "Read-only classroom service authentication policy auditor.",
      prompt:
        "Read only the service file supplied in your task. Report service, auth policy and AUTH-MISSING-45 if auth=false is not public. Keep report under 30 words; no edits or commands.",
      tools: ["Read"],
      model: "haiku",
      maxTurns: 4,
    },
    coordinator: {
      description:
        "Delegates one service review if depth permits, otherwise performs the read-only audit itself.",
      prompt:
        "Use Agent to delegate the supplied service file to auditor if Agent is available. If depth restrictions removed Agent, Read the file yourself and explicitly report that Agent is unavailable. Never invent delegation or modify files. Report under 50 words.",
      tools: ["Agent", "Read"],
      model: "inherit",
      maxTurns: 6,
    },
  };
}
