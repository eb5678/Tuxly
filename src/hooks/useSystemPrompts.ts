import { useCallback, useEffect, useState } from "react";
import {
  createSystemPrompt,
  getAllSystemPrompts,
  updateSystemPrompt,
  deleteSystemPrompt,
} from "@/lib/database";
import type {
  SystemPrompt,
  SystemPromptInput,
  UpdateSystemPromptInput,
} from "@/types";
import { STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "@/lib";
import { useApp } from "@/contexts";

export const useSystemPrompts = () => {
  const { setSystemPrompt } = useApp();
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(
    () => {
      const stored = safeLocalStorage.getItem(
        STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID
      );
      return stored ? Number(stored) : null;
    }
  );

  const fetchPrompts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getAllSystemPrompts();
      setPrompts(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch system prompts";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPrompt = useCallback(
    async (input: SystemPromptInput): Promise<SystemPrompt> => {
      try {
        setError(null);
        const result = await createSystemPrompt(input);
        await fetchPrompts(); 
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create system prompt";
        setError(errorMessage);
        throw err;
      }
    },
    [fetchPrompts]
  );

  const updatePrompt = useCallback(
    async (
      id: number,
      input: UpdateSystemPromptInput
    ): Promise<SystemPrompt> => {
      try {
        setError(null);
        const result = await updateSystemPrompt(id, input);
        await fetchPrompts(); 
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update system prompt";
        setError(errorMessage);
        throw err;
      }
    },
    [fetchPrompts]
  );

  const deletePrompt = useCallback(
    async (id: number): Promise<void> => {
      try {
        setError(null);
        await deleteSystemPrompt(id);
        await fetchPrompts(); 
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete system prompt";
        setError(errorMessage);
        throw err;
      }
    },
    [fetchPrompts]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  useEffect(() => {
    if (selectedPromptId !== null && prompts.length > 0) {
      const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.prompt);
      } else {
        setSelectedPromptId(null);
        safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
        setSystemPrompt("");
        safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, "");
      }
    }
  }, [prompts, selectedPromptId, setSystemPrompt]);

  const handleSelectPrompt = useCallback(
    (promptId: number | null) => {
      if (promptId === null) {
         setSystemPrompt("");
         setSelectedPromptId(null);
         safeLocalStorage.removeItem(STORAGE_KEYS.SYSTEM_PROMPT);
         safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
         safeLocalStorage.removeItem("selected_pluely_prompt");
         return;
      }

      const selectedPrompt = prompts.find((p) => p.id === promptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.prompt);
        setSelectedPromptId(promptId);
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_PROMPT,
          selectedPrompt.prompt
        );
        safeLocalStorage.setItem(
          STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID,
          promptId.toString()
        );
        safeLocalStorage.removeItem("selected_pluely_prompt");
      }
    },
    [prompts, setSystemPrompt]
  );

  return {
    prompts,
    isLoading,
    error,
    selectedPromptId,
    createPrompt,
    updatePrompt,
    deletePrompt,
    clearError,
    handleSelectPrompt,
  };
};