export const SPEECH_TO_TEXT_PROVIDERS = [
  {
    id: "openrouter-stt",
    name: "OpenRouter STT",
    curl: `curl https://openrouter.ai/api/v1/audio/transcriptions \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer {{API_KEY}}" \\
      -d '{
        "model": "{{MODEL}}",
        "input_audio": {
          "data": "{{AUDIO}}",
          "format": "wav"
        }
      }'`,
    responseContentPath: "text",
    streaming: false,
  }
];