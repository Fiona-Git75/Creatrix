/**
 * Tests for ChatInput — image size warning updates when connection changes.
 *
 * The maxImageSizeMb prop controls the warning threshold.  If a user has an
 * image attached that is within connection A's limit but over connection B's
 * limit, switching connections (i.e. re-rendering ChatInput with a different
 * maxImageSizeMb) must instantly show or hide the warning without requiring
 * the user to re-attach the image.
 *
 * Strategy: mock useImagePaste (via vi.hoisted) so we can capture the
 * onPastedImages callback that the component passes to the hook and call it
 * directly with a fake AttachedImage of a known size.  This avoids needing
 * a real FileReader, real file input events, or a document-level paste.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { AttachedImage } from "../components/ChatInput";

// ── Mock use-image-paste before importing ChatInput ───────────────────────────
// vi.hoisted ensures the mock handle exists before the module factory runs,
// which is required because vi.mock calls are hoisted above imports.

const { mockUseImagePaste } = vi.hoisted(() => {
  const mockUseImagePaste = vi.fn();
  return { mockUseImagePaste };
});

vi.mock("@/hooks/use-image-paste", () => ({
  useImagePaste: mockUseImagePaste,
  processImageFiles: vi.fn(),
}));

import { ChatInput } from "../components/ChatInput";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function fakeImage(sizeBytes: number): AttachedImage {
  return {
    base64: "FAKEBASE64",
    mimeType: "image/jpeg",
    name: "test.jpg",
    sizeBytes,
    previewUrl: "data:image/jpeg;base64,FAKEBASE64",
  };
}

// Retrieve the onPastedImages callback that ChatInput passed to useImagePaste
// on its first render.  The callback is stable (useCallback with [] deps) so
// it remains valid after rerenders.
function capturedCallback(): (imgs: AttachedImage[]) => void {
  return mockUseImagePaste.mock.calls[0][0] as (imgs: AttachedImage[]) => void;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("ChatInput — image size warning updates instantly on connection switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warning appears when switching to a connection with a stricter limit", async () => {
    // Connection A: 20 MB limit (OpenAI / custom default).
    const { rerender, queryByTestId } = render(
      <ChatInput onSend={vi.fn()} maxImageSizeMb={20} />,
    );

    // Attach a 15 MB image — within A's limit, so no warning.
    await act(async () => {
      capturedCallback()([fakeImage(15 * 1024 * 1024)]);
    });

    expect(queryByTestId("warning-large-image")).not.toBeInTheDocument();

    // Switch to connection B: 10 MB limit (Ollama).
    // The image is still attached — no re-attach needed.
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={10} />);

    // 15 MB > 10 MB → warning must appear instantly.
    expect(screen.getByTestId("warning-large-image")).toBeInTheDocument();
  });

  it("warning disappears when switching to a connection with a looser limit", async () => {
    // Connection B: 10 MB limit (Ollama).
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} maxImageSizeMb={10} />,
    );

    // Attach a 15 MB image — exceeds B's limit, warning visible.
    await act(async () => {
      capturedCallback()([fakeImage(15 * 1024 * 1024)]);
    });

    expect(screen.getByTestId("warning-large-image")).toBeInTheDocument();

    // Switch to connection A: 20 MB limit.
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={20} />);

    // 15 MB < 20 MB → warning must disappear.
    expect(screen.queryByTestId("warning-large-image")).not.toBeInTheDocument();
  });

  it("warning round-trips A → B → A without re-attaching the image", async () => {
    const { rerender, queryByTestId } = render(
      <ChatInput onSend={vi.fn()} maxImageSizeMb={20} />,
    );

    // Attach the image once.
    await act(async () => {
      capturedCallback()([fakeImage(15 * 1024 * 1024)]);
    });

    // A (20 MB): no warning.
    expect(queryByTestId("warning-large-image")).not.toBeInTheDocument();

    // Switch to B (10 MB): warning appears.
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={10} />);
    expect(screen.getByTestId("warning-large-image")).toBeInTheDocument();

    // Switch back to A (20 MB): warning disappears.
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={20} />);
    expect(queryByTestId("warning-large-image")).not.toBeInTheDocument();
  });

  it("no warning when image is within both connections' limits", async () => {
    // 5 MB image is under both 10 MB and 20 MB thresholds.
    const { rerender, queryByTestId } = render(
      <ChatInput onSend={vi.fn()} maxImageSizeMb={20} />,
    );

    await act(async () => {
      capturedCallback()([fakeImage(5 * 1024 * 1024)]);
    });

    // No warning with 20 MB limit.
    expect(queryByTestId("warning-large-image")).not.toBeInTheDocument();

    // No warning even after switching to 10 MB limit.
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={10} />);
    expect(queryByTestId("warning-large-image")).not.toBeInTheDocument();
  });

  it("warning text shows the correct limit for the active connection", async () => {
    const { rerender } = render(
      <ChatInput onSend={vi.fn()} maxImageSizeMb={10} />,
    );

    // Attach a 15 MB image so the warning is visible.
    await act(async () => {
      capturedCallback()([fakeImage(15 * 1024 * 1024)]);
    });

    // Warning should mention the active limit (10 MB).
    expect(screen.getByTestId("warning-large-image")).toHaveTextContent("10 MB");

    // Switch to 20 MB limit — if the warning were still visible it would say 20 MB.
    // (The warning is hidden at 20 MB for a 15 MB image, so we re-test with a
    // 25 MB image to confirm the label updates too.)
    rerender(<ChatInput onSend={vi.fn()} maxImageSizeMb={20} />);

    // Warning is gone — image is within the new limit.  Attach an oversized one.
    await act(async () => {
      capturedCallback()([fakeImage(25 * 1024 * 1024)]);
    });

    expect(screen.getByTestId("warning-large-image")).toHaveTextContent("20 MB");
  });
});
