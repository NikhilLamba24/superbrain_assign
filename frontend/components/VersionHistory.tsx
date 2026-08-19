"use client";

import { formatTime } from "@/lib/format";
import type { Version } from "@/lib/types";

interface VersionHistoryProps {
  versions: Version[];
  viewedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
}

export function VersionHistory({
  versions,
  viewedVersionId,
  onSelectVersion,
}: VersionHistoryProps) {
  return (
    <aside className="flex flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Version history
      </h2>
      {versions.length === 0 && (
        <p className="px-1 text-sm text-slate-400">No versions yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {versions.map((version) => {
          const viewing = version.id === viewedVersionId;
          return (
            <button
              key={version.id}
              onClick={() => onSelectVersion(viewing ? null : version.id)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                viewing
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-medium">{version.displayVersion}</div>
              <div className="truncate text-xs text-slate-500">{version.prompt}</div>
              <div className="text-xs text-slate-400">
                {formatTime(version.createdAt)}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
