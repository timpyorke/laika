import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import { ExtractionEditor } from "./extraction-editor";

describe("ExtractionEditor", () => {
  beforeEach(() => {
    const draft = { ...useAppStore.getState().draft, id: "extraction-draft", extractions: [] };
    useAppStore.setState({ draft, requestTabs: [{ id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id });
  });

  it("adds, configures, and removes a response extraction", async () => {
    const user = userEvent.setup();
    render(<ExtractionEditor />);
    await user.click(screen.getByRole("button", { name: "Add extraction" }));
    expect(useAppStore.getState().draft.extractions[0]).toMatchObject({ source: "jsonPath", target: "", variableName: "", isSecret: false });

    await user.type(screen.getByLabelText("Extraction 1 target"), "$.data.token");
    await user.type(screen.getByLabelText("Extraction 1 variable name"), "authToken");
    await user.click(screen.getByLabelText("Secret"));
    expect(useAppStore.getState().draft.extractions[0]).toMatchObject({ target: "$.data.token", variableName: "authToken", isSecret: true });

    await user.selectOptions(screen.getByLabelText("Extraction 1 source"), "status");
    expect(screen.getByLabelText("Extraction 1 target")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Remove extraction 1" }));
    expect(useAppStore.getState().draft.extractions).toEqual([]);
  });
});
