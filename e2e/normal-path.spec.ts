import { expect, test } from "@playwright/test";

test("正常演示路径从输入走到卡片并可返回纠正", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^语音记录/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "填入示例梦境" }).click();
  await expect(page.getByLabel("写下梦境")).toHaveValue(/古井/);
  await page.getByRole("button", { name: /确认梦境/ }).click();

  const transcript = page.getByLabel("完整转写内容");
  await expect(transcript).toHaveValue(/古镜/);
  await transcript.fill((await transcript.inputValue()).replace("古镜", "古井"));
  await page.getByRole("button", { name: /确认内容/ }).click();

  await expect(page.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeVisible();
  await expect(page.locator('input[value="古井"]')).toBeVisible();
  await page.locator('input[value="害怕"]').fill("紧张");
  await page.getByRole("button", { name: "删除蛇靠近古井" }).click();
  await page.getByRole("button", { name: /看起来准确/ }).click();

  await page.getByRole("button", { name: /^没有/ }).click();
  await page.getByRole("button", { name: /跳过演示动效/ }).click();

  await expect(page.getByRole("heading", { name: "井畔之蛇", level: 1 })).toBeVisible();
  await expect(page.getByLabel("梦象结果卡片")).toContainText("旧宅是过去，古井是深处，蛇是警觉");
  await expect(page.getByText("自动生成 · 仅一次")).toBeVisible();
  await expect(page.getByRole("button", { name: /重新生成/ })).toHaveCount(0);
  await expect(page.getByText("待核验来源").first()).toBeVisible();
  await page.getByRole("button", { name: /敦煌写本 P.3908/ }).click();
  await expect(page.getByText("尚未记录叶面与栏位")).toBeVisible();

  await page.getByRole("button", { name: /纠正梦象/ }).first().click();
  await expect(page.getByText("修订 R2")).toBeVisible();
  await expect(page.getByText(/旧解释与旧卡片已失效/)).toBeVisible();
});
