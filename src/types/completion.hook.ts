import {
  Dispatch,
  SetStateAction,
  RefObject,
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
} from "react";

export interface UseCompletionReturn {
  input: string;
  setInput: (value: string) => void;

  response: string;
  setResponse: (value: string) => void;

  isLoading: boolean;
  error: string | null;

  attachedFiles: any[];
  addFile: (file: File) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: () => void;

  submit: (speechText?: string) => Promise<void>;

  isRecording: boolean;
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  isTranscribing: boolean;
  toggleManualRecording: () => Promise<void>;

  currentConversationId: string | null;
  conversationHistory: any[];
  loadConversation: (conversation: any) => void;
  startNewConversation: () => void;

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