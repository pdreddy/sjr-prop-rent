import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Run the actual startup command in a separate project folder; do not read or
// change developer credentials, connect to Firebase, or start a server.
test("local startup loads .env.local over .env and reports missing credentials before starting", () => {
  const directory = mkdtempSync(join(tmpdir(), "sjr-startup-"));
  const env = { ...process.env, NODE_ENV: "development" };
  for (const name of Object.keys(env)) {
    if (name.startsWith("FIREBASE_") || name === "SESSION_SECRET")
      delete env[name];
  }
  try {
    const marker = "local-test-session-secret-never-used-for-real-auth";
    writeFileSync(join(directory, ".env"), "SESSION_SECRET=short\n");
    writeFileSync(join(directory, ".env.local"), `SESSION_SECRET=${marker}\n`);
    const require = createRequire(resolve("package.json"));
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        require.resolve("tsx/esm"),
        resolve("scripts/dev.ts"),
        "--check",
      ],
      { cwd: directory, env, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    const output = result.stdout + result.stderr;
    assert.match(output, /Environment files: \.env\.local, \.env/);
    assert.match(output, /Firebase credentials are missing/);
    assert.doesNotMatch(output, /SESSION_SECRET in .* must/);
    assert.doesNotMatch(output, new RegExp(marker));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
