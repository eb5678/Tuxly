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
  deleteMessage,
} from "@/lib";
import { AttachedFile, ChatConversation, CompletionState } from "@/types";
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

  const setInput = useCallback((value: string) => setState(prev => ({ ...prev, input: value })), []);

  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const addFile = useCallback((file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const attachedFile: AttachedFile = {
      id: Date.now().toString(),
      name: file.name,
      type: file.type,
      previewUrl,
      fileObj: file,
      size: file.size,
    };
    setState(prev => ({ ...prev, attachedFiles: [...prev.attachedFiles, attachedFile] }));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState(prev => {
      const fileToRemove = prev.attachedFiles.find(f => f.id === fileId);
      if (fileToRemove?.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
      return { ...prev, attachedFiles: prev.attachedFiles.filter(f => f.id !== fileId) };
    });
  }, []);

  const onRemoveAllFiles = useCallback(() => {
    setState(prev => {
      prev.attachedFiles.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return { ...prev, attachedFiles: [] };
    });
    setIsFilesPopoverOpen(false);
  }, []);

  const deleteMessageFromHistory = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      setState(prev => ({
        ...prev,
        conversationHistory: prev.conversationHistory.filter(m => m.id !== messageId)
      }));
    } catch (e) {
      console.error("Failed to delete message", e);
    }
  }, []);

  const submit = useCallback(
    async (speechTextOrEvent?: string | React.SyntheticEvent | unknown) => {
      const isManualText = typeof speechTextOrEvent === "string";
      const input = isManualText ? (speechTextOrEvent as string) : state.input;

      if (!input.trim() || state.isLoading) return; 

      if (isManualText) {
        setState((prev) => ({ ...prev, input: speechTextOrEvent as string }));
      }

      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        const messageHistory = state.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const imagesBase64 = await Promise.all(
          state.attachedFiles
            .filter((file) => file.type.startsWith("image/"))
            .map((file) => fileToBase64(file.fileObj))
        );

        if (!selectedAIProvider.provider) {
          setState((prev) => ({ ...prev, error: "Please select an AI provider in settings" }));
          return;
        }

        const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
        if (!provider) {
          setState((prev) => ({ ...prev, error: "Invalid provider selected" }));
          return;
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null, response: "" }));
        rawStreamBufferRef.current = "";
        if (streamingTextRef.current) {
          streamingTextRef.current.textContent = "Generating response...";
        }

        try {
          for await (const chunk of fetchAIResponse({
            provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: systemPrompt || undefined,
            history: messageHistory,
            userMessage: input,
            imagesBase64,
            signal,
          })) {
            if (currentRequestIdRef.current !== requestId || signal.aborted) return;

            rawStreamBufferRef.current += chunk;

            if (streamingTextRef.current) {
              streamingTextRef.current.textContent = rawStreamBufferRef.current;
            }
          }
        } catch (e: any) {
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({ ...prev, isLoading: false, error: e.message || "An error occurred" }));
          }
          return;
        }

        if (currentRequestIdRef.current !== requestId || signal.aborted) return;

        const compiledResponse = rawStreamBufferRef.current;
        setState((prev) => ({ ...prev, isLoading: false, response: compiledResponse }));
        setTimeout(() => inputRef.current?.focus(), 50);

        if (compiledResponse) {
          await saveCurrentConversation(input, compiledResponse, state.attachedFiles);
          setState((prev) => ({ ...prev, input: "", attachedFiles: [], response: "" }));
          if (streamingTextRef.current) streamingTextRef.current.textContent = "";
        }
      } catch (error) {
        if (!signal.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [state.input, state.isLoading, state.attachedFiles, selectedAIProvider, allAiProviders, systemPrompt, state.conversationHistory, fileToBase64]
  );

  const unlistenAudioRef = useRef<any>(null);
  const unlistenErrorRef = useRef<any>(null);
  const isMicBusyRef = useRef<boolean>(false);

  const cleanupAudio = useCallback(async () => {
    if (unlistenAudioRef.current) { unlistenAudioRef.current(); unlistenAudioRef.current = null; }
    if (unlistenErrorRef.current) { unlistenErrorRef.current(); unlistenErrorRef.current = null; }
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
        setIsRecording(true); // TRIGGER INSTANTLY FOR PROMPT UI FEEDBACK BEFORE RUST EVENT OVERHEAD
        await cleanupAudio();
        
        unlistenAudioRef.current = await listen<number[]>("speech-detected", async (event) => {
          setIsRecording(false);
          
          const rawAudioBytes = new Uint8Array(event.payload);
          try {
            const provider = allSttProviders.find(p => p.id === selectedSttProvider.provider);
            const audioBlob = new Blob([rawAudioBytes], { type: "audio/wav" });
            
            const text = await fetchSTT({
              provider,
              selectedProvider: selectedSttProvider,
              audio: audioBlob,
            });
            if (text) submit(text);
          } catch (err) {
             console.error("Transcription Error:", err);
             setState(prev => ({ ...prev, error: "Transcription failed." }));
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
          ? selectedAudioDevices.input.id : "@DEFAULT_SOURCE@";

        await invoke("start_system_audio_capture", { maxDurationSecs: 180, deviceId });

        setTimeout(() => { isMicBusyRef.current = false; }, 300);
      } catch {
        setState(prev => ({ ...prev, error: "Failed to start recording." }));
        await cleanupAudio();
        setIsRecording(false);
        isMicBusyRef.current = false;
      }
    }
  }, [isRecording, isTranscribing, cleanupAudio, selectedSttProvider, allSttProviders, selectedAudioDevices, submit]);

  useEffect(() => cleanupAudio, [cleanupAudio]);

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState(prev => ({
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
    setState(prev => ({
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
    async (userMessage: string, assistantResponse: string, _attachedFiles: AttachedFile[]) => {
      if (!userMessage || !assistantResponse) return;

      const conversationId = state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const newMessages = [
        ...state.conversationHistory,
        { id: generateMessageId("user", timestamp), role: "user" as const, content: userMessage, timestamp },
        { id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET), role: "assistant" as const, content: assistantResponse, timestamp: timestamp + MESSAGE_ID_OFFSET }
      ];

      let title = generateConversationTitle(userMessage);
      if (state.currentConversationId) {
        try {
          const existing = await getConversationById(state.currentConversationId);
          if (existing) title = existing.title;
        } catch {}
      }

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await saveConversation(conversation);
        setState(prev => ({ ...prev, currentConversationId: conversationId, conversationHistory: newMessages }));
      } catch {
        setState(prev => ({ ...prev, error: "Failed to save conversation." }));
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  useEffect(() => {
    const handleConversationSelected = async (e: any) => {
      if (typeof e.detail?.id !== "string") return;
      try {
        const conv = await getConversationById(e.detail.id);
        if (conv) loadConversation(conv);
      } catch {}
    };
    
    const handleConversationDeleted = (e: any) => {
      if (state.currentConversationId === e.detail) startNewConversation();
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", startNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);

    return () => {
      window.removeEventListener("conversationSelected", handleConversationSelected);
      window.removeEventListener("newConversation", startNewConversation);
      window.removeEventListener("conversationDeleted", handleConversationDeleted);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => { if (file.type.startsWith("image/")) addFile(file); });
    e.target.value = "";
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && state.input.trim()) submit();
    }
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    let imageFiles: File[] = [];

    if (e.clipboardData && e.clipboardData.items) {
      const items = Array.from(e.clipboardData.items);
      for (const item of items) {
        if (item.type.indexOf("image/") === 0) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0 && navigator.clipboard?.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              imageFiles.push(new File([blob], `screenshot-${Date.now()}.${type.split("/")[1]}`, { type }));
              break; 
            }
          }
        }
      } catch (err) { }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();

      if (!supportsImages) {
        setState(prev => ({
          ...prev,
          error: "Current AI model / provider details do not support image inputs.",
        }));
        return;
      }

      imageFiles.forEach(addFile);
      setState(prev => ({ ...prev, error: null }));
    }
  }, [addFile, supportsImages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const scrollElement = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
      if (!scrollElement) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: 100, behavior: "auto" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -100, behavior: "auto" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, []);

  useEffect(() => {
    globalShortcuts.registerAudioCallback(toggleManualRecording);
    globalShortcuts.registerInputRef(inputRef.current as any);
  }, [globalShortcuts, toggleManualRecording]);

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
    deleteMessageFromHistory,
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