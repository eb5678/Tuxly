import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="relative flex-1 flex items-center" data-tauri-drag-region>
      <Textarea
        ref={inputRef as any}
        placeholder="Ask me anything..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyPress} 
        onPaste={handlePaste as any}
        disabled={isLoading}
        autoResize={true}
        className="pr-8 border-transparent focus-visible:ring-0 shadow-none bg-transparent hover:bg-black/5 dark:hover:bg-white/5 max-h-[30vh] overflow-y-auto scrollbar-thin pt-[10px] pb-[10px]"
      />
      {isLoading && (
        <div className="absolute right-3 top-[14px]">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
};