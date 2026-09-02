import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api";
import { hasPermission } from "../../shared/auth";
import { useLanguage, useLangText } from "../../shared/language";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketCategory =
  | "product"
  | "data"
  | "ai"
  | "billing"
  | "bug"
  | "suggestion"
  | "other";

type SupportTicket = {
  id: number;
  user_id: number;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  admin_reply?: string;
  resolved_at?: string | null;
  email_status?: "not_sent" | "queued" | "sent" | "skipped" | "failed";
  email_error?: string;
  created_at?: string | null;
  updated_at?: string | null;
  user?: { id: number; username: string; email?: string };
};

const CATEGORIES: TicketCategory[] = [
  "product",
  "data",
  "ai",
  "billing",
  "bug",
  "suggestion",
  "other",
];

const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

const CATEGORY_LABELS: Record<TicketCategory, [string, string]> = {
  product: ["产品使用", "Product"],
  data: ["行情与数据", "Market Data"],
  ai: ["AI 功能", "AI Features"],
  billing: ["订阅与计费", "Billing"],
  bug: ["故障反馈", "Bug Report"],
  suggestion: ["意见建议", "Suggestion"],
  other: ["其他", "Other"],
};

const STATUS_LABELS: Record<TicketStatus, [string, string]> = {
  open: ["待处理", "Open"],
  in_progress: ["处理中", "In Progress"],
  resolved: ["已解决", "Resolved"],
  closed: ["已关闭", "Closed"],
};

const PRIORITY_LABELS: Record<TicketPriority, [string, string]> = {
  low: ["低", "Low"],
  normal: ["普通", "Normal"],
  high: ["高", "High"],
  urgent: ["紧急", "Urgent"],
};

const EMAIL_STATUS_LABELS: Record<string, [string, string]> = {
  not_sent: ["待处理", "Pending"],
  queued: ["邮件发送中", "Email queued"],
  sent: ["邮件已发送", "Email sent"],
  skipped: ["未启用邮件通知", "Email unavailable"],
  failed: ["邮件发送失败", "Email failed"],
};

