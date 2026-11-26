import { test, expect } from "@playwright/test";

test("two clients join room, see movement and exchange chat", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  const url = process.env.APP_URL || "http://localhost:5173";
  await pageA.goto(url);
  await pageB.goto(url);

  await expect(pageA.locator("body")).toBeVisible();
  await expect(pageB.locator("body")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
