import { Loader2 } from "lucide-react";
import { Input as InputComponent } from "@/components";
import { UseCompletionReturn } from "@/types";

export const Input = ({
  isLoading,
  input,
  setInput,
  handleKeyPress,
  handlePaste,
  inputRef,
}: UseCompletionReturn) => {
  return (
    <div className="relative flex-1" data-tauri-drag-region>
      <InputComponent
        ref={inputRef}
        placeholder="Ask me anything..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        onPaste={handlePaste}
        disabled={isLoading}
        className="pr-8 border-transparent focus-visible:ring-0 shadow-none bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
};