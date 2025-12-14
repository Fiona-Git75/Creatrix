import { ConversationItem } from "../ConversationItem";

export default function ConversationItemExample() {
  return (
    <div className="w-64 space-y-1 bg-sidebar p-2 rounded-md">
      <ConversationItem
        conversation={{ id: "1", title: "What is React?" }}
        isActive={true}
        onClick={() => console.log("Clicked conversation 1")}
        onDelete={() => console.log("Delete conversation 1")}
      />
      <ConversationItem
        conversation={{ id: "2", title: "Help me write a poem" }}
        isActive={false}
        onClick={() => console.log("Clicked conversation 2")}
        onDelete={() => console.log("Delete conversation 2")}
      />
    </div>
  );
}
