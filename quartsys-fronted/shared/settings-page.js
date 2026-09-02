(function () {
  const api = window.QuartSysApi;
  if (!api) return;

  const main = document.querySelector("main .p-8");
  const status = document.createElement("div");
  status.className = "text-xs text-slate-400 mb-4";
  if (main) main.prepend(status);

  function setStatus(text, isError) {
    status.textContent = text || "";
    status.className = `text-xs mb-4 ${isError ? "text-red-400" : "text-slate-400"}`;
  }

  function bindApiConfig() {
    const apiCard = Array.from(document.querySelectorAll("section")).find((s) =>
      /API Config/i.test(s.textContent || "")
    );
    if (!apiCard) return;

    const inputs = apiCard.querySelectorAll("input");
    const saveBtn = apiCard.querySelector("button[type='submit']");
    const baseInput = inputs[0];
    const keyInput = inputs[1];

    if (baseInput) {
      baseInput.value = api.apiBase || localStorage.getItem("quartsys_api_base") || "";
      baseInput.placeholder = "http://127.0.0.1:18427/api";
    }
    if (keyInput) keyInput.value = api.getToken() || "";

    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = "1";
      saveBtn.addEventListener("click", async function (e) {
        e.preventDefault();
        const base = (baseInput && baseInput.value ? baseInput.value : "").trim();
        const token = (keyInput && keyInput.value ? keyInput.value : "").trim();
        if (base) api.setApiBase(base);
        if (token) api.setToken(token);

        try {
          const health = await api.get("/health");
          setStatus(`API 已更新并连通：${health.status} (${health.db})`, false);
        } catch (err) {
          setStatus(err.message || "API 地址不可达", true);
        }
      });
    }
  }

  function bindThemePrefs() {
    const darkBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.innerHTML || "").includes("dark_mode")
    );
    const lightBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.innerHTML || "").includes("light_mode")
    );
    if (darkBtn && !darkBtn.dataset.bound) {
      darkBtn.dataset.bound = "1";
      darkBtn.addEventListener("click", function () {
        document.documentElement.classList.add("dark");
        setStatus("已切换深色主题", false);
      });
    }
    if (lightBtn && !lightBtn.dataset.bound) {
      lightBtn.dataset.bound = "1";
      lightBtn.addEventListener("click", function () {
        document.documentElement.classList.remove("dark");
        setStatus("已切换浅色主题", false);
      });
    }
  }

  function bindPlanButtons() {
    const payBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
      /Pay \$|Current Plan/i.test(b.textContent || "")
    );
    payBtns.forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        setStatus("当前演示环境未接入支付，订阅入口已预留。", false);
      });
    });
  }

  function showUser() {
    const userRaw = localStorage.getItem("user") || localStorage.getItem("quartsys_user");
    if (!userRaw) return;
    let user = null;
    try {
      user = JSON.parse(userRaw);
    } catch (e) {
      user = null;
    }
    if (!user || !user.username) return;
    const title = document.querySelector("main h1");
    if (!title) return;
    const tip = document.createElement("p");
    tip.className = "text-xs text-slate-400 mt-2";
    tip.textContent = `当前登录用户：${user.username}`;
    title.insertAdjacentElement("afterend", tip);
  }

  bindApiConfig();
  bindThemePrefs();
  bindPlanButtons();
  showUser();
  setStatus("设置页已接入后端配置与会话信息", false);
})();
