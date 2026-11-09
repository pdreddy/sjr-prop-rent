import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeGeneralSettings,
  publicTenantName,
} from "../../src/lib/config";

test("legacy settings preserve the existing full/hidden choice", () => {
  const shown = normalizeGeneralSettings({ showTenantNames: true });
  assert.equal(shown.maskTenantNames, false);
  assert.equal(publicTenantName("Deepika Kumari", shown), "Deepika Kumari");
  assert.equal(
    publicTenantName(
      "Deepika Kumari",
      normalizeGeneralSettings({ showTenantNames: false }),
    ),
    null,
  );
});

test("masked names reveal at most three whole characters and hide the remainder", () => {
  const settings = { showTenantNames: true, maskTenantNames: true };
  assert.equal(publicTenantName("Deepika Kumari @ ashta", settings), "Dee***");
  assert.equal(publicTenantName(" Ravi Kumar ", settings), "Rav***");
  assert.equal(publicTenantName("Al", settings), "Al***");
  assert.equal(publicTenantName("e\u0301lodie", settings), "e\u0301lo***");
  assert.equal(publicTenantName("👩‍💻Anna", settings), "👩‍💻An***");
  assert.equal(publicTenantName(null, settings), null);
  assert.equal(publicTenantName("   ", settings), null);
  assert.equal(
    publicTenantName("Deepika", { ...settings, showTenantNames: false }),
    null,
  );
});
