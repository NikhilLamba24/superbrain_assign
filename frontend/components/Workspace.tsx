"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeletionModal } from "@/components/DeletionModal";
import { PresenceBar } from "@/components/PresenceBar";
import { PromptBar } from "@/components/PromptBar";
import { SceneList } from "@/components/SceneList";
import { SceneView } from "@/components/SceneView";
import { VersionHistory } from "@/components/VersionHistory";
import { usePresence } from "@/hooks/usePresence";
import { useSceneUpdates } from "@/hooks/useSceneUpdates";
import { API_URL, api, ApiError } from "@/lib/api";
import { saveSession } from "@/lib/session";
import type { DeleteStatus, GenerateResponse, ProjectDetail, Version } from "@/lib/types";

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
  onBack: () => void;
  onRejoin: (sessionId: string) => void;
  onDeleted: () => void;
}

export function Workspace({
  username,
  sessionId,
  projectId,
  initialSceneId,
  onExpired,
  onLeave,
  onBack,
  onRejoin,
  onDeleted,
}: WorkspaceProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(initialSceneId);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [votedRequestId, setVotedRequestId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
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

  // Refresh the project state. Multiple triggers (realtime events, generation)
  // can fire in quick succession; coalesce them into at most ONE in-flight
  // request so we never pile up concurrent getProject calls (which exceeded
  // the browser's connection limit and caused intermittent fetch resets /
  // "Cannot reach the server" flashes). A transient failure keeps the last
  // known data and does not show the error banner.
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    try {
      const next = await api.getProject(projectId);
      setProject(next);
      setError(null);
    } catch {
      // transient failure: keep the last known project; do not flash an error
    } finally {
      refreshInFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        void refresh();
      }
    }
  }, [projectId]);

  // Ids of the current project's scenes — used to filter realtime image-version
  // events so generations in OTHER projects do not trigger a refresh here.
  const projectSceneIds = useMemo(
    () => project?.scenes.map((s) => s.id) ?? [],
    [project?.scenes],
  );

  // Manual retry after an initial load failure (the workspace must not stay
  // stuck on the loading screen when the backend is temporarily unreachable).
  const retryLoad = useCallback(() => {
    setLoadFailed(false);
    api
      .getProject(projectId)
      .then((next) => {
        setProject(next);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load the project.");
        setLoadFailed(true);
      });
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
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Refetch versions when the selected scene changes or its current version
  // changes (a new generation landed). Deliberately NOT keyed on the whole
  // `project` object — the 1s presence poll would otherwise refetch (and
  // flicker) the version list every second.
  const currentVersionId =
    project?.scenes.find((s) => s.id === selectedSceneId)?.currentVersion?.id ?? null;

  useEffect(() => {
    if (!selectedSceneId) return;
    void api
      .listVersions(selectedSceneId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [selectedSceneId, currentVersionId]);

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
  useSceneUpdates(projectId, projectSceneIds, refresh);

  // Presence also polls every second so "who is using this project" stays live
  // even when a collaborator's session expires without a realtime event. Only
  // update state when the collaborator list actually changed — returning the
  // same object reference avoids re-rendering (and re-fetching versions).
  useEffect(() => {
    const timer = setInterval(() => {
      void api
        .getPresence(projectId)
        .then(({ activeCollaborators }) => {
          setProject((prev) => {
            if (!prev) return prev;
            const unchanged =
              prev.activeCollaborators.length === activeCollaborators.length &&
              prev.activeCollaborators.every(
                (c, i) =>
                  activeCollaborators[i] &&
                  c.username === activeCollaborators[i].username &&
                  c.sceneId === activeCollaborators[i].sceneId,
              );
            return unchanged ? prev : { ...prev, activeCollaborators };
          });
        })
        .catch(() => {
          // transient polling error: keep the last known presence
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [projectId]);

  // Deletion-request state is polled every second so the admin (live response
  // feed) and co-contributors (consent popup) both stay current.
  useEffect(() => {
    const timer = setInterval(() => {
      void api
        .getDeletionStatus(projectId)
        .then((status) => {
          setDeleteStatus(status);
          if (status.status === "deleted") onDeleted();
        })
        .catch(() => {
          // transient polling error: keep the last known state
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [projectId, onDeleted]);

  // Best-effort session cleanup on tab close. `pagehide` fires reliably on
  // close/navigation (more so than `beforeunload`); sendBeacon survives unload.
  // Heartbeat expiry remains the source of truth if neither fires.
  useEffect(() => {
    const leave = () => {
      const body = new Blob([JSON.stringify({ sessionId })], {
        type: "application/json",
      });
      navigator.sendBeacon(`${API_URL}/api/sessions/leave`, body);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
    };
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

  const requestDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const resp = await api.requestProjectDeletion(projectId, username);
      if (resp.status === "deleted") {
        onDeleted();
        return;
      }
      setDeleteStatus(await api.getDeletionStatus(projectId));
    } finally {
      setDeleting(false);
    }
  }, [projectId, username, deleting, onDeleted]);

  const respondToDeletion = useCallback(
    async (approve: boolean) => {
      if (!deleteStatus?.requestId) return;
      setVotedRequestId(deleteStatus.requestId);
      const resp = await api.respondToDeletion(projectId, username, approve);
      setDeleteStatus({ ...deleteStatus, status: resp.status });
      if (resp.status === "deleted") onDeleted();
    },
    [projectId, username, deleteStatus, onDeleted],
  );

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-slate-400">
        {loadFailed ? (
          <>
            <p className="text-sm">{error ?? "Failed to load the project."}</p>
            <button
              onClick={retryLoad}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Retry
            </button>
          </>
        ) : (
          <p>Loading storyboard…</p>
        )}
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

  const isAdmin = project.createdBy === username;

  const showDeletionPopup =
    deleteStatus?.status === "pending" &&
    !isAdmin &&
    deleteStatus.requestedBy !== null &&
    deleteStatus.requestedBy !== username &&
    deleteStatus.requestId !== votedRequestId;

  const adminResponses =
    isAdmin && deleteStatus?.responses?.length ? deleteStatus.responses : [];

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
          {isAdmin && (
            <button
              onClick={requestDelete}
              disabled={deleting}
              className="text-sm text-rose-500 hover:text-rose-700 disabled:opacity-50"
            >
              {deleting ? "Requesting…" : "Delete project"}
            </button>
          )}
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700">
            Back to projects
          </button>
          <button onClick={onLeave} className="text-sm text-slate-400 hover:text-slate-700">
            Leave
          </button>
        </div>
      </header>

      <PresenceBar collaborators={collaborators} self={username} />

      {error && <div className="bg-amber-50 px-6 py-2 text-sm text-amber-700">{error}</div>}

      {adminResponses.length > 0 && deleteStatus?.status === "pending" && (
        <div className="space-y-1 bg-sky-50 px-6 py-2 text-sm text-sky-800">
          {adminResponses.map((v) => (
            <p key={v.username}>
              {v.approved
                ? `${v.username} is your co-developer for this project and is okay with the deletion.`
                : `${v.username} is having some work progress here and doesn't want to delete this.`}
            </p>
          ))}
        </div>
      )}
      {deleteStatus?.status === "rejected" && isAdmin && (
        <div className="bg-rose-50 px-6 py-2 text-sm text-rose-700">
          Deletion cancelled — a co-contributor has work progress in this project.
        </div>
      )}

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

      {showDeletionPopup && deleteStatus?.requestedBy && (
        <DeletionModal
          adminName={deleteStatus.requestedBy}
          onApprove={() => respondToDeletion(true)}
          onReject={() => respondToDeletion(false)}
        />
      )}
    </div>
  );
}
