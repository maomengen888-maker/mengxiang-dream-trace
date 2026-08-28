import { expect, test } from "@playwright/test";

test("语音转写留在首页输入框，用户确认后才继续", async ({ page }) => {
  await page.addInitScript(() => {
    class MockRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onstart?.();
        this.onresult?.({ results: [{ isFinal: true, 0: { transcript: "我梦见自己站在古井旁边" } }] });
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    const speechGlobal = globalThis as typeof globalThis & {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    speechGlobal.SpeechRecognition = MockRecognition;
    speechGlobal.webkitSpeechRecognition = MockRecognition;
  });
  await page.goto("/");

  const dreamInput = page.getByLabel("写下梦境");
  await page.getByRole("button", { name: "开始语音记录" }).click();
  await expect(dreamInput).toHaveValue("我梦见自己站在古井旁边");
  await expect(page.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeVisible();
  await page.getByRole("button", { name: "结束转写" }).click();
  await expect(page.getByText(/请先检查错字/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /昨夜有梦.*今朝见象/ })).toBeVisible();

  const animationNames = await page.locator(".home-atmosphere").evaluate((element) =>
    Array.from(element.querySelectorAll(".mist-ring, .dream-floaters i"))
      .map((item) => getComputedStyle(item).animationName),
  );
  expect(animationNames.some((name) => name !== "none")).toBe(true);

  await page.getByRole("button", { name: /开始寻象/ }).click();
  await expect(page.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeVisible();
});

test("快捷梦境从输入走到卡片并可返回纠正", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("group", { name: "梦境输入方式" })).toHaveCount(0);
  const promptButtons = page.getByLabel("常见梦境提示").getByRole("button");
  await expect(promptButtons).toHaveCount(4);
  const dreamInput = page.getByLabel("写下梦境");
  const voiceButton = page.getByRole("button", { name: "开始语音记录" });
  const inputBox = await dreamInput.boundingBox();
  const voiceBox = await voiceButton.boundingBox();
  expect(inputBox && voiceBox && voiceBox.y > inputBox.y + inputBox.height).toBeTruthy();
  const homeHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(homeHasHorizontalOverflow).toBe(false);
  await page.getByRole("button", { name: /被蛇追/ }).click();
  await expect(dreamInput).toHaveValue(/蛇一直追着我/);
  await page.getByRole("button", { name: /开始寻象/ }).click();

  await expect(page.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeVisible();
  await expect(page.getByLabel("完整转写内容")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "解梦进度" })).not.toContainText("转写");
  await expect(page.locator('input[value="蛇"]')).toBeVisible();
  await expect(page.locator('input[value="被蛇追赶"]')).toBeVisible();
  await page.getByRole("button", { name: /看起来准确/ }).click();

  await expect(page.getByRole("heading", { name: "蛇有追上或伤到你吗？" })).toBeVisible();
  await page.getByRole("button", { name: /^没有/ }).click();
  const dreamComic = page.getByAltText(/三格水墨漫画/);
  await expect(dreamComic).toBeVisible();
  await expect(dreamComic).toHaveAttribute("alt", /三格水墨漫画/);
  await expect(page.getByRole("heading", { name: "正在重现梦境" })).toBeVisible();
  await expect(page.getByText("梦境分镜 · 演示生成")).toBeVisible();
  await expect(page.locator(".immersive-processing")).toHaveClass(/stage-2/, { timeout: 2_600 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  await page.getByRole("button", { name: /跳过沉浸过程/ }).click();

  await expect(page.getByRole("heading", { name: "蛇影追逐", level: 1 })).toBeVisible();
  await expect(page.getByLabel("梦象结果卡片")).toContainText("蛇影是压力，追逐是边界被逼近");
  await expect(page.getByText("自动生成 · 仅一次")).toBeVisible();
  await expect(page.getByRole("button", { name: /重新生成/ })).toHaveCount(0);
  await expect(page.getByText("待核验来源").first()).toBeVisible();
  await page.getByRole("button", { name: /敦煌写本 P.3908/ }).click();
  await expect(page.getByText("尚未记录叶面与栏位")).toBeVisible();

  await page.getByRole("button", { name: "返回梦象确认" }).click();
  await expect(page.getByRole("heading", { name: "这是我们理解到的梦象" })).toBeVisible();
  await expect(page.getByText("修订 R2")).toBeVisible();
  await expect(page.getByText(/已返回梦象确认/)).toBeVisible();
});
