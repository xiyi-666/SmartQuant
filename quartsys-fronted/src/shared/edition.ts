function enabledByDefault(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalized);
}

export const COMMUNITY_EDITION = enabledByDefault(
  import.meta.env.VITE_COMMUNITY_EDITION ?? "1",
);

export const COMMUNITY_HIDDEN_SETTINGS_TABS = new Set([
  "SUBSCRIPTION",
  "PAYMENT CONFIG",
  "BILLING CONFIG",
  "REDEEM CODES",
  "AI CUSTOMER SERVICE",
]);
