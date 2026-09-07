import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_TOOLS,
  ChatContractError,
  buildOfflineRequest,
  createChatHistory,
  requestChatTurn,
  toolResultMessage,
  validateAssistantToolCall,
  validateCalculatorProposal,
  validateLocalLlmSpec,
} from "../chat.js";

const fields = {
  "f-users": { kind: "integer", min: 1, max: 1000000 },
  "f-peak-frac": { kind: "number", min: 0.1, max: 100 },
  "f-sv-model": { kind: "model", values: new Set(["model-a", "model-b"]) },
  "fr-policy": { kind: "enum", values: ["local_first", "api_first", "fixed_split"] },
};

const proposal = (changes = [{ field: "f-users", value: "500", reason: "Matches the described support workload." }]) => ({
  summary: "A reviewable starting point for the stated workflow.",
  planning_profile: { use_case: "support", substrate: "nutanix", data_boundary: "internal", interaction: "assistant", overflow: "local_only" },
  changes,
  question: "Would you like to review the assumptions before applying them?",
  suggested_replies: ["Review assumptions", "Apply later"],
});

const assistantCall = (name, args, extras = {}) => ({
  role: "assistant",
  content: "",
  name: "MiniMax AI",
  tool_calls: [{ id: "call-1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
  audio_content: "",
  ...extras,
});

test("MiniMax request disables thinking, requires a tool and preserves the complete assistant object", async () => {
  const calls = [];
  const message = assistantCall("propose_calculator_changes", proposal(), {
    reasoning_details: [{ type: "reasoning.text", text: "must survive as returned" }],
    provider_extension: { trace: "opaque" },
  });
  const result = await requestChatTurn({
    endpoint: "https://api.minimax.io/v1",
    model: "MiniMax-M3",
    token: "session-secret",
    systemPrompt: "Interview the user and return one validated planning tool call.",
    userMessage: "Plan a local support assistant.",
    validationContext: { fields },
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true, status: 200, json: async () => ({ model: "MiniMax-M3", choices: [{ message }], usage: { total_tokens: 10 } }) };
    },
  });
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  const body = JSON.parse(init.body);
  assert.equal(url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer session-secret");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.tool_choice, "required");
  assert.equal(body.stream, false);
  assert.equal(body.tools.length, CHAT_TOOLS.length);
  assert.ok(!init.body.includes("session-secret"), "credentials belong in the transient header only");
  assert.deepEqual(result.assistantMessage, message, "unknown response fields and the whole tool call are retained");
  assert.equal(result.toolCall.name, "propose_calculator_changes");
});

test("history pruning removes whole exchange pairs and keeps assistant response objects intact", () => {
  const history = createChatHistory({ maxExchanges: 2, maxChars: 4000 });
  for (let i = 1; i <= 3; i++) {
    const assistant = assistantCall("ask_user", { question: `Question ${i}?`, suggested_replies: [`Reply ${i}`] }, { opaque: { sequence: i } });
    history.append({
      user: { role: "user", content: `User ${i}` },
      assistant,
      tools: [toolResultMessage({ id: "call-1" }, { status: "shown" })],
    });
  }
  const snapshot = history.snapshot();
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].user.content, "User 2");
  assert.equal(snapshot[0].assistant.opaque.sequence, 2);
  const messages = history.messages({ system: { role: "system", content: "System" }, user: { role: "user", content: "User 4" } });
  assert.deepEqual(messages.map((message) => message.role), ["system", "user", "assistant", "tool", "user", "assistant", "tool", "user"]);
  assert.ok(!JSON.stringify(messages).includes("User 1"));
});

test("a single oversized exchange is rejected instead of truncating MiniMax history", () => {
  const history = createChatHistory({ maxExchanges: 2, maxChars: 1000 });
  assert.throws(
    () => history.append({ user: { role: "user", content: "u" }, assistant: { role: "assistant", content: "x".repeat(1100) }, tools: [] }),
    (error) => error instanceof ChatContractError && error.code === "history_exchange_too_large",
  );
});

test("calculator proposals accept only current allowlisted values and remain inert data", () => {
  const accepted = validateCalculatorProposal(proposal([
    { field: "f-users", value: "2500", reason: "Uses the stated employee population." },
    { field: "f-sv-model", value: "model-b", reason: "Treat this catalog model as an evaluation candidate." },
    { field: "fr-policy", value: "local_first", reason: "Keeps approved data on the local runtime first." },
  ]), { fields });
  assert.deepEqual(accepted.changes.map((change) => change.field), ["f-users", "f-sv-model", "fr-policy"]);
  assert.equal(accepted.planning_profile.substrate, "nutanix");
  assert.equal(accepted.changes[0].value, "2500");
  assert.equal(Object.prototype.hasOwnProperty.call(accepted, "apply"), false);
});

