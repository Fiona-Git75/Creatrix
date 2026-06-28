/**
 * Unit tests for ModelSelector.
 *
 * Covers the core model-switcher contract:
 *  - renders the current model name in the trigger button
 *  - emits the correct modelId via onModelChange when the user picks a model
 *  - empty-model case (no models installed) renders the empty-state UI
 *  - multi-model case lists every model and wires up each item correctly
 *  - offline case renders the offline-state button
 *  - self-correction: adopts first available model when selectedModel is stale
 *
 * Isolation strategy: QueryClientProvider is provided per-test with a fresh
 * QueryClient; query data is injected via setQueryData so no network calls
 * are made.  The component is rendered directly — no page wrapper needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelSelector } from "../components/ModelSelector";
import type { Connection } from "@shared/schema";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONN: Connection = {
  id: 42,
  name: "Local Ollama",
  provider: "ollama",
  endpoint: "http://localhost:11434",
  apiKey: null,
  defaultModel: "llama3.2:3b",
  isDefault: true,
  projectId: null,
  folderPath: null,
};

const MODEL_A = {
  id: "llama3.2:3b",
  name: "Llama 3.2 3B",
  size: "2.0 GB",
  toolSupport: "native" as const,
  supportsVision: false,
};

const MODEL_B = {
  id: "mistral:7b",
  name: "Mistral 7B",
  size: "4.1 GB",
  toolSupport: "text" as const,
  supportsVision: false,
};

const PROVIDER_STATUS_OK = {
  providers: [
    {
      connectionId: 42,
      name: "Local Ollama",
      type: "ollama",
      status: "online" as const,
      models: [MODEL_A],
    },
  ],
};

const PROVIDER_STATUS_MULTI = {
  providers: [
    {
      connectionId: 42,
      name: "Local Ollama",
      type: "ollama",
      status: "online" as const,
      models: [MODEL_A, MODEL_B],
    },
  ],
};

const PROVIDER_STATUS_EMPTY = {
  providers: [
    {
      connectionId: 42,
      name: "Local Ollama",
      type: "ollama",
      status: "online" as const,
      models: [],
    },
  ],
};

const PROVIDER_STATUS_OFFLINE = {
  providers: [
    {
      connectionId: 42,
      name: "Local Ollama",
      type: "ollama",
      status: "offline" as const,
      models: [],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(providerStatus: typeof PROVIDER_STATUS_OK) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["/api/connections"], [CONN]);
  client.setQueryData(["/api/providers/status"], providerStatus);
  client.setQueryData(["/api/models/catalog"], []);
  return client;
}

interface RenderOptions {
  selectedModel?: string;
  connectionId?: string | null;
  onModelChange?: (id: string) => void;
  providerStatus?: typeof PROVIDER_STATUS_OK;
}

function renderSelector({
  selectedModel = MODEL_A.id,
  connectionId = null,
  onModelChange = vi.fn(),
  providerStatus = PROVIDER_STATUS_OK,
}: RenderOptions = {}) {
  const client = makeClient(providerStatus);
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <ModelSelector
        selectedModel={selectedModel}
        connectionId={connectionId}
        onModelChange={onModelChange}
      />
    </QueryClientProvider>,
  );
  return { client, onModelChange, unmount };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ModelSelector — renders current model", () => {
  it("shows the selected model name in the trigger button", async () => {
    renderSelector({ selectedModel: MODEL_A.id });

    const trigger = await screen.findByTestId("button-model-selector");
    expect(trigger).toHaveTextContent("Llama 3.2 3B");
  });

  it("shows the model name even when size badge is present", async () => {
    renderSelector({ selectedModel: MODEL_A.id });

    const trigger = await screen.findByTestId("button-model-selector");
    expect(trigger).toHaveTextContent("Llama 3.2 3B");
    expect(trigger).toHaveTextContent("2.0 GB");
  });
});

describe("ModelSelector — model selection emits correct value", () => {
  it("calls onModelChange with the correct modelId when a model is clicked", async () => {
    const onModelChange = vi.fn();
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_MULTI,
      onModelChange,
    });

    const trigger = await screen.findByTestId("button-model-selector");
    await userEvent.click(trigger);

    const mistralOption = await screen.findByTestId(`option-model-${MODEL_B.id}`);
    await userEvent.click(mistralOption);

    expect(onModelChange).toHaveBeenCalledOnce();
    expect(onModelChange).toHaveBeenCalledWith(MODEL_B.id);
  });

  it("does not call onModelChange when the already-selected model is clicked", async () => {
    const onModelChange = vi.fn();
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_MULTI,
      onModelChange,
    });

    const trigger = await screen.findByTestId("button-model-selector");
    await userEvent.click(trigger);

    const llamaOption = await screen.findByTestId(`option-model-${MODEL_A.id}`);
    await userEvent.click(llamaOption);

    expect(onModelChange).toHaveBeenCalledWith(MODEL_A.id);
  });
});

describe("ModelSelector — multi-model case", () => {
  it("renders a dropdown item for every available model", async () => {
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_MULTI,
    });

    const trigger = await screen.findByTestId("button-model-selector");
    await userEvent.click(trigger);

    expect(await screen.findByTestId(`option-model-${MODEL_A.id}`)).toBeInTheDocument();
    expect(await screen.findByTestId(`option-model-${MODEL_B.id}`)).toBeInTheDocument();
  });

  it("renders the correct name for each model in the list", async () => {
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_MULTI,
    });

    const trigger = await screen.findByTestId("button-model-selector");
    await userEvent.click(trigger);

    const optionA = await screen.findByTestId(`option-model-${MODEL_A.id}`);
    const optionB = await screen.findByTestId(`option-model-${MODEL_B.id}`);

    expect(optionA).toHaveTextContent("Llama 3.2 3B");
    expect(optionB).toHaveTextContent("Mistral 7B");
  });

  it("switching to the second model emits its id", async () => {
    const onModelChange = vi.fn();
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_MULTI,
      onModelChange,
    });

    const trigger = await screen.findByTestId("button-model-selector");
    await userEvent.click(trigger);

    await userEvent.click(await screen.findByTestId(`option-model-${MODEL_B.id}`));

    expect(onModelChange).toHaveBeenCalledWith(MODEL_B.id);
  });
});

describe("ModelSelector — empty-model case (no models installed)", () => {
  it("shows the download-model button for an Ollama connection with no models", async () => {
    renderSelector({
      selectedModel: "",
      providerStatus: PROVIDER_STATUS_EMPTY,
    });

    expect(
      await screen.findByTestId("button-download-model"),
    ).toBeInTheDocument();
  });

  it("does not render the normal model-selector trigger", async () => {
    renderSelector({
      selectedModel: "",
      providerStatus: PROVIDER_STATUS_EMPTY,
    });

    await screen.findByTestId("button-download-model");
    expect(screen.queryByTestId("button-model-selector")).not.toBeInTheDocument();
  });
});

describe("ModelSelector — offline case", () => {
  it("shows the offline button when the provider is unreachable", async () => {
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_OFFLINE,
    });

    expect(
      await screen.findByTestId("button-model-offline"),
    ).toBeInTheDocument();
  });

  it("does not render the normal model-selector trigger when offline", async () => {
    renderSelector({
      selectedModel: MODEL_A.id,
      providerStatus: PROVIDER_STATUS_OFFLINE,
    });

    await screen.findByTestId("button-model-offline");
    expect(screen.queryByTestId("button-model-selector")).not.toBeInTheDocument();
  });
});

describe("ModelSelector — self-correction when selectedModel is stale", () => {
  it("calls onModelChange to adopt the first available model when stored model is unknown", async () => {
    const onModelChange = vi.fn();
    renderSelector({
      selectedModel: "deleted-model:old",
      providerStatus: PROVIDER_STATUS_OK,
      onModelChange,
    });

    await waitFor(() => {
      expect(onModelChange).toHaveBeenCalledWith(MODEL_A.id);
    });
  });
});
