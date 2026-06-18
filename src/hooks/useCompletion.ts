import { useState, useCallback, useRef, useEffect } from "react";
import { useGlobalShortcuts } from "@/hooks";
import { useApp as useGlobalApp } from "@/contexts";
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
import { AttachedFile, ChatMessage, ChatConversation, CompletionState } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const useCompletion = () => {
  const {
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedSttProvider,
    allSttProviders,
    selectedAudioDevices,
    supportsImages,
  } = useGlobalApp();
  
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
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const streamingTextRef = useRef<HTMLDivElement | null>(null);
  const rawStreamBufferRef = useRef<string>("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
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

  const submit = useCallback(
    async (speechText?: string) => {
      const input = speechText || state.input;

      if (!input.trim()) {
        return;
      }

      if (speechText) {
        setState((prev) => ({ ...prev, input: speechText }));
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
          setState((prev) => ({ ...prev, error: "Invalid provider selected" }));
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
        }));

        rawStreamBufferRef.current = "";
        if (streamingTextRef.current) {
          streamingTextRef.current.textContent = "Generating response...";
        }

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
            if (currentRequestIdRef.current !== requestId || signal.aborted) {
              return;
            }

            rawStreamBufferRef.current += chunk;

            if (streamingTextRef.current) {
              streamingTextRef.current.textContent = rawStreamBufferRef.current;
            }

            const scrollElement = scrollAreaRef.current?.querySelector(
              "[data-radix-scroll-area-viewport]"
            ) as HTMLElement;

            if (scrollElement) {
              const THRESHOLD = 65;
              const distanceToBottom =
                scrollElement.scrollHeight -
                scrollElement.scrollTop -
                scrollElement.clientHeight;

              if (distanceToBottom <= THRESHOLD) {
                scrollElement.scrollTo({
                  top: scrollElement.scrollHeight,
                  behavior: "auto",
                });
              }
            }
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

        const compiledResponse = rawStreamBufferRef.current;

        setState((prev) => ({
          ...prev,
          isLoading: false,
          response: compiledResponse,
        }));

        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        if (compiledResponse) {
          await saveCurrentConversation(
            input,
            compiledResponse,
            state.attachedFiles
          );
          
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
            response: "",
          }));
          
          if (streamingTextRef.current) {
            streamingTextRef.current.textContent = "";
          }
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

          try {
            const provider = allSttProviders.find(p => p.id === selectedSttProvider.provider);
            const text = await fetchSTT({
              provider: provider,
              selectedProvider: selectedSttProvider,
              audio: new Blob([new Uint8Array(atob(base64Audio).split("").map(c => c.charCodeAt(0)))], { type: "audio/wav" }),
            });
            if (text) submit(text);
          } catch (e: any) {
             setState((prev: any) => ({ ...prev, error: "Transcription failed." }));
          } finally {
             setIsTranscribing(false);
             isMicBusyRef.current = false;
             await cleanupAudio();
          }
        });

        unlistenErrorRef.current = await listen("audio-encoding-error", () => {
          setIsTranscribing(false);
          setIsRecording(false);
          isMicBusyRef.current = false;
          cleanupAudio();
        });

        await invoke("stop_system_audio_capture").catch(() => {});

        const deviceId = selectedAudioDevices?.input?.id && selectedAudioDevices.input.id !== "default"
          ? selectedAudioDevices.input.id
          : "@DEFAULT_SOURCE@";

        await invoke("start_system_audio_capture", { maxDurationSecs: 180, deviceId });

        setIsRecording(true);
        setTimeout(() => { isMicBusyRef.current = false; }, 300);
        
      } catch (e) {
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
    rawStreamBufferRef.current = "";
    if (streamingTextRef.current) streamingTextRef.current.textContent = "";
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
    rawStreamBufferRef.current = "";
    if (streamingTextRef.current) streamingTextRef.current.textContent = "";
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      _attachedFiles: AttachedFile[]
    ) => {
      if (!userMessage || !assistantResponse) {
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
        } catch (error) {}
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
        return;
      }
      try {
        const conversation = await getConversationById(id);
        if (conversation) {
          loadConversation(conversation);
        }
      } catch (error) {}
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

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);

    return () => {
      window.removeEventListener("conversationSelected", handleConversationSelected);
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener("conversationDeleted", handleConversationDeleted);
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
    setState((prev) => ({ ...prev, attachedFiles: [] }));
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

      if (items && items.length > 0) {
        hasImages = Array.from(items).some((item) => item.type.startsWith("image/"));
      } else if (files && files.length > 0) {
        hasImages = Array.from(files).some((file) => file.type.startsWith("image/"));
      }

      if (!hasImages) {
        try {
          const clipboardItems = await navigator.clipboard.read().catch(() => []);
          for (const clipItem of clipboardItems) {
            if (clipItem.types.some((t) => t.startsWith("image/"))) {
              hasImages = true;
              break;
            }
          }
        } catch {}
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

        if (processedFiles.length > 0) {
          await Promise.all(processedFiles.map((file) => addFile(file)));
          setState((prev) => ({ ...prev, error: null }));
        }
      }
    },
    [addFile, supportsImages]
  );

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
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    removeFile,
    submit,
    isRecording,
    setIsRecording,
    isTranscribing,
    toggleManualRecording,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    scrollAreaRef,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    streamingTextRef,
  };
};