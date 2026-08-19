"use client";

import type { ProjectSummary } from "@/lib/types";
import { Button, Card } from "./ui";

interface ProjectSelectProps {
  username: string;
  projects: ProjectSummary[];
  error: string | null;
  onEnter: (projectId: string) => void;
  onSwitchUsername: () => void;
}

export function ProjectSelect({
  username,
  projects,
  error,
  onEnter,
  onSwitchUsername,
}: ProjectSelectProps) {
  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a project</h1>
        <button
          onClick={onSwitchUsername}
          className="text-sm text-slate-400 hover:text-slate-700"
        >
          Not {username}? Switch username
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-6 flex flex-col gap-4">
        {projects.map((project) => (
          <Card key={project.id} className="flex items-center justify-between p-5">
            <div>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {project.sceneCount} scenes
                {project.activeCollaborators > 0 &&
                  ` · ${project.activeCollaborators} active`}
              </p>
            </div>
            <Button onClick={() => onEnter(project.id)}>Enter</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
