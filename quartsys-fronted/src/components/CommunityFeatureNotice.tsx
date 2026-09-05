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
    <section className="community-feature-notice" aria-labelledby="community-feature-notice-title">
      <div className="community-feature-notice-card">
        <div className="community-feature-notice-icon" aria-hidden="true">
          <LockKeyhole size={24} />
        </div>
        <div className="community-feature-notice-copy">
          <p className="community-feature-notice-eyebrow">{lt("社区版功能说明", "Community edition")}</p>
          <h1 id="community-feature-notice-title">{title}</h1>
          <p className="community-feature-notice-description">{description}</p>
          <div className="community-feature-notice-detail">{detail}</div>
          <a className="figma-btn community-feature-notice-action" href="https://www.goldenaiquant.cn/" target="_blank" rel="noreferrer">
            {lt("了解完整功能", "View the full product")} <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
