import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Platform = {
  id: string;
  name: string;
  kind: string;
  logo_url: string | null;
  url: string | null;
  value: string | null;
};

function buildHref(p: Platform): string | null {
  if (p.kind === "whatsapp" && p.value) {
    const num = p.value.replace(/[^\d]/g, "");
    if (num) return `https://wa.me/${num}`;
  }
  if (p.kind === "email" && p.value) return `mailto:${p.value}`;
  if (p.kind === "phone" && p.value) return `tel:${p.value}`;
  return p.url || null;
}

export function SocialPlatforms({ className = "", iconClass = "w-10 h-10" }: { className?: string; iconClass?: string }) {
  const { data } = useQuery({
    queryKey: ["platforms-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platforms")
        .select("id,name,kind,logo_url,url,value")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Platform[];
    },
    staleTime: 30_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {data.map((p) => {
        const href = buildHref(p);
        const content = (
          <>
            {p.logo_url ? (
              <img src={p.logo_url} alt={p.name} className={`${iconClass} object-contain rounded-lg bg-white/5 p-1.5`} />
            ) : (
              <div className={`${iconClass} grid place-items-center rounded-lg bg-white/10 text-xs font-bold`}>
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </>
        );
        return href ? (
          <a
            key={p.id}
            href={href}
            target={p.kind === "whatsapp" || (p.url ?? "").startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            title={p.name}
            className="group inline-flex items-center gap-2 hover:scale-110 transition-transform"
          >
            {content}
          </a>
        ) : (
          <div key={p.id} title={p.name}>{content}</div>
        );
      })}
    </div>
  );
}
