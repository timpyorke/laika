import { ArrowRightLeft, ChevronDown, ChevronRight, Copy, Download, FilePlus2, Folder, FolderPlus, LoaderCircle, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Input } from "../../components/ui/input";
import { methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import type { Folder as FolderModel, RequestSummary } from "../../types/workspace";
import { MoveItemDialog, type MoveTarget } from "./move-item-dialog";
import { exportWorkspace, importWorkspace } from "./workspace-transfer";

type DeleteTarget = { kind: "collection" | "folder" | "request"; id: string; name: string };
type RenameTarget = { kind: "collection" | "folder" | "request"; id: string };
type DragItem = { kind: "folder" | "request"; id: string };
type DropTarget = { kind: "collection" | "folder" | "request"; id: string; collectionId: string; parentId: string | null; position: number };
const dragMime = "application/x-laika-sidebar-item";

const childKey = (collectionId: string, parentId: string | null) => `${collectionId}:${parentId ?? "root"}`;

export function CollectionsSidebar() {
  const collections = useAppStore((state) => state.collections);
  const folders = useAppStore((state) => state.folders);
  const requests = useAppStore((state) => state.requests);
  const workspaceLoading = useAppStore((state) => state.workspaceLoading);
  const workspaceError = useAppStore((state) => state.workspaceError);
  const search = useAppStore((state) => state.collectionSearch);
  const expandedNodes = useAppStore((state) => state.expandedNodes);
  const activeRequestId = useAppStore((state) => state.draft.savedRequestId);
  const setCollectionSearch = useAppStore((state) => state.setCollectionSearch);
  const toggleNode = useAppStore((state) => state.toggleNode);
  const createCollection = useAppStore((state) => state.createCollection);
  const renameCollection = useAppStore((state) => state.renameCollection);
  const deleteCollection = useAppStore((state) => state.deleteCollection);
  const createFolder = useAppStore((state) => state.createFolder);
  const renameFolder = useAppStore((state) => state.renameFolder);
  const deleteFolder = useAppStore((state) => state.deleteFolder);
  const openSavedRequest = useAppStore((state) => state.openSavedRequest);
  const renameRequest = useAppStore((state) => state.renameRequest);
  const duplicateRequest = useAppStore((state) => state.duplicateRequest);
  const deleteRequest = useAppStore((state) => state.deleteRequest);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const moveFolder = useAppStore((state) => state.moveFolder);
  const moveRequest = useAppStore((state) => state.moveRequest);

  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { await importWorkspace(file); await useAppStore.getState().loadWorkspace(); toast.success("Collections imported"); }
    catch (error) { toast.error("Import failed", { description: error instanceof Error ? error.message : "Check the file and try again." }); }
  };
  const downloadExport = async () => {
    try { await exportWorkspace(collections, folders, requests); toast.success("Collections exported"); }
    catch { toast.error("Export failed"); }
  };

  const foldersByParent = useMemo(() => {
    const map = new Map<string, FolderModel[]>();
    for (const folder of folders) {
      const key = childKey(folder.collectionId, folder.parentId);
      map.set(key, [...(map.get(key) ?? []), folder]);
    }
    return map;
  }, [folders]);

  const requestsByParent = useMemo(() => {
    const map = new Map<string, RequestSummary[]>();
    for (const request of requests) {
      const key = childKey(request.collectionId, request.folderId);
      map.set(key, [...(map.get(key) ?? []), request]);
    }
    return map;
  }, [requests]);

  const query = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (query === "") return null;
    return requests.filter(
      (request) => request.name.toLowerCase().includes(query) || request.url.toLowerCase().includes(query),
    );
  }, [query, requests]);

  const commitRename = (target: RenameTarget, value: string) => {
    setRenaming(null);
    const name = value.trim();
    if (name === "") return;
    if (target.kind === "collection") void renameCollection(target.id, name);
    if (target.kind === "folder") void renameFolder(target.id, name);
    if (target.kind === "request") void renameRequest(target.id, name);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "collection") void deleteCollection(pendingDelete.id);
    if (pendingDelete.kind === "folder") void deleteFolder(pendingDelete.id);
    if (pendingDelete.kind === "request") void deleteRequest(pendingDelete.id);
  };

  const dropItem = (event: DragEvent, target: DropTarget) => {
    event.preventDefault();
    try {
      const item = JSON.parse(event.dataTransfer.getData(dragMime)) as DragItem;
      if (item.id === target.id) return;
      const parentId = target.kind === "collection" ? null : target.parentId;
      const position = target.kind === "collection" ? Number.MAX_SAFE_INTEGER : target.position;
      if (item.kind === "folder") void moveFolder(item.id, target.collectionId, parentId, position);
      else {
        const folderId = target.kind === "folder" ? target.id : parentId;
        const requestPosition = target.kind === "folder" ? (requestsByParent.get(childKey(target.collectionId, target.id)) ?? []).length : position;
        void moveRequest(item.id, target.collectionId, folderId, requestPosition);
      }
    } catch { /* Ignore data from outside Laika. */ }
  };

  const renderRequest = (request: RequestSummary, level: number) => (
    <TreeRow
      key={request.id}
      level={level}
      active={request.id === activeRequestId}
      icon={<span className={cn("w-11 shrink-0 text-[10px] font-bold", methodColor[request.method])}>{request.method}</span>}
      label={request.name}
      renaming={renaming?.kind === "request" && renaming.id === request.id}
      onRename={(value) => commitRename({ kind: "request", id: request.id }, value)}
      onCancelRename={() => setRenaming(null)}
      onActivate={() => void openSavedRequest(request.id)}
      dragItem={{ kind: "request", id: request.id }}
      onDrop={(event) => dropItem(event, { kind: "request", id: request.id, collectionId: request.collectionId, parentId: request.folderId, position: (requestsByParent.get(childKey(request.collectionId, request.folderId)) ?? []).findIndex((item) => item.id === request.id) })}
      actions={[
        { icon: <Pencil size={13} />, label: `Rename ${request.name}`, onClick: () => setRenaming({ kind: "request", id: request.id }) },
        { icon: <Copy size={13} />, label: `Duplicate ${request.name}`, onClick: () => void duplicateRequest(request.id) },
        { icon: <ArrowRightLeft size={13} />, label: `Move ${request.name}`, onClick: () => setMoveTarget({ kind: "request", id: request.id, name: request.name, collectionId: request.collectionId, folderId: request.folderId }) },
        { icon: <Trash2 size={13} />, label: `Delete ${request.name}`, danger: true, onClick: () => setPendingDelete({ kind: "request", id: request.id, name: request.name }) },
      ]}
    />
  );

  const renderFolder = (folder: FolderModel, level: number) => {
    const key = childKey(folder.collectionId, folder.id);
    const childFolders = foldersByParent.get(key) ?? [];
    const childRequests = requestsByParent.get(key) ?? [];
    const expanded = expandedNodes[folder.id] ?? false;

    return (
      <div key={folder.id}>
        <TreeRow
          level={level}
          expanded={expanded}
          icon={<Folder size={15} className="shrink-0 text-[#d19a24]" />}
          label={folder.name}
          count={childFolders.length + childRequests.length}
          renaming={renaming?.kind === "folder" && renaming.id === folder.id}
          onRename={(value) => commitRename({ kind: "folder", id: folder.id }, value)}
          onCancelRename={() => setRenaming(null)}
          onActivate={() => toggleNode(folder.id)}
          dragItem={{ kind: "folder", id: folder.id }}
          onDrop={(event) => dropItem(event, { kind: "folder", id: folder.id, collectionId: folder.collectionId, parentId: folder.parentId, position: (foldersByParent.get(childKey(folder.collectionId, folder.parentId)) ?? []).findIndex((item) => item.id === folder.id) })}
          actions={[
            { icon: <FilePlus2 size={13} />, label: `Save current request into ${folder.name}`, onClick: () => void saveDraft(folder.collectionId, folder.id) },
            { icon: <FolderPlus size={13} />, label: `New folder in ${folder.name}`, onClick: () => void createFolder(folder.collectionId, folder.id, "New folder") },
            { icon: <ArrowRightLeft size={13} />, label: `Move ${folder.name}`, onClick: () => setMoveTarget({ kind: "folder", id: folder.id, name: folder.name, collectionId: folder.collectionId, parentId: folder.parentId }) },
            { icon: <Pencil size={13} />, label: `Rename ${folder.name}`, onClick: () => setRenaming({ kind: "folder", id: folder.id }) },
            { icon: <Trash2 size={13} />, label: `Delete ${folder.name}`, danger: true, onClick: () => setPendingDelete({ kind: "folder", id: folder.id, name: folder.name }) },
          ]}
        />
        {expanded ? (
          <>
            {childFolders.map((child) => renderFolder(child, level + 1))}
            {childRequests.map((request) => renderRequest(request, level + 1))}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 py-3">
        <label className="relative block min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 text-[var(--muted)]" size={15} />
          <Input
            className="w-full pl-8"
            placeholder="Search collections"
            aria-label="Search collections"
            value={search}
            onChange={(event) => setCollectionSearch(event.target.value)}
          />
        </label>
        <Button variant="secondary" size="icon" aria-label="New collection" title="New collection" onClick={() => setCreatingCollection(true)}>
          <Plus size={15} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Export collections" title="Export collections" onClick={() => void downloadExport()}><Download size={15} /></Button>
        <Button variant="ghost" size="icon" aria-label="Import collections" title="Import collections" onClick={() => importInput.current?.click()}><Upload size={15} /></Button>
        <input ref={importInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event)} aria-label="Import Laika collections file" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3 panel-scroll">
        {workspaceLoading ? <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-[var(--muted)]" role="status"><LoaderCircle className="animate-spin" size={15} /> Loading workspace…</div> : null}
        {workspaceError ? (
          <p className="px-3 text-xs text-[var(--danger)]" role="alert">
            {workspaceError.message}
          </p>
        ) : null}

        {matches ? (
          matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">No requests match “{search.trim()}”.</p>
          ) : (
            matches.map((request) => renderRequest(request, 0))
          )
        ) : (
          collections.map((collection) => {
            const key = childKey(collection.id, null);
            const childFolders = foldersByParent.get(key) ?? [];
            const childRequests = requestsByParent.get(key) ?? [];
            const expanded = expandedNodes[collection.id] ?? false;
            return (
              <div key={collection.id}>
                <TreeRow
                  level={0}
                  expanded={expanded}
                  icon={<Folder size={15} className="shrink-0 text-[#d19a24]" />}
                  label={collection.name}
                  count={childFolders.length + childRequests.length}
                  renaming={renaming?.kind === "collection" && renaming.id === collection.id}
                  onRename={(value) => commitRename({ kind: "collection", id: collection.id }, value)}
                  onCancelRename={() => setRenaming(null)}
                  onActivate={() => toggleNode(collection.id)}
                  onDrop={(event) => dropItem(event, { kind: "collection", id: collection.id, collectionId: collection.id, parentId: null, position: Number.MAX_SAFE_INTEGER })}
                  actions={[
                    { icon: <FilePlus2 size={13} />, label: `Save current request into ${collection.name}`, onClick: () => void saveDraft(collection.id, null) },
                    { icon: <FolderPlus size={13} />, label: `New folder in ${collection.name}`, onClick: () => void createFolder(collection.id, null, "New folder") },
                    { icon: <Pencil size={13} />, label: `Rename ${collection.name}`, onClick: () => setRenaming({ kind: "collection", id: collection.id }) },
                    { icon: <Trash2 size={13} />, label: `Delete ${collection.name}`, danger: true, onClick: () => setPendingDelete({ kind: "collection", id: collection.id, name: collection.name }) },
                  ]}
                />
                {expanded ? (
                  <>
                    {childFolders.map((folder) => renderFolder(folder, 1))}
                    {childRequests.map((request) => renderRequest(request, 1))}
                  </>
                ) : null}
              </div>
            );
          })
        )}

        {creatingCollection ? (
          <div className="px-3 pt-2">
            <NameInput
              placeholder="Collection name"
              onCommit={(value) => {
                setCreatingCollection(false);
                if (value.trim() !== "") void createCollection(value.trim());
              }}
              onCancel={() => setCreatingCollection(false)}
            />
          </div>
        ) : null}

        {!workspaceLoading && !workspaceError && collections.length === 0 && !creatingCollection && !matches ? (
          <div className="px-6 py-10 text-center text-xs text-[var(--muted)]">
            <p className="text-sm font-medium text-[var(--foreground)]">No collections yet</p>
            <p className="mt-1">Create a collection to save requests and reopen them later.</p>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description={
          pendingDelete?.kind === "request"
            ? "The request is removed from this collection. History entries are kept."
            : "Everything inside is deleted too. History entries are kept."
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
      <MoveItemDialog
        target={moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      />
    </div>
  );
}

interface RowAction {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface TreeRowProps {
  level: number;
  icon: React.ReactNode;
  label: string;
  count?: number;
  expanded?: boolean;
  active?: boolean;
  renaming: boolean;
  actions: RowAction[];
  onActivate: () => void;
  onRename: (value: string) => void;
  onCancelRename: () => void;
  dragItem?: DragItem;
  onDrop?: (event: DragEvent) => void;
}

function TreeRow({ level, icon, label, count, expanded, active, renaming, actions, onActivate, onRename, onCancelRename, dragItem, onDrop }: TreeRowProps) {
  if (renaming) {
    return (
      <div className="px-3 py-0.5" style={{ paddingLeft: 12 + level * 14 }}>
        <NameInput defaultValue={label} placeholder={label} onCommit={onRename} onCancel={onCancelRename} />
      </div>
    );
  }

  return (
    <div
      className={cn("group flex items-center gap-1 pr-1.5", active && "bg-[var(--surface-muted)]")}
      style={{ paddingLeft: 6 + level * 14 }}
      draggable={Boolean(dragItem)}
      onDragStart={(event) => { if (dragItem) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(dragMime, JSON.stringify(dragItem)); } }}
      onDragOver={(event) => { if (onDrop) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
      onDrop={onDrop}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-expanded={expanded}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--surface-muted)]"
      >
        {expanded === undefined ? null : expanded ? (
          <ChevronDown size={14} className="shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
        )}
        {icon}
        <span className="truncate">{label}</span>
        {count === undefined ? null : <span className="ml-auto pl-1 text-xs text-[var(--muted)]">{count}</span>}
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.danger ? "danger" : "ghost"}
            size="icon"
            className="h-6 w-6"
            aria-label={action.label}
            title={action.label}
            onClick={action.onClick}
          >
            {action.icon}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface NameInputProps {
  defaultValue?: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** Commits on Enter or blur, discards on Escape. */
function NameInput({ defaultValue = "", placeholder, onCommit, onCancel }: NameInputProps) {
  const [value, setValue] = useState(defaultValue);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit(value);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <Input
      className="h-7 w-full text-sm"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onCommit(value)}
    />
  );
}
