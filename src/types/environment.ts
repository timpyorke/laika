export interface Environment {
  id: string;
  name: string;
  position: number;
}

export interface EnvironmentVariable {
  id: string;
  environmentId: string | null;
  name: string;
  /** Empty when `isSecret` is true. */
  value: string;
  isSecret: boolean;
  hasSecret: boolean;
}

export interface EnvironmentState {
  environments: Environment[];
  variables: EnvironmentVariable[];
  activeEnvironmentId: string | null;
}

export interface SaveVariableInput {
  id: string | null;
  environmentId: string | null;
  name: string;
  /** Omit the existing secret by sending an empty value. */
  value: string;
  isSecret: boolean;
}

export interface SecretStoreStatus {
  initialized: boolean;
  unlocked: boolean;
}
