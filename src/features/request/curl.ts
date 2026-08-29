import type { BodyMode, HttpMethod, KeyValueEntry, RequestDraft } from "../../types/http";

const sensitiveKeys = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "apikey", "access-token", "refresh-token", "client-secret", "password", "passwd", "token", "secret"]);
const isSensitiveKey = (key: string) => {
  const normalized = key.trim().toLowerCase().replace(/_/g, "-");
  return sensitiveKeys.has(normalized) || ["-password", "-secret", "-token", "-api-key"].some((suffix) => normalized.endsWith(suffix));
};
const redactedValue = (key: string, value: string) => isSensitiveKey(key) ? "{{secret}}" : value;
const shellQuote = (value: string) => `'${value.split("'").join(`'"'"'`)}'`;
const row = (key = "", value = ""): KeyValueEntry => ({ id: crypto.randomUUID(), enabled: true, key, value });

export function generateCurl(draft: RequestDraft): string {
  const enabledParams = draft.params.filter((item) => item.enabled && item.key.trim());
  const query = enabledParams.map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(redactedValue(item.key, item.value))}`).join("&");
  const url = query ? `${draft.url}${draft.url.includes("?") ? "&" : "?"}${query}` : draft.url;
  const parts = ["curl", "--request", draft.method, shellQuote(url || "https://api.example.com")];
  for (const header of draft.headers.filter((item) => item.enabled && item.key.trim())) {
    const value = redactedValue(header.key, header.value);
    parts.push("--header", shellQuote(`${header.key}: ${value}`));
  }
  if (draft.auth.type === "bearer") parts.push("--header", shellQuote("Authorization: Bearer {{token}}"));
  if (draft.auth.type === "basic") parts.push("--user", shellQuote(`${draft.auth.username}:{{password}}`));
  if (draft.bodyMode === "json") parts.push("--header", shellQuote("Content-Type: application/json"), "--data-raw", shellQuote(draft.body));
  if (draft.bodyMode === "text") parts.push("--data-raw", shellQuote(draft.body));
  if (draft.bodyMode === "form") {
    for (const field of draft.form.filter((item) => item.enabled && item.key.trim())) parts.push("--data-urlencode", shellQuote(`${field.key}=${redactedValue(field.key, field.value)}`));
  }
  return parts.join(" \\\n  ");
}

function tokens(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\" && quote === '"' && index + 1 < input.length) current += input[++index];
      else current += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) { if (current) { result.push(current); current = ""; } }
    else if (character === "\\" && input[index + 1] === "\n") index += 1;
    else current += character;
  }
  if (current) result.push(current);
  return result;
}

export function parseCurl(input: string): RequestDraft {
  const args = tokens(input.trim());
  if (args[0]?.toLowerCase() !== "curl") throw new Error("Paste a command beginning with curl.");
  let method: HttpMethod = "GET";
  let url = "";
  const headers: KeyValueEntry[] = [];
  const form: KeyValueEntry[] = [];
  let body = "";
  let bodyMode: BodyMode = "none";
  let auth: RequestDraft["auth"] = { type: "none", bearerToken: "", username: "", password: "", hasStoredSecret: false };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    const next = () => args[++index] ?? "";
    if (argument === "-X" || argument === "--request") method = next().toUpperCase() as HttpMethod;
    else if (argument === "-H" || argument === "--header") {
      const header = next(); const separator = header.indexOf(":");
      if (separator > 0) {
        const key = header.slice(0, separator).trim(); const value = header.slice(separator + 1).trim();
        if (key.toLowerCase() === "authorization" && value.toLowerCase().startsWith("bearer ")) auth = { ...auth, type: "bearer", bearerToken: value.slice(7) };
        else headers.push(row(key, value));
      }
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(argument)) {
      body = next(); bodyMode = body.trim().startsWith("{") || body.trim().startsWith("[") ? "json" : "text";
      if (method === "GET") method = "POST";
    } else if (argument === "--data-urlencode" || argument === "-F" || argument === "--form") {
      const value = next(); const separator = value.indexOf("=");
      form.push(row(separator < 0 ? value : value.slice(0, separator), separator < 0 ? "" : value.slice(separator + 1))); bodyMode = "form";
      if (method === "GET") method = "POST";
    } else if (argument === "-u" || argument === "--user") {
      const value = next(); const separator = value.indexOf(":");
      auth = { type: "basic", bearerToken: "", username: separator < 0 ? value : value.slice(0, separator), password: separator < 0 ? "" : value.slice(separator + 1), hasStoredSecret: false };
    } else if (!argument.startsWith("-") && !url) url = argument;
  }
  if (!url) throw new Error("The cURL command does not contain a URL.");
  const parsed = new URL(url);
  const params = [...parsed.searchParams.entries()].map(([key, value]) => row(key, value));
  parsed.search = "";
  return {
    id: crypto.randomUUID(), name: "Imported cURL", savedRequestId: null, collectionId: null, folderId: null,
    method, url: parsed.toString(), params: params.length ? params : [row()], headers: headers.length ? headers : [row()],
    body, bodyMode, form: form.length ? form : [row()], auth, timeoutMs: 30_000, assertions: [],
  };
}
