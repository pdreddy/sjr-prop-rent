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
  await expect(page.locator(".directory-empty[role='alert']")).toContainText(
    "couldn’t load",
  );
  await expect(page.locator("tbody tr")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Get the app" }).click();
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

test("electricity history opens from the status without adding a row of controls", async ({
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
    .getByRole("button", { name: "Electricity history for plot 101" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("November 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Get the app" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-install-prompted",
    "yes",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByRole("button", { name: "Get the app" })).toHaveCount(
    0,
  );
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
