import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live-refreshes business panel queries whenever the software (or another admin)
 * writes to a team table.
 */
export function useTeamRealtime(teamId: string | null, tables: string[], queryKeys: string[][]) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!teamId) return;
    const channel = supabase.channel(`business-${teamId}-${tables.join("-")}`);
    const invalidate = () => {
      for (const key of queryKeys) qc.invalidateQueries({ queryKey: key });
    };
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate);
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, tables.join("-"), JSON.stringify(queryKeys)]);
}
