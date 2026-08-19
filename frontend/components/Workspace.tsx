"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PresenceBar } from "@/components/PresenceBar";
import { PromptBar } from "@/components/PromptBar";
import { SceneList } from "@/components/SceneList";
import { SceneView } from "@/components/SceneView";
import { VersionHistory } from "@/components/VersionHistory";
import { usePresence } from "@/hooks/usePresence";
import { useSceneUpdates } from "@/hooks/useSceneUpdates";
import { API_URL, api, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import type { GenerateResponse, ProjectDetail, Version } from "@/lib/types";

const HEARTBEAT_MS = 10_000;

function toVersion(generated: GenerateResponse): Version {
  return {
    id: generated.versionId,
    sceneId: generated.sceneId,
    createdBy: generated.createdBy,
    versionNumber: 0,
    displayVersion: generated.displayVersion,
    imageUrl: generated.imageUrl,
    prompt: generated.prompt,
    createdAt: generated.createdAt,
  };
}

interface WorkspaceProps {
  username: string;
  sessionId: string;
  projectId: string;
  initialSceneId: string | null;
  onExpired: () => void;
  onLeave: () => void;
  onRejoin: (sessionId: string) => void;
}

export function Workspace({
  username,
  sessionId,
  projectId,
  initialSceneId,
  onExpired,
  onLeave,
  onRejoin,
}: WorkspaceProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(initialSceneId);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const expiredRef = useRef(false);

  // If the session expired (401) while the tab stayed open, silently rejoin
  // with the same username/project/scene so the user never bounces back to the
  // username page. Only fall back to onExpired if the username is now taken.
  const rejoin = useCallback(async () => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    try {
      const resp = await api.joinSession(username, projectId, selectedSceneId);
      onRejoin(resp.sessionId);
      expiredRef.current = false;
    } catch {
      onExpired();
    }
  }, [username, projectId, selectedSceneId, onRejoin, onExpired]);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getProject(projectId);
      setProject(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the project.");
    }
  }, [projectId]);

  // Load the project on mount / when the project id changes.
  useEffect(() => {
    let cancelled = false;
    api
      .getProject(projectId)
      .then((next) => {
        if (!cancelled) {
          setProject(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the project.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Refetch versions whenever the project (and thus the current version) changes.
  useEffect(() => {
    if (!selectedSceneId) return;
    void api
      .listVersions(selectedSceneId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [selectedSceneId, project]);

  // Heartbeat keeps the session alive; on a confirmed 401, silently rejoin.
  useEffect(() => {
    const timer = setInterval(() => {
      void api.heartbeat(sessionId, selectedSceneId).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) void rejoin();
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [sessionId, selectedSceneId, rejoin]);

  // Backgrounded tabs throttle timers, so heartbeat immediately when the tab
  // becomes visible again to avoid the session expiring while hidden.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void api.heartbeat(sessionId, selectedSceneId).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) void rejoin();
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sessionId, selectedSceneId, rejoin]);

  // Realtime: presence + scene/version changes refresh the project state.
  usePresence(projectId, refresh);
  useSceneUpdates(projectId, refresh);

  // Presence also polls every second so "who is using this project" stays live
  // even when a collaborator's session expires without a realtime event.
  useEffect(() => {
    const timer = setInterval(() => {
      void api
        .getPresence(projectId)
        .then(({ activeCollaborators }) => {
          setProject((prev) => (prev ? { ...prev, activeCollaborators } : prev));
        })
        .catch(() => {
          // transient polling error: keep the last known presence
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [projectId]);

  // Best-effort session cleanup on tab close (heartbeat expiry is the fallback).
  useEffect(() => {
    const leave = () => {
      const body = new Blob([JSON.stringify({ sessionId })], {
        type: "application/json",
      });
      navigator.sendBeacon(`${API_URL}/api/sessions/leave`, body);
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [sessionId]);

  const selectScene = useCallback(
    (sceneId: string) => {
      setSelectedSceneId(sceneId);
      setViewedVersionId(null);
      saveSession({ username, sessionId, projectId, sceneId });
      void api.heartbeat(sessionId, sceneId).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) void rejoin();
      });
    },
    [username, sessionId, projectId, rejoin],
  );

  const generate = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (!selectedSceneId || generating) return false;
      setGenerating(true);
      setGenerationError(null);
      try {
        const generated = await api.generateImage(selectedSceneId, username, prompt);
        setViewedVersionId(null);
        setVersions((prev) => [
          toVersion(generated),
          ...prev.filter((v) => v.id !== generated.versionId),
        ]);
        await refresh();
        return true;
      } catch (err) {
        setGenerationError(
          err instanceof ApiError ? err.message : "Image generation failed. Please try again.",
        );
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [selectedSceneId, generating, username, refresh],
  );

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading storyboard…
      </div>
    );
  }

  const collaborators = project.activeCollaborators;
  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) ?? null;
  const otherEditingNames = selectedSceneId
    ? collaborators
        .filter((c) => c.username !== username && c.sceneId === selectedSceneId)
        .map((c) => c.username)
    : [];
  const viewedVersion =
    versions.find((v) => v.id === viewedVersionId) ?? selectedScene?.currentVersion ?? null;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">StorySync</h1>
          <span className="text-sm text-slate-500">{project.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">
            {collaborators.length} active{" "}
            {collaborators.length === 1 ? "collaborator" : "collaborators"}
          </span>
          <button onClick={onLeave} className="text-sm text-slate-400 hover:text-slate-700">
            Leave
          </button>
        </div>
      </header>

      <PresenceBar collaborators={collaborators} self={username} />

      {error && <div className="bg-amber-50 px-6 py-2 text-sm text-amber-700">{error}</div>}

      <main className="grid min-h-0 flex-1 grid-cols-[210px_1fr_250px] gap-5 p-5">
        <SceneList
          scenes={project.scenes}
          selectedSceneId={selectedSceneId}
          collaborators={collaborators}
          self={username}
          onSelect={selectScene}
        />
        <SceneView
          scene={selectedScene}
          version={viewedVersion}
          otherEditingNames={otherEditingNames}
        />
        <VersionHistory
          versions={versions}
          viewedVersionId={viewedVersionId}
          onSelectVersion={setViewedVersionId}
        />
      </main>

      <PromptBar
        generating={generating}
        error={generationError}
        disabled={!selectedScene}
        onGenerate={generate}
      />
    </div>
  );
}
