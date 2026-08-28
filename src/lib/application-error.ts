import type { ApplicationError, ApplicationErrorCode } from "../types/http";

const errors: Record<ApplicationErrorCode, Omit<ApplicationError, "code">> = {
  INVALID_REQUEST: { title: "Invalid request settings", message: "Set the timeout between 0.1 and 300 seconds, then try again.", recoverable: true },
  INVALID_URL: { title: "Invalid request URL", message: "Enter a complete HTTP or HTTPS URL and try again.", recoverable: true },
  INVALID_HEADER: { title: "Invalid request header", message: "Check the enabled header names and values, then try again.", recoverable: true },
  INVALID_BODY: { title: "Invalid request body", message: "The JSON request body is not valid.", recoverable: true },
  INVALID_AUTH: { title: "Authentication is incomplete", message: "Enter the required authentication fields and try again.", recoverable: true },
  NETWORK_ERROR: { title: "Could not reach the server", message: "Check the address and your network connection, then try again.", recoverable: true },
  TIMEOUT: { title: "Request timed out", message: "Increase the timeout or check whether the server is responding.", recoverable: true },
  TLS_ERROR: { title: "Secure connection failed", message: "The server certificate or TLS configuration could not be verified.", recoverable: true },
  CANCELLED: { title: "Request cancelled", message: "The request was stopped before it completed.", recoverable: true },
  INVALID_INPUT: { title: "Invalid value", message: "Enter a name between 1 and 200 characters, then try again.", recoverable: true },
  INVALID_VARIABLE: { title: "Invalid variable", message: "Use a name beginning with a letter or underscore, followed by letters, numbers, dots, dashes, or underscores.", recoverable: true },
  UNRESOLVED_VARIABLES: { title: "Some variables are undefined", message: "Define the listed variables for this workspace or active environment before sending.", recoverable: true },
  SECRET_STORE_LOCKED: { title: "Secret vault is locked", message: "Unlock the secret vault before using or changing protected values.", recoverable: true },
  SECRET_STORE_ERROR: { title: "Secret vault could not be opened", message: "Check the master password and try again.", recoverable: true },
  NOT_FOUND: { title: "Item no longer exists", message: "This item was removed. Refresh the workspace and try again.", recoverable: true },
  DATABASE_ERROR: { title: "Workspace could not be updated", message: "The change was not saved. Try again, and restart Laika if the problem continues.", recoverable: true },
  DATABASE_UNAVAILABLE: { title: "Workspace storage is unavailable", message: "Laika could not open its local database, so collections and history are disabled.", recoverable: true },
  UNEXPECTED_ERROR: { title: "Request failed", message: "An unexpected error occurred while processing the request.", recoverable: true },
};

export function applicationError(code: ApplicationErrorCode): ApplicationError {
  return { code, ...errors[code] };
}

export function normalizeApplicationError(value: unknown): ApplicationError {
  if (typeof value === "object" && value !== null && "code" in value) {
    const code = (value as { code?: string }).code;
    if (code && code in errors) {
      const normalized = applicationError(code as ApplicationErrorCode);
      const details = (value as { details?: unknown }).details;
      if (details && typeof details === "object" && "variables" in details && typeof (details as { variables?: unknown }).variables === "string") {
        normalized.details = { variables: (details as { variables: string }).variables };
      }
      return normalized;
    }
  }
  return applicationError("UNEXPECTED_ERROR");
}
