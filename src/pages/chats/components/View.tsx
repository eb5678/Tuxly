import {
  Badge,
  Card,
  Empty,
  Button,
  Markdown,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components";
import { getConversationById } from "@/lib";
import { ChatConversation } from "@/types";
import {
  Download,
  MessageCircleIcon,
  MessageCircleReplyIcon,
  Trash2,
  SparklesIcon,
  UserIcon,
  SendIcon,
  Check,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import moment from "moment";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/layouts";
import { useHistory, useSystemPrompts, useCompletion } from "@/hooks";
import { useApp } from "@/contexts";
import {
  DeleteConfirmationDialog,
  ChatAudio,
  ChatFiles,
  AudioRecorder,
} from ".";

const View = () => {
  const { conversationId } = useParams();
  const { supportsImages } = useApp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatConversation | null>(null);

  const {
    handleDeleteConfirm,
    confirmDelete,
    cancelDelete,
    deleteConfirm,
    handleAttachToOverlay,
    handleDownload,
    isDownloaded,
    isAttached,
  } = useHistory();

  const { prompts, selectedPromptId, handleSelectPrompt } = useSystemPrompts();
  const completion = useCompletion();

  useEffect(() => {
    const getMessages = async () => {
      const conversation = await getConversationById(conversationId as string);
      if (conversation) {
        setMessages(conversation);
        completion.loadConversation(conversation);
      }
    };
    getMessages();
  }, [conversationId]);

  const handleDelete = async () => {
    await confirmDelete();
    navigate(-1);
  };

  const activeMessages = completion.conversationHistory.length > 0 
    ? completion.conversationHistory 
    : (messages?.messages || []);

  return (
    <PageLayout
      isMainTitle={false}
      allowBackButton={true}
      title={messages?.title || "Conversations"}
      description={`${activeMessages.length} messages`}
      rightSlot={
        <div className="flex flex-row items-center gap-2">
          <Select 
            value={selectedPromptId?.toString() || "none"} 
            onValueChange={(val) => handleSelectPrompt(val === "none" ? null : Number(val))}
          >
            <SelectTrigger className="w-[180px] h-6 lg:h-8 text-[10px] lg:text-xs">
               <SelectValue placeholder="No System Prompt" />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="none">No System Prompt</SelectItem>
               {prompts.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
               ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            title="Open this conversation in overlay"
            className="text-[10px] lg:text-sm h-6 lg:h-8"
            onClick={() =>
              conversationId && handleAttachToOverlay(conversationId)
            }
            disabled={isAttached}
          >
            {isAttached ? (
              <>
                <Check className="size-3 lg:size-4 text-green-600" />
                Attached
              </>
            ) : (
              <>
                Open in Overlay <MessageCircleReplyIcon className="size-3 lg:size-4" />
              </>
            )}
          </Button>
          <Button
            variant={"outline"}
            title="Download conversation as markdown"
            className="text-[10px] lg:text-sm h-6 lg:h-8"
            onClick={(e) => handleDownload(messages, e)}
            disabled={isDownloaded}
          >
            {isDownloaded ? (
              <>
                <Check className="size-3 lg:size-4 text-green-600" />
                Downloaded
              </>
            ) : (
              <>
                Download <Download className="size-3 lg:size-4" />
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            title="Delete conversation"
            onClick={() =>
              conversationId && handleDeleteConfirm(conversationId)
            }
            className="text-[10px] lg:text-sm h-6 lg:h-8"
          >
            Delete <Trash2 className="size-3 lg:size-4" />
          </Button>
        </div>
      }
    >
      {activeMessages.length === 0 ? (
        <Empty
          isLoading={false}
          icon={MessageCircleIcon}
          title="No messages found"
          description="Start a new message to get started"
        />
      ) : (
        <div ref={completion.scrollAreaRef as any} className="flex flex-col gap-4 pb-32 px-2 overflow-y-auto max-h-[calc(100vh-14rem)]">
          {activeMessages.map((message, index, array) => {
            const isUser = message.role === "user";
            const showDate =
              index === 0 ||
              moment(message.timestamp).format("YYYY-MM-DD") !==
                moment(array[index - 1]?.timestamp).format("YYYY-MM-DD");

            return (
              <div key={message.id || index}>
                {showDate && (
                  <Badge
                    variant={"outline"}
                    className="flex items-center justify-center my-4 w-fit mx-auto"
                  >
                    {moment(message.timestamp).format("ddd, MMM D")}
                  </Badge>
                )}

                <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser && (
                    <div className="flex-shrink-0">
                      <div className="size-7 lg:size-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <SparklesIcon className="size-3 lg:size-4 text-primary" />
                      </div>
                    </div>
                  )}

                  <div className={`flex flex-col gap-1 max-w-[70%] ${isUser ? "items-end" : "items-start"}`}>
                    <Card
                      className={`p-3 text-xs lg:text-sm transition-all shadow-none ${
                        isUser
                          ? "!bg-primary text-primary-foreground !border-primary rounded-tr-sm"
                          : "!bg-muted/50 dark:!bg-muted/30 rounded-tl-sm"
                      }`}
                    >
                      <Markdown>{message.content}</Markdown>
                    </Card>
                    <Badge variant="outline" className={`text-[10px] lg:text-xs bg-transparent border-none ${isUser ? "-mr-1" : "-ml-1"}`}>
                      {moment(message.timestamp).format("hh:mm A")}
                    </Badge>
                  </div>

                  {isUser && (
                    <div className="flex-shrink-0">
                      <div className="size-7 lg:size-8 rounded-full bg-primary flex items-center justify-center">
                        <UserIcon className="size-3 lg:size-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(completion.isLoading || completion.response) && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0">
                <div className="size-7 lg:size-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <SparklesIcon className="size-3 lg:size-4 text-primary" />
                </div>
              </div>
              <div className="flex flex-col gap-1 max-w-[70%] items-start">
                <Card className="p-3 text-xs lg:text-sm shadow-none !bg-muted/50 dark:!bg-muted/30 rounded-tl-sm w-full">
                  {completion.response ? (
                    <Markdown>{completion.response}</Markdown>
                  ) : (
                    <div 
                      ref={completion.streamingTextRef as any}
                      className="whitespace-pre-wrap font-sans text-xs lg:text-sm text-foreground leading-relaxed"
                    >
                      <span className="text-muted-foreground italic flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin text-primary"/> Generating...
                      </span>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-background/5 p-4 border-t border-border/20 backdrop-blur-md">
        {completion.error && (
          <div className="pb-3">
            <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <strong>Error:</strong> {completion.error}
            </div>
          </div>
        )}

        <div className="relative flex items-start gap-2">
          <div className="flex-1 relative">
            {completion.isRecording ? (
              <AudioRecorder
                onTranscriptionComplete={(text) => {
                  completion.setIsRecording(false);
                  completion.submit(text);
                }}
                onCancel={() => completion.setIsRecording(false)}
              />
            ) : (
              <>
                <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
                  <ChatFiles
                    attachedFiles={completion.attachedFiles}
                    handleFileSelect={completion.handleFileSelect}
                    removeFile={completion.removeFile}
                    onRemoveAllFiles={completion.onRemoveAllFiles}
                    isLoading={completion.isLoading}
                    isFilesPopoverOpen={completion.isFilesPopoverOpen}
                    setIsFilesPopoverOpen={completion.setIsFilesPopoverOpen}
                    disabled={!supportsImages}
                  />
                  <ChatAudio
                    isRecording={completion.isRecording}
                    setIsRecording={completion.setIsRecording}
                    disabled={false}
                  />
                </div>

                <Textarea
                  ref={completion.inputRef as any}
                  placeholder="Type a message..."
                  className="pr-12 pl-22 resize-none pb-12 pt-3"
                  rows={2}
                  value={completion.input}
                  onChange={(e) => completion.setInput(e.target.value)}
                  onKeyDown={completion.handleKeyPress}
                  onPaste={completion.handlePaste}
                  disabled={completion.isLoading}
                />
                <Button
                  size="icon"
                  className="size-7 lg:size-9 rounded-lg lg:rounded-xl absolute right-2 bottom-2"
                  title="Send message"
                  onClick={() => completion.submit()}
                  disabled={completion.isLoading || !completion.input.trim()}
                >
                  {completion.isLoading ? (
                    <Loader2 className="size-3 lg:size-4 animate-spin" />
                  ) : (
                    <SendIcon className="size-3 lg:size-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmationDialog
        deleteConfirm={deleteConfirm}
        cancelDelete={cancelDelete}
        confirmDelete={handleDelete}
      />
    </PageLayout>
  );
};

export default View;