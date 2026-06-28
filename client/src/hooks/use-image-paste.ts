import { useEffect, ClipboardEvent } from "react";
import type { AttachedImage } from "@/components/ChatInput";

/**
 * Processes one or more image File objects into AttachedImage records and
 * calls onImages with the results.  Each file is read via FileReader so the
 * call is asynchronous.
 */
export function processImageFiles(
  files: File[],
  onImages: (images: AttachedImage[]) => void,
): void {
  const results: AttachedImage[] = [];
  let pending = files.length;
  if (pending === 0) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      results.push({ base64, mimeType, name: file.name, sizeBytes: file.size, previewUrl: dataUrl });
      pending -= 1;
      if (pending === 0) onImages(results);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Attaches a document-level paste listener that captures image files pasted
 * anywhere on the page *except* when another input or textarea has focus
 * (those elements handle their own paste events).
 *
 * @param onImages - called with the processed AttachedImage array
 */
export function useImagePaste(onImages: (images: AttachedImage[]) => void): void {
  useEffect(() => {
    const handleDocumentPaste = (e: Event) => {
      const ce = e as unknown as ClipboardEvent;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const imageFiles = Array.from(ce.clipboardData?.files ?? []).filter(
        (f) => f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      e.preventDefault();
      processImageFiles(imageFiles, onImages);
    };

    document.addEventListener("paste", handleDocumentPaste);
    return () => document.removeEventListener("paste", handleDocumentPaste);
  }, [onImages]);
}
