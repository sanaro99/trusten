# Visual analysis

Trusten captures screenshots during website checks. Analyzing those pixels requires a
vision-capable model. Other analyzers still inspect page text, DOM structure, and styles
when vision is unavailable.

The server supports Cloudflare Workers AI, Groq, and Gemini using the same endpoint and
credential conventions as Applination. Set the variables in `apps/server/.env` for local
development or the API container's environment file for deployment, then restart the server.
Keep API keys server-side; they must never appear in browser configuration or Git.

| Provider | Required environment | Default vision model |
| --- | --- | --- |
| Cloudflare | `TRUSTEN_LLM_PROVIDER=cloudflare`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| Groq | `TRUSTEN_LLM_PROVIDER=groq`, `GROQ_API_KEY` | `qwen/qwen3.8-27b` |
| Gemini | `TRUSTEN_LLM_PROVIDER=gemini`, `TRUSTEN_GEMINI_API_KEY` (or `GEMINI_API_KEY` / `GOOGLE_API_KEY`) | `gemini-2.5-flash` |

Cloudflare requires a token with Workers AI access to the specified account. Its endpoint
includes the account ID. A custom `CLOUDFLARE_BASE_URL` may supply the complete account
endpoint instead. Each provider also supports its own `*_MODEL` and `*_BASE_URL` overrides.
Groq's GPT-OSS models are text-only; use a vision model for screenshot analysis. Gemini 2.5
Flash disables thinking so the output budget goes to the scan result. Gemini 3 overrides
omit sampling controls and use low reasoning effort, matching Applination. Set
`TRUSTEN_LLM_TIMEOUT_MS=30000` when using Gemini to allow for screenshot latency.

See the providers' current API documentation:
[Cloudflare compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/),
[Cloudflare Scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/),
[Groq vision](https://console.groq.com/docs/vision), and
[Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai).

Without an explicit provider, auto-detection prefers Cloudflare, Groq, Gemini, Nvidia NIM,
DeepSeek, OpenRouter, then local Ollama. A pinned provider is tried first; failures may use
other configured providers, including providers earlier in that order. Fallback requests
honor each provider's credentials, model, and endpoint overrides.

Screenshot checks skip known text-only models and preserve the original image when a
provider fails or rejects image input. They fail if no vision provider succeeds; a text-only
retry cannot count as completed visual coverage. If using a custom vision model whose name
is not recognized, `TRUSTEN_LLM_VISION=1` explicitly enables image requests. Model rejection
still prevents it from reporting successful coverage.

Provider errors appear in server logs. For example, DeepSeek's `402 Insufficient Balance`
requires account balance or another configured provider. Captured evidence and timestamps
remain available when vision fails, and the report is marked partial.
