import { expect, test, type Page } from "@playwright/test";

const fixture = {
  buildingName: "SJR Building",
  month: "2026-11",
  totalPlots: 4,
  paidCount: 2,
  plots: [
    {
      plotNumber: "101",
      tenantName: "Ravi Kumar",
      moveInDate: "2025-02-15T00:00:00.000Z",
      status: "PAID",
    },
    {
      plotNumber: "102",
      tenantName: "Priya Sharma",
      moveInDate: "2024-01-15T00:00:00.000Z",
      status: "UNPAID",
    },
    {
      plotNumber: "201",
      tenantName: "Meera Nair",
      moveInDate: "2025-02-15T00:00:00.000Z",
      status: "PAID",
    },
    { plotNumber: "202", tenantName: null, moveInDate: null, status: "UNPAID" },
  ],
};

async function mockStatus(page: Page) {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({ json: fixture }),
  );
}

test("search, payment filters, and reset keep the summary intact", async ({
  page,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Paid", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox").fill("priya");
  await expect(page.getByText("No matching plots")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("searchbox").fill("202");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Not displayed");
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
});

test("month changes fetch fresh data; refresh and error retry recover", async ({
  page,
}) => {
  let fail = false;
  const requested: string[] = [];
  await page.route("**/api/public/status?*", (route) => {
    requested.push(new URL(route.request().url()).searchParams.get("month")!);
    return route.fulfill(
      fail
        ? { status: 503, json: { error: "Unavailable" } }
        : { json: fixture },
    );
  });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  const previous = await page
    .locator("#public-month option")
    .nth(1)
    .getAttribute("value");
  await page.getByLabel("VIEWING MONTH").selectOption(previous!);
  await expect.poll(() => requested.at(-1)).toBe(previous);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  fail = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator(".connection-note")).toContainText(
    "Couldn’t refresh",
  );
  await expect(page.locator("tbody tr")).toHaveCount(4);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("empty building has an honest zero summary", async ({ page }) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: { ...fixture, totalPlots: 0, paidCount: 0, plots: [] },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("A fresh start for your building."),
  ).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(
    0,
  );
});

for (const width of [320, 390, 768, 1440]) {
  test(`fits a ${width}px browser and supports keyboard search`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockStatus(page);
    await page.goto("/");
    await expect(page.locator("tbody tr")).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const firstRow = await page.locator("tbody tr").first().boundingBox();
    expect(firstRow!.y).toBeLessThan(width <= 520 ? 620 : 550);
    expect(firstRow!.height).toBeLessThan(130);
    if (width <= 520)
      expect(
        await page
          .getByRole("searchbox")
          .evaluate((input) => getComputedStyle(input).fontSize),
      ).toBe("16px");
    await page.getByRole("searchbox").focus();
    await page.keyboard.type("ravi");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByText("Ravi Kumar")).toBeVisible();
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewport).not.toContain("maximum-scale=1");
  });
}

test("install guidance works without a native install prompt", async ({
  page,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Get the app|Install app/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Install instructions" }),
  ).toContainText("Safari");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(
    page.getByRole("dialog", { name: "Install instructions" }),
  ).toHaveCount(0);
});

