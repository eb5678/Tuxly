import { useEffect, useRef } from "react";

// Configuration constants for the audio analyzer
const AUDIO_CONFIG = {
  FFT_SIZE: 512,
  SMOOTHING: 0.8,
  MIN_BAR_HEIGHT: 2,
  MIN_BAR_WIDTH: 2,
  BAR_SPACING: 4,
  COLOR: {
    MIN_INTENSITY: 100, // Minimum gray value (darker)
    MAX_INTENSITY: 255, // Maximum gray value (brighter)
    INTENSITY_RANGE: 155, // MAX_INTENSITY - MIN_INTENSITY
  },
} as const;

interface AudioVisualizerProps {
  isRecording: boolean;
}

export function AudioVisualizer({ isRecording }: AudioVisualizerProps) {
  // Refs for managing audio context and animation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);

  // Cleanup function to stop visualization and close audio context
  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    // Stop all oscillators
    oscillatorsRef.current.forEach((osc) => {
      try { osc.stop(); } catch { }
    });
    oscillatorsRef.current = [];
    gainNodesRef.current = [];
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  // Start or stop visualization based on recording state
  useEffect(() => {
    if (isRecording) {
      startVisualization();
    } else {
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size based on container and device pixel ratio
        const rect = container.getBoundingClientRect();
        // Account for the 2px total margin (1px on each side)
        canvas.width = (rect.width - 2) * dpr;
        canvas.height = (rect.height - 2) * dpr;

        // Scale canvas CSS size to match container minus margins
        canvas.style.width = `${rect.width - 2}px`;
        canvas.style.height = `${rect.height - 2}px`;
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Create a fake audio stream using oscillators that mimic speech patterns
  const createFakeStream = (
    audioContext: AudioContext,
    analyser: AnalyserNode
  ) => {
    const frequencies = [120, 240, 350, 500, 800, 1200, 2000, 3500];
    const oscillators: OscillatorNode[] = [];
    const gainNodes: GainNode[] = [];

    frequencies.forEach((freq, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

      gainNode.gain.setValueAtTime(0.01, audioContext.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(analyser);

      oscillator.start();
      oscillators.push(oscillator);
      gainNodes.push(gainNode);
    });

    oscillatorsRef.current = oscillators;
    gainNodesRef.current = gainNodes;

    const animateGain = () => {
      if (!isRecording || !audioContextRef.current) return;

      gainNodes.forEach((gainNode, index) => {
        const baseGain = 0.02 + Math.random() * 0.08;
        const speechPattern = Math.sin(Date.now() / (200 + index * 50)) * 0.5 + 0.5;
        const randomBurst = Math.random() > 0.7 ? Math.random() * 0.1 : 0;
        const targetGain = baseGain * speechPattern + randomBurst;

        gainNode.gain.linearRampToValueAtTime(
          targetGain,
          audioContextRef.current!.currentTime + 0.05
        );
      });

      setTimeout(animateGain, 100);
    };

    animateGain();
  };

  // Initialize audio context and start visualization
  const startVisualization = async () => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = AUDIO_CONFIG.FFT_SIZE;
      analyser.smoothingTimeConstant = AUDIO_CONFIG.SMOOTHING;
      analyserRef.current = analyser;

      // Because Tauri captures system audio in Rust directly,
      // create fake stream mapping visualizer simulation to indicate recording visually.
      createFakeStream(audioContext, analyser);

      draw();
    } catch (error) {
      console.error("Error starting visualization:", error);
    }
  };

  const getBarColor = (normalizedHeight: number) => {
    const intensity =
      Math.floor(normalizedHeight * AUDIO_CONFIG.COLOR.INTENSITY_RANGE) +
      AUDIO_CONFIG.COLOR.MIN_INTENSITY;
    return `rgb(${intensity}, ${intensity}, ${intensity})`;
  };

  // Draw a single bar of the visualizer
  const drawBar = (
    ctx: CanvasRenderingContext2D,
    x: number,
    centerY: number,
    width: number,
    height: number,
    color: string
  ) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, centerY - height, width, height);
    ctx.fillRect(x, centerY, width, height);
  };

  const draw = () => {
    if (!isRecording) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !analyserRef.current) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);

    const drawFrame = () => {
      animationFrameRef.current = requestAnimationFrame(drawFrame);

      analyser.getByteFrequencyData(frequencyData);

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const barWidth = Math.max(
        AUDIO_CONFIG.MIN_BAR_WIDTH,
        canvas.width / dpr / bufferLength - AUDIO_CONFIG.BAR_SPACING
      );
      const centerY = canvas.height / dpr / 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const normalizedHeight = frequencyData[i] / 255; 
        const barHeight = Math.max(
          AUDIO_CONFIG.MIN_BAR_HEIGHT,
          normalizedHeight * centerY
        );

        drawBar(
          ctx,
          x,
          centerY,
          barWidth,
          barHeight,
          getBarColor(normalizedHeight)
        );

        x += barWidth + AUDIO_CONFIG.BAR_SPACING;
      }
    };

    drawFrame();
  };

  return (
    <div ref={containerRef} className="!h-[32px] !w-full pl-4 pt-2">
      <canvas ref={canvasRef} className="h-full !w-full" />
    </div>
  );
}