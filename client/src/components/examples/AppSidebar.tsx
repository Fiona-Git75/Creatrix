import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../AppSidebar";

export default function AppSidebarExample() {
  const [activeId, setActiveId] = useState<string | null>("1");
  const [model, setModel] = useState("gpt-4o");
  const [conversations, setConversations] = useState([
    { id: "1", title: "What is React?" },
    { id: "2", title: "Help me write a poem" },
    { id: "3", title: "Explain quantum computing" },
  ]);

  return (
    <SidebarProvider>
      <div className="flex h-[400px] w-full">
        <AppSidebar
          conversations={conversations}
          activeConversationId={activeId}
          selectedModel={model}
          selectedConnectionId={null}
          selectedProjectId={null}
          morningOrientationEnabled={false}
          onNewChat={() => console.log("New chat")}
          onSelectConversation={setActiveId}
          onDeleteConversation={(id) => {
            setConversations((prev) => prev.filter((c) => c.id !== id));
          }}
          onModelChange={setModel}
          onConnectionChange={() => {}}
          onProjectChange={() => {}}
        />
        <div className="flex-1 bg-background p-4">
          <p className="text-muted-foreground">Main content area</p>
        </div>
      </div>
    </SidebarProvider>
  );
}
