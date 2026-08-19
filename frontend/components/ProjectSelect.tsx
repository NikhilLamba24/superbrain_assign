"use client";

import { useState } from "react";
import type { ProjectSummary } from "@/lib/types";
import { Button, Card } from "./ui";

interface ProjectSelectProps {
  username: string;
  projects: ProjectSummary[];
  error: string | null;
  creating: boolean;
  onEnter: (projectId: string) => void;
  onCreate: (name: string) => void;
  onSwitchUsername: () => void;
}

export function ProjectSelect({
  username,
  projects,
  error,
  creating,
  onEnter,
  onCreate,
  onSwitchUsername,
}: ProjectSelectProps) {
  const [name, setName] = useState("");

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
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Create a new project</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onCreate(name.trim());
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            maxLength={60}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          You become the admin of projects you create. Only you can request their deletion.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {projects.map((project) => (
          <Card key={project.id} className="flex items-center justify-between p-5">
            <div>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {project.sceneCount} scenes
                {project.activeCollaborators > 0 &&
                  ` · ${project.activeCollaborators} active`}
                {project.createdBy && ` · created by ${project.createdBy}`}
              </p>
            </div>
            <Button onClick={() => onEnter(project.id)}>Enter</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
