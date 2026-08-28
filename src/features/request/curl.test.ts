import { describe, expect, it } from "vitest";
import type { RequestDraft } from "../../types/http";
import { generateCurl, parseCurl } from "./curl";

const draft = (): RequestDraft => ({
  id: "draft", name: "Create", savedRequestId: null, collectionId: null, folderId: null,
  method: "POST", url: "https://api.example.com/users", params: [{ id: "p", enabled: true, key: "preview", value: "true" }],
  headers: [{ id: "h", enabled: true, key: "X-Api-Key", value: "must-not-export" }], bodyMode: "json", body: '{"name":"Laika"}', form: [],
  auth: { type: "bearer", bearerToken: "must-not-export", username: "", password: "", hasStoredSecret: false }, timeoutMs: 30_000,
});

describe("cURL workflows", () => {
  it("generates a runnable snippet without credential values", () => {
    const snippet = generateCurl(draft());
    expect(snippet).toContain("--request");
    expect(snippet).toContain("POST");
    expect(snippet).toContain("preview=true");
    expect(snippet).toContain("{{token}}");
    expect(snippet).not.toContain("must-not-export");
  });

  it("imports method, URL, headers, JSON, and bearer auth", () => {
    const imported = parseCurl("curl -X PATCH 'https://api.example.com/users?page=2' -H 'Accept: application/json' -H 'Authorization: Bearer token' --data-raw '{\"active\":true}'");
    expect(imported.method).toBe("PATCH");
    expect(imported.url).toBe("https://api.example.com/users");
    expect(imported.params[0]).toMatchObject({ key: "page", value: "2" });
    expect(imported.headers[0]).toMatchObject({ key: "Accept", value: "application/json" });
    expect(imported.bodyMode).toBe("json");
    expect(imported.auth).toMatchObject({ type: "bearer", bearerToken: "token" });
  });
});
