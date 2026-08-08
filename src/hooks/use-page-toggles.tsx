import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PAGE_TOGGLES = [
  { key: "page_location_enabled", label: "Location Page", path: "/location" },
  { key: "page_pricing_enabled", label: "Pricing Page", path: "/pricing" },
  { key: "page_download_enabled", label: "Download Bot Page", path: "/download" },
  { key: "page_affiliate_enabled", label: "Affiliate Program Page", path: "/affiliate" },
  { key: "page_reviews_enabled", label: "Reviews Page", path: "/reviews" },
  { key: "page_about_enabled", label: "About Page", path: "/about" },
  { key: "page_contact_enabled", label: "Contact Page", path: "/contact" },
] as const;

export type PageKey = (typeof PAGE_TOGGLES)[number]["key"];

function isOn(value: string | null | undefined) {
  // default: enabled unless explicitly turned off
  return !(value === "false" || value === "0");
}

export function usePageToggles() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["page-toggles"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("key, value");
      const map: Record<string, boolean> = {};
      for (const t of PAGE_TOGGLES) map[t.key] = true;
      for (const row of (data ?? []) as { key: string; value: string | null }[]) {
        if (row.key in map) map[row.key] = isOn(row.value);
      }
      return map;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("settings-page-toggles")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => {
        qc.invalidateQueries({ queryKey: ["page-toggles"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const enabled = q.data ?? Object.fromEntries(PAGE_TOGGLES.map((t) => [t.key, true]));
  return { enabled: enabled as Record<PageKey, boolean>, loading: q.isLoading };
}

export function usePageEnabled(key: PageKey) {
  const { enabled, loading } = usePageToggles();
  return { enabled: enabled[key] !== false, loading };
}
