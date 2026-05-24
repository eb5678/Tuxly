import { useEffect } from "react";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

interface UseShortcutsProps {
  onAudioRecording?: () => void;
  onSystemAudio?: () => void;
  customShortcuts?: Record<string, () => void>;
}

export const useShortcuts = ({
  onAudioRecording,
  onSystemAudio,
  customShortcuts = {},
}: UseShortcutsProps = {}) => {
  const {
    registerAudioCallback,
    registerSystemAudioCallback,
    registerCustomShortcutCallback,
    unregisterCustomShortcutCallback,
  } = useGlobalShortcuts();

  useEffect(() => {
    if (onAudioRecording) {
      registerAudioCallback(onAudioRecording);
    }
  }, [onAudioRecording, registerAudioCallback]);

  useEffect(() => {
    if (onSystemAudio) {
      registerSystemAudioCallback(onSystemAudio);
    }
  }, [onSystemAudio, registerSystemAudioCallback]);

  useEffect(() => {
    Object.entries(customShortcuts).forEach(([actionId, callback]) => {
      registerCustomShortcutCallback(actionId, callback);
    });

    return () => {
      Object.keys(customShortcuts).forEach((actionId) => {
        unregisterCustomShortcutCallback(actionId);
      });
    };
  }, [
    customShortcuts,
    registerCustomShortcutCallback,
    unregisterCustomShortcutCallback,
  ]);

  return useGlobalShortcuts();
};