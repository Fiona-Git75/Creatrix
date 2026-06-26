import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, RefObject, ChangeEvent } from "react";
import { Send, Paperclip, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const LARGE_IMAGE_THRESHOLD_MB = 10;
const LARGE_IMAGE_THRESHOLD_BYTES = LARGE_IMAGE_THRESHOLD_MB * 1024 * 1024;

export interface AttachedImage {
  base64: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
  previewUrl: string;
}

interface ChatInputProps {
  onSend: (message: string, images?: AttachedImage[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  inputRef?: RefObject<HTMLTextAreaElement>;
}

export function ChatInput({ onSend, isLoading, placeholder = "Send a message...", inputRef }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = inputRef ?? internalRef;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Document-level paste: catches pastes that happen before the user clicks
  // into the textarea (e.g. Cmd+V immediately after taking a screenshot).
  // Guard: skip when another input or textarea has focus — their own paste
  // handlers should run undisturbed. Plain-text pastes are also ignored here
  // because no image files will be present.
  useEffect(() => {
    const handleDocumentPaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      // If any input or textarea has focus, let its own handler run.
      // This includes the chat textarea itself (covered by onPaste prop)
      // and any other focusable form field that should not be interrupted.
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const imageFiles = Array.from(e.clipboardData?.files ?? []).filter(
        f => f.type.startsWith("image/"),
      );
      if (imageFiles.length === 0) return;

      e.preventDefault();
      processImageFiles(imageFiles);
    };

    document.addEventListener("paste", handleDocumentPaste as EventListener);
    return () => document.removeEventListener("paste", handleDocumentPaste as EventListener);
  // processImageFiles is defined in the same render scope; no external deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = () => {
    if (value.trim() && !isLoading) {
      onSend(value.trim(), attachedImages.length > 0 ? attachedImages : undefined);
      setValue("");
      setAttachedImages([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    processImageFiles(files);
    e.target.value = "";
  };

  const processImageFiles = (files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type || "image/jpeg";
        const previewUrl = dataUrl;
        setAttachedImages(prev => [
          ...prev,
          { base64, mimeType, name: file.name, sizeBytes: file.size, previewUrl },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    e.preventDefault();
    processImageFiles(imageFiles);
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const hasLargeImage = attachedImages.some(img => img.sizeBytes > LARGE_IMAGE_THRESHOLD_BYTES);

  return (
    <div className="border-t bg-background">
      <div className="max-w-3xl mx-auto p-4">

        {hasLargeImage && (
          <div
            className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            data-testid="warning-large-image"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              This image is over {LARGE_IMAGE_THRESHOLD_MB} MB and may be rejected by the vision model.{" "}
              To resize on macOS/Linux: <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">sips -Z 1920 yourimage.jpg</code>{" "}
              or compress online at{" "}
              <a
                href="https://squoosh.app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:opacity-80"
              >
                squoosh.app
              </a>
              . You can still send it.
            </span>
          </div>
        )}

        {attachedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2" data-testid="image-preview-list">
            {attachedImages.map((img, i) => (
              <div
                key={i}
                className="relative group"
                data-testid={`image-preview-${i}`}
              >
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-16 w-16 object-cover rounded-md border"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-md" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`button-remove-image-${i}`}
                  aria-label={`Remove ${img.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                {img.sizeBytes > LARGE_IMAGE_THRESHOLD_BYTES && (
                  <div className="absolute bottom-0.5 left-0.5 right-0.5 flex items-center justify-center">
                    <AlertTriangle className="h-3 w-3 text-amber-400 drop-shadow" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border bg-card p-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-image-file"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            data-testid="button-attach-image"
            aria-label="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={isLoading}
            className="min-h-[44px] max-h-[200px] resize-none border-0 focus-visible:ring-0 text-base bg-transparent"
            rows={1}
            data-testid="input-chat-message"
            aria-label="Chat message input"
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            data-testid="button-send-message"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
