import { ShortcutAction } from "@/types";

export const DEFAULT_SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "toggle_dashboard",
    name: "Toggle Main Window",
    description: "Open/Close the chat & settings window",
    defaultKey: "alt+shift+d",
  },
  {
    id: "focus_input",
    name: "Refocus Input Box",
    description: "Bring overlay forward and place cursor in the input area",
    defaultKey: "alt+shift+i",
  },
  {
    id: "audio_recording",
    name: "Toggle Recording (Mic/System)",
    description: "Start/Stop recording audio",
    defaultKey: "alt+shift+a",
  },
];