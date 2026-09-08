// Authored planning examples, never customer telemetry or model benchmarks.
const shape = (prompt_tokens, output_tokens, cache_read_tokens = 0, cache_write_tokens = 0) =>
  ({ prompt_tokens, output_tokens, cache_read_tokens, cache_write_tokens });
const local = (prompt, output) => ({
  server_id: "ws-rtx-pro-6000-1x-derived", gpu_id: "rtx_pro_6000_ws",
  model_id: "qwen3-8b", model_label: "Qwen3 8B", runtime: "vllm",
  weight_quantization: "bf16", kv_quantization: "bf16", context_tokens: 16384,
  concurrency: 4, prompt_tokens: prompt, output_tokens: output,
  prefill_tokens_s: 2000, scheduled_hours_day: 8, peak_factor: 2,
});
export const STARTER_CASES = Object.freeze([
  {
    id: "code-reading", label: "Read code locally", kicker: "Before premium reasoning",
    description: "Let a local reader condense repetitive repository context. Keep architecture, difficult debugging and final decisions with the premium model.",
    local_job: "Read selected files and produce a focused summary with source references.",
    premium_job: "Reason over the summary; request original files whenever detail is missing.",
    cadence: "20 developers × 48 automated reading steps per working day; not 48 manual prompts.",
    tasks_day: 960, working_days: 21, horizon_months: 60,
    eligible_pct: 85, failure_pct: 5, residual_requests_per_success: 1,
    premium_offer_id: "openrouter:anthropic/claude-opus-5",
    baseline: shape(9000, 1200, 4000), residual: shape(900, 1200),
    local: local(13000, 900), expect_payback_within_horizon: true,
    caution: "A fresh summary loses the baseline cache discount. Summary quality and escalation rates require a pilot; subtle bugs still need original context.",
  },
  {
    id: "document-triage", label: "Triage documents locally", kicker: "Send exceptions to the API",
    description: "Extract fields and classify routine documents on one server. Send ambiguous or failed cases to the premium model unchanged.",
    local_job: "Classify and extract a fixed schema from routine documents.",
    premium_job: "Handle exceptions, ambiguity and failed validation at the original request shape.",
    cadence: "One operations queue of 300 documents per working day.",
    tasks_day: 300, working_days: 21, horizon_months: 60,
    eligible_pct: 80, failure_pct: 10, residual_requests_per_success: 0,
    premium_offer_id: "openrouter:anthropic/claude-opus-5",
    baseline: shape(6000, 500), residual: shape(6000, 500),
    local: local(6000, 500), expect_payback_within_horizon: false,
    caution: "Local success avoids an API request, not just some input tokens. OCR, human validation and workflow integration are not priced. At this cadence a purchase may not pay back.",
  },
  {
    id: "code-drafting", label: "Draft tests locally", kicker: "Keep premium review",
    description: "Generate repetitive test scaffolding locally, then ask the premium model for a concise review. The review receives more input but generates less output.",
    local_job: "Draft routine test cases and boilerplate from a constrained brief.",
    premium_job: "Review the draft for correctness; regenerate failed or unsuitable tasks in full.",
    cadence: "10 developers × 12 drafting tasks per working day.",
    tasks_day: 120, working_days: 21, horizon_months: 60,
    eligible_pct: 75, failure_pct: 10, residual_requests_per_success: 1,
    premium_offer_id: "openrouter:anthropic/claude-opus-5",
    baseline: shape(2000, 2400), residual: shape(4400, 350),
    local: local(2000, 2400), expect_payback_within_horizon: false,
    caution: "A short premium review is an assumption, not a quality equivalence claim. Human review, CI execution and setup labour are excluded. Low volume may favour API-only.",
  },
]);
export const STARTER_EXCLUSIONS = [
  "Planning examples, not measured customer savings or a recommendation to purchase.",
  "Prefill throughput (2,000 tokens/s), decode efficiency, task quality and failure rates are unbenchmarked assumptions. Pilot before purchasing.",
  "Electricity uses rated board power for all 730 hours each month, with 20% node overhead and PUE 1.4; scheduled task hours do not discount ownership or power.",
  "No paid platform licence assumed. Labour, support, integration, tax, financing, networking and replacement hardware are excluded; residual value is zero.",
  "Hardware is a derived component estimate, not an integrated-server vendor quotation. One server, no automatic scale-out.",
];
export const SPOTIFY_REFERENCE = {
  url: "https://engineering.atspotify.com/2026/9/portal-by-spotify-cut-my-claude-code-token-usage-by-90",
  text: "Spotify reports about 90% mean bulk-read Claude token reduction using Gemini 2.5 Flash workers. That is not total billing savings, a local-model benchmark, or evidence for these example assumptions.",
};
