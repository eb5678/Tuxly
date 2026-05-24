import { useState, useCallback, useRef, useEffect } from "react";
import { useWindowResize } from "./useWindow";
import { useGlobalShortcuts } from "@/hooks";
import { useApp } from "@/contexts";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  MESSAGE_ID_OFFSET,
  generateConversationId,
  generateMessageId,
  generateRequestId,
  fetchSTT,
} from "@/lib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface CompletionState {
  input: string;
  response: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
}

export const useCompletion = () => {
  const {
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedSttProvider,
    allSttProviders,
    selectedAudioDevices,
    supportsImages,
  } = useApp();
  
  const globalShortcuts = useGlobalShortcuts();

  const [state, setState] = useState<CompletionState>({
    input: "",
    response: "",
    isLoading: false,
    error: null,
    attachedFiles: [],
    currentConversationId: null,
    conversationHistory: [],
  });
  
  const [micOpen, setMicOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { resizeWindow } = useWindowResize();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
  }, []);

  const setResponse = useCallback((value: string) => {
    setState((prev) => ({ ...prev, response: value }));
  }, []);

  const addFile = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const attachedFile: AttachedFile = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        base64,
        size: file.size,
      };

      setState((prev) => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, attachedFile],
      }));
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, attachedFiles: [] }));
  }, []);

  const submit = useCallback(
    async (speechText?: string) => {
      const input = speechText || state.input;

      if (!input.trim()) {
        return;
      }

      if (speechText) {
        setState((prev) => ({
          ...prev,
          input: speechText,
        }));
      }

      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        const messageHistory = state.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const imagesBase64: string[] = [];
        if (state.attachedFiles.length > 0) {
          state.attachedFiles.forEach((file) => {
            if (file.type.startsWith("image/")) {
              imagesBase64.push(file.base64);
            }
          });
        }

        let fullResponse = "";

        if (!selectedAIProvider.provider) {
          setState((prev) => ({
            ...prev,
            error: "Please select an AI provider in settings",
          }));
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider) {
          setState((prev) => ({
            ...prev,
            error: "Invalid provider selected",
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
        }));

        try {
          for await (const chunk of fetchAIResponse({
            provider: provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: systemPrompt || undefined,
            history: messageHistory,
            userMessage: input,
            imagesBase64,
            signal,
          })) {
            if (currentRequestIdRef.current !== requestId) {
              return;
            }
            if (signal.aborted) {
              return;
            }
            fullResponse += chunk;
            setState((prev) => ({
              ...prev,
              response: prev.response + chunk,
            }));
          }
        } catch (e: any) {
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: e.message || "An error occurred",
            }));
          }
          return;
        }

        if (currentRequestIdRef.current !== requestId || signal.aborted) {
          return;
        }

        setState((prev) => ({ ...prev, isLoading: false }));

        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        if (fullResponse) {
          await saveCurrentConversation(
            input,
            fullResponse,
            state.attachedFiles
          );
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
            response: "",
          }));
        }
      } catch (error) {
        if (!signal?.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [
      state.input,
      state.attachedFiles,
      selectedAIProvider,
      allAiProviders,
      systemPrompt,
      state.conversationHistory,
    ]
  );

  const unlistenAudioRef = useRef<any>(null);
  const unlistenErrorRef = useRef<any>(null);
  const isMicBusyRef = useRef<boolean>(false);

  const cleanupAudio = useCallback(async () => {
    if (unlistenAudioRef.current) {
      unlistenAudioRef.current();
      unlistenAudioRef.current = null;
    }
    if (unlistenErrorRef.current) {
      unlistenErrorRef.current();
      unlistenErrorRef.current = null;
    }
    await invoke("stop_system_audio_capture").catch(() => {});
  }, []);

  const toggleManualRecording = useCallback(async () => {
    if (isTranscribing || isMicBusyRef.current) return;
    
    isMicBusyRef.current = true;

    if (isRecording) {
      setIsTranscribing(true);
      await invoke("manual_stop_continuous").catch(() => {});
    } else {
      try {
        await cleanupAudio();
        
        unlistenAudioRef.current = await listen("speech-detected", async (event: any) => {
          setIsRecording(false);
          const base64Audio = event.payload as string;
          
          const binaryString = atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const audioBlob = new Blob([bytes], { type: "audio/wav" });

          try {
            const provider = allSttProviders.find(p => p.id === selectedSttProvider.provider);
            const text = await fetchSTT({
              provider: provider,
              selectedProvider: selectedSttProvider,
              audio: audioBlob,
            });
            if (text) submit(text);
          } catch (e: any) {
             console.error("STT Conversion Error:", e);
             setState((prev: any) => ({ ...prev, error: "Transcription failed." }));
          } finally {
             setIsTranscribing(false);
             isMicBusyRef.current = false;
             await cleanupAudio();
          }
        });

        unlistenErrorRef.current = await listen("audio-encoding-error", (event: any) => {
          console.warn("Audio processing aborted:", event.payload);
          setIsTranscribing(false);
          setIsRecording(false);
          isMicBusyRef.current = false;
          cleanupAudio();
        });

        await invoke("stop_system_audio_capture").catch(() => {});

        const vadConfig = {
          enabled: false, 
          max_recording_duration_secs: 180,
          box_size: 1024, sensitivity_rms: 0.012, peak_threshold: 0.035, silence_chunks: 45, min_speech_chunks: 7, pre_speech_chunks: 12, noise_gate_threshold: 0.003
        };

        const deviceId = selectedAudioDevices?.input?.id && selectedAudioDevices.input.id !== "default"
          ? selectedAudioDevices.input.id
          : null;

        await invoke("start_system_audio_capture", { vadConfig, deviceId });

        setIsRecording(true);
        setTimeout(() => { isMicBusyRef.current = false; }, 300);
        
      } catch (e) {
        console.error(e);
        setState((prev: any) => ({ ...prev, error: "Failed to start recording." }));
        await cleanupAudio();
        setIsRecording(false);
        isMicBusyRef.current = false;
      }
    }
  }, [isRecording, isTranscribing, cleanupAudio, selectedSttProvider, allSttProviders, selectedAudioDevices, submit]);

  useEffect(() => {
    return () => {
       cleanupAudio();
    };
  }, [cleanupAudio]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
    }));
  }, [cancel]);

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState((prev) => ({
      ...prev,
      currentConversationId: conversation.id,
      conversationHistory: conversation.messages,
      input: "",
      response: "",
      error: null,
      isLoading: false,
    }));
  }, []);

  const startNewConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentConversationId: null,
      conversationHistory: [],
      input: "",
      response: "",
      error: null,
      isLoading: false,
      attachedFiles: [],
    }));
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      _attachedFiles: AttachedFile[]
    ) => {
      if (!userMessage || !assistantResponse) {
        console.error("Cannot save conversation: missing message content");
        return;
      }

      const conversationId =
        state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const userMsg: ChatMessage = {
        id: generateMessageId("user", timestamp),
        role: "user",
        content: userMessage,
        timestamp,
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
        role: "assistant",
        content: assistantResponse,
        timestamp: timestamp + MESSAGE_ID_OFFSET,
      };

      const newMessages = [...state.conversationHistory, userMsg, assistantMsg];

      let existingConversation = null;
      if (state.currentConversationId) {
        try {
          existingConversation = await getConversationById(
            state.currentConversationId
          );
        } catch (error) {
          console.error("Failed to get existing conversation:", error);
        }
      }

      const title =
        state.conversationHistory.length === 0
          ? generateConversationTitle(userMessage)
          : existingConversation?.title ||
            generateConversationTitle(userMessage);

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: existingConversation?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      try {
        await saveConversation(conversation);

        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));
      } catch (error) {
        console.error("Failed to save conversation:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to save conversation. Please try again.",
        }));
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  useEffect(() => {
    const handleConversationSelected = async (event: any) => {
      const { id } = event.detail;
      if (!id || typeof id !== "string") {
        console.error("No conversation ID provided");
        setState((prev) => ({
          ...prev,
          error: "Invalid conversation selected",
        }));
        return;
      }
      try {
        const conversation = await getConversationById(id);
        if (conversation) {
          loadConversation(conversation);
        } else {
          setState((prev) => ({
            ...prev,
            error: "Conversation not found. It may have been deleted.",
          }));
        }
      } catch (error) {
         console.error("Failed to load conversation:", error);
      }
    };

    const handleNewConversation = () => {
      startNewConversation();
    };

    const handleConversationDeleted = (event: any) => {
      const deletedId = event.detail;
      if (state.currentConversationId === deletedId) {
        startNewConversation();
      }
    };

    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === "pluely-conversation-selected" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.id && typeof data.id === "string") {
            const conversation = await getConversationById(data.id);
            if (conversation) {
              loadConversation(conversation);
            }
          }
        } catch (error) {
          console.error("Parse error:", error);
        }
      }
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("conversationSelected", handleConversationSelected);
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener("conversationDeleted", handleConversationDeleted);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        addFile(file);
      }
    });
    e.target.value = "";
  };

  const onRemoveAllFiles = () => {
    clearFiles();
    setIsFilesPopoverOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && state.input.trim()) {
        submit();
      }
    }
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      const files = e.clipboardData?.files;
      let hasImages = false;

      // Check standard lists
      if (items && items.length > 0) {
        hasImages = Array.from(items).some((item) => item.type.startsWith("image/"));
      } else if (files && files.length > 0) {
        hasImages = Array.from(files).some((file) => file.type.startsWith("image/"));
      }

      // Check async clipboard
      if (!hasImages) {
        try {
          const clipboardItems = await navigator.clipboard.read().catch(() => []);
          for (const clipItem of clipboardItems) {
            if (clipItem.types.some((t) => t.startsWith("image/"))) {
              hasImages = true;
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      if (hasImages) {
        e.preventDefault();
        e.stopPropagation();

        if (!supportsImages) {
          setState((prev) => ({
            ...prev,
            error: "Current AI model / provider details do not support image inputs.",
          }));
          return;
        }

        const processedFiles: File[] = [];

        if (items && items.length > 0) {
          Array.from(items).forEach((item) => {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) processedFiles.push(file);
            }
          });
        }

        if (processedFiles.length === 0 && files && files.length > 0) {
          Array.from(files).forEach((file) => {
            if (file.type.startsWith("image/")) {
              processedFiles.push(file);
            }
          });
        }

        if (processedFiles.length === 0) {
          try {
            const clipboardItems = await navigator.clipboard.read();
            for (const clipItem of clipboardItems) {
              const imgTypes = clipItem.types.filter((t) => t.startsWith("image/"));
              for (const type of imgTypes) {
                const blob = await clipItem.getType(type);
                const fileExt = type.split("/")[1] || "png";
                const file = new File([blob], `screenshot_${Date.now()}.${fileExt}`, { type });
                processedFiles.push(file);
              }
            }
          } catch {
            // ignore
          }
        }

        if (processedFiles.length > 0) {
          await Promise.all(processedFiles.map((file) => addFile(file)));
          setState((prev) => ({ ...prev, error: null }));
        }
      }
    },
    [addFile, supportsImages]
  );

  useEffect(() => {
    if (
      state.response &&
      scrollAreaRef.current
    ) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight
        });
      }
    }
  }, [state.response]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeScrollRef = scrollAreaRef.current;
      const scrollElement = activeScrollRef?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "auto" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "auto" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scrollAreaRef]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentRequestIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    globalShortcuts.registerAudioCallback(toggleManualRecording);
    globalShortcuts.registerInputRef(inputRef.current as any);
  }, [
    globalShortcuts.registerAudioCallback,
    globalShortcuts.registerInputRef,
    toggleManualRecording,
  ]);

  return {
    input: state.input,
    setInput,
    response: state.response,
    setResponse,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    submit,
    cancel,
    reset,
    setState,
    isRecording,
    setIsRecording,
    isTranscribing,
    toggleManualRecording,
    micOpen,
    setMicOpen,
    currentConversationId: state.currentConversationId,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    scrollAreaRef,
    resizeWindow,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
  };
};