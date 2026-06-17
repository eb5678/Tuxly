import { useState } from "react";
import {
  Label,
  Slider,
  Switch,
} from "@/components";
import {
  ChevronDownIcon,
  SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  maxRecordingDuration: number;
  onMaxDurationChange: (secs: number) => void;
  useSystemPrompt: boolean;
  setUseSystemPrompt: (value: boolean) => void;
  contextContent: string;
  setContextContent: (content: string) => void;
}

export const SettingsPanel = ({
  maxRecordingDuration,
  onMaxDurationChange,
  useSystemPrompt,
  setUseSystemPrompt,
}: SettingsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Settings</span>
        </div>
        <ChevronDownIcon
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-4">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Recording
            </h4>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center justify-between">
                <span>Max Recording Duration</span>
                <span className="text-muted-foreground font-normal">
                  {Math.round(maxRecordingDuration / 60)} min
                </span>
              </Label>
              <Slider
                value={[maxRecordingDuration / 60]}
                onValueChange={([value]) => onMaxDurationChange(Math.round(value * 60))}
                min={1}
                max={3}
                step={0.5}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              AI Context
            </h4>

            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <Label className="text-xs font-medium">Use System Prompt</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {useSystemPrompt
                    ? "Using default prompt from settings"
                    : "Using custom context below"}
                </p>
              </div>
              <Switch
                checked={useSystemPrompt}
                onCheckedChange={setUseSystemPrompt}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};