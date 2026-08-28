import { invoke } from "@tauri-apps/api/core";
import type {
  Collection,
  Folder,
  RequestSummary,
  SaveRequestInput,
  SavedRequest,
  WorkspaceTree,
} from "../../types/workspace";

export async function loadWorkspaceTree(): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("load_workspace_tree");
}

export async function createCollection(name: string): Promise<Collection> {
  return invoke<Collection>("create_collection", { name });
}

export async function renameCollection(id: string, name: string): Promise<Collection> {
  return invoke<Collection>("rename_collection", { id, name });
}

export async function deleteCollection(id: string): Promise<void> {
  return invoke<void>("delete_collection", { id });
}

export async function createFolder(collectionId: string, parentId: string | null, name: string): Promise<Folder> {
  return invoke<Folder>("create_folder", { collectionId, parentId, name });
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  return invoke<Folder>("rename_folder", { id, name });
}

export async function deleteFolder(id: string): Promise<void> {
  return invoke<void>("delete_folder", { id });
}

export async function moveFolder(id: string, collectionId: string, parentId: string | null, position: number): Promise<void> {
  return invoke<void>("move_folder", { id, collectionId, parentId, position });
}

export async function saveRequest(request: SaveRequestInput): Promise<SavedRequest> {
  return invoke<SavedRequest>("save_request", { request });
}

export async function getSavedRequest(id: string): Promise<SavedRequest> {
  return invoke<SavedRequest>("get_saved_request", { id });
}

export async function renameRequest(id: string, name: string): Promise<RequestSummary> {
  return invoke<RequestSummary>("rename_request", { id, name });
}

export async function duplicateRequest(id: string): Promise<SavedRequest> {
  return invoke<SavedRequest>("duplicate_request", { id });
}

export async function moveRequest(id: string, collectionId: string, folderId: string | null, position: number): Promise<void> {
  return invoke<void>("move_request", { id, collectionId, folderId, position });
}

export async function deleteRequest(id: string): Promise<void> {
  return invoke<void>("delete_request", { id });
}
