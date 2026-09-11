import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  buildDemoTrip,
  useDeterministicExternalServices,
} from "./support/planner-workflow";

test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });

test("@demo record the Batam Planner walkthrough", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chrome-desktop", "One canonical demo recording");
  await useDeterministicExternalServices(page, { loadImages: true });

  await page.goto("/");
  await page.waitForTimeout(1_000);
  await page.getByLabel("Search Destinations").fill("Barelang");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.waitForTimeout(800);
  await buildDemoTrip(page, { paceMs: 700 });
  await page.waitForTimeout(1_000);

  await page.getByRole("button", { name: /Day 2/ }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Day 1/ }).click();
  const firstVisit = page.getByRole("listitem", { name: /^Visit / }).first();
  await firstVisit.focus();
  await page.waitForTimeout(1_000);
  await expect(page.getByText("Itinerary ready", { exact: true })).toBeVisible();

  const video = page.video();
  await page.close();
  if (video) {
    const artifacts = path.resolve(process.cwd(), "artifacts");
    await mkdir(artifacts, { recursive: true });
    await video.saveAs(path.join(artifacts, "batam-planner-demo.webm"));
  }
});
