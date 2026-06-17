import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import { getShortcutsConfig } from "@/lib";

let globalEventListeners: { [key: string]: UnlistenFn | undefined } = {};

let globalInputRef: HTMLInputElement | null = null;
let globalAudioCallback: (() => void) | null = null;

export const useGlobalShortcuts = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioCallbackRef = useRef<(() => void) | null>(null);

  const registerInputRef = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    globalInputRef = input;
  }, []);

  const registerAudioCallback = useCallback((callback: () => void) => {
    audioCallbackRef.current = callback;
    globalAudioCallback = callback;
  }, []);

  useEffect(() => {
    const setupEventListeners = async () => {
      try {
        Object.values(globalEventListeners).forEach(unlisten => unlisten && unlisten());

        globalEventListeners.focus = await listen("focus-text-input", () => {
          setTimeout(() => globalInputRef?.focus(), 100);
        });

        globalEventListeners.audio = await listen("start-audio-recording", () => {
          if (globalAudioCallback) globalAudioCallback();
        });

        globalEventListeners.registrationError = await listen<Array<[string, string, string]>>(
          "shortcut-registration-error",
          (event) => {
            window.dispatchEvent(new CustomEvent("shortcutRegistrationError", { detail: event.payload }));
          }
        );
      } catch (error) {
        console.error("Failed to setup event listeners:", error);
      }
    };
    setupEventListeners();
  }, []);

  useEffect(() => {
    const handleLocalKeyDown = (e: KeyboardEvent) => {
      if (["Control", "Shift", "Alt", "Meta", "Super", "Escape"].includes(e.key)) return;
      const keys: string[] = [];
      if (e.metaKey) keys.push("super");
      if (e.ctrlKey) keys.push("ctrl");
      if (e.altKey) keys.push("alt");
      if (e.shiftKey) keys.push("shift");
      
      let mainKey = e.key.toLowerCase();
      const specialMap: Record<string, string> = {
        arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
        " ": "space", escape: "esc", enter: "return", "\\": "backslash"
      };
      
      if (mainKey && specialMap[mainKey]) mainKey = specialMap[mainKey];
      if (mainKey) keys.push(mainKey);
      
      const pressedCombo = Array.from(new Set(keys)).join("+"); 
      const config = getShortcutsConfig();
      for (const [actionId, binding] of Object.entries(config.bindings)) {
        if (binding.enabled && binding.key === pressedCombo) {
          e.preventDefault(); 
          e.stopPropagation();
          switch (actionId) {
            case "audio_recording":
              if (globalAudioCallback) globalAudioCallback();
              break;
            case "focus_input":
              setTimeout(() => globalInputRef?.focus(), 50);
              break;
            case "toggle_dashboard":
              invoke("toggle_dashboard").catch(console.error);
              break;
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", handleLocalKeyDown, true);
    return () => window.removeEventListener("keydown", handleLocalKeyDown, true);
  }, []);

  return {
    registerInputRef,
    registerAudioCallback,
  };
};