/**
 * Tests for the image count badge on the consultant tool-call card.
 *
 * The badge (data-testid="consultant-image-count-{id}") must:
 *  - be hidden when no images are supplied
 *  - show "1 image" (singular) when exactly one image is supplied
 *  - show "N images" (plural) when more than one image is supplied
 *  - derive its count from all four arg channels: image_path, image_base64,
 *    image_paths[], and image_base64s[]
 *  - prefer result.image_count when the call completes and that value is present
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolCallCard } from "../components/ToolCallCard";
import type { ToolEvent } from "../components/ToolCallCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConsultantEvent(
  id: string,
  args: Record<string, unknown>,
  result?: Record<string, unknown>,
): ToolEvent {
  return {
    id,
    capability: "ask_consultant",
    args: { consultant_name: "Specialist", question: "What do you think?", ...args },
    status: result !== undefined ? "success" : "running",
    result,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ToolCallCard — consultant image count badge", () => {

  // ── No images ──────────────────────────────────────────────────────────────

  it("does not render the badge when no image args are supplied", () => {
    render(<ToolCallCard event={makeConsultantEvent("c1", {})} />);
    expect(screen.queryByTestId("consultant-image-count-c1")).not.toBeInTheDocument();
  });

  it("does not render the badge when the result image_count is 0", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c2", {}, { answer: "done", image_count: 0 })}
      />,
    );
    expect(screen.queryByTestId("consultant-image-count-c2")).not.toBeInTheDocument();
  });

  // ── Singular: exactly 1 image ──────────────────────────────────────────────

  it("shows '1 image' when a single image_path is provided", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c3", { image_path: "/tmp/photo.jpg" })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c3");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toMatch(/^1 image$/);
  });

  it("shows '1 image' when a single image_base64 blob is provided", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c4", { image_base64: "data:image/png;base64,abc" })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c4");
    expect(badge.textContent).toMatch(/^1 image$/);
  });

  it("shows '1 image' when image_paths is an array with one entry", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c5", { image_paths: ["/tmp/a.png"] })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c5");
    expect(badge.textContent).toMatch(/^1 image$/);
  });

  it("shows '1 image' when image_base64s is an array with one entry", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c6", { image_base64s: ["data:image/jpeg;base64,xyz"] })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c6");
    expect(badge.textContent).toMatch(/^1 image$/);
  });

  // ── Plural: multiple images ────────────────────────────────────────────────

  it("shows '2 images' when image_paths has two entries", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c7", {
          image_paths: ["/tmp/a.png", "/tmp/b.png"],
        })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c7");
    expect(badge.textContent).toMatch(/^2 images$/);
  });

  it("shows '3 images' when image_path and image_paths combine to three", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c8", {
          image_path: "/tmp/cover.jpg",
          image_paths: ["/tmp/a.png", "/tmp/b.png"],
        })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c8");
    expect(badge.textContent).toMatch(/^3 images$/);
  });

  it("shows '4 images' when all four channels contribute one image each", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent("c9", {
          image_path: "/tmp/a.jpg",
          image_base64: "data:image/png;base64,aaa",
          image_paths: ["/tmp/b.png"],
          image_base64s: ["data:image/webp;base64,bbb"],
        })}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c9");
    expect(badge.textContent).toMatch(/^4 images$/);
  });

  // ── Result takes precedence ────────────────────────────────────────────────

  it("uses result.image_count when the call succeeds and the value is ≥1", () => {
    // The args say 1 image but the result says 3 — the result wins.
    render(
      <ToolCallCard
        event={makeConsultantEvent(
          "c10",
          { image_path: "/tmp/a.jpg" },
          { answer: "done", image_count: 3 },
        )}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c10");
    expect(badge.textContent).toMatch(/^3 images$/);
  });

  it("falls back to arg-derived count when result has no image_count field", () => {
    render(
      <ToolCallCard
        event={makeConsultantEvent(
          "c11",
          { image_paths: ["/tmp/a.png", "/tmp/b.png"] },
          { answer: "done" },
        )}
      />,
    );
    const badge = screen.getByTestId("consultant-image-count-c11");
    expect(badge.textContent).toMatch(/^2 images$/);
  });

});
