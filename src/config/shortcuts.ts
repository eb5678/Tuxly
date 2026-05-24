import { ShortcutAction } from "@/types";

export const DEFAULT_SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "toggle_dashboard",
    name: "Toggle Main Window",
    description: "Open/Close the chat & settings window",
    defaultKey: "alt+shift+d",
  },
  {
    id: "toggle_window",
    name: "Toggle Mini Overlay",
    description: "Show/Hide the mini prompt overlay",
    defaultKey: "alt+backslash",
  },
  {
    id: "focus_input",
    name: "Refocus Input Box",
    description: "Bring overlay forward and place cursor in the input area",
    defaultKey: "alt+shift+i",
  },
  {
    id: "move_window",
    name: "Move Overlay",
    description: "Move overlay with arrow keys",
    defaultKey: "alt",
  },
  {
    id: "audio_recording",
    name: "Toggle Recording (Mic/System)",
    description: "Start/Stop recording audio",
    defaultKey: "alt+shift+a",
  },
];