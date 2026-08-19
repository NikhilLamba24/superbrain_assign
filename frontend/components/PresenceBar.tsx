"use client";

import type { Collaborator } from "@/lib/types";

export function PresenceBar({
  collaborators,
  self,
}: {
  collaborators: Collaborator[];
  self: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-200 bg-white px-6 py-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Editing now
      </span>
      {collaborators.length === 0 && (
        <span className="text-slate-400">No one else is here.</span>
      )}
      {collaborators.map((collaborator) => (
        <span key={collaborator.username} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className={collaborator.username === self ? "font-semibold" : ""}>
            {collaborator.username}
          </span>
          {collaborator.sceneName && (
            <span className="text-slate-400">— {collaborator.sceneName}</span>
          )}
        </span>
      ))}
    </div>
  );
}
