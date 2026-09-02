import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ExternalLink, Gift, PlayCircle, X } from "lucide-react";
import { api } from "../api";
import { useLangText } from "../shared/language";
import { userScopedStorageKey } from "../shared/pageCache";
import { presentGoogleRewardedAd } from "../shared/rewardedAds";

type RewardAdProvider = {
  key: string;
  label: string;
  launch_mode?: "google_gpt" | "external_callback" | string;
};

type RewardAdStatus = {
  available?: boolean;
  reward_credits?: number;
  daily_limit?: number;
  completed_today?: number;
  remaining_today?: number;
  providers?: RewardAdProvider[];
};

type LongTaskRewardAdModalProps = {
  active: boolean;
  taskKey: string;
  contextLabel: string;
  promptDelayMs?: number;
};

const PROMPT_HISTORY_KEY = "long-task-reward-ad-prompts";
const PROMPT_TTL_MS = 7 * 24 * 60 * 60_000;

function readPromptHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(userScopedStorageKey(PROMPT_HISTORY_KEY)) || "{}") as Record<string, number>;
    const cutoff = Date.now() - PROMPT_TTL_MS;
    return Object.fromEntries(
      Object.entries(raw)
        .filter(([, value]) => Number(value) >= cutoff)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 60),
    );
  } catch {
    return {} as Record<string, number>;
  }
}

function markPrompted(taskKey: string) {
  try {
    localStorage.setItem(
      userScopedStorageKey(PROMPT_HISTORY_KEY),
      JSON.stringify({ ...readPromptHistory(), [taskKey]: Date.now() }),
    );
  } catch {
    // Prompt deduplication is best-effort only.
  }
}

