import { test } from "node:test";
import assert from "node:assert/strict";
import { limitsFor, capEnvironment, workflowScript, FILES } from "./scaling.js";
import { definitions } from "./agents.js";
import { allowedTool } from "./policy.js";
import { validateConfig } from "./modes.js";
import { prepareWorkspace } from "./workspace.js";
test("depth, concurrency and budget are independently bounded", () => {
  assert.equal(limitsFor("depth1").depth, 1);
  assert.equal(limitsFor("depth2").depth, 2);
  assert.equal(limitsFor("concurrency").concurrency, 1);
  assert.ok(limitsFor("budget").budgetUsd < 0.001);
  assert.equal(limitsFor("bounded").concurrency, 3);
});
test("runtime receives string env caps and separate workflow concurrency", () => {
  const e = capEnvironment("serial");
  assert.equal(e.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, "1");
  assert.equal(e.CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS, "1");
  assert.equal(
    capEnvironment("workflow").CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS,
    "2",
  );
});
test("auditor cannot spawn; coordinator can request nested delegation", () => {
  assert.deepEqual(definitions().auditor.tools, ["Read"]);
  assert.ok(definitions().coordinator.tools!.includes("Agent"));
});
test("workflow scripts use fixed inputs, literal metadata and bounded coordination", () => {
  const a = workflowScript("workflow"),
    b = workflowScript("serial");
  assert.ok(a.startsWith("export const meta"));
  assert.ok(a.includes("pipeline(files, audit)"));
  assert.ok(b.includes("for (const file of files)"));
  assert.ok(!a.includes("import("));
  for (const file of FILES) assert.ok(a.includes(file));
});
test("only known agents and fixed fixture reads are permitted", () => {
  const names = Object.keys(definitions());
  assert.ok(
    allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "auditor", prompt: "Review" },
      names,
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "unknown", prompt: "x" },
      names,
    ),
  );
  assert.ok(allowedTool("C:/lab", "Read", { file_path: FILES[0] }, names));
  for (const name of ["Write", "Edit", "Bash"])
    assert.ok(
      !allowedTool(
        "C:/lab",
        name,
        { file_path: FILES[0], command: "echo x" },
        names,
      ),
    );
  assert.ok(!allowedTool("C:/lab", "Read", { file_path: "../.env" }, names));
});
test("browser cannot inject caps, scripts or model IDs", () => {
  assert.deepEqual(validateConfig({ mode: "budget" }), { mode: "budget" });
  for (const v of [
    { mode: "bad" },
    { mode: "bounded", budgetUsd: 100 },
    { mode: "workflow", script: "x" },
  ])
    assert.throws(() => validateConfig(v));
});
test("three real fixtures are hashed independently and include a known classroom finding", async () => {
  const w = await prepareWorkspace();
  try {
    const a = await w.snapshot(),
      b = await w.snapshot();
    assert.equal(a.files.length, 3);
    assert.ok(a.files.some((x) => x.text.includes("AUTH-MISSING-45")));
    assert.equal(a.hash, b.hash);
  } finally {
    await w.cleanup();
  }
});
