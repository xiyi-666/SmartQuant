import { useEffect, useMemo } from "react";
import { useLanguage } from "../shared/language";
import { toZhContent } from "./content-translate";

type Props = {
  rawHtml: string;
  pageKey: string;
};

function parseHtml(rawHtml: string) {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const title = doc.title || "AIQuartSmart Community Edition";
  const styleTexts = Array.from(doc.querySelectorAll("head style"))
    .map((s) => s.textContent || "")
    .filter(Boolean);

  const main = doc.querySelector("main");
  const html = main ? main.innerHTML : doc.body.innerHTML;
  const mainClass = main?.getAttribute("class") || "";

  return { title, styleTexts, html, mainClass };
}

function sanitizeContainerClass(mainClass: string) {
  return mainClass
    .replace(/\bpl-64\b/g, "")
    .replace(/\bpt-14\b/g, "")
    .replace(/\bml-64\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeLegacyFloatingAssistants(html: string) {
  return html;
}

function localizeLegacyTitle(title: string, lang: "zh" | "en") {
  if (lang === "zh") return title;
  return title
    .replace(/AIQuartSmart Community Edition/g, "AIQuartSmart Community Edition")
    .replace(/量化交易系统/g, "Quant Trading System");
}

export default function ReplicaPage({ rawHtml, pageKey }: Props) {
  const parsed = useMemo(() => parseHtml(rawHtml), [rawHtml]);
  const { lang } = useLanguage();

  const contentHtml = useMemo(() => {
    const source = removeLegacyFloatingAssistants(parsed.html);
    return lang === "zh" ? toZhContent(source) : source;
  }, [parsed.html, lang]);

  useEffect(() => {
    document.title = localizeLegacyTitle(parsed.title, lang);
  }, [parsed.title, lang]);

  useEffect(() => {
    const ids: string[] = [];
    parsed.styleTexts.forEach((css, idx) => {
      const id = `qs-page-style-${pageKey}-${idx}`;
      ids.push(id);
      let styleNode = document.getElementById(id) as HTMLStyleElement | null;
      if (!styleNode) {
        styleNode = document.createElement("style");
        styleNode.id = id;
        document.head.appendChild(styleNode);
      }
      styleNode.textContent = css;
    });

    return () => {
      ids.forEach((id) => {
        const node = document.getElementById(id);
        if (node) node.remove();
      });
    };
  }, [parsed.styleTexts, pageKey]);

  const className = sanitizeContainerClass(parsed.mainClass);

  return <div className={className || ""} dangerouslySetInnerHTML={{ __html: contentHtml }} />;
}
