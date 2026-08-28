import type { Collection, Folder, RequestSummary, SavedRequest, SaveRequestInput } from "../../types/workspace";
import * as client from "./collections-client";

interface ExportCollection {
  sourceId: string;
  name: string;
  description: string;
  folders: Array<{ sourceId: string; parentSourceId: string | null; name: string }>;
  requests: Array<Omit<SaveRequestInput, "id" | "collectionId" | "folderId"> & { folderSourceId: string | null }>;
}

export interface LaikaExport { format: "laika-collections"; version: 1; exportedAt: string; collections: ExportCollection[] }

export function buildWorkspaceExport(collections: Collection[], folders: Folder[], requests: RequestSummary[], savedRequests: SavedRequest[]): LaikaExport {
  const detail = new Map(savedRequests.map((request) => [request.id, request]));
  return {
    format: "laika-collections", version: 1, exportedAt: new Date().toISOString(),
    collections: collections.map((collection) => ({
      sourceId: collection.id, name: collection.name, description: collection.description,
      folders: folders.filter((folder) => folder.collectionId === collection.id).map((folder) => ({ sourceId: folder.id, parentSourceId: folder.parentId, name: folder.name })),
      requests: requests.filter((request) => request.collectionId === collection.id).map((summary) => {
        const saved = detail.get(summary.id)!;
        return { folderSourceId: saved.folderId, name: saved.name, method: saved.method, url: saved.url, params: saved.params, headers: saved.headers, bodyMode: saved.bodyMode, body: saved.body, form: saved.form, auth: saved.auth, authSecret: null, timeoutMs: saved.timeoutMs, assertions: saved.assertions };
      }),
    })),
  };
}

export async function exportWorkspace(collections: Collection[], folders: Folder[], requests: RequestSummary[]) {
  const payload = buildWorkspaceExport(collections, folders, requests, await Promise.all(requests.map((request) => client.getSavedRequest(request.id))));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `laika-collections-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  URL.revokeObjectURL(url);
}

export async function importWorkspace(file: File) {
  const parsed = JSON.parse(await file.text()) as Partial<LaikaExport>;
  if (parsed.format !== "laika-collections" || parsed.version !== 1 || !Array.isArray(parsed.collections)) throw new Error("This is not a supported Laika collections file.");
  for (const collection of parsed.collections) {
    if (!collection.name || !Array.isArray(collection.folders) || !Array.isArray(collection.requests)) throw new Error("The collections file is incomplete.");
    const createdCollection = await client.createCollection(collection.name);
    const folderIds = new Map<string, string>();
    let pending = [...collection.folders];
    while (pending.length) {
      const ready = pending.filter((folder) => folder.parentSourceId === null || folderIds.has(folder.parentSourceId));
      if (!ready.length) throw new Error("The collections file contains an invalid folder hierarchy.");
      for (const folder of ready) {
        const created = await client.createFolder(createdCollection.id, folder.parentSourceId ? folderIds.get(folder.parentSourceId)! : null, folder.name);
        folderIds.set(folder.sourceId, created.id);
      }
      const readyIds = new Set(ready.map((folder) => folder.sourceId));
      pending = pending.filter((folder) => !readyIds.has(folder.sourceId));
    }
    for (const request of collection.requests) {
      const { folderSourceId, ...input } = request;
      await client.saveRequest({ ...input, id: null, collectionId: createdCollection.id, folderId: folderSourceId ? folderIds.get(folderSourceId) ?? null : null });
    }
  }
}
