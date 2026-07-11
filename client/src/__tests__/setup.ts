import "@testing-library/jest-dom";
import { vi } from "vitest";

// Radix UI Select uses several browser APIs jsdom doesn't support.
// Stub them all here so any test that renders a Radix Select doesn't crash.
window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
// Radix SelectContent calls scrollIntoView on the focused item when it mounts
window.HTMLElement.prototype.scrollIntoView = vi.fn();
// Radix also uses ResizeObserver for positioning
if (!("ResizeObserver" in window)) {
  (window as unknown as Record<string, unknown>).ResizeObserver =
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}
const _typeProbe: number = 'this is not a number'; // __TYPE_ERROR_PROBE__
const _typeProbe: number = 'this is not a number'; // __TYPE_ERROR_PROBE__
