import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import { getShortcutsConfig } from "@/lib";

let globalEventListeners: { [key: string]: UnlistenFn | undefined } = {};

let globalInputRef: HTMLInputElement | null = null;
let globalAudioCallback: (() => void) | null = null;
let globalSystemAudioCallback: (() => void) | null = null;
let globalCustomShortcutCallbacks: Map<string, () => void> = new Map();

export const useGlobalShortcuts = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioCallbackRef = useRef<(() => void) | null>(null);
  const systemAudioCallbackRef = useRef<(() => void) | null>(null);
  const customShortcutCallbacksRef = useRef<Map<string, () => void>>(new Map());

  const checkShortcutsRegistered = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>("check_shortcuts_registered");
    } catch (e) {
      return false;
    }
  }, []);

  const getShortcuts = useCallback(async (): Promise<Record<string, string> | null> => {
    try {
      return await invoke<Record<string, string>>("get_registered_shortcuts");
    } catch (e) {
      return null;
    }
  }, []);

  const updateShortcuts = useCallback(async (): Promise<boolean> => {
    try {
      const config = getShortcutsConfig();
      await invoke("update_shortcuts", { config });
      return true;
    } catch (e) {
      return false;
    }
  }, []);

  const registerInputRef = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    globalInputRef = input;
  }, []);

  const registerAudioCallback = useCallback((callback: () => void) => {
    audioCallbackRef.current = callback;
    globalAudioCallback = callback;
  }, []);

  const registerSystemAudioCallback = useCallback((callback: () => void) => {
    systemAudioCallbackRef.current = callback;
    globalSystemAudioCallback = callback;
  }, []);

  const registerCustomShortcutCallback = useCallback((actionId: string, callback: () => void) => {
    customShortcutCallbacksRef.current.set(actionId, callback);
    globalCustomShortcutCallbacks.set(actionId, callback);
  }, []);

  const unregisterCustomShortcutCallback = useCallback((actionId: string) => {
    customShortcutCallbacksRef.current.delete(actionId);
    globalCustomShortcutCallbacks.delete(actionId);
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

        globalEventListeners.systemAudio = await listen("toggle-system-audio", () => {
          if (globalSystemAudioCallback) globalSystemAudioCallback();
        });

        globalEventListeners.customShortcut = await listen<{ action: string }>(
          "custom-shortcut-triggered",
          (event) => {
            const cb = globalCustomShortcutCallbacks.get(event.payload.action);
            if (cb) cb();
          }
        );

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
            case "toggle_window":
              invoke("toggle_window").catch(console.error);
              break;
            default:
              const cb = globalCustomShortcutCallbacks.get(actionId);
              if (cb) cb();
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", handleLocalKeyDown, true);
    return () => window.removeEventListener("keydown", handleLocalKeyDown, true);
  }, []);

  return {
    checkShortcutsRegistered,
    getShortcuts,
    updateShortcuts,
    registerInputRef,
    registerAudioCallback,
    registerSystemAudioCallback,
    registerCustomShortcutCallback,
    unregisterCustomShortcutCallback,
  };
};