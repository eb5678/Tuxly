import { Dispatch, SetStateAction } from "react";
import { TYPE_PROVIDER } from "@/types";

export type IContextType = {
  systemPrompt: string;
  setSystemPrompt: Dispatch<SetStateAction<string>>;
  allAiProviders: TYPE_PROVIDER[];
  customAiProviders: TYPE_PROVIDER[];
  selectedAIProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedAIProvider: ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  allSttProviders: TYPE_PROVIDER[];
  customSttProviders: TYPE_PROVIDER[];
  selectedSttProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  onSetSelectedSttProvider: ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => void;
  loadData: () => void;
  selectedAudioDevices: {
    input: { id: string; name: string };
    output: { id: string; name: string };
  };
  setSelectedAudioDevices: Dispatch<
    SetStateAction<{
      input: { id: string; name: string };
      output: { id: string; name: string };
    }>
  >;
  supportsImages: boolean;
  setSupportsImages: (value: boolean) => void;
};