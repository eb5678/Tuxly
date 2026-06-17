import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components";
import { AudioVisualizer } from "@/pages/app/components/speech/audio-visualizer";
import { fetchSTT } from "@/lib";
import { useApp } from "@/contexts";
import { StopCircle, Send } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface AudioRecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onCancel: () => void;
}

const MAX_DURATION = 3 * 60 * 1000;

export const AudioRecorder = ({
  onTranscriptionComplete,
  onCancel,
}: AudioRecorderProps) => {
  const { selectedSttProvider, allSttProviders, selectedAudioDevices } = useApp();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);

  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRef = useRef<any>(null);

  const cleanup = useCallback(async () => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
    if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
    }
    await invoke("stop_system_audio_capture").catch(() => {});
  }, []);

  useEffect(() => {
    startNativeRecording();
    return () => { cleanup(); };
  }, []);

  const startNativeRecording = async () => {
    try {
      unlistenRef.current = await listen("speech-detected", async (event: any) => {
        setIsTranscribing(true);

        const base64Audio = event.payload as string;
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: "audio/wav" });

        try {
          const provider = allSttProviders.find(p => p.id === selectedSttProvider.provider);

          const text = await fetchSTT({
            provider: provider,
            selectedProvider: selectedSttProvider,
            audio: audioBlob,
          });

          if (text) onTranscriptionComplete(text);
          else onCancel();
        } catch (error) {
          console.error("Transcription failed:", error);
          onCancel();
        }
      });

      await invoke("stop_system_audio_capture").catch(() => {});

      const deviceId = selectedAudioDevices?.input?.id && selectedAudioDevices.input.id !== "default" 
        ? selectedAudioDevices.input.id 
        : "@DEFAULT_SOURCE@";

      await invoke("start_system_audio_capture", {
        maxDurationSecs: 180,
        deviceId
      });

      startTimeRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setDuration(Date.now() - startTimeRef.current);
      }, 100);

      maxDurationTimeoutRef.current = setTimeout(() => {
        handleSend();
      }, MAX_DURATION);

    } catch (error) {
      console.error("Failed to start native recording:", error);
      cleanup();
      onCancel();
    }
  };

  const handleStop = async () => {
    await cleanup();
    onCancel();
  };

  const handleSend = async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    await invoke("manual_stop_continuous").catch(() => {});
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="border bg-background rounded-lg overflow-hidden">
      <div className="h-12 relative bg-muted/20">
        <div className="h-full w-full pt-3">
          <AudioVisualizer isRecording={!isTranscribing} />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-mono tabular-nums font-medium">
            {formatTime(duration)}
          </span>
          <span className="text-xs text-muted-foreground">/ 3:00</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={handleStop}
            disabled={isTranscribing}
            className="h-8 w-8"
            title="Stop recording"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isTranscribing}
            className="h-8 w-8"
            title={isTranscribing ? "Sending..." : "Send to AI"}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};