import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERVIEW_QUESTIONS,
  MINIMAX_DEFAULTS,
  PlannerRequestError,
  buildBlueprint,
  buildPlannerPlan,
  buildPrompt,
  chatCompletionsUrl,
  createRequestFence,
  isInterviewComplete,
  requestRefinement,
} from "../planner.js";

const complete = (overrides = {}) => ({
  use_case: "support",
  substrate: "nutanix",
  data_boundary: "internal",
  interaction: "assistant",
  overflow: "local_only",
  ...overrides,
});

test("the interview maps every use case to an existing calculator preset", () => {
  const expected = {
    support: "support_desk",
    knowledge: "internal_kb",
    analytics: "graph_analyst",
    automation: "agent_platform",
    mixed: "mixed_enterprise",
  };
  assert.equal(INTERVIEW_QUESTIONS.length, 5);
  assert.equal(isInterviewComplete({}), false);
  for (const [useCase, presetId] of Object.entries(expected)) {
    const plan = buildPlannerPlan(complete({ use_case: useCase }));
    assert.equal(plan.presetId, presetId);
    assert.equal(plan.controlledFields["fr-policy"], "local_first");
  }
  assert.throws(() => buildPlannerPlan({ use_case: "support" }), /Complete every/);
});

test("apply mappings are total and do not retain a prior fallback", () => {
  const burst = buildPlannerPlan(complete({ overflow: "burst" }));
  const localOnly = buildPlannerPlan(complete({ overflow: "local_only" }));
  assert.deepEqual(Object.keys(burst.controlledFields).sort(), Object.keys(localOnly.controlledFields).sort());
  assert.equal(burst.controlledFields["fr-failshare"], "0.15");
  assert.equal(localOnly.controlledFields["fr-failshare"], "0");
  assert.equal(localOnly.controlledFields["fr-blend"], "100");
  assert.equal(localOnly.controlledFields["fr-failrate"], "2");
});

test("the deterministic blueprint is Nutanix-biased, portable and honest about price", () => {
  const plan = buildPlannerPlan(complete());
  const blueprint = buildBlueprint(plan, { presetLabel: "Support desk", modelLabel: "Example model" });
  assert.match(blueprint.text, /Nutanix Kubernetes Platform|AHV/);
  assert.match(blueprint.text, /portable|another conformant Kubernetes/);
  assert.match(blueprint.text, /no public list price/i);
  assert.match(blueprint.text, /calculator remains the only cost surface/i);
  assert.doesNotMatch(blueprint.text, /\$\d/);
});

test("portable substrates keep the same gateway seam without claiming Nutanix licence cost", () => {
  const blueprint = buildBlueprint(buildPlannerPlan(complete({ substrate: "kubernetes" })));
  assert.match(blueprint.text, /OpenAI-compatible/);
  assert.match(blueprint.text, /Nutanix Kubernetes Platform later/);
  assert.doesNotMatch(blueprint.text, /no public list price/i);
});

test("the refinement prompt preserves provenance and forbids invented costs", () => {
  const plan = buildPlannerPlan(complete());
  const blueprint = buildBlueprint(plan);
  const prompt = buildPrompt({ plan, blueprint, context: { modelLabel: "Model X" } });
  assert.match(prompt, /Do not invent prices, savings, benchmark results/);
  assert.match(prompt, /portable Kubernetes or Linux-VM equivalent/);
  assert.match(prompt, /Model X/);
  assert.doesNotMatch(prompt, /api[_ -]?key|Bearer /i);
});

test("MiniMax defaults use the documented OpenAI-compatible contract", () => {
  assert.equal(MINIMAX_DEFAULTS.endpoint, "https://api.minimax.io/v1");
  assert.equal(MINIMAX_DEFAULTS.model, "MiniMax-M3");
  assert.equal(chatCompletionsUrl(MINIMAX_DEFAULTS.endpoint), "https://api.minimax.io/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://gateway.example/v1/chat/completions"), "https://gateway.example/v1/chat/completions");
});

test("an HTTPS page refuses an HTTP localhost endpoint with a prompt-courier remedy", () => {
  assert.throws(
    () => chatCompletionsUrl("http://localhost:11434/v1", "https://studio.factor-io.com/tco-calculator.html"),
    (error) => error instanceof PlannerRequestError && error.code === "mixed_content" && /Copy the prompt/.test(error.message),
  );
  assert.equal(
    chatCompletionsUrl("http://localhost:11434/v1", "http://localhost:8781/tco-calculator.html"),
    "http://localhost:11434/v1/chat/completions",
  );
});

test("refinement performs one explicit request and normalizes safe response text", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return { ok: true, status: 200, json: async () => ({ model: "MiniMax-M3", choices: [{ message: { content: [{ text: "A" }, { text: "B" }] } }] }) };
  };
  assert.equal(calls.length, 0, "constructing a fetch spy performs no implicit request");
  const result = await requestRefinement({
    endpoint: MINIMAX_DEFAULTS.endpoint,
    model: MINIMAX_DEFAULTS.model,
    token: "secret-value",
    prompt: "Refine this plan",
    fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.equal(result.text, "A\nB");
  const [url, init] = calls[0];
  assert.equal(url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer secret-value");
  assert.match(init.body, /Never invent prices/);
});

test("HTTP, malformed and oversized responses are normalized", async () => {
  await assert.rejects(
    requestRefinement({ endpoint: MINIMAX_DEFAULTS.endpoint, model: "m", prompt: "p", fetchImpl: async () => ({ ok: false, status: 401 }) }),
    (error) => error.code === "http" && error.status === 401 && !error.message.includes("undefined"),
  );
  await assert.rejects(
    requestRefinement({ endpoint: MINIMAX_DEFAULTS.endpoint, model: "m", prompt: "p", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    (error) => error.code === "empty_response",
  );
  const result = await requestRefinement({
    endpoint: MINIMAX_DEFAULTS.endpoint,
    model: "m",
    prompt: "p",
    maxChars: 4,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "123456" } }] }) }),
  });
  assert.equal(result.truncated, true);
  assert.match(result.text, /^1234/);
  assert.match(result.text, /truncated/);
});

test("request fencing rejects an older completion", () => {
  const fence = createRequestFence();
  const older = fence.begin();
  const newer = fence.begin();
  assert.equal(fence.isCurrent(older), false);
  assert.equal(fence.isCurrent(newer), true);
  fence.cancel();
  assert.equal(fence.isCurrent(newer), false);
});
