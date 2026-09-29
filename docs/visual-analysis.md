# Visual analysis

Trusten captures screenshots during website checks. To analyze the pixels for visual patterns,
the server also needs access to a vision-capable model. The other analyzers still inspect page
text, DOM structure, and styles when vision is unavailable.

For DeepSeek, configure `DEEPSEEK_API_KEY` with an account that has available API balance. The
server now defaults to `deepseek-flash`, which accepts JPEG screenshots through the Chat
Completions API. An explicit `DEEPSEEK_MODEL` override must also support image input. Restart the
server after changing its environment.

The server logs provider failures. A `402 Insufficient Balance` response means the provider
declined the request; changing Trusten code cannot make that account analyze an image. Add
balance or configure another reachable vision-capable provider. A text-only model can still help
with other analyses, but it will not mark screenshot analysis as complete.

Results retain the captured screenshot and timestamp even when vision fails. In that case, the
grade is marked as partial so visitors can inspect the evidence without mistaking a text-only
response for a complete visual check.
