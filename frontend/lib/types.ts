export interface Collaborator {
  username: string;
  sceneId: string | null;
  sceneName: string | null;
}

export interface Version {
  id: string;
  sceneId: string;
  createdBy: string;
  versionNumber: number;
  displayVersion: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  position: number;
  currentVersion: Version | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  sceneCount: number;
  activeCollaborators: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  scenes: Scene[];
  activeCollaborators: Collaborator[];
}

export interface SessionJoinResponse {
  success: boolean;
  sessionId: string;
  collaborators: Collaborator[];
}

export interface GenerateResponse {
  versionId: string;
  displayVersion: string;
  imageUrl: string;
  createdBy: string;
  sceneId: string;
  prompt: string;
  createdAt: string;
}