test("manifest and icons are valid; offline fallback never stores records or admin pages", async ({
  page,
  context,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(
    manifest.icons.some(
      (icon: { purpose: string }) => icon.purpose === "maskable",
    ),
  ).toBe(true);
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(
    await page.locator('meta[name="theme-color"]').getAttribute("content"),
  ).toBe(manifest.theme_color);
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/png");
    const png = await image.body();
    expect(png.readUInt32BE(16)).toBe(Number(icon.sizes.split("x")[0]));
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.goto("/admin/login");
  const stored = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(stored).toContain("/offline.html");
  expect(
    stored.every(
      (path) =>
        path === "/offline.html" ||
        path.startsWith("/icons/") ||
        path.startsWith("/_next/static/"),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
  await expect(page.getByText("Ravi Kumar")).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("banner is absent and due, partial and N/A statuses remain distinct", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 3,
        paidCount: 0,
        plots: [
          { ...fixture.plots[0], status: "DUE", electricityStatus: "PAID" },
          {
            ...fixture.plots[1],
            status: "PARTIAL",
            electricityStatus: "UNPAID",
          },
          { ...fixture.plots[2], status: "NA", electricityStatus: "NA" },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every home." })).toHaveCount(
    0,
  );
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Due", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Due");
  await page.getByRole("button", { name: "Partial", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Partial");
});

test("plot number opens electricity history without a separate details control", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        plots: [
          {
            ...fixture.plots[0],
            electricityStatus: "UNPAID",
            electricityMonths: [
              {
                month: "2026-11",
                units: 100,
                isDefault: false,
                bill: 700,
                paid: 500,
                balance: 200,
                status: "PARTIAL",
              },
            ],
          },
        ],
        totalPlots: 1,
        paidCount: 1,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "View details for plot 101" })
    .click();
  await expect(page.getByRole("region", { name: "Plot 101 details", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Plot 101 details", exact: true })).toContainText("November 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Plot 101 details", exact: true })).toHaveCount(0);
});

test("native install prompts work and the button disappears after installation", async ({
  page,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.installPrompted = "yes";
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: /Get the app|Install app/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-install-prompted",
    "yes",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("button", { name: /Get the app|Install app/ }),
  ).toHaveCount(0);
});

test("electricity and attention filters from the working branch remain available", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        plots: [
          { ...fixture.plots[0], electricityStatus: "PAID" },
          { ...fixture.plots[1], electricityStatus: "UNPAID" },
          { ...fixture.plots[2], electricityStatus: "PAID" },
          { ...fixture.plots[3], electricityStatus: "NA", status: "NA" },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByLabel("Filter electricity status").selectOption("UNPAID");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Priya Sharma");
  await page.getByLabel("Filter electricity status").selectOption("ALL");
  await page.getByRole("checkbox", { name: /Needs attention/ }).check();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("summary cards filter the list and the total resets filters", async ({
  page,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Show paid rent" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Show paid rent" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show pending rent" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).toContainText("Priya Sharma");
  await page.getByRole("button", { name: "Show all plots" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("automatic refresh fetches fresh data without clearing the list", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/public/status?*", (route) => {
    calls++;
    return route.fulfill({
      json: {
        ...fixture,
        buildingName: calls > 1 ? "SJR Updated" : "SJR Building",
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.clock.fastForward(60_001);
  await expect(page.getByText("SJR Updated", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  expect(calls).toBe(2);
});

test("offline feedback preserves loaded records and reconnect refreshes them", async ({
  page,
  context,
}) => {
  let calls = 0;
  await page.route("**/api/public/status?*", (route) => {
    calls++;
    return route.fulfill({ json: fixture });
  });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  const initialCalls = calls;
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-note")).toContainText(
    "You’re offline",
  );
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => calls).toBeGreaterThan(initialCalls);
  await expect(page.locator(".connection-note")).toHaveCount(0);
});

test("Safari standalone mode hides installation controls", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    }),
  );
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Get the app|Install app/ }),
  ).toHaveCount(0);
});

test("worker updates offer a refresh without automatically reloading the page", async ({
  page,
}) => {
  await mockStatus(page);
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
  await expect(page.locator(".app-update-notice")).toContainText(
    "A new app version is ready",
  );
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Dismiss app update" }).click();
  await expect(page.locator(".app-update-notice")).toHaveCount(0);
});

test("monthly status counts and attention breakdown stay stable while filtering", async ({
  page,
}) => {
  const statuses = ["PAID", "DUE", "UNPAID", "PARTIAL", "NA"];
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 5,
        paidCount: 1,
        plots: statuses.map((status, index) => ({
          ...fixture.plots[index % fixture.plots.length],
          plotNumber: String(101 + index),
          status,
          electricityStatus:
            index === 0 ? "PAID" : index === 4 ? "NA" : "UNPAID",
        })),
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  for (const name of ["Paid", "Due", "Unpaid", "Partial", "N/A"]) {
    await expect(
      page.getByRole("button", { name, exact: true }).locator(".status-count"),
    ).toHaveText("1");
  }
  await expect(
    page
      .getByRole("button", { name: "All plots", exact: true })
      .locator(".status-count"),
  ).toHaveText("5");
  await expect(
    page
      .getByLabel("Filter electricity status")
      .locator('option[value="PAID"]'),
  ).toHaveText("Paid (1)");
  await expect(
    page
      .getByLabel("Filter electricity status")
      .locator('option[value="UNPAID"]'),
  ).toHaveText("Unpaid (3)");
  await expect(
    page.getByLabel("Filter electricity status").locator('option[value="NA"]'),
  ).toHaveText("N/A (1)");
  await expect(page.locator(".attention-copy")).toContainText(
    "Needs attention 3",
  );
  await expect(page.locator(".attention-breakdown")).toContainText(
    "Rent 2 · Electricity 3",
  );
  await page.getByRole("searchbox").fill("Priya");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page
      .getByRole("button", { name: "All plots", exact: true })
      .locator(".status-count"),
  ).toHaveText("5");
  await expect(page.locator(".attention-breakdown")).toContainText(
    "Rent 2 · Electricity 3",
  );
});

test("electricity history highlights the viewing month, including a historical selection", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) => {
    const month = new URL(route.request().url()).searchParams.get("month")!;
    return route.fulfill({
      json: {
        ...fixture,
        totalPlots: 1,
        paidCount: 1,
        plots: [
          {
            ...fixture.plots[0],
            electricityStatus: "PAID",
            electricityMonths: [
              {
                month: "2000-01",
                units: 10,
                bill: 70,
                paid: 70,
                balance: 0,
                isDefault: false,
                status: "PAID",
              },
              {
                month,
                units: 20,
                bill: 140,
                paid: 140,
                balance: 0,
                isDefault: false,
                status: "PAID",
              },
            ],
          },
        ],
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const previousMonth = await page
    .locator("#public-month option")
    .nth(1)
    .getAttribute("value");
  for (const selected of [
    await page.locator("#public-month").inputValue(),
    previousMonth!,
  ]) {
    await page.getByLabel("VIEWING MONTH").selectOption(selected);
    await expect(
      page.getByRole("button", { name: "View details for plot 101" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "View details for plot 101" })
      .click();
    const current = page
      .getByRole("region", { name: "Plot 101 details", exact: true })
      .locator('tbody tr[aria-current="true"]');
    await expect(current).toHaveCount(1);
    const label = new Date(`${selected}-01T00:00:00Z`).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric", timeZone: "UTC" },
    );
    await expect(current).toContainText(label);
    await expect(current.locator(".selected-month-label")).toHaveText(
      "Selected",
    );
    await expect(
      page.getByRole("region", { name: "Plot 101 details", exact: true }).locator("tbody tr:not([aria-current])"),
    ).toHaveCount(1);
    await page.keyboard.press("Escape");
  }
});

test("public plot details show rent and the complete electricity ledger from the example", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-09T12:00:00Z") });
  const electricityMonths = [
    {
      month: "2026-07",
      prevReading: 0,
      currReading: 0,
      units: 0,
      isDefault: true,
      bill: 500,
      paid: 0,
      balance: 500,
      status: "UNPAID",
    },
    {
      month: "2026-08",
      prevReading: 0,
      currReading: 0,
      units: 0,
      isDefault: true,
      bill: 500,
      paid: 500,
      balance: 0,
      status: "PAID",
    },
    {
      month: "2026-09",
      prevReading: 0,
      currReading: 53,
      units: 53,
      isDefault: false,
      bill: 371,
      paid: 0,
      balance: 371,
      status: "UNPAID",
    },
    {
      month: "2026-10",
      prevReading: 53,
      currReading: 148.8,
      units: 95.8,
      isDefault: false,
      bill: 670.6,
      paid: 0,
      balance: 670.6,
      status: "UNPAID",
    },
  ];
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 1,
        paidCount: 0,
        plots: [
          {
            ...fixture.plots[0],
            status: "UNPAID",
            paidDate: null,
            electricityStatus: "UNPAID",
            electricityMonths,
            electricityTotals: { billed: 2041.6, paid: 500, due: 1541.6 },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator(".plot-total-due")).toContainText("1,541.6");
  await page.getByLabel("VIEWING MONTH").selectOption("2026-10");
  await page.getByRole("button", { name: "View details for plot 101" }).click();
  const details = page.getByRole("region", { name: "Plot 101 details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Plot 101 details" }),
  ).toBeVisible();
  await expect(details.locator(".plot-month-summary")).toContainText("Rent");
  await expect(details.locator(".plot-month-summary")).toContainText("Unpaid");
  await expect(details.locator('tr[aria-current="true"]')).toContainText("53 → 148.8");
  await expect(details.locator('tr[aria-current="true"]')).toContainText("95.8");
  await expect(details.locator("tbody tr")).toHaveCount(4);
  await expect(details.locator("tfoot")).toContainText("148.8");
  await expect(details.locator("tfoot")).toContainText("₹2,041.6");
  await expect(details.locator("tfoot")).toContainText("₹500");
  await expect(details.locator("tfoot")).toContainText("₹1,541.6");
  await expect(details.locator(".history-ledger-note")).toContainText(
    "2 default-bill months",
  );
  await expect(details.locator('tr[aria-current="true"]')).toContainText(
    "October 2026",
  );
});

test("plot details without electricity history show only rent status", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 1,
        paidCount: 1,
        plots: [
          {
            ...fixture.plots[0],
            paidDate: "2026-11-05T00:00:00Z",
            electricityStatus: "UNPAID",
            electricityAmount: 500,
            electricityMonths: [],
            electricityTotals: { billed: 0, paid: 0, due: 0 },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "View details for plot 101" }).click();
  const details = page.getByRole("region", { name: "Plot 101 details", exact: true });
  await expect(details.locator(".plot-month-summary")).toContainText("Paid");
  await expect(details.locator(".plot-month-summary")).not.toContainText("Nov 5, 2026");
  await expect(details).toContainText("No electricity records yet");
  await expect(details.locator("tfoot")).toHaveCount(0);
});

test("masked public names stay masked in the list and details", async ({
  page,
}) => {
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 1,
        paidCount: 1,
        plots: [
          { ...fixture.plots[0], tenantName: "Dee***", electricityMonths: [] },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("tbody")).toContainText("Dee***");
  await page.getByRole("button", { name: "View details for plot 101" }).click();
  await expect(page.getByRole("region", { name: "Plot 101 details", exact: true })).toContainText("Dee***");
  await expect(page.getByText("Deepika Kumari", { exact: true })).toHaveCount(
    0,
  );
});

test("mobile history expands below the row without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        totalPlots: 1,
        plots: [
          {
            ...fixture.plots[0],
            electricityStatus: "UNPAID",
            electricityMonths: [
              {
                month: "2026-10",
                prevReading: 53,
                currReading: 148.8,
                units: 95.8,
                bill: 670.6,
                paid: 0,
                balance: 670.6,
                isDefault: false,
                status: "UNPAID",
              },
            ],
            electricityTotals: { billed: 670.6, paid: 0, due: 670.6 },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const button = page.getByRole("button", {
    name: "View details for plot 101",
  });
  await expect(button).toHaveText("101");
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await button.click();
  const dialog = page.getByRole("region", { name: "Plot 101 details", exact: true });
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await dialog
      .locator("tbody td")
      .first()
      .evaluate((cell) => parseFloat(getComputedStyle(cell).fontSize)),
  ).toBeGreaterThanOrEqual(14);
  await dialog.getByRole("button", { name: "Close plot details" }).click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`whole row opens rent and electricity history at ${width}px; keyboard works too`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/public/status?*", route => route.fulfill({ json: {
      ...fixture, totalPlots: 1, plots: [{
        ...fixture.plots[0], tenantName: "Rav***", electricityStatus: "UNPAID",
        rentMonths: [
          { month: "2026-08", recorded: true, bill: 11000, paid: 11000, balance: 0, advance: 0, paidDate: "2026-08-05T00:00:00Z", status: "PAID" },
          { month: "2026-09", recorded: true, bill: 11000, paid: 5000, balance: 6000, advance: 0, paidDate: "2026-09-06T00:00:00Z", status: "PARTIAL" },
          { month: "2026-10", recorded: false, bill: 11000, paid: 0, balance: 11000, advance: 0, paidDate: null, status: "UNPAID" },
        ],
        rentTotals: { billed: 33000, paid: 16000, due: 17000, advance: 0 },
        electricityMonths: [{ month: "2026-10", prevReading: 100, currReading: 200, units: 100, isDefault: false, bill: 700, paid: 500, balance: 200, status: "PARTIAL" }],
        electricityTotals: { billed: 700, paid: 500, due: 200 },
      }],
    } }));
    await page.goto("/");
    const row = page.locator(".plot-history-row");
    await expect(row.getByRole("button")).toHaveCount(1);
    await row.locator(".resident-name").click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    await expect(row.locator("xpath=following-sibling::tr[1]")).toHaveClass("plot-history-expansion");
    const dialog = page.getByRole("region", { name: "Plot 101 details", exact: true });
    await expect(dialog.getByRole("table")).toHaveCount(1);
    await expect(dialog.getByRole("heading", { name: "Rent history", exact: true })).toHaveCount(0);
    await expect(dialog.locator('[data-label="Rent"]')).toContainText("Unpaid");
    await expect(dialog).not.toContainText("₹16,000");
    await expect(dialog).not.toContainText("₹17,000");
    await expect(dialog).not.toContainText("₹33,000");
    await expect(dialog.getByLabel("Electricity history totals")).toContainText("₹500");
    await expect(dialog.getByLabel("Electricity history totals")).toContainText("₹200");
    await dialog.locator("tbody tr").last().scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Clicking inside history must not collapse it. Clicking the parent row again does.
    await dialog.getByRole("heading", { name: "Electricity history", exact: true }).click();
    await expect(dialog).toBeVisible();
    await row.locator(".resident-name").click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    await row.locator(".plot-payment-status").click();
    await expect(dialog).toBeVisible();
    await row.locator(".plot-payment-status").click();
    await expect(dialog).toHaveCount(0);
    const trigger = row.getByRole("button", { name: "View details for plot 101" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const width of [320, 1440]) {
  test(`row cells toggle inline history and switching rows keeps one expanded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockStatus(page);
    await page.goto("/");
    const rows = page.locator(".plot-history-row");
    const first = rows.first();
    for (const cell of [first.locator("th"), first.locator("td").first(), first.locator("td").last()]) {
      await cell.click({ position: { x: 5, y: 5 } });
      await expect(page.locator(".plot-history-expansion")).toHaveCount(1);
      await expect(first.getByRole("button")).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("region", { name: "Plot 101 details", exact: true })).toBeVisible();
      await cell.click({ position: { x: 5, y: 5 } });
      await expect(page.locator(".plot-history-expansion")).toHaveCount(0);
    }
    if (width > 520) {
      await first.locator(".move-in-date").click();
    } else {
      await first.getByRole("button").click();
    }
    await rows.nth(1).locator(".resident-name").click();
    await expect(page.locator(".plot-history-expansion")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Plot 102 details", exact: true })).toBeVisible();
    await expect(first.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Close plot details" }).click();
    await expect(rows.nth(1).getByRole("button")).toBeFocused();
    await expect(page.locator(".plot-history-expansion")).toHaveCount(0);
  });
}

test("building electricity shows the actual bill, the total billed to tenants and the difference", async ({ page }) => {
  let building: { actualBill: number | null; billedToTenants: number } = { actualBill: 12400, billedToTenants: 11250.5 };
  await page.route("**/api/public/status?*", (route) =>
    route.fulfill({ json: { ...fixture, buildingElectricity: building } }),
  );
  await page.goto("/");
  const band = page.getByRole("region", { name: "Building electricity" });
  await expect(band).toContainText("₹12,400");
  await expect(band).toContainText("₹11,250.5");
  await expect(band).toContainText("₹1,149.5");
  await expect(band).toContainText("not billed to tenants");
  await expect(band).toContainText("Tenant bills cover 91%");
  building = { actualBill: null, billedToTenants: 11250.5 };
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(band).toContainText("Not entered yet");
  await expect(band).not.toContainText("Tenant bills cover");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
