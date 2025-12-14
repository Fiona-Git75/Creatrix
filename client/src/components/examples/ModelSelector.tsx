import { useState } from "react";
import { ModelSelector } from "../ModelSelector";

export default function ModelSelectorExample() {
  const [model, setModel] = useState("gpt-4o");
  
  return (
    <ModelSelector
      selectedModel={model}
      onModelChange={setModel}
    />
  );
}
