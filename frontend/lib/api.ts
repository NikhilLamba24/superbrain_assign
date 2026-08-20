import type {
  Collaborator,
  CreateProjectResponse,
  DeleteResponse,
  DeleteStatus,
  GenerateResponse,
  ProjectDetail,
  ProjectSummary,
  Scene,
  SessionJoinResponse,
  Version,
} from "./types";

export const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  code?: string;
  cause?: unknown;

  constructor(message: string, status: number, code?: string, cause?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });

  let resp: Response;
  try {
    resp = await doFetch();
  } catch (cause) {
    // Network-level failure (e.g. a dead keep-alive connection left over from a
    // backend restart). Retry once after a short delay before giving up — this
    // avoids one-off "Cannot reach the server" errors on user actions like
    // Delete Project. HTTP errors are NOT retried (handled below).
    await new Promise((r) => setTimeout(r, 500));
    try {
      resp = await doFetch();
    } catch {
      throw new ApiError(
        "Cannot reach the server. Is the backend running?",
        0,
        undefined,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  if (!resp.ok) {
    let message = `Request failed (${resp.status})`;
    try {
      const body = (await resp.json()) as { detail?: unknown; code?: string };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the default message when the body is not JSON
    }
    throw new ApiError(message, resp.status);
  }

  return (await resp.json()) as T;
}

export const api = {
  checkUsername: (username: string) =>
    request<{ available: boolean }>("/api/sessions/check", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),

  joinSession: (username: string, projectId: string, sceneId: string | null) =>
    request<SessionJoinResponse>("/api/sessions/join", {
      method: "POST",
      body: JSON.stringify({ username, projectId, sceneId }),
    }),

  heartbeat: (sessionId: string, sceneId: string | null) =>
    request<{ success: boolean }>("/api/sessions/heartbeat", {
      method: "POST",
      body: JSON.stringify({ sessionId, sceneId }),
    }),

  leaveSession: (sessionId: string) =>
    request<{ success: boolean }>("/api/sessions/leave", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),

  listProjects: () => request<ProjectSummary[]>("/api/projects"),

  getProject: (projectId: string) =>
    request<ProjectDetail>(`/api/projects/${projectId}`),

  getPresence: (projectId: string) =>
    request<{ activeCollaborators: Collaborator[] }>(
      `/api/projects/${projectId}/presence`,
    ),

  createProject: (username: string, name: string) =>
    request<CreateProjectResponse>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ username, name }),
    }),

  requestProjectDeletion: (projectId: string, username: string) =>
    request<{ status: string; requestId: string | null; contributors: string[] }>(
      `/api/projects/${projectId}/delete/request`,
      { method: "POST", body: JSON.stringify({ username }) },
    ),

  getDeletionStatus: (projectId: string) =>
    request<DeleteStatus>(`/api/projects/${projectId}/delete/status`),

  respondToDeletion: (projectId: string, username: string, approve: boolean) =>
    request<DeleteResponse>(`/api/projects/${projectId}/delete/vote`, {
      method: "POST",
      body: JSON.stringify({ username, approve }),
    }),

  listScenes: (projectId: string) =>
    request<Scene[]>(`/api/projects/${projectId}/scenes`),

  getScene: (sceneId: string) => request<Scene>(`/api/scenes/${sceneId}`),

  generateImage: (sceneId: string, username: string, prompt: string) =>
    request<GenerateResponse>(`/api/scenes/${sceneId}/generate`, {
      method: "POST",
      body: JSON.stringify({ username, prompt }),
    }),

  listVersions: (sceneId: string) =>
    request<Version[]>(`/api/scenes/${sceneId}/versions`),
};
