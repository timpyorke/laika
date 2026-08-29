import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./settings-dialog";

const backupClient = vi.hoisted(() => ({
  createWorkspaceBackup: vi.fn(),
  stageWorkspaceRestore: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./backup-client", () => backupClient);
vi.mock("sonner", () => ({ toast }));

describe("SettingsDialog", () => {
  beforeEach(() => {
    backupClient.createWorkspaceBackup.mockReset().mockResolvedValue(null);
    backupClient.stageWorkspaceRestore.mockReset().mockResolvedValue(null);
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
});
