/**
 * Tests for the DownloadReportButton and CopyReportButton inside RepairPanel.
 *
 * DownloadReportButton clicking must:
 *  1. Be present in the repair view.
 *  2. Create a Blob containing the serialised repair report.
 *  3. Trigger a browser file download with filename "repair-report.txt".
 *  4. The Blob content must match the output of buildReport() for the same
 *     coherence data.
 *
 * CopyReportButton clicking must:
 *  1. Be present in the repair view.
 *  2. Call navigator.clipboard.writeText with the buildReport() output.
 *  3. A second click after the "copied" state resets also works correctly.
 *
 * The DOM file-download dance (createObjectURL → <a>.click → revokeObjectURL)
 * is verified by spying on the relevant globals. Blob content is captured by
 * subclassing the global Blob to record what it was called with.
 *
 * RepairPanel is rendered directly — fully decoupled from Setup.tsx — so
 * this test will not break when Setup.tsx gains new imports that rely on
 * browser APIs or backend calls not present in jsdom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepairPanel } from "../components/RepairPanel";

// ── Navigator clipboard stub ──────────────────────────────────────────────────
// CopyReportButton calls navigator.clipboard.writeText on mount path; stub so
// it does not throw during render.
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COHERENCE_AMBER = {
  coherent: false,
  overallStatus: "AMBER" as const,
  measuredAt: "2026-06-28T00:00:00.000Z",
  items: [
    {
      domain: "Identity",
      component: "Admin user",
      actual: "missing",
      message: "No admin account found",
      action: "Create an admin account",
      firstLook: "Check the users table",
    },
    {
      domain: "Inference",
      component: "Ollama",
      actual: "unreachable",
      message: "Cannot connect to Ollama",
    },
  ],
};

// Independent oracle for the expected report — same formula as buildReport()
// inside RepairPanel but computed separately so the test is not a tautology.
function expectedReport(): string {
  const status = COHERENCE_AMBER.overallStatus;
  const items = COHERENCE_AMBER.items;
  const lines: string[] = [`=== System Repair Report (${status}) ===`, ""];
  items.forEach(item => {
    lines.push(`[${item.domain}] ${item.component}`);
    lines.push(`✗ ${item.message}`);
    if (item.action) lines.push(`Fix: ${item.action}`);
    if (item.firstLook) lines.push(`First look: ${item.firstLook}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel() {
  return render(
    <RepairPanel
      coherence={COHERENCE_AMBER}
      coherenceIsFetching={false}
      repairCountdown={30}
      onRecheck={vi.fn()}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DownloadReportButton — repair view", () => {
  let capturedBlobContent: string | null;
  let capturedAnchor: HTMLAnchorElement | null;
  let anchorClickSpy: ReturnType<typeof vi.spyOn> | null;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let OriginalBlob: typeof Blob;
  const MOCK_OBJECT_URL = "blob:mock-url-for-test";

  beforeEach(() => {
    capturedBlobContent = null;
    capturedAnchor = null;
    anchorClickSpy = null;

    // Subclass Blob to record the text that was passed to the constructor.
    OriginalBlob = globalThis.Blob;
    const OrigBlob = OriginalBlob;
    globalThis.Blob = class SpyBlob extends OrigBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        if (parts && parts.length > 0 && typeof parts[0] === "string") {
          capturedBlobContent = parts[0];
        }
      }
    } as typeof Blob;

    createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue(MOCK_OBJECT_URL);

    revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    // Intercept document.createElement so we can spy on the anchor's click()
    // without triggering real browser navigation.
    const originalCreate = document.createElement.bind(document);
    createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, ...rest: any[]) => {
        const el = originalCreate(tag, ...rest);
        if (tag === "a") {
          capturedAnchor = el as HTMLAnchorElement;
          anchorClickSpy = vi.spyOn(el, "click").mockImplementation(() => {});
        }
        return el;
      });
  });

  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.restoreAllMocks();
  });

  it("renders the Download report button in the repair view", () => {
    renderPanel();
    expect(screen.getByTestId("button-download-report")).toBeInTheDocument();
  });

  it("clicking the button creates an object URL, sets the correct filename, clicks the anchor, then revokes the URL", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId("button-download-report"));

    // An object URL must have been created from the Blob.
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    // The anchor element must have been produced and configured correctly.
    expect(capturedAnchor).not.toBeNull();
    expect(capturedAnchor!.download).toBe("repair-report.txt");
    expect(capturedAnchor!.href).toContain(MOCK_OBJECT_URL);

    // The anchor's click() must have been called to start the download.
    expect(anchorClickSpy).not.toBeNull();
    expect(anchorClickSpy!).toHaveBeenCalledTimes(1);

    // The object URL must be revoked after use to free memory.
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(MOCK_OBJECT_URL);
  });

  it("the downloaded Blob content matches the buildReport() output for the rendered coherence data", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId("button-download-report"));

    expect(capturedBlobContent).not.toBeNull();
    expect(capturedBlobContent).toBe(expectedReport());
  });
});

// ── CopyReportButton tests ────────────────────────────────────────────────────

describe("CopyReportButton — repair view", () => {
  let writeTextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Copy report button in the repair view", () => {
    renderPanel();
    expect(screen.getByTestId("button-copy-report")).toBeInTheDocument();
  });

  it("clicking the button calls navigator.clipboard.writeText with the buildReport() output", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId("button-copy-report"));

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    expect(writeTextSpy).toHaveBeenCalledWith(expectedReport());
  });

  it("a second click after the copied state resets also writes the correct content", async () => {
    const user = userEvent.setup({ delay: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderPanel();

    await user.click(screen.getByTestId("button-copy-report"));
    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    expect(writeTextSpy).toHaveBeenLastCalledWith(expectedReport());

    // Advance past the 2000 ms "copied" reset timeout.
    vi.advanceTimersByTime(2100);

    await user.click(screen.getByTestId("button-copy-report"));
    expect(writeTextSpy).toHaveBeenCalledTimes(2);
    expect(writeTextSpy).toHaveBeenLastCalledWith(expectedReport());

    vi.useRealTimers();
  });

  it("shows 'Report copied' in green immediately after clicking", async () => {
    const user = userEvent.setup({ delay: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderPanel();

    // Before click — button shows default label.
    expect(screen.getByText("Copy report")).toBeInTheDocument();
    expect(screen.queryByText("Report copied")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("button-copy-report"));

    // clipboard.writeText resolves as a microtask; act() inside userEvent
    // flushes it so setCopied(true) is committed before this assertion runs.
    expect(screen.getByText("Report copied")).toBeInTheDocument();
    expect(screen.queryByText("Copy report")).not.toBeInTheDocument();

    // The "Report copied" span carries the green colour class.
    expect(screen.getByText("Report copied").className).toContain("text-green-400");

    vi.useRealTimers();
  });

  it("reverts to 'Copy report' after 2000 ms", async () => {
    const user = userEvent.setup({ delay: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderPanel();

    await user.click(screen.getByTestId("button-copy-report"));
    expect(screen.getByText("Report copied")).toBeInTheDocument();

    // Advance past the 2000 ms reset timer and flush the resulting
    // state update (setCopied(false)) through React's scheduler.
    await act(async () => {
      vi.advanceTimersByTime(2001);
    });

    expect(screen.queryByText("Report copied")).not.toBeInTheDocument();
    expect(screen.getByText("Copy report")).toBeInTheDocument();

    vi.useRealTimers();
  });
});
