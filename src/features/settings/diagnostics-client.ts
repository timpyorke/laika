import { invoke } from "@tauri-apps/api/core";

export interface DiagnosticsSettings {
  enabled: boolean;
}

export function getDiagnosticsSettings() {
  return invoke<DiagnosticsSettings>("get_diagnostics_settings");
}

export function setDiagnosticsEnabled(enabled: boolean) {
  return invoke<void>("set_diagnostics_enabled", { enabled });
}

export function clearDiagnostics() {
  return invoke<void>("clear_diagnostics");
}

export function exportDiagnostics() {
  return invoke<string | null>("export_diagnostics");
}
