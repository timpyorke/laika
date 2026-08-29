import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useAppStore } from "../../store/use-app-store";

const selectClass =
  "h-8 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 text-[12.5px] font-normal text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none";

/** Asks where a draft should live the first time it is saved. */
export function SaveRequestDialog() {
  const open = useAppStore((state) => state.saveDialogOpen);
  const draftName = useAppStore((state) => state.draft.name);
  const collections = useAppStore((state) => state.collections);
  const folders = useAppStore((state) => state.folders);
  const isSaving = useAppStore((state) => state.isSaving);
  const setSaveDialogOpen = useAppStore((state) => state.setSaveDialogOpen);
  const setName = useAppStore((state) => state.setName);
  const createCollection = useAppStore((state) => state.createCollection);
  const saveDraft = useAppStore((state) => state.saveDraft);

  const [name, setLocalName] = useState(draftName);
  const [collectionId, setCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [folderId, setFolderId] = useState("");

  useEffect(() => {
    if (!open) return;
    setLocalName(draftName);
    setCollectionId(collections[0]?.id ?? "");
    setNewCollectionName("");
    setFolderId("");
  }, [open, draftName, collections]);

  const availableFolders = folders.filter((folder) => folder.collectionId === collectionId);
  const needsNewCollection = collections.length === 0;
  const canSubmit =
    name.trim() !== "" && (needsNewCollection ? newCollectionName.trim() !== "" : collectionId !== "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isSaving) return;

    let target = collectionId;
    if (needsNewCollection) {
      const created = await createCollection(newCollectionName.trim());
      if (!created) return;
      target = created.id;
    }
    setName(name.trim());
    await saveDraft(target, folderId === "" ? null : folderId);
  };

  return (
    <Dialog open={open} onOpenChange={setSaveDialogOpen}>
      <DialogContent title="Save request" description="Choose where this request is stored in the workspace.">
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-[12.5px] font-medium">
            Name
            <Input value={name} onChange={(event) => setLocalName(event.target.value)} autoFocus placeholder="Request name" />
          </label>

          {needsNewCollection ? (
            <label className="grid gap-2 text-[12.5px] font-medium">
              New collection
              <Input
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                placeholder="Collection name"
              />
              <span className="text-[11.5px] font-normal text-[var(--muted)]">
                You do not have any collections yet, so one is created for this request.
              </span>
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-[12.5px] font-medium">
                Collection
                <select
                  className={selectClass}
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
              <label className="grid gap-2 text-[12.5px] font-medium">
                Folder
                <select className={selectClass} value={folderId} onChange={(event) => setFolderId(event.target.value)}>
                  <option value="">No folder</option>
                  {availableFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit || isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