function formatDate(value: string | null | undefined, languageMode: string) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const locale = languageMode === "en" ? "en-US" : languageMode === "zh-TW" ? "zh-TW" : "zh-CN";
  return parsed.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportTicketsPanel() {
  const lt = useLangText();
  const { languageMode } = useLanguage();
  const canManageSystem = hasPermission("system.manage");
  const [category, setCategory] = useState<TicketCategory>("product");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formNotice, setFormNotice] = useState("");
  const [formError, setFormError] = useState(false);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [myLoading, setMyLoading] = useState(true);

  const loadMine = useCallback(async () => {
    setMyLoading(true);
    try {
      const payload: any = await api.listMySupportTickets(100);
      setMyTickets(Array.isArray(payload?.tickets) ? payload.tickets : []);
    } catch (error: any) {
      setFormError(true);
      setFormNotice(error?.message || lt("工单记录加载失败", "Failed to load tickets"));
    } finally {
      setMyLoading(false);
    }
  }, [languageMode]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const submitTicket = async (event: FormEvent) => {
    event.preventDefault();
    setFormNotice("");
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setFormError(true);
      setFormNotice(
        lt(
          "请填写至少 3 个字符的标题和至少 10 个字符的问题描述。",
          "Enter a subject of at least 3 characters and a description of at least 10 characters.",
        ),
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.createSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubject("");
      setMessage("");
      setFormError(false);
      setFormNotice(
        lt(
          "提交成功。系统管理员处理完成后会通过站内通知告知您；已配置 SMTP 时也会发送邮件。",
          "Submitted. You will receive an in-app notification after processing, plus email when SMTP is available.",
        ),
      );
      await loadMine();
    } catch (error: any) {
      setFormError(true);
      setFormNotice(error?.message || lt("提交失败，请稍后重试", "Submission failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="support-ticket-panel">
      <section className="support-ticket-submit-card">
        <div className="support-ticket-card-head">
          <span className="support-ticket-icon"><MessageSquareText aria-hidden="true" /></span>
          <div>
            <h3>{lt("提交工单或意见", "Submit a Ticket or Feedback")}</h3>
            <p>{lt("描述问题、建议或订阅疑问，处理结果会保留在您的账号中。", "Report an issue, suggestion or billing question. Responses remain private to your account.")}</p>
          </div>
        </div>
        <form className="support-ticket-form" onSubmit={submitTicket}>
          <label>
            <span>{lt("问题分类", "Category")}</span>
            <select className="figma-input" value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)}>
              {CATEGORIES.map((item) => <option key={item} value={item}>{lt(...CATEGORY_LABELS[item])}</option>)}
            </select>
          </label>
          <label>
            <span>{lt("标题", "Subject")}</span>
            <input
              className="figma-input"
              maxLength={160}
              placeholder={lt("简要说明需要协助的内容", "Briefly describe what you need help with")}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="support-ticket-message-field">
            <span>{lt("详细描述", "Details")}</span>
            <textarea
              className="figma-input"
              maxLength={5000}
              placeholder={lt("请说明操作步骤、预期结果和实际情况。", "Include steps, expected result and actual behavior.")}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <div className="support-ticket-form-footer">
            <span>{message.length}/5000</span>
            <button className="figma-btn figma-btn-primary" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {submitting ? lt("提交中", "Submitting") : lt("提交", "Submit")}
            </button>
          </div>
          {formNotice && <p className={`support-ticket-notice ${formError ? "is-error" : "is-success"}`} role="status">{formNotice}</p>}
        </form>
      </section>

      <section className="support-ticket-history-card">
        <div className="support-ticket-card-head support-ticket-history-head">
          <span className="support-ticket-icon"><Inbox aria-hidden="true" /></span>
          <div>
            <h3>{lt("我的工单", "My Tickets")}</h3>
            <p>{lt("仅展示当前账号提交的记录和管理员回复。", "Only tickets and replies belonging to this account are shown.")}</p>
          </div>
          <button className="support-ticket-icon-button" type="button" onClick={() => void loadMine()} disabled={myLoading} title={lt("刷新", "Refresh")}>
            <RefreshCw className={myLoading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
        {myLoading && myTickets.length === 0 ? (
          <div className="support-ticket-empty"><Loader2 className="spin" aria-hidden="true" /><span>{lt("正在加载工单", "Loading tickets")}</span></div>
        ) : myTickets.length === 0 ? (
          <div className="support-ticket-empty"><Inbox aria-hidden="true" /><span>{lt("暂无工单记录", "No tickets yet")}</span></div>
        ) : (
          <div className="support-ticket-list">
            {myTickets.map((ticket) => (
              <article key={ticket.id} className="support-ticket-item">
                <div className="support-ticket-item-head">
                  <div>
                    <span className={`support-ticket-status status-${ticket.status}`}>{lt(...STATUS_LABELS[ticket.status])}</span>
                    <span className="support-ticket-category">{lt(...CATEGORY_LABELS[ticket.category])}</span>
                  </div>
                  <time>{formatDate(ticket.created_at, languageMode)}</time>
                </div>
                <h4>#{ticket.id} {ticket.subject}</h4>
                <p className="support-ticket-copy">{ticket.message}</p>
                {ticket.admin_reply && (
                  <div className="support-ticket-reply">
                    <strong><CheckCircle2 aria-hidden="true" />{lt("管理员回复", "Administrator Reply")}</strong>
                    <p>{ticket.admin_reply}</p>
                    <span>{lt(...(EMAIL_STATUS_LABELS[ticket.email_status || "not_sent"] || EMAIL_STATUS_LABELS.not_sent))}</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {canManageSystem && <AdminTicketWorkbench languageMode={languageMode} />}
    </div>
  );
}

function AdminTicketWorkbench({ languageMode }: { languageMode: string }) {
  const lt = useLangText();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [editorStatus, setEditorStatus] = useState<TicketStatus>("open");
  const [editorPriority, setEditorPriority] = useState<TicketPriority>("normal");
  const [editorReply, setEditorReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const payload: any = await api.listAdminSupportTickets({
        search,
        status: statusFilter,
        category: categoryFilter,
        page,
        pageSize: 20,
      });
      const nextTickets = Array.isArray(payload?.tickets) ? payload.tickets : [];
      setTickets(nextTickets);
      setTotal(Number(payload?.total || 0));
      setPages(Math.max(1, Number(payload?.pages || 1)));
      setSelected((current) => nextTickets.find((item: SupportTicket) => item.id === current?.id) || nextTickets[0] || null);
    } catch (error: any) {
      setNoticeError(true);
      setNotice(error?.message || lt("管理员工单加载失败", "Failed to load admin ticket queue"));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, languageMode, page, search, statusFilter]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selected) return;
    setEditorStatus(selected.status);
    setEditorPriority(selected.priority);
    setEditorReply(selected.admin_reply || "");
  }, [selected]);

  const filterSummary = useMemo(
    () => lt(`共 ${total} 个匹配工单`, `${total} matching tickets`),
    [languageMode, total],
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const saveTicket = async () => {
    if (!selected) return;
    if ((editorStatus === "resolved" || editorStatus === "closed") && !editorReply.trim()) {
      setNoticeError(true);
      setNotice(lt("处理完成或关闭前必须填写回复。", "A reply is required before resolving or closing a ticket."));
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const payload: any = await api.updateAdminSupportTicket(selected.id, {
        status: editorStatus,
        priority: editorPriority,
        admin_reply: editorReply.trim(),
      });
      setSelected(payload?.ticket || selected);
      setNoticeError(false);
      setNotice(
        editorStatus === "resolved" || editorStatus === "closed"
          ? lt("处理结果已保存，站内通知已生成，邮件将在后台发送。", "Saved. The in-app notification was created and email will be sent in the background.")
          : lt("工单已更新", "Ticket updated"),
      );
      window.dispatchEvent(new Event("quartsys:notifications-refresh"));
      await loadTickets();
    } catch (error: any) {
      setNoticeError(true);
      setNotice(error?.message || lt("工单更新失败", "Failed to update ticket"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="support-ticket-admin-card">
      <div className="support-ticket-card-head">
        <span className="support-ticket-icon is-admin"><ShieldCheck aria-hidden="true" /></span>
        <div>
          <h3>{lt("管理员处理台", "Administrator Workbench")}</h3>
          <p>{lt("检索、分级并回复用户工单。只有系统管理员可以访问。", "Search, prioritize and reply to user tickets. System administrators only.")}</p>
        </div>
      </div>
      <form className="support-ticket-admin-toolbar" onSubmit={submitSearch}>
        <label className="support-ticket-search-field">
          <Search aria-hidden="true" />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={lt("搜索用户、邮箱、标题或内容", "Search user, email, subject or content")} />
        </label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="all">{lt("全部状态", "All statuses")}</option>
          {STATUSES.map((item) => <option key={item} value={item}>{lt(...STATUS_LABELS[item])}</option>)}
        </select>
        <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
          <option value="all">{lt("全部分类", "All categories")}</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{lt(...CATEGORY_LABELS[item])}</option>)}
        </select>
        <button className="figma-btn" type="submit"><Search aria-hidden="true" />{lt("检索", "Search")}</button>
      </form>
      <div className="support-ticket-admin-meta">
        <span>{filterSummary}</span>
        <button type="button" onClick={() => void loadTickets()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} aria-hidden="true" />{lt("刷新", "Refresh")}</button>
      </div>
      <div className="support-ticket-admin-layout">
        <div className="support-ticket-admin-list-wrap">
          {loading && tickets.length === 0 ? (
            <div className="support-ticket-empty"><Loader2 className="spin" aria-hidden="true" /><span>{lt("正在加载", "Loading")}</span></div>
          ) : tickets.length === 0 ? (
            <div className="support-ticket-empty"><Inbox aria-hidden="true" /><span>{lt("没有匹配的工单", "No matching tickets")}</span></div>
          ) : (
            <div className="support-ticket-admin-list">
              {tickets.map((ticket) => (
                <button key={ticket.id} type="button" className={selected?.id === ticket.id ? "is-active" : ""} onClick={() => setSelected(ticket)}>
                  <div>
                    <span className={`support-ticket-status status-${ticket.status}`}>{lt(...STATUS_LABELS[ticket.status])}</span>
                    <span className={`support-ticket-priority priority-${ticket.priority}`}>{lt(...PRIORITY_LABELS[ticket.priority])}</span>
                  </div>
                  <strong>#{ticket.id} {ticket.subject}</strong>
                  <span>{ticket.user?.username || `UID ${ticket.user_id}`} · {formatDate(ticket.created_at, languageMode)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="support-ticket-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft aria-hidden="true" /></button>
            <span>{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight aria-hidden="true" /></button>
          </div>
        </div>
        <div className="support-ticket-admin-editor">
          {!selected ? (
            <div className="support-ticket-empty"><Clock3 aria-hidden="true" /><span>{lt("选择一个工单开始处理", "Select a ticket to begin")}</span></div>
          ) : (
            <>
              <div className="support-ticket-admin-ticket-head">
                <div>
                  <span>{lt(...CATEGORY_LABELS[selected.category])}</span>
                  <h4>#{selected.id} {selected.subject}</h4>
                  <p>{selected.user?.username || `UID ${selected.user_id}`} · {selected.user?.email || lt("未绑定邮箱", "No email")}</p>
                </div>
                <time>{formatDate(selected.created_at, languageMode)}</time>
              </div>
              <div className="support-ticket-admin-message">{selected.message}</div>
              <div className="support-ticket-editor-grid">
                <label>
                  <span>{lt("状态", "Status")}</span>
                  <select className="figma-input" value={editorStatus} onChange={(event) => setEditorStatus(event.target.value as TicketStatus)}>
                    {STATUSES.map((item) => <option key={item} value={item}>{lt(...STATUS_LABELS[item])}</option>)}
                  </select>
                </label>
                <label>
                  <span>{lt("优先级", "Priority")}</span>
                  <select className="figma-input" value={editorPriority} onChange={(event) => setEditorPriority(event.target.value as TicketPriority)}>
                    {PRIORITIES.map((item) => <option key={item} value={item}>{lt(...PRIORITY_LABELS[item])}</option>)}
                  </select>
                </label>
              </div>
              <label className="support-ticket-admin-reply-field">
                <span>{lt("回复用户", "Reply to User")}</span>
                <textarea className="figma-input" maxLength={5000} value={editorReply} onChange={(event) => setEditorReply(event.target.value)} placeholder={lt("说明处理结论、操作建议或后续安排。", "Explain the resolution, recommendation or next action.")} />
              </label>
              {selected.email_status && selected.email_status !== "not_sent" && (
                <p className={`support-ticket-email-state email-${selected.email_status}`}>
                  {lt(...(EMAIL_STATUS_LABELS[selected.email_status] || EMAIL_STATUS_LABELS.not_sent))}
                  {selected.email_status === "failed" && selected.email_error ? `: ${selected.email_error}` : ""}
                </p>
              )}
              <div className="support-ticket-admin-actions">
                <span>{lt("选择“已解决”或“已关闭”会通知用户。", "Resolving or closing notifies the user.")}</span>
                <button className="figma-btn figma-btn-primary" type="button" onClick={() => void saveTicket()} disabled={saving}>
                  {saving ? <Loader2 className="spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                  {saving ? lt("保存中", "Saving") : lt("保存处理结果", "Save Result")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {notice && <p className={`support-ticket-notice ${noticeError ? "is-error" : "is-success"}`} role="status">{notice}</p>}
    </section>
  );
}
