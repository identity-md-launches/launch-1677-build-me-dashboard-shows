import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

// Run against an already running production preview, including a subpath if needed:
// node scripts/check-site.mjs http://localhost:4173/ [--out directory | --stdout]
// POIDH_BROWSERS=chromium limits the run to one installed browser engine.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outputArg = args.indexOf("--out");
const positional = args.filter(
  (argument, index) =>
    !argument.startsWith("--") && args[index - 1] !== "--out",
);
const baseUrl =
  positional[0] || process.env.POIDH_PREVIEW_URL || "http://localhost:4173/";
const outputDir = args.includes("--stdout")
  ? null
  : resolve(
      repoRoot,
      outputArg >= 0
        ? args[outputArg + 1]
        : process.env.POIDH_QA_OUTPUT || "test/scratch/dashboard-validation",
    );
if (outputDir) await mkdir(outputDir, { recursive: true });
const browserNames = (process.env.POIDH_BROWSERS || "chromium,webkit")
  .split(",")
  .map((name) => name.trim());
if (browserNames.some((name) => !["chromium", "webkit"].includes(name)))
  throw new Error(
    "POIDH_BROWSERS accepts chromium,webkit or either engine alone.",
  );
const snapshotText = await readFile(
  resolve(repoRoot, "public/data/activity.json"),
  "utf8",
);
const snapshot = JSON.parse(snapshotText);
const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  snapshotSha256: createHash("sha256").update(snapshotText).digest("hex"),
  snapshotPeriod: snapshot.period,
  browsers: [],
};
const names = {
  all: "All chains",
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
};
const metrics = ["bounties", "claims", "completed"];
const labels = {
  bounties: "Bounties",
  claims: "Proofs",
  completed: "Completed",
};
const countsLabel = {
  bounties: "bounties created",
  claims: "proofs submitted",
  completed: "bounties completed",
};
const displayDate = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
function startDate(days) {
  const end = new Date(`${snapshot.period.end}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - days + 1);
  return end.toISOString().slice(0, 10);
}
function expectedData(chain, days) {
  const source = snapshot.daily.filter(
    (row) =>
      (chain === "all" || row.chain === chain) &&
      row.date >= startDate(days) &&
      row.date <= snapshot.period.end,
  );
  const uniqueWallets = new Set();
  const summary = { bounties: 0, claims: 0, completed: 0, wallets: 0 };
  const dates = new Map();
  for (const row of source) {
    let day = dates.get(row.date);
    if (!day) {
      day = {
        date: row.date,
        bounties: 0,
        claims: 0,
        completed: 0,
        wallets: new Set(),
      };
      dates.set(row.date, day);
    }
    for (const metric of metrics) {
      summary[metric] += row[metric];
      day[metric] += row[metric];
    }
    for (const wallet of row.wallets) {
      uniqueWallets.add(wallet.toLowerCase());
      day.wallets.add(wallet.toLowerCase());
    }
  }
  summary.wallets = uniqueWallets.size;
  return {
    summary,
    daily: [...dates.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({ ...day, wallets: day.wallets.size })),
  };
}
function expectedWeeks(daily) {
  const grouped = new Map();
  for (const day of daily) {
    const date = new Date(`${day.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = date.toISOString().slice(0, 10);
    const entry = grouped.get(week) || {
      date: day.date,
      endDate: day.date,
      bounties: 0,
      claims: 0,
      completed: 0,
      days: 0,
    };
    entry.endDate = day.date;
    entry.days += 1;
    for (const metric of metrics) entry[metric] += day[metric];
    grouped.set(week, entry);
  }
  return [...grouped.values()];
}
const countText = (value) => new Intl.NumberFormat("en-US").format(value);
const actualNumber = (value) => Number(value.replaceAll(",", "").trim());

async function exercise(browserType, label) {
  const result = {
    name: label,
    checks: [],
    launches: [],
    pageErrors: [],
    consoleErrors: [],
    responseFailures: [],
    requestFailures: [],
    externalRequests: [],
    axe: [],
  };
  report.browsers.push(result);
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    result.launches.push({ passed: true, version: browser.version() });
  } catch (error) {
    result.launches.push({ passed: false, error: String(error.message) });
    result.status = "unavailable";
    console.log(`${label}: unavailable: ${error.message}`);
    return;
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const origin = new URL(baseUrl).origin;
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      result.responseFailures.push({
        url: response.url(),
        status: response.status(),
      });
  });
  page.on("requestfailed", (request) =>
    result.requestFailures.push({
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== origin
    )
      result.externalRequests.push(request.url());
  });
  async function check(name, fn) {
    const started = Date.now();
    try {
      const detail = await fn();
      result.checks.push({
        name,
        passed: true,
        milliseconds: Date.now() - started,
        ...(detail === undefined ? {} : { detail }),
      });
      console.log(`${label}: PASS ${name}`);
    } catch (error) {
      result.checks.push({
        name,
        passed: false,
        milliseconds: Date.now() - started,
        error: String(error.stack || error),
      });
      console.log(`${label}: FAIL ${name}: ${error.message}`);
      if (outputDir)
        await page
          .screenshot({
            path: `${outputDir}/${label}-${name.replaceAll(/[^a-zA-Z0-9]+/g, "-").slice(0, 60)}-failure.png`,
            fullPage: true,
          })
          .catch(() => {});
    }
  }
  async function setSelection(chain, days) {
    await page
      .getByRole("group", { name: "Filter by chain", exact: true })
      .getByRole("button", { name: names[chain], exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Date range", exact: true })
      .selectOption(String(days));
    await page.waitForFunction(
      ({ expected }) => {
        const actual = [...document.querySelectorAll(".metric-value")].map(
          (el) => Number(el.textContent.replaceAll(",", "").trim()),
        );
        return JSON.stringify(actual) === JSON.stringify(expected);
      },
      { expected: Object.values(expectedData(chain, days).summary) },
    );
  }
  async function checkAxe(name) {
    const analysis = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = analysis.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    }));
    result.axe.push({
      state: name,
      violations,
      incompleteRules: analysis.incomplete.map((v) => v.id),
      passRuleCount: analysis.passes.length,
    });
    assert.equal(violations.length, 0, JSON.stringify(violations));
    return {
      violationCount: violations.length,
      passRuleCount: analysis.passes.length,
      incompleteRules: analysis.incomplete.map((v) => v.id),
    };
  }

  try {
    await check("production-load-and-metadata", async () => {
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await page
        .getByRole("heading", { name: "Protocol activity", exact: true })
        .waitFor();
      assert.match(await page.title(), /poidh/i);
      for (const selector of [
        'meta[name="description"]',
        'meta[property="og:title"]',
        'meta[property="og:image"]',
      ]) {
        assert.ok(
          (await page.locator(selector).getAttribute("content"))?.trim(),
          selector,
        );
      }
      const favicon = await page
        .locator('link[rel="icon"]')
        .getAttribute("href");
      assert.ok(favicon && !favicon.startsWith("/"), "Relative favicon URL");
      assert.equal(
        (await page.request.get(new URL(favicon, baseUrl).href)).status(),
        200,
      );
      const dataResponse = await page.request.get(
        new URL("data/activity.json", baseUrl).href,
      );
      assert.equal(dataResponse.status(), 200);
      assert.deepEqual(
        await dataResponse.json(),
        snapshot,
        "Production snapshot matches public source",
      );
      const urls = await page
        .locator('script[src],link[rel="stylesheet"]')
        .evaluateAll((elements) =>
          elements.map(
            (el) => el.getAttribute("src") || el.getAttribute("href"),
          ),
        );
      assert.ok(
        urls.every((url) => url.startsWith("./")),
        JSON.stringify(urls),
      );
      return {
        title: await page.title(),
        assets: urls,
        snapshotRows: snapshot.daily.length,
      };
    });

    await check(
      "metrics-and-comparison-all-16-filter-combinations",
      async () => {
        const combinations = [];
        for (const days of [365, 90, 30, 7]) {
          for (const chain of ["all", "ethereum", "arbitrum", "base"]) {
            await setSelection(chain, days);
            const expected = expectedData(chain, days);
            assert.deepEqual(
              (await page.locator(".metric-value").allTextContents()).map(
                actualNumber,
              ),
              Object.values(expected.summary),
            );
            assert.equal(
              await page
                .getByRole("group", { name: "Filter by chain", exact: true })
                .getByRole("button", { name: names[chain], exact: true })
                .getAttribute("aria-pressed"),
              "true",
            );
            const chainRows = page.locator(".chain-table tbody tr");
            for (let i = 0; i < snapshot.chains.length; i++) {
              const chainExpected = expectedData(
                snapshot.chains[i].id,
                days,
              ).summary;
              assert.deepEqual(
                (await chainRows.nth(i).locator("td").allTextContents()).map(
                  actualNumber,
                ),
                metrics.map((metric) => chainExpected[metric]),
              );
            }
            combinations.push({ chain, days, totals: expected.summary });
          }
        }
        return combinations;
      },
    );

    await check(
      "csv-download-real-content-and-filenames-all-16-selections",
      async () => {
        for (const days of [365, 90, 30, 7]) {
          for (const chain of ["all", "ethereum", "arbitrum", "base"]) {
            await setSelection(chain, days);
            const downloadPromise = page.waitForEvent("download");
            await page
              .getByRole("button", { name: "Export CSV", exact: true })
              .click();
            const download = await downloadPromise;
            assert.equal(
              download.suggestedFilename(),
              `poidh-${chain}-${startDate(days)}-to-${snapshot.period.end}.csv`,
            );
            assert.equal(await download.failure(), null);
            const content = await readFile(await download.path(), "utf8");
            const rows = content.trimEnd().split("\r\n");
            assert.equal(
              rows[0],
              "date_utc,chain,bounties_created,proofs_submitted,bounties_completed,unique_active_wallets",
            );
            const expected = expectedData(chain, days).daily;
            assert.equal(rows.length, days + 1);
            assert.deepEqual(
              rows.slice(1),
              expected.map(
                (row) =>
                  `${row.date},${chain},${row.bounties},${row.claims},${row.completed},${row.wallets}`,
              ),
            );
          }
        }
        return { downloads: 16, everyFieldCompared: true };
      },
    );

    await check(
      "chart-metrics-daily-weekly-and-keyboard-selection",
      async () => {
        await setSelection("all", 365);
        await page.getByRole("button", { name: "Chart", exact: true }).click();
        const daily = expectedData("all", 365).daily;
        for (const grouping of ["day", "week"]) {
          await page
            .getByRole("combobox", { name: "Group chart by", exact: true })
            .selectOption(grouping);
          const buckets = grouping === "day" ? daily : expectedWeeks(daily);
          for (const metric of metrics) {
            await page
              .getByRole("group", { name: "Chart metric", exact: true })
              .getByRole("button", { name: labels[metric], exact: true })
              .click();
            const slider = page.getByRole("slider");
            await slider.focus();
            await slider.press("Home");
            assert.equal(await slider.getAttribute("aria-valuenow"), "1");
            assert.match(
              await slider.getAttribute("aria-valuetext"),
              new RegExp(
                `${countText(buckets[0][metric])} ${countsLabel[metric]}`,
              ),
            );
            await slider.press("ArrowRight");
            assert.equal(await slider.getAttribute("aria-valuenow"), "2");
            await slider.press("ArrowLeft");
            assert.equal(await slider.getAttribute("aria-valuenow"), "1");
            await slider.press("ArrowLeft");
            assert.equal(
              await slider.getAttribute("aria-valuenow"),
              "1",
              "Left boundary clamps",
            );
            await slider.press("End");
            assert.equal(
              await slider.getAttribute("aria-valuenow"),
              String(buckets.length),
            );
            assert.match(
              await slider.getAttribute("aria-valuetext"),
              new RegExp(
                `${countText(buckets.at(-1)[metric])} ${countsLabel[metric]}`,
              ),
            );
            await slider.press("ArrowRight");
            assert.equal(
              await slider.getAttribute("aria-valuenow"),
              String(buckets.length),
              "Right boundary clamps",
            );
            assert.equal(
              actualNumber(
                await page.locator(".activity-chart__value strong").innerText(),
              ),
              buckets.at(-1)[metric],
            );
            assert.ok(
              (await slider.evaluate(
                (el) => getComputedStyle(el).outlineStyle,
              )) !== "none",
              "Focus outline exists",
            );
          }
        }
        assert.equal(
          await page.locator(".activity-chart__partial").innerText(),
          "Partial week",
        );
        const slider = page.getByRole("slider");
        const rect = await slider.boundingBox();
        await page.mouse.click(rect.x + 65, rect.y + rect.height / 2);
        assert.ok(
          Number(await slider.getAttribute("aria-valuenow")) < 10,
          "Pointer selects a bucket near plot start",
        );
        return {
          metrics: 3,
          groupings: 2,
          keyboardKeys: ["Home", "End", "ArrowLeft", "ArrowRight"],
          pointer: true,
        };
      },
    );

    await check(
      "table-pagination-values-daily-subtitle-and-filter-reset",
      async () => {
        await setSelection("all", 365);
        await page
          .getByRole("combobox", { name: "Group chart by", exact: true })
          .selectOption("week");
        await page.getByRole("button", { name: "Table", exact: true }).click();
        assert.equal(
          await page.locator(".activity-panel .panel-heading p").innerText(),
          "All chains · Daily counts",
        );
        const rows = expectedData("all", 365).daily.toReversed();
        async function verifyPage(index) {
          const actual = await page
            .locator(".daily-table tbody tr")
            .evaluateAll((elements) =>
              elements.map((el) =>
                [...el.children].map((cell) => cell.textContent.trim()),
              ),
            );
          const expected = rows
            .slice(index * 10, index * 10 + 10)
            .map((row) => [
              displayDate(row.date),
              ...["bounties", "claims", "completed", "wallets"].map((metric) =>
                countText(row[metric]),
              ),
            ]);
          assert.deepEqual(actual, expected);
          assert.equal(
            await page.locator(".pagination > span").innerText(),
            `Page ${index + 1} of 37`,
          );
        }
        await verifyPage(0);
        assert.ok(
          await page
            .getByRole("button", { name: "Newer", exact: true })
            .isDisabled(),
        );
        await page.getByRole("button", { name: "Older", exact: true }).click();
        await verifyPage(1);
        await page.getByRole("button", { name: "Newer", exact: true }).click();
        await verifyPage(0);
        for (let i = 0; i < 36; i++)
          await page
            .getByRole("button", { name: "Older", exact: true })
            .click();
        await verifyPage(36);
        assert.ok(
          await page
            .getByRole("button", { name: "Older", exact: true })
            .isDisabled(),
        );
        await setSelection("ethereum", 7);
        assert.equal(
          await page.locator(".pagination > span").innerText(),
          "Page 1 of 1",
        );
        assert.equal(await page.locator(".daily-table tbody tr").count(), 7);
        assert.ok(
          await page
            .getByRole("button", { name: "Newer", exact: true })
            .isDisabled(),
        );
        assert.ok(
          await page
            .getByRole("button", { name: "Older", exact: true })
            .isDisabled(),
        );
        return {
          pageSizes: [10, 10, 5, 7],
          lastPage: 37,
          filtersResetPage: true,
        };
      },
    );

    await check("chain-comparison-row-buttons-filter-dashboard", async () => {
      await setSelection("all", 90);
      for (const chain of snapshot.chains) {
        await page
          .getByRole("button", {
            name: `Filter dashboard to ${chain.name}`,
            exact: true,
          })
          .click();
        assert.deepEqual(
          (await page.locator(".metric-value").allTextContents()).map(
            actualNumber,
          ),
          Object.values(expectedData(chain.id, 90).summary),
        );
        assert.equal(
          await page
            .getByRole("group", { name: "Filter by chain", exact: true })
            .getByRole("button", { name: names[chain.id], exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
      }
    });

    await check("real-empty-state-and-longer-period-recovery", async () => {
      await setSelection("arbitrum", 7);
      assert.ok(
        await page
          .getByRole("heading", {
            name: "No new bounties in this window",
            exact: true,
          })
          .isVisible(),
      );
      await page
        .getByRole("button", { name: "Show last 12 months", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("combobox", { name: "Date range", exact: true })
          .inputValue(),
        "365",
      );
      assert.equal(await page.locator(".bounty-list li").count(), 5);
      await page.getByRole("button", { name: "Chart", exact: true }).click();
      await page
        .getByRole("group", { name: "Chart metric", exact: true })
        .getByRole("button", { name: "Bounties", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Group chart by", exact: true })
        .selectOption("day");
      await setSelection("arbitrum", 7);
      assert.ok(
        await page
          .getByText("No activity in this selection", { exact: true })
          .isVisible(),
      );
      assert.equal(
        await page.locator(".activity-chart__value strong").innerText(),
        "0",
      );
      return {
        chain: "arbitrum",
        days: 7,
        bounties: expectedData("arbitrum", 7).summary.bounties,
      };
    });

    await check("recent-bounties-match-source-and-link-addresses", async () => {
      await setSelection("all", 365);
      const recent = snapshot.bounties
        .filter(
          (row) =>
            row.createdAt.slice(0, 10) >= startDate(365) &&
            row.createdAt.slice(0, 10) <= snapshot.period.end,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
      const actual = await page
        .locator(".bounty-main > a")
        .evaluateAll((links) =>
          links.map((link) => ({
            title: link.textContent.trim(),
            href: link.getAttribute("href"),
          })),
        );
      assert.deepEqual(
        actual,
        recent.map((row) => ({ title: row.name.trim(), href: row.url })),
      );
      return actual;
    });

    await check("axe-main-chart", () => checkAxe("main-chart"));
    await check("source-details-contracts-and-info-anchor", async () => {
      await page
        .getByRole("link", { name: "About the data", exact: true })
        .click();
      await page.locator("#about-data[open]").waitFor();
      assert.equal(await page.locator("#about-data").getAttribute("open"), "");
      assert.equal(new URL(page.url()).hash, "#about-data");
      const expected = snapshot.chains.map(
        (chain) => `${chain.explorer}/address/${chain.address}`,
      );
      const actual = await page
        .locator(".contract-list a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      assert.deepEqual(actual, expected);
      assert.ok(
        await page
          .getByRole("link", { name: "Download source snapshot" })
          .isVisible(),
      );
      await page.locator("#about-data > summary").click();
      assert.equal(
        await page.locator("#about-data").getAttribute("open"),
        null,
      );
      await page
        .getByRole("link", {
          name: "Read how proofs per bounty is calculated",
          exact: true,
        })
        .click();
      await page.locator("#about-data[open]").waitFor();
      assert.equal(new URL(page.url()).hash, "#metric-definitions");
      assert.equal(await page.locator("#about-data").getAttribute("open"), "");
      assert.ok(
        await page
          .getByRole("heading", { name: "What the numbers mean", exact: true })
          .isVisible(),
      );
      return { contractLinks: actual, anchorsOpenDetails: true };
    });
    await check("axe-expanded-methodology", () =>
      checkAxe("expanded-methodology"),
    );
    await check("axe-table", async () => {
      await page.getByRole("button", { name: "Table", exact: true }).click();
      return checkAxe("table-expanded-methodology");
    });

    await check("responsive-layout-and-first-screen", async () => {
      const measurements = [];
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({
          width,
          height: width >= 768 ? 1000 : 844,
        });
        await page.getByRole("button", { name: "Chart", exact: true }).click();
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(100);
        const chart = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          title: document.querySelector("h1").getBoundingClientRect().toJSON(),
          primary: [...document.querySelectorAll("button")]
            .find((el) => el.textContent.includes("Export CSV"))
            .getBoundingClientRect()
            .toJSON(),
        }));
        assert.ok(
          chart.document <= width + 1,
          `Chart document overflow at ${width}: ${JSON.stringify(chart)}`,
        );
        assert.ok(chart.body <= width + 1, `Chart body overflow at ${width}`);
        if (width === 390) {
          assert.ok(
            chart.title.top >= 0 && chart.title.bottom <= 844,
            "Product title is on first mobile screen",
          );
          assert.ok(
            chart.primary.top >= 0 && chart.primary.bottom <= 844,
            "Export action is on first mobile screen",
          );
        }
        if (outputDir)
          await page.screenshot({
            path: `${outputDir}/${label}-${width}-chart.png`,
            fullPage: true,
          });
        if (outputDir && (width === 390 || width === 1440))
          await page.screenshot({
            path: `${outputDir}/${label}-${width}-first-screen.png`,
          });
        await page.getByRole("button", { name: "Table", exact: true }).click();
        const table = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          tableWidth: document.querySelector(".table-scroll").scrollWidth,
          tableClientWidth: document.querySelector(".table-scroll").clientWidth,
        }));
        assert.ok(
          table.document <= width + 1,
          `Table document overflow at ${width}: ${JSON.stringify(table)}`,
        );
        assert.ok(table.body <= width + 1, `Table body overflow at ${width}`);
        measurements.push({ width, chart, table });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Chart", exact: true }).click();
      await page.getByRole("slider").focus();
      await page.getByRole("slider").press("ArrowLeft");
      if (outputDir)
        await page.screenshot({
          path: `${outputDir}/${label}-390-keyboard-focus.png`,
        });
      return measurements;
    });
    await check("axe-mobile-390", () =>
      checkAxe("mobile-chart-expanded-methodology"),
    );

    await check("root-text-resize-200-percent-at-390", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const measurements = [];
      try {
        for (const view of ["Chart", "Table"]) {
          await page.getByRole("button", { name: view, exact: true }).click();
          await page.evaluate(() => scrollTo(0, 0));
          await page.waitForTimeout(100);
          const sizes = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            rootFont: getComputedStyle(document.documentElement).fontSize,
          }));
          assert.equal(sizes.rootFont, "32px");
          assert.ok(
            sizes.document <= 391,
            `Document overflow with 200% root text in ${view}: ${JSON.stringify(sizes)}`,
          );
          assert.ok(
            sizes.body <= 391,
            `Body overflow with 200% root text in ${view}: ${JSON.stringify(sizes)}`,
          );
          for (const chain of ["All chains", "Ethereum", "Arbitrum", "Base"]) {
            assert.ok(
              await page
                .getByRole("group", { name: "Filter by chain", exact: true })
                .getByRole("button", { name: chain, exact: true })
                .isVisible(),
            );
          }
          assert.ok(
            await page
              .getByRole("button", { name: "Export CSV", exact: true })
              .isVisible(),
          );
          measurements.push({ view, ...sizes });
          if (outputDir)
            await page.screenshot({
              path: `${outputDir}/${label}-390-text-200-${view.toLowerCase()}.png`,
              fullPage: true,
            });
        }
      } finally {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "";
        });
        await page.getByRole("button", { name: "Chart", exact: true }).click();
      }
      return {
        measurements,
        limitation: "CSS root text enlargement; not browser-native 200% zoom.",
      };
    });

    await check(
      "mobile-touch-inspection-and-keyboard-table-scroll",
      async () => {
        const mobileContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        });
        const mobile = await mobileContext.newPage();
        await mobile.goto(baseUrl);
        await mobile
          .getByRole("heading", { name: "Protocol activity", exact: true })
          .waitFor();
        const slider = mobile.getByRole("slider");
        await slider.scrollIntoViewIfNeeded();
        const box = await slider.boundingBox();
        await mobile.touchscreen.tap(box.x + 65, box.y + box.height / 2);
        const selected = Number(await slider.getAttribute("aria-valuenow"));
        assert.ok(
          selected > 1 && selected < 150,
          `Tap selects early bucket: ${selected}`,
        );
        await mobile.getByRole("button", { name: "Table", exact: true }).tap();
        const region = mobile.getByRole("region", {
          name: "Daily activity data; scroll horizontally on small screens",
          exact: true,
        });
        await region.focus();
        const before = await region.evaluate((el) => ({
          x: el.scrollLeft,
          overflow: el.scrollWidth > el.clientWidth,
        }));
        assert.equal(before.overflow, true);
        await mobile.keyboard.press("ArrowRight");
        await mobile.waitForFunction(
          () => document.querySelector(".table-scroll").scrollLeft > 0,
        );
        const after = await region.evaluate((el) => el.scrollLeft);
        assert.ok(after > before.x);
        await mobileContext.close();
        return {
          touchTapSelectedBucket: selected,
          tableHorizontalScrollBefore: before.x,
          tableHorizontalScrollAfter: after,
        };
      },
    );

    await check(
      "normal-runtime-console-resources-and-no-external-requests",
      async () => {
        assert.deepEqual(result.pageErrors, []);
        assert.deepEqual(result.consoleErrors, []);
        assert.deepEqual(result.responseFailures, []);
        assert.deepEqual(result.requestFailures, []);
        assert.deepEqual(result.externalRequests, []);
        return {
          pageErrors: 0,
          consoleErrors: 0,
          responseFailures: 0,
          requestFailures: 0,
          externalRequests: 0,
        };
      },
    );

    await check("loading-state", async () => {
      const isolated = await context.newPage();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await isolated.route("**/data/activity.json", async (route) => {
        await gate;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: snapshotText,
        });
      });
      await isolated.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await isolated
        .getByRole("heading", {
          name: "Loading protocol activity",
          exact: true,
        })
        .waitFor();
      assert.ok(
        await isolated
          .getByText(
            "Opening the saved snapshot for Ethereum, Arbitrum, and Base.",
            { exact: true },
          )
          .isVisible(),
      );
      release();
      await isolated
        .getByRole("heading", { name: "Protocol activity", exact: true })
        .waitFor();
      await isolated.close();
    });

    await check("snapshot-http-failure-and-retry-recovery", async () => {
      const isolated = await context.newPage();
      let attempts = 0;
      await isolated.route("**/data/activity.json", (route) => {
        attempts += 1;
        return route.fulfill(
          attempts === 1
            ? {
                status: 503,
                contentType: "text/plain",
                body: "Unavailable for test",
              }
            : {
                status: 200,
                contentType: "application/json",
                body: snapshotText,
              },
        );
      });
      await isolated.goto(baseUrl);
      await isolated
        .getByRole("heading", {
          name: "Activity could not be loaded",
          exact: true,
        })
        .waitFor();
      assert.ok(
        await isolated
          .getByText(
            "The saved snapshot is unavailable. Try loading it again.",
            { exact: true },
          )
          .isVisible(),
      );
      await isolated
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await isolated
        .getByRole("heading", { name: "Protocol activity", exact: true })
        .waitFor();
      assert.equal(attempts, 2);
      assert.deepEqual(
        (await isolated.locator(".metric-value").allTextContents()).map(
          actualNumber,
        ),
        Object.values(expectedData("all", 365).summary),
      );
      await isolated.close();
      return { initialStatus: 503, attempts: 2, recovered: true };
    });

    await check("malformed-snapshot-rejected-and-retry-recovery", async () => {
      const isolated = await context.newPage();
      let attempts = 0;
      const errors = [];
      isolated.on("pageerror", (error) => errors.push(error.message));
      await isolated.route("**/data/activity.json", (route) => {
        attempts += 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: attempts === 1 ? "{}" : snapshotText,
        });
      });
      await isolated.goto(baseUrl);
      await isolated
        .getByRole("heading", {
          name: "Activity could not be loaded",
          exact: true,
        })
        .waitFor();
      await isolated
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await isolated
        .getByRole("heading", { name: "Protocol activity", exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      assert.equal(attempts, 2);
      await isolated.close();
      return { malformedFixture: "{}", recovered: true, unhandledErrors: 0 };
    });
  } finally {
    await context.close();
    await browser.close();
  }
  result.status = result.checks.every((check) => check.passed)
    ? "passed"
    : "failed";
}

const engines = { chromium, webkit };
for (const name of browserNames) await exercise(engines[name], name);
report.finishedAt = new Date().toISOString();
report.passed =
  report.browsers.length > 0 &&
  report.browsers.every((browser) => browser.status === "passed");
if (outputDir)
  await writeFile(
    resolve(outputDir, "results.json"),
    JSON.stringify(report, null, 2),
  );
console.log(
  JSON.stringify(
    outputDir
      ? {
          passed: report.passed,
          browsers: report.browsers.map((browser) => ({
            name: browser.name,
            status: browser.status,
            passed: browser.checks.filter((check) => check.passed).length,
            failed: browser.checks
              .filter((check) => !check.passed)
              .map((check) => check.name),
          })),
          resultFile: resolve(outputDir, "results.json"),
        }
      : report,
    null,
    2,
  ),
);
process.exitCode = report.passed ? 0 : 1;
