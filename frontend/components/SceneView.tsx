"use client";

import { formatTime } from "@/lib/format";
import type { Scene, Version } from "@/lib/types";

interface SceneViewProps {
  scene: Scene | null;
  version: Version | null;
  otherEditingNames: string[];
}

export function SceneView({ scene, version, otherEditingNames }: SceneViewProps) {
  if (!scene) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400">
        Select a scene to begin
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div>
        <h2 className="text-xl font-semibold">
          Scene {scene.position} — {scene.title}
        </h2>
        {scene.description && (
          <p className="mt-1 text-sm text-slate-500">{scene.description}</p>
        )}
        {otherEditingNames.length > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            {otherEditingNames.join(", ")}{" "}
            {otherEditingNames.length === 1 ? "is" : "are"} also editing this scene.
          </p>
        )}
      </div>

      {version ? (
        <>
          {/* The image scales to fit the available area without cropping
              (object-contain), so any aspect ratio is shown in full. */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={version.imageUrl}
              alt={version.prompt}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{version.displayVersion}</span>
              <span className="text-xs text-slate-400">
                {formatTime(version.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 text-slate-500">by {version.createdBy}</p>
            <p className="mt-2 italic text-slate-600">“{version.prompt}”</p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
          No image yet. Write a prompt below to generate the first variation.
        </div>
      )}
    </section>
  );
}
