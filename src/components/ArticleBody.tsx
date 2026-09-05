/**
 * Renders announcement / article content authored in the admin panel.
 * Accepts either rich HTML (WordPress-style paste) or Markdown and renders it
 * with the site typography. HTML is sanitized before rendering.
 */
import { Markdown } from "@/components/Markdown";

const ALLOWED = new Set([
  "P","BR","HR","STRONG","B","EM","I","U","S","SMALL","MARK","CODE","PRE","BLOCKQUOTE",
  "UL","OL","LI","H1","H2","H3","H4","H5","H6","A","IMG","TABLE","THEAD","TBODY","TR","TH","TD",
  "SPAN","DIV","FIGURE","FIGCAPTION",
]);

function sanitize(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...[...child.childNodes]);
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        const ok =
          (name === "href" && /^(https?:|mailto:|\/)/i.test(value)) ||
          (name === "src" && /^(https?:|\/|data:image\/)/i.test(value)) ||
          name === "alt" || name === "title" || name === "colspan" || name === "rowspan";
        if (!ok) child.removeAttribute(attr.name);
      });
      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);
    });
  };
  const root = doc.body.firstElementChild;
  if (!root) return "";
  walk(root);
  return root.innerHTML;
}

const HTML_RE = /<\/?(p|div|h[1-6]|ul|ol|li|table|img|a|br|strong|em|blockquote|pre|span)\b[^>]*>/i;

export function ArticleBody({ content }: { content: string }) {
  const isHtml = HTML_RE.test(content);
  if (!isHtml) return <Markdown content={content} />;

  return (
    <div
      className="article-html text-[15px] leading-relaxed text-white/75 [&_h1]:text-2xl [&_h1]:sm:text-4xl [&_h1]:font-black [&_h1]:text-white [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:sm:text-3xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:sm:text-2xl [&_h3]:font-bold [&_h3]:text-white/95 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:my-3 [&_strong]:text-white [&_a]:text-primary [&_a]:underline [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_ul]:marker:text-primary [&_ol]:marker:text-primary [&_img]:rounded-2xl [&_img]:my-5 [&_img]:max-w-full [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/60 [&_blockquote]:bg-primary/5 [&_blockquote]:pl-4 [&_blockquote]:py-3 [&_blockquote]:rounded-r-xl [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-primary/20 [&_pre]:bg-black/50 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[12.5px] [&_code]:font-mono [&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_th]:text-left [&_th]:p-3 [&_th]:text-white [&_th]:bg-white/5 [&_td]:p-3 [&_td]:border-t [&_td]:border-white/5 [&_hr]:my-8 [&_hr]:border-white/10"
      // Content is authored by site admins and sanitized above.
      dangerouslySetInnerHTML={{ __html: sanitize(content) }}
    />
  );
}
