"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UsernameForm } from "@/components/UsernameForm";
import { Workspace } from "@/components/Workspace";
import { api, ApiError } from "@/lib/api";
import {
  clearSession,
  loadSession,
  saveSession,
  type StoredSession,
} from "@/lib/session";
import type { ProjectSummary } from "@/lib/types";

type Step = "username" | "projects" | "workspace";

export default function Home() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState<string | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Resume a still-valid session after a page refresh.
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    void api
      .heartbeat(saved.sessionId, saved.sceneId)
      .then(() => {
        setUsername(saved.username);
        setSession(saved);
        setStep("workspace");
      })
      .catch(() => {
        clearSession();
        setSession(null);
        setUsername(null);
      });
  }, []);

  const handleUsername = useCallback(async (name: string) => {
    setUsername(name);
    setError(null);
    try {
      setProjects(await api.listProjects());
      setStep("projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load projects.");
      setStep("projects");
    }
  }, []);

  const handleEnterProject = useCallback(
    async (projectId: string) => {
      if (!username) return;
      setError(null);
      try {
        const resp = await api.joinSession(username, projectId, null);
        const next: StoredSession = {
          username,
          sessionId: resp.sessionId,
          projectId,
          sceneId: null,
        };
        saveSession(next);
        setSession(next);
        setStep("workspace");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to join the project.");
      }
    },
    [username],
  );

  // Called when the Workspace silently rejoins after an expired session while
  // the tab stayed open: keep the same username/project, swap in the fresh
  // session id, and persist it so a later reload also resumes.
  const handleRejoin = useCallback((newSessionId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, sessionId: newSessionId };
      saveSession(next);
      return next;
    });
  }, []);

  const handleLeaveWorkspace = useCallback(() => {
    if (session) void api.leaveSession(session.sessionId);
    clearSession();
    setSession(null);
    setUsername(null);
    setError(null);
    setStep("username");
  }, [session]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      {step === "username" && <UsernameForm onSuccess={handleUsername} />}
      {step === "projects" && username && (
        <ProjectSelect
          username={username}
          projects={projects}
          error={error}
          onEnter={handleEnterProject}
          onSwitchUsername={() => {
            setError(null);
            setUsername(null);
            setStep("username");
          }}
        />
      )}
      {step === "workspace" && username && session && (
        <Workspace
          username={username}
          sessionId={session.sessionId}
          projectId={session.projectId}
          initialSceneId={session.sceneId}
          onExpired={handleLeaveWorkspace}
          onLeave={handleLeaveWorkspace}
          onRejoin={handleRejoin}
        />
      )}
    </main>
  );
}
