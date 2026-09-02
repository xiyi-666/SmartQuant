import { ExternalLink, LockKeyhole } from "lucide-react";
import { useLangText } from "../shared/language";

export default function CommunityFeatureNotice({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  const lt = useLangText();
  return (
    <div className="figma-page-header" style={{ maxWidth: 760 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--primary)" }}>
          <LockKeyhole size={22} aria-hidden="true" />
          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>
        <p style={{ margin: 0 }}>{description}</p>
        <div style={{ padding: 16, borderRadius: 12, background: "var(--bg-gray)", border: "1px solid var(--border-subtle)", lineHeight: 1.7 }}>
          {detail}
        </div>
        <a className="figma-btn" href="https://www.goldenaiquant.cn/" target="_blank" rel="noreferrer" style={{ width: "fit-content" }}>
          {lt("了解完整功能", "View the full product")} <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
