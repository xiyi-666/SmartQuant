import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Bot,
  ClipboardList,
  HelpCircle,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../api";
import { useLanguage } from "../../shared/language";
import {
  normalizePublicCustomerServiceAiSettings,
  type PublicCustomerServiceAiSettings,
} from "../../shared/customerService";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function renderMarkdown(value: string) {
  const html = marked.parse(value || "", { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

export default function LandingCustomerServiceFab() {
  const { lang } = useLanguage();
  const [settings, setSettings] = useState<PublicCustomerServiceAiSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "ticket">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState({ name: "", contact: "", topic: "", message: "" });
  const [ticketMsg, setTicketMsg] = useState("");
  const [ticketSaving, setTicketSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicCustomerServiceAiSettings()
      .then((payload: any) => {
        if (cancelled) return;
        const normalized = normalizePublicCustomerServiceAiSettings(payload);
        setSettings(normalized.enabled ? normalized : null);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings?.enabled) return;
    setMessages([{ role: "assistant", content: settings.welcome_message }]);
  }, [settings?.enabled, settings?.welcome_message]);

  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  const visibleFaqs = useMemo(
    () => (settings?.faqs || []).filter((item) => item.enabled).slice(0, 4),
    [settings?.faqs],
  );
  const quickQuestions = useMemo(
    () => (settings?.recommended_questions || []).slice(0, 6),
    [settings?.recommended_questions],
  );

  if (!settings?.enabled) return null;

  const sendMessage = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setActiveTab("chat");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const result: any = await api.chatPublicCustomerServiceAi({
        message: text,
        history: nextMessages.slice(-8),
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            result?.answer ||
            (lang === "zh"
              ? "我已收到问题，请补充联系方式或提交工单。"
              : "I received your question. Please add contact details or submit a ticket."),
        },
      ]);
    } catch (error: any) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error?.message ||
            (lang === "zh"
              ? "客服暂时不可用，请提交工单，我们会尽快处理。"
              : "Customer service is temporarily unavailable. Submit a ticket and we will follow up."),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submitTicket = async (event: FormEvent) => {
    event.preventDefault();
    setTicketMsg("");
    if (!ticket.message.trim()) {
      setTicketMsg(lang === "zh" ? "请填写问题内容。" : "Enter the issue details.");
      return;
    }
    setTicketSaving(true);
    try {
      const result: any = await api.createPublicCustomerServiceTicket(ticket);
      setTicket({ name: "", contact: "", topic: "", message: "" });
      setTicketMsg(
        lang === "zh"
          ? `工单已提交：#${result?.ticket_id || "-"}`
          : `Ticket submitted: #${result?.ticket_id || "-"}`,
      );
    } catch (error: any) {
      setTicketMsg(
        error?.message ||
          (lang === "zh" ? "工单提交失败，请稍后再试。" : "Ticket submission failed. Try again later."),
      );
    } finally {
      setTicketSaving(false);
    }
  };

  const openTicket = () => {
    setOpen(true);
    setActiveTab("ticket");
  };

  return (
    <div className="landing-cs-root">
      {open && (
        <section className="landing-cs-panel" aria-label={settings.display_title}>
          <header className="landing-cs-header">
            <div className="landing-cs-title">
              <span>
                <Bot size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{settings.display_title}</strong>
                <small>{lang === "zh" ? "产品咨询与快速引导" : "Product guidance and support"}</small>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={lang === "zh" ? "关闭客服" : "Close support"}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="landing-cs-tabs" role="tablist" aria-label={lang === "zh" ? "客服模式" : "Support mode"}>
            <button
              type="button"
              className={activeTab === "chat" ? "active" : ""}
              onClick={() => setActiveTab("chat")}
              role="tab"
              aria-selected={activeTab === "chat"}
            >
              <MessageCircle size={15} aria-hidden="true" />
              {lang === "zh" ? "咨询" : "Chat"}
            </button>
            <button
              type="button"
              className={activeTab === "ticket" ? "active" : ""}
              onClick={openTicket}
              role="tab"
              aria-selected={activeTab === "ticket"}
            >
              <ClipboardList size={15} aria-hidden="true" />
              {lang === "zh" ? "工单" : "Ticket"}
            </button>
          </div>

          {activeTab === "chat" ? (
            <>
              <div className="landing-cs-body" ref={bodyRef}>
                <div className="landing-cs-capabilities">
                  {settings.capabilities.slice(0, 4).map((item) => (
                    <span key={item}>
                      <Sparkles size={13} aria-hidden="true" />
                      {item}
                    </span>
                  ))}
                </div>
                {visibleFaqs.length > 0 && (
                  <div className="landing-cs-faqs">
                    {visibleFaqs.map((item) => (
                      <button key={item.question} type="button" onClick={() => sendMessage(item.question)}>
                        <HelpCircle size={14} aria-hidden="true" />
                        <span>{item.question}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="landing-cs-messages">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`landing-cs-message ${message.role}`}>
                      <div
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                      />
                    </div>
                  ))}
                  {loading && (
                    <div className="landing-cs-message assistant is-loading">
                      {lang === "zh" ? "正在整理回答..." : "Preparing answer..."}
                    </div>
                  )}
                </div>
              </div>
              {quickQuestions.length > 0 && (
                <div className="landing-cs-quick">
                  {quickQuestions.map((item) => (
                    <button key={item} type="button" onClick={() => sendMessage(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="landing-cs-input-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={lang === "zh" ? "输入产品咨询问题" : "Ask about the product"}
                  disabled={loading}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label={lang === "zh" ? "发送" : "Send"}>
                  <Send size={16} aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <form className="landing-cs-ticket" onSubmit={submitTicket}>
              <input
                value={ticket.name}
                onChange={(event) => setTicket((current) => ({ ...current, name: event.target.value }))}
                placeholder={lang === "zh" ? "称呼" : "Name"}
              />
              <input
                value={ticket.contact}
                onChange={(event) => setTicket((current) => ({ ...current, contact: event.target.value }))}
                placeholder={lang === "zh" ? "联系方式" : "Contact"}
              />
              <input
                value={ticket.topic}
                onChange={(event) => setTicket((current) => ({ ...current, topic: event.target.value }))}
                placeholder={lang === "zh" ? "问题主题" : "Topic"}
              />
              <textarea
                value={ticket.message}
                onChange={(event) => setTicket((current) => ({ ...current, message: event.target.value }))}
                placeholder={lang === "zh" ? "描述你遇到的问题或想了解的内容" : "Describe your issue or request"}
                rows={5}
              />
              <div className="landing-cs-ticket-actions">
                <span>{ticketMsg}</span>
                <button type="submit" disabled={ticketSaving}>
                  {ticketSaving ? (lang === "zh" ? "提交中" : "Submitting") : lang === "zh" ? "提交工单" : "Submit"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      <button
        type="button"
        className="landing-cs-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? (lang === "zh" ? "收起 AI客服" : "Collapse AI support") : settings.display_title}
        title={settings.display_title}
      >
        <Bot size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
