import { supabase } from "@/integrations/supabase/client";

export type DownloadOption = {
  id: string;
  title: string | null;
  version: string;
  platform: string | null;
  download_url: string | null;
  release_notes: string | null;
  file_size: string | null;
  is_latest: boolean | null;
  created_at: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export function downloadLabel(item: Pick<DownloadOption, "title" | "platform" | "version">) {
  if (item.title && item.title.trim()) return item.title.trim();
  const platform = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : "Download";
  return item.version ? `AD4YOU for ${platform} — v${item.version}` : `AD4YOU for ${platform}`;
}

/**
 * Loads every download option the admin created. Columns added later (title,
 * is_active, sort_order) may be missing on older databases, so rows are filtered
 * and sorted in code instead of in the query. When no option has a link yet, the
 * original single download link from settings is returned so the page is never empty.
 */
export async function loadDownloadOptions(): Promise<DownloadOption[]> {
  const { data } = await supabase.from("bot_versions").select("*");
  const rows = ((data ?? []) as unknown as DownloadOption[])
    .filter((r) => r.is_active !== false)
    .sort((a, b) => {
      const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (order !== 0) return order;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

  if (rows.some((r) => r.download_url)) return rows;

  const { data: legacy } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "download_url")
    .maybeSingle();
  const url = (legacy as { value?: string | null } | null)?.value ?? null;
  if (!url) return rows;

  const fallback: DownloadOption = {
    id: "legacy-download",
    title: "Download AD4YOU",
    version: rows[0]?.version ?? "",
    platform: "windows",
    download_url: url,
    release_notes: null,
    file_size: null,
    is_latest: true,
    created_at: null,
    sort_order: -1,
    is_active: true,
  };
  return [fallback, ...rows];
}
