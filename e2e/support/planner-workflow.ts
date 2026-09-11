import { expect, type Page } from "@playwright/test";

export const demoDestinations = [
  "Barelang Bridge",
  "Maha Vihara Duta Maitreya Temple",
  "Pantai Melur",
  "Wey Wey Seafood Nagoya",
] as const;

export async function useDeterministicExternalServices(
  page: Page,
  options: { loadImages?: boolean } = {},
) {
  if (!options.loadImages) {
    await page.route("https://picsum.photos/**", (route) => route.abort());
  }
  await page.route("**/api/travel-estimate", async (route) => {
    const input = route.request().postDataJSON() as {
      origin: { latitude: number; longitude: number };
      destination: { latitude: number; longitude: number };
      mode: "car" | "motorcycle" | "walking";
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        estimate: {
          distanceMeters: 4_200,
          durationSeconds: input.mode === "walking" ? 900 : 600,
          mode: input.mode,
          geometry: [input.origin, input.destination],
          warnings: [],
        },
      }),
    });
  });
}

async function chooseSelectOption(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

export async function buildDemoTrip(
  page: Page,
  options: { paceMs?: number } = {},
) {
  const pause = () =>
    options.paceMs ? page.waitForTimeout(options.paceMs) : Promise.resolve();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where do you want to go?" })).toBeVisible();
  await page.getByRole("button", { name: "Create new trip" }).first().click();
  await pause();

  for (const name of demoDestinations) {
    await page.getByRole("button", { name: `Add ${name} to Trip` }).click();
    await pause();
  }
  await page
    .getByRole("button", { name: "Set Harris Hotel Batam Center as Accommodation" })
    .click();
  await expect(page.getByText("4 selected")).toBeVisible();
  await pause();

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await pause();
  await page.getByLabel("Trip name").fill("Batam highlights");
  await chooseSelectOption(page, "#arrival-terminal", "Batam Centre Ferry Terminal");
  await page.locator("#arrival-date").fill("2026-10-10");
  await page.locator("#arrival-time").fill("08:30");
  await chooseSelectOption(page, "#departure-terminal", "Harbour Bay Ferry Terminal");
  await page.locator("#departure-date").fill("2026-10-11");
  await page.locator("#departure-time").fill("18:00");
  await page
    .getByRole("radio", { name: "Car / taxi / ride-hailing", exact: true })
    .click();
  await page.getByRole("radio", { name: "10 minutes", exact: true }).click();
  await page.getByRole("button", { name: "Use current order" }).click();
  await pause();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("tab", { name: "Itinerary" }).click();
  await pause();
  await page.getByRole("button", { name: "Build itinerary" }).click();
  await expect(page.getByText("Itinerary ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Day 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Day 2/ })).toBeVisible();
}
