/**
 * Component tests for MemoryPanel — Add Memory dialog.
 *
 * MemoryPanel now shows only global-scope memories with a single Add button.
 * The scope selector has been removed. These tests cover:
 *
 *  1. The Add Memory dialog opens when the button is clicked.
 *  2. The Save button is disabled while the textarea is empty.
 *  3. Filling the textarea and clicking Save calls apiRequest with the correct
 *     global-scope payload.
 *  4. Cancel closes the dialog without making any API call.
 *
 * Isolation strategy:
 *  - `@/lib/queryClient` apiRequest is vi.mock'd — no real network calls.
 *  - `@/hooks/use-toast` is vi.mock'd so toast calls are observable.
 *  - global.fetch is stubbed to return empty arrays for GET /api/memory calls.
 *  - No live server, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryPanel } from "../components/MemoryPanel";

// ── jsdom stubs ────────────────────────────────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// ── Module mocks ──────────────────────────────────────────────────────────────

const { mockToast, mockApiRequest } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockApiRequest: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...actual,
    apiRequest: mockApiRequest,
    queryClient: new (await import("@tanstack/react-query")).QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
}

function renderPanel(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryPanel
        open={true}
        onOpenChange={vi.fn()}
        projectId={null}
        conversationId={null}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryPanel Add Memory dialog", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
    stubFetch();
    mockToast.mockClear();
    mockApiRequest.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("opens the Add Memory dialog when the button is clicked", async () => {
    renderPanel(client);

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    expect(screen.getByTestId("textarea-memory-content")).toBeTruthy();
    expect(screen.getByTestId("button-save-memory")).toBeTruthy();
  });

  it("Save button is disabled while the textarea is empty", async () => {
    renderPanel(client);

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const saveBtn = screen.getByTestId("button-save-memory");
    expect(saveBtn).toHaveProperty("disabled", true);
  });

  it("Save button becomes enabled once text is entered", async () => {
    renderPanel(client);

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const textarea = screen.getByTestId("textarea-memory-content");
    await userEvent.type(textarea, "I prefer concise responses.");

    const saveBtn = screen.getByTestId("button-save-memory");
    expect(saveBtn).toHaveProperty("disabled", false);
  });

  it("calls apiRequest with scope=global when Save is clicked", async () => {
    mockApiRequest.mockResolvedValue({ ok: true });
    renderPanel(client);

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const textarea = screen.getByTestId("textarea-memory-content");
    await userEvent.type(textarea, "Prefer British English.");

    const saveBtn = screen.getByTestId("button-save-memory");
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/memory",
        expect.objectContaining({ scope: "global", content: "Prefer British English." }),
      );
    });
  });

  it("Cancel closes the dialog without calling apiRequest", async () => {
    renderPanel(client);

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const textarea = screen.getByTestId("textarea-memory-content");
    await userEvent.type(textarea, "Some text.");

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("textarea-memory-content")).toBeNull();
    });
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
