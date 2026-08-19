"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Subscribes to scene / image_versions changes so a new generated image or an
 * updated current_version_id propagates to every connected client.
 */
export function useSceneUpdates(
  projectId: string | null,
  sceneIds: string[],
  onChanged: () => void,
): void {
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
        (payload) => {
          // image_versions has no project_id column, so filter by the current
          // project's scenes — otherwise a generation in ANY project would
          // trigger a full project refetch here.
          const sceneId = payload.new?.scene_id as string | undefined;
          if (sceneId && sceneIds.includes(sceneId)) onChanged();
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, sceneIds, onChanged]);
}
