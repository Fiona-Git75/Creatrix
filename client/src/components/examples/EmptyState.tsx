import { EmptyState } from "../EmptyState";

export default function EmptyStateExample() {
  return (
    <div className="h-[500px] bg-background">
      <EmptyState onStartChatting={() => console.log("Start chatting")} />
    </div>
  );
}
