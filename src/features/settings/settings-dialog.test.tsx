import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./settings-dialog";

const backupClient = vi.hoisted(() => ({
  createWorkspaceBackup: vi.fn(),
  stageWorkspaceRestore: vi.fn(),
}));

const diagnosticsClient = vi.hoisted(() => ({
  getDiagnosticsSettings: vi.fn(),
  setDiagnosticsEnabled: vi.fn(),
  exportDiagnostics: vi.fn(),
  clearDiagnostics: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./backup-client", () => backupClient);
vi.mock("./diagnostics-client", () => diagnosticsClient);
vi.mock("sonner", () => ({ toast }));

describe("SettingsDialog", () => {
  beforeEach(() => {
    backupClient.createWorkspaceBackup.mockReset().mockResolvedValue(null);
    backupClient.stageWorkspaceRestore.mockReset().mockResolvedValue(null);
    diagnosticsClient.getDiagnosticsSettings.mockReset().mockResolvedValue({ enabled: false });
    diagnosticsClient.setDiagnosticsEnabled.mockReset().mockResolvedValue(undefined);
    diagnosticsClient.exportDiagnostics.mockReset().mockResolvedValue(null);
    diagnosticsClient.clearDiagnostics.mockReset().mockResolvedValue(undefined);
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("creates a complete workspace backup from the settings surface", async () => {
    backupClient.createWorkspaceBackup.mockResolvedValue({
      fileName: "workspace.laika-backup",
      createdAt: 1_788_000_000_000,
      includesSecrets: true,
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Create backup" }));

    await waitFor(() => expect(backupClient.createWorkspaceBackup).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Workspace backup created", {
      description: "workspace.laika-backup",
    });
  });

  it("confirms restore and tells the user a restart is required", async () => {
    backupClient.stageWorkspaceRestore.mockResolvedValue({
      backupAppVersion: "0.1.0",
      createdAt: 1_788_000_000_000,
      includesSecrets: true,
      restartRequired: true,
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Restore…" }));
    expect(screen.getByText("Restore a workspace backup?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose backup" }));

    await waitFor(() => expect(backupClient.stageWorkspaceRestore).toHaveBeenCalledOnce());
    expect(await screen.findByText("Restore staged — restart Laika to apply it")).toBeInTheDocument();
  });

  it("loads the diagnostics setting and toggles it off by default", async () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />);

    await waitFor(() => expect(diagnosticsClient.getDiagnosticsSettings).toHaveBeenCalledOnce());
    const toggle = await screen.findByRole("button", { name: "Enable" });
    await userEvent.click(toggle);

    await waitFor(() => expect(diagnosticsClient.setDiagnosticsEnabled).toHaveBeenCalledWith(true));
    expect(toast.success).toHaveBeenCalledWith("Diagnostics enabled");
    expect(await screen.findByRole("button", { name: "Disable" })).toBeInTheDocument();
  });

  it("exports diagnostics to a user-chosen file", async () => {
    diagnosticsClient.exportDiagnostics.mockResolvedValue("laika-diagnostics-1.json");

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Export diagnostics…" }));

    await waitFor(() => expect(diagnosticsClient.exportDiagnostics).toHaveBeenCalledOnce());
    expect(toast.success).toHaveBeenCalledWith("Diagnostics exported", {
      description: "laika-diagnostics-1.json",
    });
  });
});
