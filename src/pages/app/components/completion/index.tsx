import { useCompletion } from "@/hooks";
import { Files } from "./Files";
import { Audio } from "./Audio";
import { Input } from "./Input";
import { Button, ScrollArea, Markdown, CopyButton } from "@/components";
import { MessageSquarePlus, SparklesIcon, Loader2, BotIcon, Trash2Icon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { memo } from "react";

// Memoize to prevent parsing identical Markdown histories on every keystroke/stream update
const MemoizedMessage = memo(({ message, onDelete }: { message: any, onDelete: (id: string) => void }) => (
  <div className={`p-3 rounded-lg text-sm relative group ${
    message.role === "user"
      ? "bg-primary/10 border-l-4 border-primary ml-10"
      : "bg-muted/50 mr-10"
  }`}>
    <div className="flex items-center justify-between mb-2">
       <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
         {message.role === "user" ? "You" : <><BotIcon className="h-3 w-3"/> AI</>}
       </span>
       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
         {message.role === "assistant" && (
           <CopyButton content={message.content} />
         )}
         <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer hover:bg-destructive/20 hover:text-destructive" onClick={() => onDelete(message.id)} title="Delete message">
            <Trash2Icon className="h-3 w-3" />
         </Button>
       </div>
    </div>
    <div className="prose prose-sm max-w-none dark:prose-invert break-words">
       <Markdown>{message.content}</Markdown>
    </div>
  </div>
), (prev, next) => prev.message.content === next.message.content);

export const Completion = () => {
  const completion = useCompletion();

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {}
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div data-tauri-drag-region className="flex flex-row items-center gap-2 p-2 border-b border-border/50 shrink-0">
        <Button size="icon" variant="ghost" title="New Chat" onClick={completion.startNewConversation}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        <Audio {...completion} />
        <Input {...completion} />
        <Files {...completion} />
        <Button size="icon" variant="ghost" title="Open Dev Space" onClick={openDashboard}>
          <SparklesIcon className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea ref={completion.scrollAreaRef} className="flex-1 p-4 overflow-y-auto">
         <div className="flex flex-col space-y-4 pb-6 overflow-hidden">
            {completion.error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                <strong>Error:</strong> {completion.error}
              </div>
            )}
            
            {completion.conversationHistory.map((message, index) => (
              <MemoizedMessage key={message.id || index} message={message} onDelete={completion.deleteMessageFromHistory} />
            ))}
            
            {(completion.isLoading || completion.response) && (
              <div className="p-3 rounded-lg text-sm bg-muted/50 mr-10 relative">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                     <BotIcon className="h-3 w-3" /> AI
                     {completion.isLoading && <Loader2 className="h-3 w-3 animate-spin"/>}
                   </span>
                   <div className="flex items-center gap-2">
                     {completion.response && <CopyButton content={completion.response} />}
                   </div>
                </div>
                
                <div className="prose prose-sm max-w-none dark:prose-invert break-words">
                   {completion.response ? (
                     <Markdown>{completion.response}</Markdown>
                   ) : (
                     <div 
                       ref={completion.streamingTextRef as any}
                       className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed select-text"
                     >
                       <span className="text-muted-foreground italic flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin text-primary"/> Generating response...</span>
                     </div>
                   )}
                </div>
              </div>
            )}
         </div>
      </ScrollArea>
    </div>
  );
};