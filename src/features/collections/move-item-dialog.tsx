import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { useAppStore } from "../../store/use-app-store";

const selectClass =
  "h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal text-[var(--foreground)] focus:border-[var(--focus)] focus:outline-none";

export type MoveTarget =
  | { kind: "folder"; id: string; name: string; collectionId: string; parentId: string | null }
  | { kind: "request"; id: string; name: string; collectionId: string; folderId: string | null };

interface MoveItemDialogProps {
  target: MoveTarget | null;
  onOpenChange: (open: boolean) => void;
}

/** Moves a folder or request without requiring a pointer-driven drag gesture. */
export function MoveItemDialog({ target, onOpenChange }: MoveItemDialogProps) {
  const collections = useAppStore((state) => state.collections);
  const folders = useAppStore((state) => state.folders);
  const moveFolder = useAppStore((state) => state.moveFolder);
  const moveRequest = useAppStore((state) => state.moveRequest);

  const [collectionId, setCollectionId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setCollectionId(target.collectionId);
    setFolderId(target.kind === "folder" ? (target.parentId ?? "") : (target.folderId ?? ""));
    setMoving(false);
  }, [target]);

  const excludedFolderIds = useMemo(() => {
    if (target?.kind !== "folder") return new Set<string>();
    const excluded = new Set([target.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          changed = true;
        }
      }
    }
    return excluded;
  }, [folders, target]);

  const availableFolders = folders.filter(
    (folder) => folder.collectionId === collectionId && !excludedFolderIds.has(folder.id),
  );
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderLabel = (id: string) => {
    const names: string[] = [];
    const visited = new Set<string>();
    let current = folderById.get(id);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? folderById.get(current.parentId) : undefined;
    }
    return names.join(" / ");
  };

  const currentFolderId = target?.kind === "folder" ? target.parentId : target?.folderId;
  const destinationChanged = Boolean(
    target && (target.collectionId !== collectionId || (currentFolderId ?? "") !== folderId),
  );
  const destinationExists = collectionId !== "" && (folderId === "" || availableFolders.some((folder) => folder.id === folderId));
  const canSubmit = destinationChanged && destinationExists && !moving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target || !canSubmit) return;
    setMoving(true);
    const destinationId = folderId === "" ? null : folderId;
    const success = target.kind === "folder"
      ? await moveFolder(target.id, collectionId, destinationId)
      : await moveRequest(target.id, collectionId, destinationId);
    setMoving(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Move ${target?.name ?? "item"}`}
        description="Choose a collection and destination folder. The item is placed at the end of that location."
      >
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Collection
            <select
              className={selectClass}
              aria-label="Destination collection"
              value={collectionId}
              onChange={(event) => {
                setCollectionId(event.target.value);
                setFolderId("");
              }}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Folder
            <select
              className={selectClass}
              aria-label="Destination folder"
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
            >
              <option value="">Collection root</option>
              {availableFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folderLabel(folder.id)}</option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>{moving ? "Moving…" : "Move"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
