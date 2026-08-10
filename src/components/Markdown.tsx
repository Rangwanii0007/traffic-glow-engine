/**
 * Minimal, dependency-free markdown renderer tuned for the AD4YOU package articles:
 * headings, bold, inline code, fenced code blocks, tables, lists, quotes and rules.
 */
import { type ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("**")) nodes.push(<strong key={key} className="text-white font-bold">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key} className="px-1.5 py-0.5 rounded bg-white/10 text-primary font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={key} className="italic text-white/90">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(
        <pre key={`b${key++}`} className="my-5 overflow-x-auto rounded-2xl border border-primary/20 bg-black/50 p-4 text-[12.5px] leading-relaxed font-mono text-emerald-200/90">
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const head = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i += 1;
      }
      blocks.push(
        <div key={`b${key++}`} className="my-6 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-white/5">
              <tr>{head.map((h, hi) => <th key={hi} className="text-left p-3 font-semibold text-white">{inline(h, `h${hi}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-white/5">
                  {r.map((c, ci) => <td key={ci} className="p-3 text-white/75 align-top">{inline(c, `c${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*(-{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className="my-8 border-white/10" />);
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const cls = level <= 1
        ? "text-2xl sm:text-4xl font-black mt-10 mb-4 bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent"
        : level === 2
          ? "text-xl sm:text-3xl font-bold mt-9 mb-3 text-white"
          : level === 3
            ? "text-lg sm:text-2xl font-bold mt-7 mb-2 text-white/95"
            : "text-base sm:text-lg font-semibold mt-6 mb-2 text-white/90";
      blocks.push(<p key={`b${key++}`} className={cls}>{inline(text, `hd${key}`)}</p>);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      blocks.push(
        <blockquote key={`b${key++}`} className="my-5 border-l-4 border-primary/60 bg-primary/5 pl-4 py-3 rounded-r-xl text-white/80">
          {inline(buf.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={`b${key++}`} className={`my-4 space-y-2 pl-5 ${ordered ? "list-decimal" : "list-disc"} text-white/75 marker:text-primary`}>
          {items.map((it, ii) => <li key={ii}>{inline(it, `li${key}-${ii}`)}</li>)}
        </Tag>,
      );
      continue;
    }

    if (!line.trim()) { i += 1; continue; }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|\s*>|```|\|)/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={`b${key++}`} className="my-3 leading-relaxed text-white/75">{inline(buf.join(" "), `p${key}`)}</p>);
  }

  return <div className="text-[15px]">{blocks}</div>;
}
