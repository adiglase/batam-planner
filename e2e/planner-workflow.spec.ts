import { expect, test } from "@playwright/test";
import {
  buildDemoTrip,
  demoDestinations,
  useDeterministicExternalServices,
} from "./support/planner-workflow";

test.beforeEach(async ({ page }) => {
  await useDeterministicExternalServices(page);
});

test("Visitor builds a complete two-day, four-Destination Itinerary", async ({ page }) => {
  await buildDemoTrip(page);

  const visits = page.getByRole("listitem", { name: /^Visit / });
  const visitLabels = await visits.evaluateAll((items) =>
    items.map((item) => item.getAttribute("aria-label") ?? ""),
  );
  for (const destination of demoDestinations) {
    expect(visitLabels.filter((label) => label.startsWith(`Visit ${destination},`))).toHaveLength(1);
  }
  await expect(page.getByText(/Traffic-unaware estimates/)).toBeVisible();
  await expect(page.locator(".itinerary-actions")).toHaveCSS("position", "sticky");
  const timelineEntries = page.getByRole("listitem", { name: /^(Visit|Travel) / });
  expect(await timelineEntries.count()).toBeGreaterThanOrEqual(9);
  expect(await page.locator(".map-route-leg").count()).toBeGreaterThanOrEqual(5);
  await timelineEntries.last().scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Build again" })).toBeVisible();
});

test("a failed Rebuild keeps the last feasible Itinerary", async ({ page }) => {
  await buildDemoTrip(page);
  const previousEntries = await page
    .getByRole("listitem", { name: /^(Visit|Travel) / })
    .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));

  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await page.getByRole("tab", { name: "Trip details" }).click();
  await page.locator("#visit-duration-destination-barelang-bridge").fill("2000");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Itinerary" }).click();
  await expect(page.getByText("Needs rebuilding", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rebuild itinerary" }).click();
  await expect(page.getByText("No complete Itinerary fits", { exact: true })).toBeVisible();
  const preservedEntries = await page
    .getByRole("listitem", { name: /^(Visit|Travel) / })
    .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));
  expect(preservedEntries).toEqual(previousEntries);
  await expect(page.getByText("Needs rebuilding", { exact: true })).toBeVisible();
});

test("divider, workspace context, editing, and map-timeline focus stay synchronized", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const divider = page.getByRole("separator", { name: "Resize map and workspace" });
  const startingShare = isMobile ? "45" : "60";
  await expect(divider).toHaveAttribute("aria-valuenow", startingShare);
  const bounds = (await divider.boundingBox())!;
  if (isMobile) {
    await divider.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      clientX: bounds.x + bounds.width / 2,
      clientY: bounds.y + bounds.height / 2,
    });
    await divider.dispatchEvent("pointermove", {
      pointerId: 7,
      pointerType: "touch",
      clientX: bounds.x + bounds.width / 2,
      clientY: 10_000,
    });
    await divider.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "touch",
      clientX: bounds.x + bounds.width / 2,
      clientY: 10_000,
    });
  } else {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(10_000, bounds.y + bounds.height / 2);
    await page.mouse.up();
  }
  await expect(divider).toHaveAttribute("aria-valuenow", "65");
  await divider.focus();
  for (let index = 0; index < 10; index += 1) {
    await divider.press(isMobile ? "ArrowUp" : "ArrowLeft");
  }
  await expect(divider).toHaveAttribute("aria-valuenow", "35");

  await buildDemoTrip(page);
  const firstVisit = page.getByRole("listitem", { name: /^Visit / }).first();
  const visitName = (await firstVisit.getAttribute("aria-label"))!.split(",")[0].replace("Visit ", "");
  await page.mouse.move(0, 0);
  await firstVisit.focus();
  await expect(page.locator(".map-caption strong")).toHaveText(visitName);

  const firstTravel = page.getByRole("listitem", { name: /^Travel from / }).first();
  const firstTravelLabel = await firstTravel.getAttribute("aria-label");
  await firstTravel.focus();
  await expect(page.locator(".map-caption strong")).toHaveText(
    firstTravelLabel!.split(",")[0],
  );

  const mapVisit = page.getByRole("button", {
    name: new RegExp(`Visit \\d+: ${visitName}`),
  });
  await mapVisit.focus();
  await expect(firstVisit).toHaveAttribute("data-focused", "true");

  const mapLeg = page.getByRole("button", { name: /^Travel from / }).first();
  const legLabel = await mapLeg.getAttribute("aria-label");
  await mapLeg.focus();
  await expect(page.getByRole("listitem", { name: legLabel! })).toHaveAttribute(
    "data-focused",
    "true",
  );

  await expect(page.getByRole("button", { name: "Done" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await page.getByRole("tab", { name: "Trip details" }).click();
  await expect(page.getByLabel("Trip name")).toBeVisible();
  await page.getByRole("tab", { name: "Discover" }).click();
  const zoomIn = page.getByRole("button", { name: "Zoom in on illustrated map" });
  while (await zoomIn.isEnabled()) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await page.getByRole("tab", { name: "Trip details" }).click();
  await page.getByRole("tab", { name: "Discover" }).click();
  await expect(zoomIn).toBeDisabled();
  await page.getByLabel("Search Destinations").fill("Temple");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("checkbox", { name: "Culture & worship" }).click();
  if (isMobile) {
    await page.getByRole("button", { name: "Done" }).click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "View details for Maha Vihara Duta Maitreya Temple" })
    .first()
    .focus();
  await expect(page.locator(".map-caption strong")).toHaveText(
    "Maha Vihara Duta Maitreya Temple",
  );
  await page.getByRole("tab", { name: "Trip details" }).click();
  await page.getByRole("tab", { name: "Discover" }).click();
  await expect(page.getByLabel("Search Destinations")).toHaveValue("Temple");
  await expect(
    page.getByRole("button", {
      name: "Remove Culture & worship category filter",
    }),
  ).toBeVisible();
  await expect(page.locator(".map-caption strong")).toHaveText(
    "Maha Vihara Duta Maitreya Temple",
  );
  await expect(page.getByText("Batam highlights", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("tab", { name: "Itinerary" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Batam highlights", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Discover" }).click();
  await expect(page.getByLabel("Search Destinations")).toHaveValue("Temple");
});
