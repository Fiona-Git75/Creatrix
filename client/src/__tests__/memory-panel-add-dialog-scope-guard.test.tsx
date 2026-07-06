/**
 * Component tests for MemoryPanel — Add Memory dialog scope guard.
 *
 * Covers the case where the panel is opened without a projectId or
 * conversationId, and confirms:
 *
 *  1. The "Project" and "Chat" SelectItems inside the Add Memory dialog are
 *     rendered as disabled when projectId and conversationId are null.
 *
 *  2. If the internal addScope state somehow reaches "project" while
 *     projectId is null (e.g. the parent drops projectId after the user
 *     already selected it), clicking Save fires the canAddScope toast error
 *     and does NOT forward any API call.
 *
 * Isolation strategy:
 *  - `@/lib/queryClient` apiRequest is vi.mock'd so no real network calls fire.
 *  - `@/hooks/use-toast` is vi.mock'd so the toast calls are observable.
 *  - global.fetch is stubbed to return empty arrays for all GET /api/memory
 *    queries the component fires on mount.
 *  - No live server, database, or AI provider is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// vi.mock factories are hoisted to the top of the file before any variable
// declarations, so we must declare mocks with vi.hoisted() to avoid
// "Cannot access before initialization" errors.
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

/** Stub fetch so every GET /api/memory call returns an empty array. */
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

interface RenderOptions {
  projectId?: string | null;
  conversationId?: string | null;
}

function renderPanel(
  client: QueryClient,
  { projectId = null, conversationId = null }: RenderOptions = {},
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryPanel
        open={true}
        onOpenChange={vi.fn()}
        projectId={projectId ?? null}
        conversationId={conversationId ?? null}
      />
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MemoryPanel Add Memory dialog — scope SelectItems disabled when context is absent", () => {
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

  it("the Project SelectItem is disabled when projectId is null", async () => {
    renderPanel(client, { projectId: null, conversationId: null });

    // Open the Add Memory dialog
    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    // Open the scope Select so Radix renders the dropdown items into the DOM
    const scopeTrigger = await screen.findByTestId("select-memory-scope");
    await userEvent.click(scopeTrigger);

    // Radix renders SelectItems as role="option" inside the open listbox
    const projectOption = await screen.findByRole("option", { name: /project/i });
    expect(
      projectOption,
      "Project option should be present in the dropdown",
    ).toBeTruthy();
    expect(
      projectOption.getAttribute("data-disabled"),
      "Project option must carry data-disabled when projectId is null",
    ).toBe("");
  });

  it("the Chat SelectItem is disabled when conversationId is null", async () => {
    renderPanel(client, { projectId: null, conversationId: null });

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const scopeTrigger = await screen.findByTestId("select-memory-scope");
    await userEvent.click(scopeTrigger);

    const chatOption = await screen.findByRole("option", { name: /chat/i });
    expect(
      chatOption,
      "Chat option should be present in the dropdown",
    ).toBeTruthy();
    expect(
      chatOption.getAttribute("data-disabled"),
      "Chat option must carry data-disabled when conversationId is null",
    ).toBe("");
  });

  it("the Global SelectItem is NOT disabled when rendered with null context", async () => {
    renderPanel(client, { projectId: null, conversationId: null });

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const scopeTrigger = await screen.findByTestId("select-memory-scope");
    await userEvent.click(scopeTrigger);

    const globalOption = await screen.findByRole("option", { name: /global/i });
    expect(
      globalOption.getAttribute("data-disabled"),
      "Global option must NOT be disabled",
    ).toBeNull();
  });
});

describe("MemoryPanel Add Memory dialog — canAddScope guard fires when scope diverges from context", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = makeClient();
    stubFetch();
    mockToast.mockClear();
    // Make apiRequest resolve so mutations don't crash if they ever slip through
    mockApiRequest.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    client.clear();
  });

  it("shows toast error and makes no API call when addScope='project' but projectId is null", async () => {
    // ── Step 1: render with a valid projectId so we can select Project scope ──
    const { rerender } = renderPanel(client, {
      projectId: "proj-test",
      conversationId: null,
    });

    // Open the Add Memory dialog
    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    // Open the scope select and pick "Project"
    const scopeTrigger = await screen.findByTestId("select-memory-scope");
    await userEvent.click(scopeTrigger);

    const projectOption = await screen.findByRole("option", { name: /project/i });
    await userEvent.click(projectOption);

    // Verify the scope changed to Project (trigger now shows "Project")
    await waitFor(() => {
      expect(scopeTrigger.textContent).toMatch(/project/i);
    });

    // ── Step 2: parent drops projectId — scope state is "project", but no id ──
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId={null}
          conversationId={null}
        />
      </QueryClientProvider>,
    );

    // ── Step 3: fill content and submit ───────────────────────────────────────
    const textarea = screen.getByTestId("textarea-memory-content");
    await userEvent.type(textarea, "This is a test memory.");

    const saveBtn = screen.getByTestId("button-save-memory");
    await userEvent.click(saveBtn);

    // ── Assertions ────────────────────────────────────────────────────────────

    // Toast error must fire
    await waitFor(() => {
      expect(mockToast, "toast error must be called").toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Cannot add memory to this scope.",
          variant: "destructive",
        }),
      );
    });

    // No POST to /api/memory must have been made
    expect(
      mockApiRequest,
      "apiRequest must NOT be called when the guard fires",
    ).not.toHaveBeenCalled();
  });

  it("shows toast error and makes no API call when addScope='conversation' but conversationId is null", async () => {
    // ── Step 1: render with a valid conversationId ────────────────────────────
    const { rerender } = renderPanel(client, {
      projectId: null,
      conversationId: "conv-test",
    });

    const addBtn = await screen.findByTestId("button-add-memory");
    await userEvent.click(addBtn);

    const scopeTrigger = await screen.findByTestId("select-memory-scope");
    await userEvent.click(scopeTrigger);

    const chatOption = await screen.findByRole("option", { name: /chat/i });
    await userEvent.click(chatOption);

    await waitFor(() => {
      expect(scopeTrigger.textContent).toMatch(/chat/i);
    });

    // ── Step 2: parent drops conversationId ───────────────────────────────────
    rerender(
      <QueryClientProvider client={client}>
        <MemoryPanel
          open={true}
          onOpenChange={vi.fn()}
          projectId={null}
          conversationId={null}
        />
      </QueryClientProvider>,
    );

    // ── Step 3: fill content and submit ───────────────────────────────────────
    const textarea = screen.getByTestId("textarea-memory-content");
    await userEvent.type(textarea, "This is a conversation memory.");

    const saveBtn = screen.getByTestId("button-save-memory");
    await userEvent.click(saveBtn);

    // ── Assertions ────────────────────────────────────────────────────────────
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Cannot add memory to this scope.",
          variant: "destructive",
        }),
      );
    });

    expect(
      mockApiRequest,
      "apiRequest must NOT be called when the guard fires",
    ).not.toHaveBeenCalled();
  });
});
