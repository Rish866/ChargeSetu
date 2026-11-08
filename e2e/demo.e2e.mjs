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
  await page.goto(`${BASE}/stations?city=Mumbai&connector=ccs2`);
  await page.waitForSelector("text=2 stations found");
  ok("filters: Mumbai + CCS2 = 2", true);

  // New nationwide filters (state / AC-DC / vehicle) via the form.
  await page.goto(`${BASE}/stations`);
  await page.waitForSelector("text=14 stations found");
  await page.selectOption("#state", "Maharashtra");
  await page.selectOption("#current", "DC");
  await page.click("text=Apply filters");
  await page.waitForURL(/state=Maharashtra/);
  await page.waitForSelector("text=/\\d+ stations? found/");
  ok("filters: state + DC applied via form", page.url().includes("current=DC"));
  await page.goto(`${BASE}/stations?state=Kerala`);
  await page.waitForSelector("text=No stations match your filters");
  ok("filters: empty state shows message", true);

  await page.goto(`${BASE}/stations`);
  await page.click("nav[aria-label='Quick filters'] >> text=Verified only");
  await page.waitForURL(/verified=1/);
  await page.waitForSelector("text=/\\d+ stations? found/");
  const verifiedCount = await page.locator("ul >> li >> text=Not yet verified").count();
  ok("quick filter: verified only", verifiedCount === 0, await page.locator("[aria-live=polite]").first().innerText());

  await page.goto(`${BASE}/stations?view=map`);
  await page.waitForSelector(".leaflet-container", { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.waitForResponse((r) => r.url().includes("/api/map") && r.status() === 200, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1500);
  ok("map renders clustered markers from /api/map", (await page.locator(".leaflet-marker-icon, .leaflet-interactive").count()) >= 1);
  const apiRes = await page.request.get(`${BASE}/api/map?minLat=6&maxLat=37&minLng=68&maxLng=97&zoom=5`);
  const apiJson = await apiRes.json();
  ok("api/map returns points", apiRes.status() === 200 && Array.isArray(apiJson.points) && apiJson.points.length >= 1);
  const bad = await page.request.get(`${BASE}/api/map?minLat=abc`);
  ok("api/map rejects bad input", bad.status() === 400);

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
  ok("mobile: filters collapsed", !(await mp.locator("#state").isVisible()));
  await mp.click("button:has-text('Filters')");
  ok("mobile: filters expand", await mp.locator("#state").isVisible());
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

  // ---------- Station leads (admin) ----------
  await page.goto(`${BASE}/admin/leads`);
  await page.waitForSelector("h1:has-text('Station leads')");
  ok("leads: list shows demo leads", (await page.locator("text=VoltYatra Thane Station Road (Demo lead)").count()) === 1);
  ok("leads: missing fields shown", (await page.locator("text=Still needed before publishing").count()) >= 2);
  await a11y("leads list");
  await page.locator("li:has-text('VoltYatra Thane Station Road')").getByRole("link", { name: "Review", exact: true }).click();
  await page.waitForSelector("text=Create a station from this lead");
  ok("leads: form prefilled from lead", (await page.inputValue("#f-name")) === "VoltYatra Thane Station Road (Demo lead)" && (await page.isChecked("input[name=connectorTypes][value=ccs2]")) && (await page.inputValue("#f-powerKw")) === "60");
  ok("leads: nothing invented", (await page.inputValue("#f-latitude")) === "" && (await page.inputValue("#f-openingHours")) === "" && (await page.inputValue("#f-connectorCount")) === "");
  await page.click("text=Create station (pending review)");
  await page.waitForSelector("text=Latitude must be a number");
  ok("leads: can't convert without confirmed coordinates", true);
  await page.fill("#f-latitude", "19.1860");
  await page.fill("#f-longitude", "72.9750");
  await page.fill("#f-area", "Thane West");
  await page.fill("#f-connectorCount", "2");
  await page.fill("#f-openingHours", "24 hours");
  await page.fill("#f-price", "20");
  await page.click("text=Create station (pending review)");
  await page.waitForURL(/notice=from-lead/);
  await page.waitForSelector("text=Station created from the lead");
  ok("leads: converted into a pending station", (await page.locator("text=Pending review").count()) > 0 && (await page.locator("text=Not yet verified").count()) > 0);
  await page.goto(`${BASE}/stations?q=thane%20station%20road`);
  await page.waitForSelector("text=No stations match");
  ok("leads: converted station hidden until approved", true);
  await page.goto(`${BASE}/admin/leads?status=converted`);
  await page.waitForSelector("text=VoltYatra Thane Station Road");
  ok("leads: lead marked converted", (await page.locator("text=Converted to station").count()) === 1);
  // Reject the other lead
  await page.goto(`${BASE}/admin/leads/00000000-0000-4000-8000-f10000000002`);
  await page.fill("#lead-note", "Not public — residents only");
  await page.click("button:has-text('Reject lead')");
  await page.waitForSelector("text=This lead has already been handled");
  ok("leads: reject a lead", true);

  // Non-admins can't see leads
  await page.goto(`${BASE}/login?next=/admin/leads`);
  await page.click("text=Continue as operator");
  await page.waitForURL((u) => u.pathname === "/admin/leads");
  await page.waitForSelector("text=You don't have access");
  ok("leads: operator blocked", (await page.locator("text=VoltYatra Thane").count()) === 0);

  // ---- Nationwide import (fictional fixture file uploaded through the admin screen) ----
  await page.goto(`${BASE}/login?next=/admin/data`);
  await page.click("text=Continue as admin");
  await page.waitForURL((u) => u.pathname === "/admin/data");
  await page.waitForSelector("text=Import and publish");
  await a11y("admin data");
  await page.setInputFiles("#import-file", "tests/fixtures/sample-clean.csv");
  await page.waitForSelector("text=/30 importable stations in 1 states/");
  ok("import: only level-B readable rows importable (OSM, level C, garbled text skipped)", (await page.locator("text=/5 rows skipped/").count()) === 1);
  await page.click("button:has-text('Import 30 stations')");
  await page.waitForSelector("text=/Finished: 30 added, 0 already existed/", { timeout: 60000 });
  ok("import: 30 rows added (hidden)", true);
  await page.click("button:has-text('Import 30 stations')");
  await page.waitForSelector("text=/Finished: 0 added, 30 already existed/", { timeout: 60000 });
  ok("import: re-run is idempotent", true);
  await page.goto(`${BASE}/stations?state=Goa`);
  await page.waitForSelector("text=No stations match your filters");
  ok("import: hidden by default (not public)", true);
  await page.goto(`${BASE}/admin/data`);
  await page.selectOption("select >> nth=0", "Goa");
  await page.click("button:has-text('Publish imported')");
  await page.waitForSelector("text=/Published 30 stations \\(Goa\\)/", { timeout: 60000 });
  ok("import: all 30 imported rows publishable in the test environment", true);
  await page.goto(`${BASE}/stations?state=Goa`);
  await page.waitForSelector("text=30 stations found");
  await a11y("stations: source-listed");
  ok("directory: 24 per page with pagination", (await page.locator("main li >> text=Source-listed").count()) === 24 && (await page.locator("nav[aria-label='Pagination']").count()) === 1);
  ok("directory: never shown as verified", (await page.locator("main li >> text=\"Verified\"").count()) === 0);
  await page.goto(`${BASE}/stations?state=Goa&page=2`);
  await page.waitForSelector("text=Page 2 of 2");
  ok("directory: page 2 works", true);
  await page.goto(`${BASE}/stations?state=Goa&q=panaji`);
  await page.waitForSelector("text=/\\d+ stations? found/");
  await page.locator("main li a:has-text('Fixture Net')").first().click();
  await page.waitForSelector("text=Operational status not confirmed");
  ok("detail: shows unconfirmed-status banner", true);
  await page.waitForSelector("h2:has-text('Charging points')", { timeout: 10000 });
  ok("detail: unknown hours shown honestly", (await page.locator("text=Not provided by source").count()) >= 1);
  ok("detail: charging points table", (await page.locator("h2:has-text('Charging points')").count()) === 1);
  ok("detail: attribution to BEE", (await page.locator("text=Bureau of Energy Efficiency").count()) >= 1);
  const detailUrl = page.url();

  // Hiding demo data is refused until a lot of real stations are live
  await page.goto(`${BASE}/admin/data`);
  await page.fill("input[aria-label='Type HIDE DEMO to confirm']", "HIDE DEMO");
  await page.click("button:has-text('Hide demo stations')");
  await page.waitForSelector("text=/Refused: fewer than 500/");
  ok("demo hide refused while real data is small", true);
  const backup = await page.request.get(`${BASE}/admin/data/demo-backup`);
  ok("demo backup downloadable by admin", backup.status() === 200 && (await backup.text()).includes("GreenPlug"));

  // Operator claims a source-listed station; admin reviews it
  await page.goto(`${BASE}/login?next=${encodeURIComponent(new URL(detailUrl).pathname + "/claim")}`);
  await page.click("text=Continue as operator");
  await page.waitForSelector("text=Claim this station");
  await page.fill("#f-evidence", "Our company runs this fixture outlet under a dealer agreement.");
  await page.click("button:has-text('Submit claim')");
  await page.waitForSelector("text=Claim received");
  ok("claim: operator submitted", true);
  await page.goto(`${BASE}/login?next=/admin/claims`);
  await page.click("text=Continue as admin");
  await page.waitForSelector("text=dealer agreement");
  await page.click("button:has-text('Approve')");
  await page.waitForSelector("text=No claims waiting");
  ok("claim: admin approved", true);
  const anon = await (await browser.newContext()).newPage();
  const dataRes = await anon.goto(`${BASE}/admin/data`);
  ok("admin/data hidden from visitors", (await anon.locator("text=Sign in").count()) > 0 && (await anon.locator("text=State dashboard").count()) === 0, String(dataRes?.status()));
  const anonBackup = await anon.request.get(`${BASE}/admin/data/demo-backup`);
  ok("demo backup forbidden to visitors", anonBackup.status() === 403);
  const anonClaim = await anon.goto(`${BASE}/stations/nonexistent/claim`);
  ok("claim page for missing station is a not-found page", (await anon.locator("text=/not found/i").count()) > 0, String(anonClaim?.status()));
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
