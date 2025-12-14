import { ThemeProvider } from "../ThemeProvider";
import { ThemeToggle } from "../ThemeToggle";

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <span className="text-sm text-muted-foreground">Toggle theme</span>
      </div>
    </ThemeProvider>
  );
}
