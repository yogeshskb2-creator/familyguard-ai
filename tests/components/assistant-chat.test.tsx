import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantChat } from "@/components/assistant/AssistantChat";

let fetchMock: ReturnType<typeof vi.fn>;
let restoreScroll: () => void;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "Bob is at Home.", provider: "quick", toolsUsed: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  // Regression: current Chromium returns a Promise from scrollIntoView().
  const orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    return Promise.resolve() as unknown as void;
  };
  restoreScroll = () => (Element.prototype.scrollIntoView = orig);
});
afterEach(() => {
  vi.unstubAllGlobals();
  restoreScroll();
});

describe("AssistantChat", () => {
  it("survives scrollIntoView returning a Promise (Chromium) and shows the answer", async () => {
    render(<AssistantChat configured={[]} preferred="claude" />);
    await userEvent.click(screen.getByRole("button", { name: "Show the last known location" }));
    await waitFor(() => expect(screen.getByText("Bob is at Home.")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Show my family members" }));
    await waitFor(() => expect(screen.getAllByTestId("turn-assistant")).toHaveLength(2));
  });

  it("without configured providers, defaults to Quick answers and disables the others", () => {
    render(<AssistantChat configured={[]} preferred="claude" />);
    expect(screen.getByRole("radio", { name: /Quick answers/ })).toBeChecked();
    for (const p of [/Claude/, /OpenAI/, /Gemini/]) expect(screen.getByRole("radio", { name: p })).toBeDisabled();
    expect(screen.getByText(/nothing is sent to an AI company/)).toBeInTheDocument();
  });

  it("uses the preferred provider when configured, and tells the user what is shared", () => {
    render(<AssistantChat configured={[{ id: "gemini", label: "Gemini", model: "gemini-3.8-flash" }]} preferred="gemini" />);
    expect(screen.getByRole("radio", { name: /Gemini/ })).toBeChecked();
    expect(screen.getByText(/is sent to Gemini. Contact details are never sent/)).toBeInTheDocument();
  });

  it("sends only plain text turns and keeps the question on error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "ai_busy", message: "Busy, try again." } }), { status: 503 }));
    render(<AssistantChat configured={[{ id: "claude", label: "Claude", model: "claude-opus-5-5" }]} preferred="claude" />);
    await userEvent.type(screen.getByLabelText("Your question"), "Where is Bob?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Busy, try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("Where is Bob?");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ provider: "claude", messages: [{ role: "user", content: "Where is Bob?" }] });
  });

  it("renders model output as plain text (no HTML injection)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ text: '<img src=x onerror="alert(1)"><a href="https://evil">click</a>', provider: "quick", toolsUsed: [] }), { status: 200 }));
    const { container } = render(<AssistantChat configured={[]} preferred="claude" />);
    await userEvent.click(screen.getByRole("button", { name: "Show recent SOS alerts" }));
    await screen.findByText(/<img src=x/);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href="https://evil"]')).toBeNull();
  });
});
