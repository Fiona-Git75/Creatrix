import { ChatMessage } from "../ChatMessage";

export default function ChatMessageExample() {
  return (
    <div className="space-y-2">
      <ChatMessage
        message={{
          id: "1",
          role: "user",
          content: "What is the capital of France?",
        }}
      />
      <ChatMessage
        message={{
          id: "2",
          role: "assistant",
          content: "The capital of France is Paris. It's known as the 'City of Light' and is famous for landmarks like the Eiffel Tower and the Louvre Museum.",
        }}
      />
    </div>
  );
}
