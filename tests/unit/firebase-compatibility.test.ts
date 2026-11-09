import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { getDocument, setDocument } from "../../src/lib/firebase";

test("existing individual Firebase credentials, namespace and encoded dates remain compatible", async () => {
  const names = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY_BASE64",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_DATABASE_URL",
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "FIREBASE_DB_PREFIX",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  Object.assign(process.env, {
    FIREBASE_PROJECT_ID: "demo-compatibility",
    FIREBASE_CLIENT_EMAIL: "test@example.invalid",
    FIREBASE_PRIVATE_KEY_BASE64: Buffer.from(key).toString("base64"),
    FIREBASE_DATABASE_URL:
      "https://demo-compatibility-default-rtdb.firebaseio.com",
    FIREBASE_DB_PREFIX: "test",
  });
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const paths: string[] = [];
  let patch: Record<string, unknown> | null = null;
  globalThis.fetch = async (resource, init) => {
    const url = new URL(String(resource));
    assert.ok(
      init?.signal,
      "Firebase operations must have bounded network waiting",
    );
    if (url.hostname === "oauth2.googleapis.com")
      return Response.json({
        access_token: "local-test-token",
        expires_in: 3600,
      });
    assert.equal(
      url.hostname,
      "demo-compatibility-default-rtdb.firebaseio.com",
    );
    paths.push(url.pathname);
    if (init?.method === "PATCH") {
      patch = JSON.parse(String(init.body));
      return Response.json({});
    }
    return Response.json({
      plotNumber: "101",
      moveInDate: { __type: "date", value: "2026-06-01T00:00:00.000Z" },
    });
  };
  try {
    const unit = await getDocument<{ plotNumber: string; moveInDate: Date }>(
      "units/u1",
    );
    assert.equal(unit?.plotNumber, "101");
    assert.equal(unit?.moveInDate.toISOString(), "2026-06-01T00:00:00.000Z");
    await setDocument(
      "",
      {
        "buildingElectricityBills/2026-11": { total: 28201 },
        "auditLogs/a1": { createdAt: new Date("2026-11-09T00:00:00.000Z") },
      },
      true,
    );
    assert.deepEqual(paths, ["/test/units/u1.json", "/test/.json"]);
    assert.deepEqual(patch, {
      "buildingElectricityBills/2026-11": { total: 28201 },
      "auditLogs/a1": {
        createdAt: { __type: "date", value: "2026-11-09T00:00:00.000Z" },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
