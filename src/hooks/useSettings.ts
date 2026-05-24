import { useEffect, useState } from "react";
import { useApp } from "@/contexts";
import { extractVariables, deleteAllConversations } from "@/lib";

export const useSettings = () => {
  const {
    allAiProviders,
    allSttProviders,
    selectedAIProvider,
    selectedSttProvider,
    onSetSelectedAIProvider,
    onSetSelectedSttProvider,
  } = useApp();
  
  const [variables, setVariables] = useState<{ key: string; value: string }[]>([]);
  const [sttVariables, setSttVariables] = useState<{ key: string; value: string }[]>([]);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  useEffect(() => {
    if (selectedAIProvider.provider) {
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      if (provider) {
        const variables = extractVariables(provider?.curl);
        setVariables(variables);
      }
    }
  }, [selectedAIProvider.provider]);

  useEffect(() => {
    if (selectedSttProvider.provider) {
      const provider = allSttProviders.find((p) => p.id === selectedSttProvider.provider);
      if (provider) {
        const variables = extractVariables(provider?.curl);
        setSttVariables(variables);
      }
    }
  }, [selectedSttProvider.provider]);

  const handleDeleteAllChatsConfirm = async () => {
    try {
      await deleteAllConversations();
      setShowDeleteConfirmDialog(false);
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
    }
  };

  return {
    allAiProviders,
    allSttProviders,
    selectedAIProvider,
    selectedSttProvider,
    onSetSelectedAIProvider,
    onSetSelectedSttProvider,
    handleDeleteAllChatsConfirm,
    showDeleteConfirmDialog,
    setShowDeleteConfirmDialog,
    variables,
    sttVariables,
  };
};