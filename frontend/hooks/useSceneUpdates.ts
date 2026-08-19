"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Subscribes to scene / image_versions changes so a new generated image or an
 * updated current_version_id propagates to every connected client.
 */
export function useSceneUpdates(projectId: string | null, onChanged: () => void): void {
  useEffect(() => {
    if (!projectId) return;
    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel(`storysync-scenes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "scenes",
          filter: `project_id=eq.${projectId}`,
        },
        onChanged,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "image_versions" },
        onChanged,
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, onChanged]);
}
