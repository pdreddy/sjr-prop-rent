import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { getDocument } from "../../src/lib/firebase";

test("inline service-account JSON connects without separate credential variables", async () => {
  const names = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "FIREBASE_DATABASE_URL",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_PRIVATE_KEY_BASE64",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const originalFetch = globalThis.fetch;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  for (const name of names) delete process.env[name];
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "demo-inline",
    client_email: "test@example.invalid",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "unused-example-file.json";
  let authenticated = false;
  globalThis.fetch = async (resource) => {
    const url = new URL(String(resource));
    if (url.hostname === "oauth2.googleapis.com") {
      authenticated = true;
      return Response.json({ access_token: "test-token", expires_in: 3600 });
    }
    assert.equal(url.hostname, "demo-inline-default-rtdb.firebaseio.com");
    return Response.json(null);
  };
  try {
    assert.equal(await getDocument("units/u1"), null);
    assert.equal(authenticated, true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
