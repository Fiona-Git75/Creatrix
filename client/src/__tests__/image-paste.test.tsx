/**
 * Tests for the useImagePaste hook and ChatInput paste integration.
 *
 * The paste logic was extracted from ChatInput into a shared hook:
 *   client/src/hooks/use-image-paste.ts
 *
 * Three paths are covered:
 *   1. processImageFiles — core FileReader pipeline (unit)
 *   2. useImagePaste     — document-level paste listener (hook)
 *   3. ChatInput         — textarea paste + document-level paste (integration)
 *
 * FileReader strategy
 * ───────────────────
 * jsdom's FileReader is present but does not implement readAsDataURL reliably.
 * We replace it globally with a lightweight mock that resolves via microtask
 * (Promise.resolve) so act(async () => {...}) flushes it correctly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { processImageFiles, useImagePaste } from "../hooks/use-image-paste";
import { ChatInput } from "../components/ChatInput";

// ── FileReader mock ───────────────────────────────────────────────────────────

class MockFileReader {
  result: string = "";
  onload: ((ev: { target: MockFileReader }) => void) | null = null;

  readAsDataURL(file: File) {
    const type = file.type || "image/jpeg";
    this.result = `data:${type};base64,FAKEBASE64`;
    // Resolve in a microtask so act(async) flushes it.
    Promise.resolve().then(() => this.onload?.({ target: this }));
  }
}

vi.stubGlobal("FileReader", MockFileReader);

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeImageFile(type = "image/jpeg", name = "photo.jpg"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: 1024 });
  return f;
}

/** Build a minimal ClipboardEvent-like Event that useImagePaste can consume. */
function makeDocumentPasteEvent(files: File[]): Event {
  const evt = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(evt, "clipboardData", {
    value: { files, items: [] },
    writable: false,
  });
  return evt;
}

// ── 1. processImageFiles — unit tests ─────────────────────────────────────────

describe("processImageFiles", () => {
  it("converts a single image file into an AttachedImage record", async () => {
    const onImages = vi.fn();
    processImageFiles([makeImageFile("image/jpeg", "shot.jpg")], onImages);

    await vi.waitFor(() => expect(onImages).toHaveBeenCalled());

    const [images] = onImages.mock.calls[0];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      mimeType: "image/jpeg",
      name: "shot.jpg",
      sizeBytes: 1024,
      base64: "FAKEBASE64",
      previewUrl: "data:image/jpeg;base64,FAKEBASE64",
    });
  });

  it("batches multiple files and calls onImages exactly once", async () => {
    const onImages = vi.fn();
    processImageFiles(
      [makeImageFile("image/jpeg", "a.jpg"), makeImageFile("image/png", "b.png")],
      onImages,
    );

    await vi.waitFor(() => expect(onImages).toHaveBeenCalledOnce());

    const [images] = onImages.mock.calls[0];
    expect(images).toHaveLength(2);
    expect(images.map((i: { name: string }) => i.name)).toEqual(
      expect.arrayContaining(["a.jpg", "b.png"]),
    );
  });

  it("does nothing when given an empty file list", () => {
    const onImages = vi.fn();
    processImageFiles([], onImages);
    expect(onImages).not.toHaveBeenCalled();
  });

  it("falls back to image/jpeg when file.type is empty", async () => {
    const onImages = vi.fn();
    const f = new File(["x"], "noext");
    Object.defineProperty(f, "type", { value: "" });
    processImageFiles([f], onImages);

    await vi.waitFor(() => expect(onImages).toHaveBeenCalled());

    const [images] = onImages.mock.calls[0];
    expect(images[0].mimeType).toBe("image/jpeg");
  });
});

// ── 2. useImagePaste hook — document-level paste ───────────────────────────────

describe("useImagePaste", () => {
  beforeEach(() => {
    // Ensure clean focus state before each test.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  it("calls onImages when an image is pasted with no input focused", async () => {
    const onImages = vi.fn();
    renderHook(() => useImagePaste(onImages));

    await act(async () => {
      document.dispatchEvent(makeDocumentPasteEvent([makeImageFile()]));
    });

    await vi.waitFor(() => expect(onImages).toHaveBeenCalled());
    const [images] = onImages.mock.calls[0];
    expect(images[0].mimeType).toBe("image/jpeg");
  });

  it("skips the paste when a textarea has focus", async () => {
    const onImages = vi.fn();
    renderHook(() => useImagePaste(onImages));

    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();

    await act(async () => {
      document.dispatchEvent(makeDocumentPasteEvent([makeImageFile()]));
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(onImages).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("skips the paste when an input has focus", async () => {
    const onImages = vi.fn();
    renderHook(() => useImagePaste(onImages));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      document.dispatchEvent(makeDocumentPasteEvent([makeImageFile()]));
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(onImages).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores paste events that contain no image files", async () => {
    const onImages = vi.fn();
    renderHook(() => useImagePaste(onImages));

    const textOnly = new Event("paste", { bubbles: true });
    Object.defineProperty(textOnly, "clipboardData", {
      value: { files: [], items: [] },
    });
    await act(async () => {
      document.dispatchEvent(textOnly);
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(onImages).not.toHaveBeenCalled();
  });

  it("stops listening after the hook unmounts", async () => {
    const onImages = vi.fn();
    const { unmount } = renderHook(() => useImagePaste(onImages));
    unmount();

    await act(async () => {
      document.dispatchEvent(makeDocumentPasteEvent([makeImageFile()]));
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(onImages).not.toHaveBeenCalled();
  });
});

// ── 3. ChatInput — paste integration ─────────────────────────────────────────

describe("ChatInput — paste integration", () => {
  beforeEach(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  it("pasting an image while the textarea has focus adds it to the preview strip", async () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByRole("textbox");

    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { files: [makeImageFile("image/jpeg", "hero.jpg")] },
      });
    });

    // The image preview should appear in the strip.
    await vi.waitFor(() =>
      expect(screen.getByTestId("image-preview-0")).toBeInTheDocument(),
    );
  });

  it("pasting plain text in the textarea does not add any image preview", async () => {
    render(<ChatInput onSend={vi.fn()} />);
    const textarea = screen.getByRole("textbox");

    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { files: [] },
      });
    });

    expect(screen.queryByTestId("image-preview-list")).not.toBeInTheDocument();
  });

  it("pasting an image with no input focused (document-level) adds it to the preview strip", async () => {
    render(<ChatInput onSend={vi.fn()} />);

    // Blur the textarea so the document-level handler fires.
    const textarea = screen.getByRole("textbox");
    textarea.blur();

    await act(async () => {
      document.dispatchEvent(makeDocumentPasteEvent([makeImageFile()]));
    });

    await vi.waitFor(() =>
      expect(screen.getByTestId("image-preview-0")).toBeInTheDocument(),
    );
  });
});
