// Browser end-to-end tests in DEMO mode (no database needed).
// Run:  npm run build && ALLOW_DEMO_ROLES=true scripts/with-server.sh npm run test:e2e
// First time only:  npx playwright install chromium
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE ?? "http://localhost:3000";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const results = [];
const problems = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/tile\.openstreetmap|Failed to load resource/.test(m.text())) problems.push(`console ${page.url()}: ${m.text()}`);
});

/** Runs axe on the current page; returns serious/critical violations. */
async function a11y(name) {
  await page.addScriptTag({ content: axeSource });
  const v = await page.evaluate(async () => {
    // @ts-expect-error injected
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return r.violations
      .filter((x) => x.impact === "serious" || x.impact === "critical")
      .map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target?.join(" ")}`);
  });
  ok(`a11y: ${name}`, v.length === 0, v.join(" | "));
}

try {
  // ---------- Public ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector("text=Recently verified stations");
  ok("home shows demo banner", (await page.locator("text=Demo mode — every station shown is fictional").count()) === 1);
  ok("home lists verified stations", (await page.locator("text=View details").count()) === 3);
  ok("page title", (await page.title()).includes("ChargeSetu"));
  ok("favicon linked", (await page.locator("link[rel=icon]").count()) > 0);
  await a11y("home");

  await page.fill("#home-q", "bandra");
  await page.click("form[role=search] button[type=submit]");
  await page.waitForURL(/\/stations\?q=bandra/);
  await page.waitForSelector("text=/\\d+ stations? found/");
  ok("home search opens directory", true);

  await page.goto(`${BASE}/stations`);
  await page.waitForSelector("text=14 stations found");
  await a11y("stations list");
  await page.selectOption("#city", "Mumbai");
  await page.selectOption("#connector", "ccs2");
  await page.click("text=Apply filters");
  await page.waitForSelector("text=2 stations found");
  ok("filters: Mumbai + CCS2 = 2", true);

  await page.goto(`${BASE}/stations`);
  await page.click("nav[aria-label='Quick filters'] >> text=Verified only");
  await page.waitForURL(/verified=1/);
  await page.waitForSelector("text=/\\d+ stations? found/");
  const verifiedCount = await page.locator("ul >> li >> text=Not yet verified").count();
  ok("quick filter: verified only", verifiedCount === 0, await page.locator("[aria-live=polite]").first().innerText());

  await page.goto(`${BASE}/stations?view=map`);
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  await page.waitForTimeout(1000);
  ok("map renders markers", (await page.locator(".leaflet-interactive").count()) >= 10);

  await page.goto(`${BASE}/stations?q=zzzz-nothing`);
  await page.waitForSelector("text=No stations match");
  ok("empty state", true);

  await page.goto(`${BASE}/stations/greenplug-linking-road-hub-demo`);
  await page.waitForSelector("h1:has-text('GreenPlug Linking Road Hub')");
  ok("detail: verified price", (await page.locator("text=₹21/kWh").count()) > 0);
  ok("detail: demo warning", (await page.locator("text=Fictional demo listing").count()) > 0);
  ok("detail: freshness label", (await page.locator("text=/Verified (today|yesterday|\\d+ days ago|\\d+ months ago)/").count()) > 0);
  ok("detail: title", (await page.title()).includes("GreenPlug Linking Road Hub"));
  const dir = await page.locator("a:has-text('Directions')").first().getAttribute("href");
  ok("detail: directions link", dir?.startsWith("https://www.google.com/maps/dir/?api=1&destination=19.0607,72.8362") ?? false);
  await a11y("station detail");

  await page.goto(`${BASE}/stations/chargekaro-andheri-metro-parking-demo`);
  await page.waitForSelector("h1");
  ok("unverified station hides price", (await page.locator("text=Price not yet verified").count()) > 0);

  await page.goto(`${BASE}/stations/does-not-exist`);
  await page.waitForSelector("text=Station not found");
  ok("missing station: not-found UI + noindex", (await page.locator("meta[name=robots][content*=noindex]").count()) > 0);
  await page.goto(`${BASE}/stations/greenplug-powai-lakeside-demo`);
  await page.waitForSelector("text=Station not found");
  ok("pending station not public", true);

  for (const [path, heading] of [["/about", "How we verify"], ["/contact", "Contact & support"], ["/privacy", "Privacy Policy"], ["/terms", "Terms of Use"]]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForSelector(`h1:has-text("${heading}")`);
    ok(`page ${path}`, true);
  }
  ok("legal pages marked as draft", (await page.locator("text=Draft — not yet reviewed by a lawyer").count()) === 1);
  await a11y("terms");

  // Report flow
  await page.goto(`${BASE}/report?station=00000000-0000-4000-8000-d00000000001`);
  await page.waitForSelector("#f-stationId");
  await a11y("report form");
  await page.click("text=Send report");
  await page.waitForSelector("text=Choose what's wrong");
  ok("report: validation errors", (await page.locator("text=Please add a few more details").count()) > 0);
  await page.selectOption("#f-issueType", "wrong_hours");
  await page.fill("#f-description", "Closes at 9 PM now according to the guard.");
  await page.fill("#f-reporterEmail", " driver@example.com ");
  await page.waitForTimeout(3200);
  await page.click("text=Send report");
  await page.waitForSelector("text=Report sent");
  ok("report: submitted", true);

  // ---------- Mobile ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/stations`);
  await mp.waitForSelector("text=14 stations found");
  ok("mobile: bottom nav", await mp.locator("nav[aria-label=Main]").last().isVisible());
  ok("mobile: quick filters visible", await mp.locator("nav[aria-label='Quick filters']").isVisible());
  ok("mobile: filters collapsed", !(await mp.locator("#city").isVisible()));
  await mp.click("button:has-text('Filters')");
  ok("mobile: filters expand", await mp.locator("#city").isVisible());
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("mobile: no horizontal page scroll", overflow <= 1, `${overflow}px`);
  await mobile.close();

  // ---------- Access control ----------
  await page.goto(`${BASE}/admin`);
  await page.waitForSelector("text=Sign in as an admin");
  ok("anon blocked from admin", (await page.locator("h2:has-text('Pending submissions')").count()) === 0);
  await page.goto(`${BASE}/login?next=/stations`);
  await page.click("text=Continue as driver");
  await page.waitForURL((u) => u.pathname === "/stations");
  await page.goto(`${BASE}/admin`);
  await page.waitForSelector("text=You don't have access");
  ok("driver blocked from admin", true);
  await page.goto(`${BASE}/operator`);
  await page.waitForSelector("text=You don't have access");
  ok("driver blocked from operator portal", true);

  // ---------- Operator ----------
  await page.goto(`${BASE}/login?next=/operator`);
  await page.click("text=Continue as operator");
  await page.waitForURL((u) => u.pathname === "/operator");
  await page.waitForSelector("h1:has-text('Operator dashboard')");
  ok("operator sees own stations only", (await page.locator("text=ChargeKaro").count()) === 0);
  ok("operator sees rejection feedback", (await page.locator("text=Reviewer feedback").count()) > 0);
  await page.goto(`${BASE}/admin`);
  await page.waitForSelector("text=You don't have access");
  ok("operator blocked from admin", true);

  await page.goto(`${BASE}/operator/stations/new`);
  await page.waitForSelector("#f-name");
  await a11y("station form");
  await page.fill("#f-name", "GreenPlug Phoenix Mall Test (Demo)");
  await page.fill("#f-network", "GreenPlug (Demo)");
  await page.fill("#f-address", "Level B1 (fictional), Phoenix Mall, Lower Parel");
  await page.fill("#f-area", "Lower Parel");
  await page.fill("#f-city", "Mumbai");
  await page.selectOption("#f-state", "Maharashtra");
  await page.fill("#f-latitude", "51.5");
  await page.fill("#f-longitude", "72.8258");
  await page.check("input[name=connectorTypes][value=ccs2]");
  await page.fill("#f-powerKw", "60");
  await page.fill("#f-openingHours", "10 AM–11 PM");
  await page.fill("#f-contactPhone", "+1 415 555 0100");
  await page.click("text=Submit for review");
  await page.waitForSelector("text=Latitude must be within India");
  ok("validation: latitude bounds", true);
  ok("validation: price required", (await page.locator("text=Enter a price").count()) > 0);
  ok("validation: Indian phone", (await page.locator("text=Enter an Indian number").count()) > 0);
  ok("form keeps text, select and checkbox values", (await page.inputValue("#f-name")).includes("Phoenix") && (await page.inputValue("#f-state")) === "Maharashtra" && (await page.isChecked("input[name=connectorTypes][value=ccs2]")));
  await page.fill("#f-latitude", "18.9947");
  await page.fill("#f-price", "23.5");
  await page.fill("#f-contactPhone", "98765 43210");
  await page.click("text=Submit for review");
  await page.waitForURL(/notice=submitted/);
  await page.waitForSelector("li:has-text('Phoenix Mall Test') >> text=Pending review");
  ok("station submitted as pending", true);

  await page.goto(`${BASE}/stations?q=phoenix`);
  await page.waitForSelector("text=No stations match");
  ok("pending station hidden from public", true);

  await page.goto(`${BASE}/operator`);
  await page.locator("li:has-text('Phoenix Mall Test') >> text=Edit").click();
  await page.waitForSelector("text=Save and resubmit");
  ok("edit form shows normalised phone", (await page.inputValue("#f-contactPhone")) === "+91 98765 43210");
  await page.fill("#f-openingHours", "24 hours");
  await page.click("text=Save and resubmit");
  await page.waitForURL(/notice=updated/);
  ok("operator edit saved", true);

  await page.goto(`${BASE}/operator/stations/00000000-0000-4000-8000-d00000000003/edit`);
  await page.waitForSelector("text=Station not found");
  ok("operator can't edit another operator's station", (await page.locator("#f-name").count()) === 0);

  // ---------- Admin ----------
  await page.goto(`${BASE}/login?next=/admin`);
  await page.click("text=Continue as admin");
  await page.waitForURL((u) => u.pathname === "/admin");
  await page.waitForSelector("h2:has-text('Pending submissions')");
  await a11y("admin");
  const pendingCard = page.locator("section[aria-labelledby=pending-h] li:has-text('Phoenix Mall Test')");
  ok("admin sees new pending station", (await pendingCard.count()) === 1);
  ok("admin sees who submitted it", (await pendingCard.locator("text=GreenPlug Demo Networks").count()) > 0);
  ok("admin sees operator accounts", (await page.locator("h2:has-text('Operator accounts')").count()) === 1);
  const pendingBefore = Number((await page.locator("dl > div:has-text('Pending review') dd").innerText()).trim());
  await pendingCard.locator("text=Approve & verify").click();
  await page.waitForFunction(() => !document.querySelector("section[aria-labelledby=pending-h]")?.textContent?.includes("Phoenix Mall Test"));
  const pendingAfter = Number((await page.locator("dl > div:has-text('Pending review') dd").innerText()).trim());
  ok("approve updates pending count", pendingAfter === pendingBefore - 1, `${pendingBefore} -> ${pendingAfter}`);

  const gachi = page.locator("section[aria-labelledby=pending-h] li:has-text('Gachibowli')");
  await gachi.locator("summary:has-text('Reject')").click();
  await gachi.locator("textarea[name=reason]").fill("Please add a photo of the charger and the full address.");
  await gachi.locator("text=Confirm rejection").click();
  await page.waitForFunction(() => !document.querySelector("section[aria-labelledby=pending-h]")?.textContent?.includes("Gachibowli"));
  ok("reject with reason", true);

  const reportsBefore = await page.locator("section[aria-labelledby=reports-h] li").count();
  await page.locator("section[aria-labelledby=reports-h] li").first().locator("button:has-text('Resolve')").click();
  await page.waitForFunction((n) => document.querySelectorAll("section[aria-labelledby=reports-h] li").length === n - 1, reportsBefore);
  ok("report resolved", true);

  await page.goto(`${BASE}/admin/stations/00000000-0000-4000-8000-d00000000003`);
  await page.waitForSelector("text=Save changes");
  await page.fill("#f-openingHours", "6 AM–11 PM");
  await page.click("text=Save changes");
  await page.waitForURL(/notice=saved/);
  ok("admin edit saved", true);

  await page.goto(`${BASE}/admin/stations/00000000-0000-4000-8000-d00000000003`);
  await page.click("button:has-text('Deactivate')");
  await page.waitForSelector("button:has-text('Re-publish')");
  ok("admin deactivate", true);
  await page.goto(`${BASE}/stations/chargekaro-andheri-metro-parking-demo`);
  await page.waitForSelector("text=Station not found");
  ok("deactivated station hidden", true);

  await page.goto(`${BASE}/stations?q=phoenix`);
  await page.waitForSelector("text=1 station found");
  ok("approved station public with verified price", (await page.locator("text=₹23.5/kWh").count()) > 0);
} catch (err) {
  results.push(`FAIL exception at ${page.url()}: ${err.message.split("\n")[0]}`);
  const shot = process.env.E2E_FAILURE_SCREENSHOT ?? "e2e-failure.png";
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  results.push(`     screenshot saved to ${shot}; visible text: ${(await page.locator("main").innerText().catch(() => "")).slice(0, 300).replace(/\s+/g, " ")}`);
  process.exitCode = 1;
}

await browser.close();
console.log(results.join("\n"));
const passed = results.filter((r) => r.startsWith("ok")).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log(problems.length ? `\nBrowser problems:\n${[...new Set(problems)].join("\n")}` : "No browser console/page errors.");
if (problems.length) process.exitCode = 1;
