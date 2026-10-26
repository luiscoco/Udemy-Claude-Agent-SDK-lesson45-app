import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { FILES } from "./scaling.js";
export const FIXTURES = [
  "service=catalog; method=GET; route=/catalog; public=true; auth=false",
  "service=orders; method=POST; route=/orders; public=false; auth=false; finding=AUTH-MISSING-45",
  "service=billing; method=GET; route=/invoices; public=false; auth=true",
];
export async function prepareWorkspace() {
  const parent = resolve(realpathSync.native(tmpdir()), "claude-sdk45"),
    root = resolve(parent, randomUUID());
  const safe = () => {
    const r = relative(parent, root);
    if (!r || r.startsWith("..") || isAbsolute(r))
      throw new Error("Invalid classroom workspace.");
  };
  safe();
  const cwd = join(root, "project"),
    home = join(root, "home"),
    sdkHome = join(root, "sdk");
  for (const p of [join(cwd, "services"), home, sdkHome])
    await mkdir(p, { recursive: true });
  for (const [i, file] of FILES.entries())
    await writeFile(join(cwd, file), FIXTURES[i]);
  await writeFile(
    join(cwd, "CLAUDE.md"),
    "Classroom audit. Never edit files. Only read the three services. Reports under 50 words.",
  );
  return {
    cwd,
    home,
    sdkHome,
    async snapshot() {
      const files = await Promise.all(
        FILES.map(async (file) => ({
          file,
          text: await readFile(join(cwd, file), "utf8"),
        })),
      );
      return {
        files,
        hash: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      };
    },
    async cleanup() {
      safe();
      await rm(root, { recursive: true, force: true });
    },
  };
}
