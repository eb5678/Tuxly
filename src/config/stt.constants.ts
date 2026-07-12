export const SPEECH_TO_TEXT_PROVIDERS = [
  {
    id: "openrouter-stt",
    name: "OpenRouter STT",
    curl: `curl https://openrouter.ai/api/v1/audio/transcriptions \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -F "file=@audio.wav" \\
      -F "model={{MODEL}}"`,
    responseContentPath: "text",
    streaming: false,
  }
];