import test from "node:test";
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { chromePath } from "../../packages/capture/tools.ts";
import { dataDir } from "../../packages/storage/paths.ts";

test("desktop Chrome creates two projects, edits a script, runs a fixture job and reopens after process termination", {
  timeout: 45000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "productfilm-e2e-"));
  let child: ChildProcess | undefined;
  async function start(port: string) {
    child = fork(new URL("../../apps/server/main.ts", import.meta.url), [], {
      silent: true,
      env: { ...process.env, PRODUCTFILM_DATA_DIR: root, PRODUCTFILM_PORT: port },
    });
    let errors = "";
    child.stderr?.on("data", (d) => {
      errors += d;
    });
    if (!child.stdout) throw new Error("missing server stdout");
    for await (const chunk of child.stdout) {
      const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) return url;
    }
    throw new Error(`server startup: ${errors}`);
  }
  async function stop(signal: NodeJS.Signals) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, "exit");
    child.kill(signal);
    await exit;
  }
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    chromiumSandbox: true,
  });
  try {
    const address = await start("0");
    const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
    await page.goto(address);
    const dir = join(dataDir(), "reports", `workbench-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const library = page.getByRole("button", { name: /^项目库/ });
    async function selectProject(title: string) {
      await library.click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(title) })
        .click();
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
    }
    await library.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await library.evaluate((el) => el === document.activeElement), true);
    await page.getByRole("button", { name: /编辑实证讲稿/ }).click();
    assert.equal(
      await page.getByLabel("实证", { exact: true }).evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "创建项目", exact: true }).click();
    assert.equal(
      await page.getByLabel("项目名称").evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByLabel("目标时长").selectOption("180000");
    await page.getByRole("button", { name: "编辑实证讲稿，预算 90 秒" }).waitFor();
    await page.getByLabel("导入文本").setInputFiles({
      name: "README.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("工作台界面验收材料"),
    });
    await page.waitForFunction(
      () => (document.getElementById("intro") as HTMLTextAreaElement).value === "工作台界面验收材料",
    );
    await page.getByLabel("极简展示").check();
    for (const title of ["测试片甲", "测试片乙"]) {
      await page.getByLabel("项目名称").fill(title);
      await page.getByRole("button", { name: "创建项目", exact: true }).click();
      await page.getByRole("heading", { name: title }).waitFor();
      if (title === "测试片甲") await page.getByRole("button", { name: "新建项目" }).click();
    }
    await selectProject("测试片甲");
    await page.getByRole("button", { name: "五段讲稿" }).click();
    await page.getByRole("textbox", { name: "问题", exact: true }).fill("你如何保留演示中的原声？");
    await page.getByRole("button", { name: "保存更改" }).click();
    await page.getByText("已保存 · 版本 2").waitFor();
    await page.getByRole("button", { name: "任务记录" }).click();
    await page.getByRole("button", { name: "运行快照自检" }).click();
    await page.getByText("已通过", { exact: true }).waitFor();
    await page.screenshot({ path: join(dir, "tasks.png") });
    await stop("SIGKILL");
    await start(new URL(address).port);
    await page.reload();
    await page.getByRole("heading", { name: "测试片甲" }).waitFor();
    await page.getByRole("button", { name: "五段讲稿" }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "问题", exact: true }).inputValue(),
      "你如何保留演示中的原声？",
    );
    await page.getByRole("button", { name: "任务记录" }).click();
    await page.getByText("已通过", { exact: true }).waitFor();
    await selectProject("测试片乙");
    await page.getByRole("button", { name: "五段讲稿" }).click();
    assert.equal(await page.getByRole("textbox", { name: "问题", exact: true }).inputValue(), "");
    await page.getByRole("button", { name: "项目材料" }).click();
    await page.screenshot({ path: join(dir, "workbench.png"), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow at ${width}`,
      );
      if (width === 390) await page.screenshot({ path: join(dir, "mobile.png"), fullPage: true });
    }
    await selectProject("测试片甲");
    assert.equal(await page.getByLabel("极简展示").isChecked(), true);
    await page.getByRole("button", { name: /编辑问题讲稿/ }).focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.getByLabel("问题", { exact: true }).evaluate((el) => el === document.activeElement),
      true,
    );
    await page.screenshot({ path: join(dir, "script-mobile.png"), fullPage: true });
    console.log("工作台截图", dir);
  } finally {
    await browser.close();
    await stop("SIGTERM");
  }
});
