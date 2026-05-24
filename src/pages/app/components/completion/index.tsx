import { useCompletion } from "@/hooks";
import { Files } from "./Files";
import { Audio } from "./Audio";
import { Input } from "./Input";
import { Button, ScrollArea, Markdown, CopyButton } from "@/components";
import { MessageSquarePlus, SparklesIcon, Loader2, BotIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export const Completion = ({ isHidden }: { isHidden: boolean }) => {
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
        <Input {...completion} isHidden={isHidden} />
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
              <div key={index} className={`p-3 rounded-lg text-sm ${
                message.role === "user"
                  ? "bg-primary/10 border-l-4 border-primary ml-10"
                  : "bg-muted/50 mr-10"
              }`}>
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                     {message.role === "user" ? "You" : <><BotIcon className="h-3 w-3"/> AI</>}
                   </span>
                   {message.role === "assistant" && (
                     <CopyButton content={message.content} />
                   )}
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert break-words">
                   <Markdown>{message.content}</Markdown>
                </div>
              </div>
            ))}
            
            {(completion.isLoading || completion.response) && (
              <div className="p-3 rounded-lg text-sm bg-muted/50 mr-10">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
                     <BotIcon className="h-3 w-3" /> AI
                     {completion.isLoading && <Loader2 className="h-3 w-3 animate-spin"/>}
                   </span>
                   {completion.response && <CopyButton content={completion.response} />}
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert break-words">
                   {completion.response ? (
                     <Markdown>{completion.response}</Markdown>
                   ) : (
                     <span className="text-muted-foreground italic">Generating response...</span>
                   )}
                </div>
              </div>
            )}
         </div>
      </ScrollArea>
    </div>
  );
};