# Design Guidelines: Self-Hosted AI Chat UI

## Design Approach

**Selected Approach**: Design System-Inspired (ChatGPT + Linear + Notion hybrid)

This chat interface prioritizes readability, efficiency, and clean interactions. Drawing from ChatGPT's conversation clarity, Linear's precise typography, and Notion's comfortable spacing, we create a functional yet polished AI interaction experience.

## Core Design Principles

1. **Conversation First**: Chat content is the primary focus—minimize UI chrome
2. **Instant Clarity**: Clear visual distinction between user and AI messages
3. **Efficient Navigation**: Quick access to conversations and settings without clutter
4. **Comfortable Reading**: Optimized typography for long-form AI responses

## Layout System

**Primary Structure**: Sidebar + Main Chat Area (70/30 split on desktop)

**Spacing Scale**: Use Tailwind units of **2, 3, 4, 6, 8, 12** consistently
- Tight spacing: `p-2`, `gap-2` (buttons, icons)
- Standard spacing: `p-4`, `gap-4` (cards, message padding)
- Generous spacing: `p-6`, `p-8` (section padding)
- Major spacing: `p-12` (page-level containers)

**Breakpoints**:
- Mobile: Stack sidebar as overlay/drawer
- Tablet: 60/40 split
- Desktop: 70/30 split with fixed sidebar width (280px)

## Typography

**Font Stack**: 
- Primary: `Inter` (UI elements, chat interface)
- Monospace: `JetBrains Mono` (code blocks in AI responses)

**Hierarchy**:
- App Title: `text-lg font-semibold` (sidebar header)
- Message Content: `text-base leading-relaxed` (16px, 1.75 line height)
- Timestamps: `text-xs` (metadata)
- Model Selector: `text-sm font-medium`
- Button Text: `text-sm font-medium`

**Code Display**: Wrap code blocks with syntax highlighting (use Prism.js via CDN), monospace font at `text-sm`

## Component Library

### 1. Sidebar (Conversation Panel)
- Fixed width: `w-72` on desktop
- Vertical sections:
  - **New Chat Button**: Full-width, prominent at top (`h-10`, `mb-4`)
  - **Conversation List**: Scrollable area with individual chat items
  - **Settings/Model Selector**: Pinned to bottom
- **Chat Item Card**:
  - Padding: `p-3`, margin: `mb-2`
  - Truncated title: `truncate`, single line
  - Hover state with delete icon reveal
  - Active conversation: distinct visual treatment

### 2. Main Chat Area
- **Chat Container**: `max-w-3xl mx-auto` for optimal reading width
- **Message Bubbles**:
  - User messages: Aligned right, compact width
  - AI messages: Full-width with `max-w-none`, generous padding (`p-6`)
  - Avatar indicators: Small circular icons (`w-8 h-8`) for both user/AI
  - Message padding: `py-6 px-4`
  - Spacing between messages: `gap-6`
- **Streaming Indicator**: Pulsing dot or typing animation during AI generation

### 3. Input Area
- **Fixed Bottom Position**: Sticky with elevation shadow
- **Multi-line Textarea**: 
  - Auto-expanding (max 5 lines before scroll)
  - Padding: `p-4`
  - Rounded corners: `rounded-xl`
  - Min height: `h-14`
- **Send Button**: Icon button (`w-10 h-10`), positioned absolute right
- **Container**: `max-w-3xl mx-auto`, padding `p-4`

### 4. Model Selector Dropdown
- **Location**: Sidebar bottom or top-right of chat area
- **Display**: Current model with chevron icon
- **Options**: GPT-4, GPT-3.5-Turbo as selectable items
- **Item height**: `h-10` each
- Dropdown padding: `p-2`

### 5. Action Buttons
- **Copy Button**: Appears on hover over AI messages (top-right)
- **Delete Chat**: Icon button in sidebar chat items
- **Clear Conversation**: Text button in header/settings
- All icons from **Heroicons** (outline style)
- Button size: `h-8 w-8` for icon buttons, `px-4 h-10` for text buttons

### 6. Empty State
- **Centered Content**: When no conversation exists
- **Welcome Message**: `text-2xl font-semibold mb-4`
- **Suggested Prompts**: 3-4 cards in grid (`grid-cols-2 gap-4`)
- Each prompt card: `p-4`, `rounded-lg`, clickable

## Icons

**Library**: Heroicons (via CDN, outline style)
- New Chat: `PlusIcon`
- Send Message: `PaperAirplaneIcon`
- Delete: `TrashIcon`
- Copy: `ClipboardDocumentIcon`
- Settings: `Cog6ToothIcon`
- Menu (mobile): `Bars3Icon`

## Responsive Behavior

**Mobile (<768px)**:
- Sidebar becomes full-screen overlay with hamburger menu trigger
- Message padding reduces to `p-4`
- Hide timestamps on very small screens
- Chat area becomes full-width

**Tablet (768px-1024px)**:
- Collapsible sidebar with toggle
- Narrower chat max-width: `max-w-2xl`

**Desktop (>1024px)**:
- Full sidebar visible
- Optimal reading width: `max-w-3xl`
- Ample spacing throughout

## Accessibility

- **Focus States**: Visible outlines on all interactive elements
- **Keyboard Navigation**: 
  - Enter to send (Shift+Enter for new line)
  - Escape to close modals/dropdowns
  - Tab navigation through conversations
- **ARIA Labels**: All icon buttons have descriptive labels
- **Form Inputs**: Proper labels for textarea and model selector
- **Color Contrast**: Text meets WCAG AA standards (handled by color system later)

## Animations

**Minimal, Purposeful Motion**:
- Message appearance: Subtle fade-in (`duration-200`)
- Streaming text: Character-by-character reveal or smooth append
- Sidebar toggle: Slide transition (`duration-300 ease-in-out`)
- **No decorative animations**: Focus on functional feedback only

## Images

**No hero images** required for this utility application. All visuals are functional:
- User/AI avatars: Simple circular placeholders or initials
- Optional: Small AI model icons (32x32) for model selector