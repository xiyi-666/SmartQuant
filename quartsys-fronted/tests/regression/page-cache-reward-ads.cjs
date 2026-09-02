/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

function must(condition, message) {
  if (!condition) throw new Error(message);
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function loadPageCache(root) {
  const file = path.join(root, "src", "shared", "pageCache.ts");
  const source = fs
    .readFileSync(file, "utf8")
    .replace(
      'import { getAuthUser } from "./auth";',
      "const getAuthUser = () => globalThis.__pageCacheTestUser;",
    );
  const output = esbuild.transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2020",
  }).code;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, require);
  return module.exports;
}

function run() {
  const root = path.resolve(__dirname, "..", "..");
  const storage = new MemoryStorage();
  global.window = { localStorage: storage };
  global.localStorage = storage;
  global.__pageCacheTestUser = { id: 101, username: "alpha" };

  const cache = loadPageCache(root);
  must(cache.writeUserPageCache("risk", "CN", { score: 18 }) === true, "cache write failed");
  must(cache.readUserPageCache("risk", "CN", 60_000)?.value?.score === 18, "cache read failed");

  const firstUserStorageKey = cache.userScopedStorageKey("active-task");
  global.__pageCacheTestUser = { id: 202, username: "beta" };
  must(cache.readUserPageCache("risk", "CN", 60_000) === null, "page cache leaked across users");
  must(cache.userScopedStorageKey("active-task") !== firstUserStorageKey, "task key is not user scoped");

  global.__pageCacheTestUser = { id: 101, username: "alpha" };
  const pageCacheKey = [...storage.values.keys()].find((key) => key.includes("user-page-cache"));
  const expired = JSON.parse(storage.getItem(pageCacheKey));
  expired.savedAt = Date.now() - 10_000;
  storage.setItem(pageCacheKey, JSON.stringify(expired));
  must(cache.readUserPageCache("risk", "CN", 1000) === null, "expired cache was not rejected");

  const pages = [
    "AiInsightsPage.tsx",
    "RiskPage.tsx",
    "SmartResearchPage.tsx",
    "ScreenerPage.tsx",
  ].map((name) => fs.readFileSync(path.join(root, "src", "pages", name), "utf8"));
  pages.forEach((content, index) => {
    must(content.includes("LongTaskRewardAdModal"), `page ${index + 1} is missing the rewarded-ad modal`);
  });
  must(pages[0].includes('readUserPageCache<AiInsightsCacheSnapshot>'), "AI insights cache restore missing");
  must(pages[1].includes('readUserPageCache<RiskPageCacheSnapshot>'), "risk cache restore missing");
  must(pages[2].includes('readUserPageCache<SmartResearchCacheSnapshot>'), "smart research cache restore missing");
  must(pages[3].includes("cachedEntry && !forceRefresh"), "screener force-refresh cache bypass missing");

  const modal = fs.readFileSync(
    path.join(root, "src", "components", "LongTaskRewardAdModal.tsx"),
    "utf8",
  );
  must(modal.includes("status.available !== true"), "paid/admin ad availability guard missing");
  must(modal.includes("markPrompted(cycleKey)"), "per-task ad prompt deduplication missing");
  must(modal.includes("completeRewardAdSession"), "reward completion call missing");

  console.log(JSON.stringify({ status: "ok", checks: [
    "user-isolated-page-cache",
    "cache-expiry",
    "four-page-cache-wiring",
    "rewarded-ad-eligibility-and-deduplication",
  ] }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: String(error?.message || error) }, null, 2));
  process.exit(1);
}
