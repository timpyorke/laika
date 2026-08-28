import { invoke } from "@tauri-apps/api/core";
import type { Environment, EnvironmentState, EnvironmentVariable, SaveVariableInput, SecretStoreStatus } from "../../types/environment";

export const loadEnvironmentState = () => invoke<EnvironmentState>("load_environment_state");
export const createEnvironment = (name: string) => invoke<Environment>("create_environment", { name });
export const renameEnvironment = (id: string, name: string) => invoke<Environment>("rename_environment", { id, name });
export const deleteEnvironment = (id: string) => invoke<void>("delete_environment", { id });
export const setActiveEnvironment = (id: string | null) => invoke<void>("set_active_environment", { id });
export const saveEnvironmentVariable = (variable: SaveVariableInput) => invoke<EnvironmentVariable>("save_environment_variable", { variable });
export const deleteEnvironmentVariable = (id: string) => invoke<void>("delete_environment_variable", { id });
export const revealEnvironmentVariable = (id: string) => invoke<string>("reveal_environment_variable", { id });
export const secretStoreStatus = () => invoke<SecretStoreStatus>("secret_store_status");
export const unlockSecretStore = (password: string) => invoke<SecretStoreStatus>("unlock_secret_store", { password });
export const lockSecretStore = () => invoke<SecretStoreStatus>("lock_secret_store");
