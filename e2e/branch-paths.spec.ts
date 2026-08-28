import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeVisible();
  await page.waitForTimeout(100);
});

test("模糊水面经单轮澄清后得到有保留的解释", async ({ page }) => {
  await page.getByLabel("写下梦境").fill("我梦见眼前是一片看不清的水面，四周很安静。");
  await page.getByRole("button", { name: /开始寻象/ }).click();
  await expect(page.locator(".uncertain-line")).toContainText("自己与水面的位置关系");
  await page.getByRole("button", { name: /看起来准确/ }).click();

  await expect(page.getByRole("heading", { name: "你在岸边，还是已经进入水中？" })).toBeVisible();
  await page.getByRole("button", { name: /^岸边/ }).click();
  await expect(page.getByText(/聚焦水之间的关系/)).toBeVisible();
  await page.getByRole("button", { name: /跳过沉浸过程/ }).click();

  await expect(page.getByRole("heading", { name: "水面未明", level: 1 })).toBeVisible();
  await expect(page.locator(".certainty-badge")).toHaveText("有保留");
  await expect(page.locator(".reading-panel blockquote")).toContainText("岸边是观望，水面是未知");
});

test("现代手机碎屏显示无直接出处且不强行类比", async ({ page }) => {
  await page.getByLabel("写下梦境").fill("我梦见手机屏幕突然碎裂，所有消息都看不清了。");
  await page.getByRole("button", { name: /开始寻象/ }).click();
  await expect(page.locator('input[value="手机屏幕"]')).toBeVisible();
  await page.getByRole("button", { name: /看起来准确/ }).click();
  await page.getByRole("button", { name: /跳过沉浸过程/ }).click();

  await expect(page.getByRole("heading", { name: "碎屏之梦", level: 1 })).toBeVisible();
  await expect(page.getByText("暂无直接记载")).toBeVisible();
  await expect(page.getByText(/不会强行类比/)).toBeVisible();
  await expect(page.getByText("古镜")).toHaveCount(0);

  await page.getByRole("button", { name: /敦煌写本 P.3908/ }).click();
  await expect(page.getByText("暂无候选条目")).toBeVisible();
  await expect(page.getByText("本次未找到可核验位置")).toBeVisible();
});