test("proposal validation rejects credentials, prices, unknown models, bounds, duplicates, HTML and arithmetic claims", () => {
  const rejected = [
    [{ field: "ai-token", value: "x", reason: "Use it." }, "forbidden_field"],
    [{ field: "f-sh-capex", value: "100", reason: "Use a guessed price." }, "unknown_field"],
    [{ field: "f-sv-model", value: "invented", reason: "Use this model." }, "model"],
    [{ field: "f-users", value: "1000001", reason: "Large audience." }, "bounds"],
    [{ field: "f-users", value: "500", reason: "<b>trusted</b>" }, "html"],
    [{ field: "f-users", value: "500", reason: "This costs ฿100." }, "arithmetic_claim"],
  ];
  for (const [change, code] of rejected) {
    assert.throws(() => validateCalculatorProposal(proposal([change]), { fields }), (error) => error.code === code, code);
  }
  assert.throws(
    () => validateCalculatorProposal(proposal([
      { field: "f-users", value: "500", reason: "First." },
      { field: "f-users", value: "600", reason: "Second." },
    ]), { fields }),
    (error) => error.code === "duplicate_field",
  );
});

test("local-LLM specifications require Nutanix and portable mappings plus deterministic ledger references", () => {
  const spec = validateLocalLlmSpec({
    title: "Nutanix local support assistant",
    summary: "A local-first service with a replaceable model-serving boundary.",
    components: [{ name: "Model runtime", nutanix: "GPU-enabled AHV virtual machine or Nutanix Kubernetes Platform workload.", portable: "A Linux GPU virtual machine or conformant Kubernetes deployment.", why: "Keeps the runtime replaceable behind one API contract." }],
    workflow: ["User request enters the identity-aware gateway."],
    security: ["Authorize retrieval per document."],
    operations: ["Track queue depth and accelerator saturation."],
    evaluation: ["Use a representative offline evaluation set."],
    rollout: ["Pilot before expanding traffic."],
    component_explanations: [{ ledger_path: "recurring.self_hosted", explanation: "Use the ledger recurring component to explain what contributes to the horizon result." }],
    assumptions: ["The selected model remains an evaluation candidate."],
    open_decisions: ["Confirm the vendor subscription quote."],
  });
  assert.match(spec.components[0].nutanix, /Nutanix|AHV/);
  assert.match(spec.components[0].portable, /Linux|Kubernetes/);
  assert.equal(spec.component_explanations[0].ledger_path, "recurring.self_hosted");
  assert.throws(
    () => validateLocalLlmSpec({ ...spec, component_explanations: [{ ledger_path: "invented.total", explanation: "Made up." }] }),
    (error) => error.code === "ledger_path",
  );
  assert.throws(
    () => validateLocalLlmSpec({ ...spec, summary: "The total is ฿100." }),
    (error) => error.code === "arithmetic_claim",
  );
});

test("assistant tool validation rejects missing, multiple, unknown and malformed calls", () => {
  assert.throws(() => validateAssistantToolCall({ role: "assistant", content: "plain text" }, { fields }), (error) => error.code === "tool_count");
  assert.throws(() => validateAssistantToolCall({ role: "assistant", tool_calls: [assistantCall("ask_user", {}, {}).tool_calls[0], assistantCall("ask_user", {}, {}).tool_calls[0]] }, { fields }), (error) => error.code === "tool_count");
  assert.throws(() => validateAssistantToolCall(assistantCall("delete_everything", {}), { fields }), (error) => error.code === "tool_name");
  const malformed = assistantCall("ask_user", {}); malformed.tool_calls[0].function.arguments = "{";
  assert.throws(() => validateAssistantToolCall(malformed, { fields }), (error) => error.code === "tool_json");
});

test("HTTP, invalid JSON and schema failures are normalized without response leakage", async () => {
  const base = {
    endpoint: "https://api.minimax.io/v1",
    model: "MiniMax-M3",
    systemPrompt: "Return one planning tool call.",
    userMessage: "Help me plan.",
    validationContext: { fields },
  };
  await assert.rejects(requestChatTurn({ ...base, fetchImpl: async () => ({ ok: false, status: 401 }) }), (error) => error.code === "http" && error.status === 401);
  await assert.rejects(requestChatTurn({ ...base, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad"); } }) }), (error) => error.code === "invalid_json");
  await assert.rejects(requestChatTurn({ ...base, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), (error) => error.code === "response_schema");
});

test("timeout and caller cancellation have distinct normalized outcomes", async () => {
  const abortingFetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });
  const base = {
    endpoint: "https://api.minimax.io/v1", model: "MiniMax-M3",
    systemPrompt: "Return one planning tool call.", userMessage: "Help me plan.",
    validationContext: { fields }, fetchImpl: abortingFetch,
  };
  await assert.rejects(requestChatTurn({ ...base, timeoutMs: 5 }), (error) => error.code === "timeout");
  const controller = new AbortController();
  const pending = requestChatTurn({ ...base, signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(pending, (error) => error.code === "aborted");
});

test("offline request is copyable, complete and never contains a real credential", () => {
  const history = createChatHistory();
  const artifact = buildOfflineRequest({
    endpoint: "/minimax/v1",
    model: "MiniMax-M3",
    history,
    systemPrompt: "Return one planning tool call.",
    userMessage: "Plan an internal knowledge assistant.",
    pageUrl: "https://studio.factor-io.com/tco-calculator.html",
  });
  assert.equal(artifact.url, "https://studio.factor-io.com/minimax/v1/chat/completions");
  assert.deepEqual(artifact.payload.thinking, { type: "disabled" });
  assert.match(artifact.copyText, /<session-only token, if required>/);
  assert.doesNotMatch(artifact.copyText, /session-secret/);
  assert.match(artifact.instructions.same_origin_gateway, /server-side/);
  assert.match(artifact.instructions.local_llm, /Ollama|LM Studio/);
});
