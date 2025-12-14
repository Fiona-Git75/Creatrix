import { EmptyState } from "../EmptyState";

export default function EmptyStateExample() {
  return (
    <div className="h-[500px] bg-background">
      <EmptyState onSelectPrompt={(prompt) => console.log("Selected:", prompt)} />
    </div>
  );
}
