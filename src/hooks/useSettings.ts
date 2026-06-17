import { useEffect, useState } from "react";
import { useApp } from "@/contexts";
import { extractVariables } from "@/lib";

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

  return {
    allAiProviders,
    allSttProviders,
    selectedAIProvider,
    selectedSttProvider,
    onSetSelectedAIProvider,
    onSetSelectedSttProvider,
    variables,
    sttVariables,
  };
};