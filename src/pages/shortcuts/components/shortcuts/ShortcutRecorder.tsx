import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components";
import { Check, X } from "lucide-react";
import { formatShortcutKeyForDisplay, normalizeShortcutKey } from "@/lib";

interface ShortcutRecorderProps {
  onSave: (key: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const ShortcutRecorder = ({ onSave, onCancel, disabled = false }: ShortcutRecorderProps) => {
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const mainKeyRaw = e.key.toLowerCase();
      const isModifierOnly = ["control", "alt", "shift", "meta", "os", "super", "command"].includes(mainKeyRaw);

      const keys: string[] = [];
      if (e.altKey) keys.push("alt");
      if (e.ctrlKey) keys.push("ctrl");
      if (e.shiftKey) keys.push("shift");
      if (e.metaKey || ["meta", "os", "super", "command"].includes(mainKeyRaw)) {
         keys.push("super");
      }

      if (!isModifierOnly) {
        const specialKeyMap: Record<string, string> = {
          arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
          " ": "space", escape: "esc", enter: "return", backspace: "backspace",
          delete: "delete", tab: "tab", "[": "bracketleft", "]": "bracketright",
          ";": "semicolon", "'": "quote", "`": "grave", "\\": "backslash",
          "/": "slash", ",": "comma", ".": "period", "-": "minus", "=": "equal", "+": "plus",
        };
        keys.push(specialKeyMap[mainKeyRaw] || mainKeyRaw);
      }

      const normalizedCombo = normalizeShortcutKey(keys.join("+"));
      const finalKeysArray = normalizedCombo.split("+");

      const hasModifier = finalKeysArray.some(k => ["super", "ctrl", "alt", "shift"].includes(k));
      if (hasModifier && !isModifierOnly) {
        setRecordedKeys(finalKeysArray);
        setError("");
      } else {
        setRecordedKeys(finalKeysArray);
        setError("Must include at least one modifier and one key");
      }
    },
    []
  );
  
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    window.focus();
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [handleKeyDown, handleKeyUp]);

  const handleSave = async () => {
    if (recordedKeys.length < 2) {
       setError("Shortcut needs at least one modifier and one key (e.g. Alt+S)");
       return;
    }
    onSave(recordedKeys.join("+"));
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex gap-2 items-center">
        <div className="flex-1 px-3 py-2 bg-primary/5 border-2 border-primary/50 rounded-md font-mono text-sm text-center">
             <span className="text-primary font-medium animate-pulse">⌨️ {recordedKeys.length > 0 ? formatShortcutKeyForDisplay(recordedKeys.join("+")) : "Press a combination (e.g. Alt+Key)..."}</span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={disabled || recordedKeys.length < 2}><Check className="h-4 w-4" /> Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={disabled}><X className="h-4 w-4" /> Cancel</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};