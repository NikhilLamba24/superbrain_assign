"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Subscribes to active_sessions changes (presence) for the project and calls
 * onChanged whenever someone joins, changes scene, or leaves.
 */
export function usePresence(projectId: string | null, onChanged: () => void): void {
  useEffect(() => {
    if (!projectId) return;
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel(`storysync-presence-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_sessions",
          filter: `project_id=eq.${projectId}`,
        },
        onChanged,
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, onChanged]);
}
