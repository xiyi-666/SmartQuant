let googleRewardedScriptPromise: Promise<void> | null = null;

export type RewardedAdMessages = {
  sdkLoadFailed?: string;
  placementMissing?: string;
  unsupported?: string;
  notCompleted?: string;
  unavailable?: string;
};

export function loadGoogleRewardedScript(messages: RewardedAdMessages = {}) {
  if ((window as any).googletag?.apiReady) return Promise.resolve();
  if (googleRewardedScriptPromise) return googleRewardedScriptPromise;
  googleRewardedScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-rewarded="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(messages.sdkLoadFailed || "Google Rewarded Ads SDK failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
    script.dataset.googleRewarded = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(messages.sdkLoadFailed || "Google Rewarded Ads SDK failed to load"));
    document.head.appendChild(script);
  });
  return googleRewardedScriptPromise;
}

export async function presentGoogleRewardedAd(
  adUnitPath: string,
  messages: RewardedAdMessages = {},
) {
  if (!adUnitPath) throw new Error(messages.placementMissing || "Google Rewarded Ads placement is not configured");
  await loadGoogleRewardedScript(messages);
  const googleTag = (window as any).googletag || ((window as any).googletag = { cmd: [] });
  await new Promise<void>((resolve, reject) => {
    googleTag.cmd.push(() => {
      const outOfPageFormat = googleTag.enums?.OutOfPageFormat?.REWARDED;
      const slot = outOfPageFormat
        ? googleTag.defineOutOfPageSlot(adUnitPath, outOfPageFormat)
        : null;
      if (!slot) {
        reject(new Error(messages.unsupported || "Rewarded ads are not supported on this device or placement"));
        return;
      }
      const pubads = googleTag.pubads();
      let granted = false;
      let settled = false;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        pubads.removeEventListener?.("rewardedSlotReady", onReady);
        pubads.removeEventListener?.("rewardedSlotGranted", onGranted);
        pubads.removeEventListener?.("rewardedSlotClosed", onClosed);
        googleTag.destroySlots?.([slot]);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onReady = (event: any) => {
        if (event.slot === slot) event.makeRewardedVisible();
      };
      const onGranted = (event: any) => {
        if (event.slot !== slot) return;
        granted = true;
        finish();
      };
      const onClosed = (event: any) => {
        if (event.slot === slot && !granted) {
          finish(new Error(messages.notCompleted || "The ad was not completed, so no credits were awarded"));
        }
      };
      const timeoutId = window.setTimeout(
        () => finish(new Error(messages.unavailable || "No rewarded ad is available right now")),
        30_000,
      );
      pubads.addEventListener("rewardedSlotReady", onReady);
      pubads.addEventListener("rewardedSlotGranted", onGranted);
      pubads.addEventListener("rewardedSlotClosed", onClosed);
      slot.addService(pubads);
      googleTag.enableServices();
      googleTag.display(slot);
    });
  });
}
