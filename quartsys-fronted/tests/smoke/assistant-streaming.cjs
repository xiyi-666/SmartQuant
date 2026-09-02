/* eslint-disable no-console */
const { chromium } = require("@playwright/test");

const frontendBase = process.env.QS_FRONTEND_BASE || "http://127.0.0.1:15473";
const backendBase = process.env.QS_BACKEND_BASE || "http://127.0.0.1:18427";
const username = process.env.QS_TEST_USERNAME || "admin";
const password = process.env.QS_TEST_PASSWORD || "admin123";
const prompt =
  process.env.QS_ASSISTANT_SMOKE_PROMPT ||
  "请按标题、列表、表格和代码四个结构块简要说明双均线策略";

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const login = await page.request.post(`${backendBase}/api/login`, {
      data: { username, password },
    });
    if (!login.ok()) {
      throw new Error(`Login failed with HTTP ${login.status()}`);
    }

    const auth = await login.json();
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem("quartsys_token", token);
      localStorage.setItem("token", token);
      localStorage.setItem("quartsys_auth_user", JSON.stringify(user));
      localStorage.setItem(
        "quartsys_permissions_version",
        "2026-07-10-agent-analysis-v1",
      );
      localStorage.setItem("quartsys_user", user.username);
      localStorage.setItem("quartsys_role", user.role);
      localStorage.setItem(
        "quartsys_permissions",
        JSON.stringify(user.permissions || []),
      );
    }, auth);

    await page.goto(`${frontendBase}/dashboard`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".qs-assistant-fab").waitFor({ timeout: 30_000 });
    await page.locator(".qs-assistant-fab").click();
    await page.locator(".qs-assistant-input").fill(prompt);
    await page.locator(".qs-assistant-send").click();

    let progressiveState = null;
    const progressiveDeadline = Date.now() + 60_000;
    while (Date.now() < progressiveDeadline) {
      const state = await page.evaluate(() => ({
        streaming:
          document
            .querySelector(".qs-assistant-send")
            ?.classList.contains("is-stop") || false,
        blockCount: document.querySelectorAll(".assistant-structured > *").length,
        status:
          document
            .querySelector(".assistant-stream-progress")
            ?.textContent?.trim() || "",
      }));
      if (state.streaming && state.blockCount > 0) {
        progressiveState = state;
        break;
      }
      await page.waitForTimeout(100);
    }

    if (!progressiveState) {
      throw new Error("No assistant block became visible before the stream finished");
    }

    await page.waitForFunction(
      () => {
        const sendButton = document.querySelector(".qs-assistant-send");
        return Boolean(
          sendButton &&
            !sendButton.classList.contains("is-stop") &&
            document.querySelectorAll(".assistant-structured > *").length > 0,
        );
      },
      null,
      { timeout: 90_000 },
    );

    const finalState = await page.evaluate(() => ({
      blockCount: document.querySelectorAll(".assistant-structured > *").length,
      hasTable: Boolean(document.querySelector(".assistant-table")),
      hasCode: Boolean(document.querySelector(".assistant-structured pre")),
      stopButtonVisible:
        document
          .querySelector(".qs-assistant-send")
          ?.classList.contains("is-stop") || false,
      preview:
        document
          .querySelector(".assistant-structured")
          ?.textContent?.trim()
          .slice(0, 160) || "",
    }));

    console.log(
      JSON.stringify(
        {
          status: "ok",
          progressiveState,
          finalState,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: String(error && error.stack ? error.stack : error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
