import { invoke } from "@tauri-apps/api/core";

export interface BackupResult {
  fileName: string;
  createdAt: number;
  includesSecrets: boolean;
}

export interface RestoreResult {
  backupAppVersion: string;
  createdAt: number;
  includesSecrets: boolean;
  restartRequired: boolean;
}

export function createWorkspaceBackup() {
  return invoke<BackupResult | null>("create_workspace_backup");
}

export function stageWorkspaceRestore() {
  return invoke<RestoreResult | null>("stage_workspace_restore");
}
