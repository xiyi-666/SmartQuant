import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../shared/language";

const CHECKOUT_STORAGE_KEY = "quartsys_epay_checkout";
const CHECKOUT_TIMEOUT_SECONDS = 180;

type EpayCheckoutPayload = {
  url?: string;
  data?: Record<string, unknown>;
  order?: {
    trade_no?: string;
    amount_cents?: number;
    order_type?: string;
  };
  local_callback_unreachable?: boolean;
  created_at?: number;
};

function appendPaymentStatus(url: string, status: string, tradeNo?: string) {
  const target = new URL(url || "/settings?tab=subscription", window.location.origin);
  target.searchParams.set("tab", target.searchParams.get("tab") || "subscription");
  target.searchParams.set("pay", status);
  if (tradeNo) target.searchParams.set("trade_no", tradeNo);
  return target.toString();
}

function readCheckoutPayload(): EpayCheckoutPayload | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHECKOUT_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function formatCny(amountCents?: number) {
  if (!amountCents && amountCents !== 0) return "--";
  return `￥${(amountCents / 100).toFixed(2)}`;
}

export default function EpayCheckoutPage() {
  const { lang } = useLanguage();
  const lt = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const submittedRef = useRef(false);
  const [payload, setPayload] = useState<EpayCheckoutPayload | null>(() => readCheckoutPayload());
  const [secondsLeft, setSecondsLeft] = useState(CHECKOUT_TIMEOUT_SECONDS);
  const [status, setStatus] = useState<"loading" | "active" | "timeout" | "missing">("loading");

  const returnUrl = useMemo(() => {
    const value = payload?.data?.return_url;
    return typeof value === "string" && value ? value : `${window.location.origin}/settings?tab=subscription`;
  }, [payload]);
  const tradeNo = String(payload?.data?.out_trade_no || payload?.order?.trade_no || "");
  const payType = String(payload?.data?.type || "");

  useEffect(() => {
    if (!payload?.url || !payload?.data) {
      setStatus("missing");
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("active");

    const form = document.createElement("form");
    form.method = "POST";
    form.action = String(payload.url);
    form.target = "epay-checkout-frame";
    form.style.display = "none";
    Object.entries(payload.data).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value ?? "");
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
  }, [payload]);

  useEffect(() => {
    if (status !== "active") return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setStatus("timeout");
          window.setTimeout(() => {
            window.location.href = appendPaymentStatus(returnUrl, "timeout", tradeNo);
          }, 900);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [returnUrl, status, tradeNo]);

  const handleFrameLoad = () => {
    const iframe = iframeRef.current;
    try {
      const frameUrl = iframe?.contentWindow?.location.href || "";
      if (frameUrl && frameUrl.startsWith(window.location.origin) && frameUrl.includes("/settings")) {
        window.location.href = frameUrl;
      }
    } catch {
      // Cross-origin checkout pages cannot be inspected. The local timeout keeps the shell in control.
    }
  };

  const goBack = (statusValue = "cancelled") => {
    window.location.href = appendPaymentStatus(returnUrl, statusValue, tradeNo);
  };

  const methodLabel =
    payType === "wxpay" ? lt("微信支付", "WeChat Pay") : payType === "qqpay" ? lt("QQ 钱包", "QQ Wallet") : lt("支付宝", "Alipay");

  return (
    <div className="epay-checkout-page" lang={lang === "zh" ? "zh-CN" : "en"}>
      <header className="epay-checkout-header">
        <div>
          <span>{lt("安全支付", "Secure Checkout")}</span>
          <h1>{lt("正在跳转 ePay 收银台", "Opening ePay Checkout")}</h1>
          <p>
            {lt(
              "支付超时或关闭后会自动回到订阅页面，不会跳转到支付平台官网。",
              "Timeouts and cancellations return to the subscription page instead of the payment provider homepage.",
            )}
          </p>
        </div>
        <button className="figma-btn" type="button" onClick={() => goBack()}>
          {lt("返回订阅页", "Back to Plans")}
        </button>
      </header>

      <section className="epay-checkout-summary">
        <div>
          <span>{lt("订单号", "Order")}</span>
          <strong>{tradeNo || "--"}</strong>
        </div>
        <div>
          <span>{lt("支付方式", "Method")}</span>
          <strong>{methodLabel}</strong>
        </div>
        <div>
          <span>{lt("支付金额", "Amount")}</span>
          <strong>{formatCny(payload?.order?.amount_cents)}</strong>
        </div>
        <div>
          <span>{lt("剩余时间", "Time Left")}</span>
          <strong>{secondsLeft}s</strong>
        </div>
      </section>

      {payload?.local_callback_unreachable && (
        <p className="settings-commerce-note">
          {lt(
            "当前为本地调试：可以打开收银台，但支付平台无法访问本机异步通知。请使用公网域名或内网穿透完成支付状态回调测试。",
            "Local testing can open checkout, but the provider cannot reach this machine for asynchronous notification. Use a public domain or a tunnel to test payment callbacks.",
          )}
        </p>
      )}

      {status === "missing" ? (
        <div className="epay-checkout-state">
          <h2>{lt("支付请求不存在", "Checkout request missing")}</h2>
          <p>{lt("请返回订阅页重新发起支付。", "Return to the subscription page and start checkout again.")}</p>
          <button className="figma-btn figma-btn-primary" type="button" onClick={() => goBack("failed")}>
            {lt("返回订阅页", "Back to Plans")}
          </button>
        </div>
      ) : status === "timeout" ? (
        <div className="epay-checkout-state">
          <h2>{lt("支付超时", "Payment Timeout")}</h2>
          <p>{lt("正在返回订阅页，请重新发起支付。", "Returning to the subscription page. Start checkout again if needed.")}</p>
        </div>
      ) : (
        <div className="epay-checkout-frame-shell">
          <iframe
            ref={iframeRef}
            title="ePay Checkout"
            name="epay-checkout-frame"
            onLoad={handleFrameLoad}
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
          />
        </div>
      )}
    </div>
  );
}
