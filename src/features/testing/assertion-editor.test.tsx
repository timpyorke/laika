import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import { AssertionEditor } from "./assertion-editor";

describe("AssertionEditor", () => {
  beforeEach(() => {
    const draft = { ...useAppStore.getState().draft, id: "assertion-draft", assertions: [] };
    useAppStore.setState({ draft, requestTabs: [{ id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id });
  });

  it("adds, configures, and removes a response assertion", async () => {
    const user = userEvent.setup();
    render(<AssertionEditor />);
    await user.click(screen.getByRole("button", { name: "Add assertion" }));
    expect(useAppStore.getState().draft.assertions[0]).toMatchObject({ kind: "status", operator: "equals", expected: "200" });

    await user.selectOptions(screen.getByLabelText("Assertion 1 type"), "responseTime");
    await user.clear(screen.getByLabelText("Assertion 1 expected value"));
    await user.type(screen.getByLabelText("Assertion 1 expected value"), "250");
    expect(useAppStore.getState().draft.assertions[0]).toMatchObject({ kind: "responseTime", operator: "lessThan", expected: "250" });

    await user.click(screen.getByRole("button", { name: "Remove assertion 1" }));
    expect(useAppStore.getState().draft.assertions).toEqual([]);
  });
});
