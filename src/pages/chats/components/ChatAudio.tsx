import { MicIcon } from "lucide-react";
import { Button } from "@/components";

interface ChatAudioProps {
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  disabled: boolean;
}

export const ChatAudio = ({
  isRecording,
  setIsRecording,
  disabled,
}: ChatAudioProps) => {
    return (
      <Button
        size="icon"
        variant="outline"
        onClick={() => setIsRecording(!isRecording)}
        className="size-7 lg:size-9 rounded-lg lg:rounded-xl"
        title={isRecording ? "Recording..." : "Voice input"}
        disabled={disabled}
      >
        <MicIcon
          className={`size-3 lg:size-4 ${
            isRecording ? "text-red-500 animate-pulse" : ""
          }`}
        />
      </Button>
    );
};