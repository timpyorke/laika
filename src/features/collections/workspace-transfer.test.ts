import { describe, expect, it } from "vitest";
import { buildWorkspaceExport } from "./workspace-transfer";

describe("Laika collection export", () => {
  it("preserves non-secret request data while omitting auth secret material", () => {
    const payload = buildWorkspaceExport(
      [{ id: "c1", name: "API", description: "", position: 0, createdAt: 1, updatedAt: 1 }],
      [{ id: "f1", collectionId: "c1", parentId: null, name: "Users", position: 0 }],
      [{ id: "r1", collectionId: "c1", folderId: "f1", name: "List", method: "GET", url: "https://example.com", position: 0 }],
      [{ id: "r1", collectionId: "c1", folderId: "f1", name: "List", method: "GET", url: "https://example.com", params: [{ enabled: true, key: "page", value: "2" }], headers: [], bodyMode: "none", body: "", form: [], auth: { type: "bearer" }, hasAuthSecret: true, timeoutMs: 30_000 }],
    );
    const roundTrip = JSON.parse(JSON.stringify(payload));
    expect(roundTrip.collections[0].folders[0].name).toBe("Users");
    expect(roundTrip.collections[0].requests[0].params[0]).toEqual({ enabled: true, key: "page", value: "2" });
    expect(roundTrip.collections[0].requests[0].authSecret).toBeNull();
    expect(JSON.stringify(roundTrip)).not.toContain("hasAuthSecret");
  });
});
