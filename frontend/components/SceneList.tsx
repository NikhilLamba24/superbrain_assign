"use client";

import type { Collaborator, Scene } from "@/lib/types";

interface SceneListProps {
  scenes: Scene[];
  selectedSceneId: string | null;
  collaborators: Collaborator[];
  self: string;
  onSelect: (sceneId: string) => void;
}

export function SceneList({
  scenes,
  selectedSceneId,
  collaborators,
  self,
  onSelect,
}: SceneListProps) {
  return (
    <aside className="flex flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Scenes
      </h2>
      {scenes.map((scene) => {
        const active = scene.id === selectedSceneId;
        const othersEditing = collaborators.filter(
          (c) => c.username !== self && c.sceneId === scene.id,
        ).length;
        return (
          <button
            key={scene.id}
            onClick={() => onSelect(scene.id)}
            className={`rounded-lg px-3 py-2 text-left transition-colors ${
              active ? "bg-sky-600 text-white" : "hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Scene {scene.position}</span>
              {othersEditing > 0 && (
                <span
                  className={`text-xs ${active ? "text-sky-200" : "text-amber-600"}`}
                >
                  {othersEditing} editing
                </span>
              )}
            </div>
            <div
              className={`text-sm ${active ? "text-sky-100" : "text-slate-500"}`}
            >
              {scene.title}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
