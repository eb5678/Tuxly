import { Dispatch, SetStateAction, RefObject, KeyboardEvent, ChangeEvent, ClipboardEvent } from "react";

export interface UseCompletionReturn {
  input: string;
  setInput: (value: string) => void;
  response: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: any[];
  removeFile: (fileId: string) => void;
  submit: (speechText?: string) => Promise<void>;
  isRecording: boolean;
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  isTranscribing: boolean;
  toggleManualRecording: () => Promise<void>;
  conversationHistory: any[];
  loadConversation: (conversation: any) => void;
  startNewConversation: () => void;
  deleteMessageFromHistory: (id: string) => Promise<void>; // <-- NEW
  handleFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  handleKeyPress: (e: KeyboardEvent) => void;
  handlePaste: (e: ClipboardEvent) => Promise<void>;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  isFilesPopoverOpen: boolean;
  setIsFilesPopoverOpen: Dispatch<SetStateAction<boolean>>;
  onRemoveAllFiles: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  streamingTextRef: RefObject<HTMLDivElement | null>; 
}