export default function LongTaskRewardAdModal({
  active,
  taskKey,
  contextLabel,
  promptDelayMs = 2500,
}: LongTaskRewardAdModalProps) {
  const lt = useLangText();
  const [open, setOpen] = useState(false);
  const [rewardedAds, setRewardedAds] = useState<RewardAdStatus | null>(null);
  const [busyProvider, setBusyProvider] = useState("");
  const [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState(false);
  const activeCycleRef = useRef("");

  useEffect(() => {
    if (!active) {
      activeCycleRef.current = "";
      return;
    }
    if (activeCycleRef.current) return;
    const cycleKey = String(taskKey || `${contextLabel}:${Date.now()}`);
    activeCycleRef.current = cycleKey;
    if (readPromptHistory()[cycleKey]) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getSubscriptionSelf()
        .then((payload: any) => {
          if (cancelled || !active) return;
          const status = (payload?.rewarded_ads || {}) as RewardAdStatus;
          const providers = Array.isArray(status.providers) ? status.providers : [];
          if (
            status.available !== true ||
            Number(status.remaining_today || 0) <= 0 ||
            providers.length === 0
          ) {
            return;
          }
          markPrompted(cycleKey);
          setRewardedAds({ ...status, providers });
          setNotice("");
          setCompleted(false);
          setOpen(true);
        })
        .catch(() => {
          // Ad availability must never interfere with the analysis task.
        });
    }, promptDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, contextLabel, promptDelayMs, taskKey]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyProvider) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busyProvider, open]);

  const launchRewardAd = async (provider: RewardAdProvider) => {
    setBusyProvider(provider.key);
    setNotice("");
    setCompleted(false);
    const popup =
      provider.launch_mode === "external_callback"
        ? window.open("about:blank", "_blank")
        : null;
    if (popup) popup.opener = null;
    try {
      const session: any = await api.createRewardAdSession({ provider: provider.key });
      if (session?.launch_mode === "google_gpt") {
        await presentGoogleRewardedAd(
          String(session?.provider_config?.ad_unit_path || ""),
          {
            sdkLoadFailed: lt("Google 奖励广告组件加载失败", "Google Rewarded Ads failed to load"),
            placementMissing: lt("Google 奖励广告位未配置", "Google Rewarded Ads placement is not configured"),
            unsupported: lt("当前设备或广告位不支持奖励广告", "Rewarded ads are not supported on this device or placement"),
            notCompleted: lt("广告未完整观看，本次不发放积分", "The ad was not completed, so no credits were awarded"),
            unavailable: lt("广告暂未填充，请稍后再试", "No rewarded ad is available right now"),
          },
        );
        const completedPayload: any = await api.completeRewardAdSession({
          session_token: session.session_token,
        });
        const nextStatus: any = await api.getSubscriptionSelf().catch(() => null);
        if (nextStatus?.rewarded_ads) setRewardedAds(nextStatus.rewarded_ads);
        const credits = Number(completedPayload?.credits_awarded || session.reward_credits || 0);
        setCompleted(true);
        setNotice(
          lt(
            `广告观看完成，${credits} 积分已到账。`,
            `Ad completed. ${credits} credits have been added.`,
          ),
        );
        window.dispatchEvent(
          new CustomEvent("quartsys:subscription-updated", { detail: nextStatus }),
        );
        return;
      }

      const launchUrl = String(session?.provider_config?.launch_url || "");
      if (!launchUrl) throw new Error(lt("广告跳转地址未配置", "Ad launch URL is not configured"));
      const target = new URL(launchUrl, window.location.origin);
      target.searchParams.set("session_token", session.session_token);
      target.searchParams.set("placement_id", String(session?.provider_config?.placement_id || ""));
      if (popup) popup.location.href = target.toString();
      else window.open(target.toString(), "_blank", "noopener,noreferrer");
      setNotice(
        lt(
          "广告已打开，完整观看并由广告平台确认后积分会自动到账。",
          "The ad is open. Credits arrive after completion is verified by the provider.",
        ),
      );
    } catch (error: any) {
      popup?.close();
      setNotice(error?.message || lt("广告暂不可用，请稍后再试", "Rewarded ad is unavailable. Try again later."));
    } finally {
      setBusyProvider("");
    }
  };

  if (!open || !rewardedAds || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="long-task-ad-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyProvider) setOpen(false);
      }}
    >
      <section
        className="long-task-ad-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-task-ad-title"
      >
        <header className="long-task-ad-header">
          <div className="long-task-ad-icon" aria-hidden="true">
            <Gift size={22} />
          </div>
          <div>
            <span>{lt("分析等待奖励", "Analysis Wait Reward")}</span>
            <h2 id="long-task-ad-title">{lt("等待期间观看广告，获得积分", "Watch an ad while you wait")}</h2>
            <p>
              {lt(
                `${contextLabel}正在后台执行。广告为可选项，关闭窗口不会中断任务。`,
                `${contextLabel} is running in the background. The ad is optional and closing it will not interrupt the task.`,
              )}
            </p>
          </div>
          <button
            type="button"
            className="long-task-ad-close"
            onClick={() => setOpen(false)}
            disabled={Boolean(busyProvider)}
            aria-label={lt("关闭", "Close")}
          >
            <X size={18} />
          </button>
        </header>

        <div className="long-task-ad-reward">
          <strong>+{Number(rewardedAds.reward_credits || 0)}</strong>
          <span>{lt("积分 / 次", "credits / ad")}</span>
          <small>
            {lt("今日剩余", "Remaining today")} {Number(rewardedAds.remaining_today || 0)}
          </small>
        </div>

        <div className="long-task-ad-providers">
          {(rewardedAds.providers || []).map((provider) => (
            <button
              key={provider.key}
              type="button"
              className={`long-task-ad-provider provider-${provider.key}`}
              onClick={() => void launchRewardAd(provider)}
              disabled={Boolean(busyProvider) || Number(rewardedAds.remaining_today || 0) <= 0}
            >
              {provider.launch_mode === "external_callback" ? <ExternalLink size={17} /> : <PlayCircle size={17} />}
              <span>
                <strong>{provider.label}</strong>
                <small>
                  {busyProvider === provider.key
                    ? lt("正在打开…", "Opening...")
                    : lt("完整观看后领取", "Complete to claim")}
                </small>
              </span>
            </button>
          ))}
        </div>

        {notice && (
          <div className={`long-task-ad-notice ${completed ? "success" : ""}`}>
            {completed && <CheckCircle2 size={16} />}
            <span>{notice}</span>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
