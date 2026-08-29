import { ArchiveRestore, DatabaseBackup, LineChart, LockKeyhole, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { normalizeApplicationError } from "../../lib/application-error";
import { createWorkspaceBackup, stageWorkspaceRestore, type RestoreResult } from "./backup-client";
import { exportDiagnostics, getDiagnosticsSettings, setDiagnosticsEnabled } from "./diagnostics-client";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [busy, setBusy] = useState<"backup" | "restore" | "diagnostics-toggle" | "diagnostics-export" | null>(
    null,
  );
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<RestoreResult | null>(null);
  const [diagnosticsEnabled, setDiagnosticsEnabledState] = useState(false);

  useEffect(() => {
    if (!open) return;
    getDiagnosticsSettings()
      .then((settings) => setDiagnosticsEnabledState(settings.enabled))
      .catch(() => {
        // Leave the toggle at its previous value; the action buttons below
        // still surface a normalized error if the user tries to act.
      });
  }, [open]);

  const toggleDiagnostics = async () => {
    setBusy("diagnostics-toggle");
    try {
      const next = !diagnosticsEnabled;
      await setDiagnosticsEnabled(next);
      setDiagnosticsEnabledState(next);
      toast.success(next ? "Diagnostics enabled" : "Diagnostics disabled");
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    } finally {
      setBusy(null);
    }
  };

  const exportDiagnosticsFile = async () => {
    setBusy("diagnostics-export");
    try {
      const fileName = await exportDiagnostics();
      if (fileName) {
        toast.success("Diagnostics exported", { description: fileName });
      }
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    } finally {
      setBusy(null);
    }
  };

  const createBackup = async () => {
    setBusy("backup");
    try {
      const result = await createWorkspaceBackup();
      if (result) {
        toast.success("Workspace backup created", { description: result.fileName });
      }
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    setBusy("restore");
    try {
      const result = await stageWorkspaceRestore();
      if (result) {
        setPendingRestore(result);
        toast.success("Workspace restore is ready", {
          description: "Quit and reopen Laika to apply the backup.",
        });
      }
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Dialog open={open && !confirmingRestore} onOpenChange={onOpenChange}>
        <DialogContent
          title="Settings"
          description="Protect or recover the complete local workspace, including saved requests, history, environments, and the encrypted secret vault."
        >
          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-start gap-3 border-b border-[var(--border)] p-3.5">
              <div className="mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--accent)]">
                <DatabaseBackup size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[13.5px] font-semibold">Workspace backup</h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  Save one verified <span className="font-mono text-[11px]">.laika-backup</span> archive. If the vault has been initialized, its encrypted data and salt are included together.
                </p>
              </div>
              <Button disabled={busy !== null} onClick={() => void createBackup()}>
                <DatabaseBackup size={13} />
                {busy === "backup" ? "Backing up…" : "Create backup"}
              </Button>
            </div>

            <div className="flex items-start gap-3 p-3.5">
              <div className="mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--warning)]">
                <ArchiveRestore size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[13.5px] font-semibold">Restore workspace</h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  Validate and stage a backup, then apply it before storage opens on the next launch. Laika retains the current workspace as a rollback copy.
                </p>
              </div>
              <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmingRestore(true)}>
                <RotateCcw size={13} />
                {busy === "restore" ? "Restoring…" : "Restore…"}
              </Button>
            </div>
          </section>

          <section className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-start gap-3 border-b border-[var(--border)] p-3.5">
              <div className="mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--accent)]">
                <LineChart size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[13.5px] font-semibold">Diagnostics</h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  Off by default. When on, Laika records the app version, OS, an operation category, a success/failure
                  outcome, an error code, and a coarse timing bucket for requests, collection runs, and
                  backup/restore — never a URL, header, parameter, body, environment value, or secret.
                </p>
              </div>
              <Button variant="secondary" disabled={busy !== null} onClick={() => void toggleDiagnostics()}>
                {busy === "diagnostics-toggle" ? "Updating…" : diagnosticsEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            <div className="flex items-start gap-3 p-3.5">
              <div className="mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--muted-dim)]">
                <LineChart size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[13.5px] font-semibold">Export diagnostics</h2>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  Save the recorded events as a JSON file. Nothing is ever sent automatically — export is the only way
                  diagnostic data leaves this device.
                </p>
              </div>
              <Button disabled={busy !== null} onClick={() => void exportDiagnosticsFile()}>
                {busy === "diagnostics-export" ? "Exporting…" : "Export diagnostics…"}
              </Button>
            </div>
          </section>

          {pendingRestore ? (
            <div className="mt-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 text-[11.5px] leading-relaxed">
              <p className="font-semibold text-[var(--foreground)]">Restore staged — restart Laika to apply it</p>
              <p className="mt-1 text-[var(--muted)]">
                Backup from Laika {pendingRestore.backupAppVersion}. Created {new Date(pendingRestore.createdAt).toLocaleString()}.
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
            <LockKeyhole className="mt-0.5 shrink-0 text-[var(--muted-dim)]" size={13} aria-hidden="true" />
            <p>Secrets remain encrypted in the backup. You will need the same vault master password after restoring them.</p>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingRestore}
        title="Restore a workspace backup?"
        description="The selected backup will replace the current workspace after the next restart. Laika validates it first and keeps a rollback copy of the current data."
        confirmLabel="Choose backup"
        onConfirm={() => void restoreBackup()}
        onOpenChange={setConfirmingRestore}
      />
    </>
  );
}
