import { Megaphone, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

export type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_active: boolean | null;
  show_on_web: boolean | null;
  expires_at: string | null;
  created_at: string | null;
};

export const TYPE_STYLES = {
  info: { icon: Info, label: "Update", ring: "ring-primary/30", chip: "bg-primary/15 text-primary border-primary/30", glow: "from-primary/25 to-accent/10" },
  success: { icon: CheckCircle2, label: "Release", ring: "ring-success/30", chip: "bg-success/15 text-success border-success/30", glow: "from-success/25 to-primary/10" },
  warning: { icon: AlertTriangle, label: "Notice", ring: "ring-warning/30", chip: "bg-warning/15 text-warning border-warning/30", glow: "from-warning/25 to-primary/10" },
  error: { icon: XCircle, label: "Important", ring: "ring-destructive/30", chip: "bg-destructive/15 text-destructive border-destructive/30", glow: "from-destructive/25 to-primary/10" },
} as const;

export function styleFor(type: string | null | undefined) {
  return TYPE_STYLES[(type ?? "info") as keyof typeof TYPE_STYLES] ?? TYPE_STYLES.info;
}

export { Megaphone };

export function plainExcerpt(content: string, max = 180) {
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function isLive(r: AnnouncementRow) {
  return !!r.is_active && !!r.show_on_web && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now());
}
