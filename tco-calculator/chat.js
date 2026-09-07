// chat.js — bounded MiniMax-M3 tool conversation for the planning workbench.
//
// This module never reads or mutates calculator controls. It validates model
// output into inert proposals/specifications; app.js owns preview and explicit
// Apply. Complete assistant messages are retained because MiniMax requires the
// full response object in multi-turn tool conversations.
import { chatCompletionsUrl } from "./planner.js";

export const CHAT_LIMITS = Object.freeze({
  maxExchanges: 8,
  maxHistoryChars: 32000,
  maxUserChars: 4000,
  maxAssistantChars: 16000,
  timeoutMs: 30000,
});

export const CHAT_TOOLS = Object.freeze([
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask one concise interview question when more workflow context is needed. Do not change calculator values.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          rationale: { type: "string" },
          suggested_replies: { type: "array", maxItems: 4, items: { type: "string" } },
        },
        required: ["question", "suggested_replies"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_calculator_changes",
      description: "Return an inert, reviewable proposal using only allowed current calculator controls. The application previews it; the user must Apply it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          planning_profile: {
            type: "object",
            additionalProperties: false,
            properties: {
              use_case: { type: "string", enum: ["support", "knowledge", "analytics", "automation", "mixed"] },
              substrate: { type: "string", enum: ["nutanix", "kubernetes", "vm", "workstation"] },
              data_boundary: { type: "string", enum: ["restricted", "internal", "public"] },
              interaction: { type: "string", enum: ["assistant", "embedded", "batch", "agent"] },
              overflow: { type: "string", enum: ["local_only", "approved_api", "burst"] },
            },
            required: ["use_case", "substrate", "data_boundary", "interaction", "overflow"],
          },
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                value: { type: "string" },
                reason: { type: "string" },
              },
              required: ["field", "value", "reason"],
            },
          },
          question: { type: "string" },
          suggested_replies: { type: "array", maxItems: 4, items: { type: "string" } },
        },
        required: ["summary", "planning_profile", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "present_local_llm_spec",
      description: "After Apply, present a Nutanix-biased local-LLM specification with a portable equivalent for each component and explanations that cite deterministic ledger paths instead of doing arithmetic.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          components: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                nutanix: { type: "string" },
                portable: { type: "string" },
                why: { type: "string" },
              },
              required: ["name", "nutanix", "portable", "why"],
            },
          },
          workflow: { type: "array", maxItems: 12, items: { type: "string" } },
          security: { type: "array", maxItems: 12, items: { type: "string" } },
          operations: { type: "array", maxItems: 12, items: { type: "string" } },
          evaluation: { type: "array", maxItems: 12, items: { type: "string" } },
          rollout: { type: "array", maxItems: 12, items: { type: "string" } },
          component_explanations: {
            type: "array",
            maxItems: 24,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                ledger_path: { type: "string" },
                explanation: { type: "string" },
              },
              required: ["ledger_path", "explanation"],
            },
          },
          assumptions: { type: "array", maxItems: 12, items: { type: "string" } },
          open_decisions: { type: "array", maxItems: 12, items: { type: "string" } },
        },
        required: ["title", "summary", "components", "workflow", "security", "operations", "evaluation", "rollout", "component_explanations", "assumptions", "open_decisions"],
      },
    },
  },
]);

const TOOL_NAMES = new Set(CHAT_TOOLS.map((tool) => tool.function.name));
const LEDGER_ROOTS = new Set(["demand", "sizing", "recurring", "capex", "power", "subscription", "routing", "commercial_overlay", "exclusions", "freshness", "formulas"]);
const HTML = /<\/?[a-z][^>]*>/i;
const ARITHMETIC_CLAIM = /(?:[$฿€£]\s*\d|\b\d+(?:\.\d+)?\s*(?:\+|-|\*|×|\/|÷|=)\s*\d+)/;
const FORBIDDEN_FIELD = /(?:token|secret|password|endpoint|api[-_]?key|credential)/i;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const INTEGER = /^-?(?:0|[1-9]\d*)$/;

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

export class ChatContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChatContractError";
    this.code = code;
  }
}

export class ChatRequestError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "ChatRequestError";
    this.code = code;
    this.status = status;
  }
}

function strictObject(value, allowed, required, label) {
  if (!isObject(value)) throw new ChatContractError("schema", `${label} must be an object.`);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new ChatContractError("schema", `${label} contains unsupported fields: ${extras.join(", ")}.`);
  const missing = required.filter((key) => !(key in value));
  if (missing.length) throw new ChatContractError("schema", `${label} is missing: ${missing.join(", ")}.`);
  return value;
}

function safeText(value, label, { max = 1200, optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string") throw new ChatContractError("schema", `${label} must be text.`);
  const text = value.trim();
  if (!text) throw new ChatContractError("schema", `${label} must not be empty.`);
  if (text.length > max) throw new ChatContractError("too_large", `${label} is longer than ${max} characters.`);
  if (HTML.test(text)) throw new ChatContractError("html", `${label} must be plain text, not HTML.`);
  if (ARITHMETIC_CLAIM.test(text)) throw new ChatContractError("arithmetic_claim", `${label} must cite the deterministic ledger instead of asserting prices or arithmetic.`);
  return text;
}

function safeTextArray(value, label, { maxItems = 12, required = false } = {}) {
  if (!Array.isArray(value)) throw new ChatContractError("schema", `${label} must be an array.`);
  if (required && value.length === 0) throw new ChatContractError("schema", `${label} must contain at least one item.`);
  if (value.length > maxItems) throw new ChatContractError("too_large", `${label} may contain at most ${maxItems} items.`);
  return value.map((item, i) => safeText(item, `${label}[${i}]`, { max: 500 }));
}

export function validateAskUser(input) {
  const value = strictObject(input, ["question", "rationale", "suggested_replies"], ["question", "suggested_replies"], "ask_user");
  return {
    question: safeText(value.question, "question", { max: 500 }),
    rationale: safeText(value.rationale, "rationale", { max: 500, optional: true }),
    suggested_replies: safeTextArray(value.suggested_replies, "suggested_replies", { maxItems: 4 }),
  };
}

function validateFieldValue(field, value, spec) {
  if (typeof value !== "string" || value.length > 256) throw new ChatContractError("field_value", `${field} must be a short string value.`);
  if (spec.kind === "enum") {
    if (!Array.isArray(spec.values) || !spec.values.includes(value)) throw new ChatContractError("enum", `${field} is not one of the current control values.`);
    return value;
  }
  if (spec.kind === "model") {
    const ids = spec.values instanceof Set ? spec.values : new Set(spec.values ?? []);
    if (!ids.has(value)) throw new ChatContractError("model", `${field} is not a model ID in the current loaded catalog.`);
    return value;
  }
  if (spec.kind === "integer" || spec.kind === "number") {
    const pattern = spec.kind === "integer" ? INTEGER : DECIMAL;
    if (!pattern.test(value)) throw new ChatContractError("number", `${field} must be a plain ${spec.kind === "integer" ? "integer" : "decimal"} string.`);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new ChatContractError("number", `${field} must be finite.`);
    if (spec.min !== undefined && numeric < Number(spec.min)) throw new ChatContractError("bounds", `${field} is below its allowed minimum.`);
    if (spec.max !== undefined && numeric > Number(spec.max)) throw new ChatContractError("bounds", `${field} is above its allowed maximum.`);
    return value;
  }
  throw new ChatContractError("field_contract", `${field} has no supported validation contract.`);
}

export function validateCalculatorProposal(input, context = {}) {
  const value = strictObject(input, ["summary", "changes", "question", "suggested_replies"], ["summary", "changes"], "propose_calculator_changes");
  if (!Array.isArray(value.changes) || value.changes.length === 0 || value.changes.length > 24) {
    throw new ChatContractError("changes", "A proposal must contain 1–24 changes.");
  }
  const fields = isObject(context.fields) ? context.fields : {};
  const seen = new Set();
  const changes = value.changes.map((raw, i) => {
    const change = strictObject(raw, ["field", "value", "reason"], ["field", "value", "reason"], `changes[${i}]`);
    const field = safeText(change.field, `changes[${i}].field`, { max: 100 });
    if (FORBIDDEN_FIELD.test(field) || field.startsWith("ai-")) throw new ChatContractError("forbidden_field", `${field} is not a calculator proposal field.`);
    if (seen.has(field)) throw new ChatContractError("duplicate_field", `${field} appears more than once in the proposal.`);
    seen.add(field);
    const spec = fields[field];
    if (!spec) throw new ChatContractError("unknown_field", `${field} is outside the current calculator allowlist.`);
    return {
      field,
      value: validateFieldValue(field, change.value, spec),
      reason: safeText(change.reason, `changes[${i}].reason`, { max: 500 }),
    };
  });
  return {
    summary: safeText(value.summary, "summary", { max: 1000 }),
    changes,
    question: safeText(value.question, "question", { max: 500, optional: true }),
    suggested_replies: value.suggested_replies === undefined ? [] : safeTextArray(value.suggested_replies, "suggested_replies", { maxItems: 4 }),
  };
}

export function validateLocalLlmSpec(input) {
  const keys = ["title", "summary", "components", "workflow", "security", "operations", "evaluation", "rollout", "component_explanations", "assumptions", "open_decisions"];
  const value = strictObject(input, keys, keys, "present_local_llm_spec");
  if (!Array.isArray(value.components) || value.components.length === 0 || value.components.length > 16) {
    throw new ChatContractError("components", "The specification must contain 1–16 components.");
  }
  const components = value.components.map((raw, i) => {
    const component = strictObject(raw, ["name", "nutanix", "portable", "why"], ["name", "nutanix", "portable", "why"], `components[${i}]`);
    return Object.fromEntries(Object.entries(component).map(([key, text]) => [key, safeText(text, `components[${i}].${key}`, { max: 800 })]));
  });
  if (!Array.isArray(value.component_explanations) || value.component_explanations.length > 24) {
    throw new ChatContractError("component_explanations", "component_explanations must contain at most 24 items.");
  }
  const componentExplanations = value.component_explanations.map((raw, i) => {
    const row = strictObject(raw, ["ledger_path", "explanation"], ["ledger_path", "explanation"], `component_explanations[${i}]`);
    const path = safeText(row.ledger_path, `component_explanations[${i}].ledger_path`, { max: 200 });
    if (!LEDGER_ROOTS.has(path.split(".")[0])) throw new ChatContractError("ledger_path", `${path} is not a deterministic component-ledger path.`);
    return { ledger_path: path, explanation: safeText(row.explanation, `component_explanations[${i}].explanation`, { max: 800 }) };
  });
  return {
    title: safeText(value.title, "title", { max: 300 }),
    summary: safeText(value.summary, "summary", { max: 1200 }),
    components,
    workflow: safeTextArray(value.workflow, "workflow"),
    security: safeTextArray(value.security, "security"),
    operations: safeTextArray(value.operations, "operations"),
    evaluation: safeTextArray(value.evaluation, "evaluation"),
    rollout: safeTextArray(value.rollout, "rollout"),
    component_explanations: componentExplanations,
    assumptions: safeTextArray(value.assumptions, "assumptions"),
    open_decisions: safeTextArray(value.open_decisions, "open_decisions"),
  };
}

export function validateAssistantToolCall(message, context = {}) {
  if (!isObject(message) || message.role !== "assistant") throw new ChatContractError("assistant_message", "The endpoint did not return an assistant message object.");
  const calls = message.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1) throw new ChatContractError("tool_count", "The assistant must return exactly one structured tool call.");
  const call = calls[0];
  if (!isObject(call) || call.type !== "function" || !isObject(call.function)) throw new ChatContractError("tool_schema", "The assistant tool call is malformed.");
  const name = call.function.name;
  if (!TOOL_NAMES.has(name)) throw new ChatContractError("tool_name", `Unsupported assistant tool ${JSON.stringify(name)}.`);
  if (typeof call.function.arguments !== "string") throw new ChatContractError("tool_arguments", "Tool arguments must be a JSON string.");
  let args;
  try { args = JSON.parse(call.function.arguments); } catch { throw new ChatContractError("tool_json", "Tool arguments are not valid JSON."); }
  const validated = name === "ask_user"
    ? validateAskUser(args)
    : name === "propose_calculator_changes"
      ? validateCalculatorProposal(args, context)
      : validateLocalLlmSpec(args);
  return { id: String(call.id ?? ""), type: "function", name, arguments: validated };
}

const exchangeSize = (exchange) => JSON.stringify(exchange).length;

export function createChatHistory({ maxExchanges = CHAT_LIMITS.maxExchanges, maxChars = CHAT_LIMITS.maxHistoryChars } = {}) {
  if (!Number.isInteger(maxExchanges) || maxExchanges < 1) throw new TypeError("maxExchanges must be a positive integer");
  if (!Number.isInteger(maxChars) || maxChars < 1000) throw new TypeError("maxChars must be an integer of at least 1000");
  let exchanges = [];
  return {
    append({ user, assistant, tools = [] }) {
      if (!isObject(user) || user.role !== "user") throw new ChatContractError("history_user", "History user messages must be complete user objects.");
      if (!isObject(assistant) || assistant.role !== "assistant") throw new ChatContractError("history_assistant", "History assistant messages must be complete assistant objects.");
      if (!Array.isArray(tools) || tools.some((tool) => !isObject(tool) || tool.role !== "tool")) throw new ChatContractError("history_tools", "History tool results must be complete tool message objects.");
      const exchange = cloneJson({ user, assistant, tools });
      if (exchangeSize(exchange) > maxChars) throw new ChatContractError("history_exchange_too_large", "One complete exchange exceeds the retained-history character limit.");
      exchanges.push(exchange);
      while (exchanges.length > maxExchanges || exchanges.reduce((sum, row) => sum + exchangeSize(row), 0) > maxChars) exchanges.shift();
    },
    messages({ system, user }) {
      const output = [];
      if (system) output.push(cloneJson(system));
      for (const exchange of exchanges) output.push(cloneJson(exchange.user), cloneJson(exchange.assistant), ...cloneJson(exchange.tools));
      if (user) output.push(cloneJson(user));
      return output;
    },
    snapshot() { return cloneJson(exchanges); },
    clear() { exchanges = []; },
  };
}

export function toolResultMessage(toolCall, result) {
  if (!toolCall?.id) throw new ChatContractError("tool_call_id", "A tool result requires the assistant tool-call ID.");
  return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) };
}

export function buildChatPayload({ model, messages, tools = CHAT_TOOLS }) {
  const chosenModel = String(model ?? "").trim();
  if (!chosenModel) throw new ChatRequestError("model_required", "Enter the model name exposed by the endpoint.");
  if (!Array.isArray(messages) || messages.length === 0) throw new ChatRequestError("messages_required", "The conversation has no messages to send.");
  return {
    model: chosenModel,
    messages: cloneJson(messages),
    tools: cloneJson(tools),
    tool_choice: "required",
    thinking: { type: "disabled" },
    temperature: 0.2,
    max_completion_tokens: 1800,
    stream: false,
  };
}

function requestSignal(external, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener?.("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() { clearTimeout(timer); external?.removeEventListener?.("abort", onAbort); },
  };
}

export async function requestChatTurn({
  endpoint,
  model,
  token,
  history,
  systemPrompt,
  userMessage,
  validationContext = {},
  pageUrl,
  signal,
  fetchImpl = globalThis.fetch,
  timeoutMs = CHAT_LIMITS.timeoutMs,
  maxAssistantChars = CHAT_LIMITS.maxAssistantChars,
}) {
  if (typeof fetchImpl !== "function") throw new ChatRequestError("fetch_unavailable", "This browser cannot send the request. Copy the request into a model client instead.");
  const userText = safeText(userMessage, "user message", { max: CHAT_LIMITS.maxUserChars });
  const systemText = safeText(systemPrompt, "system prompt", { max: 12000 });
  const user = { role: "user", content: userText };
  const system = { role: "system", content: systemText };
  const messages = history?.messages ? history.messages({ system, user }) : [system, user];
  const payload = buildChatPayload({ model, messages });
  let url;
  try { url = chatCompletionsUrl(endpoint, pageUrl); }
  catch (error) { throw new ChatRequestError(error?.code ?? "endpoint", error?.message ?? "The endpoint is invalid.", error?.status ?? null); }
  const headers = { "Content-Type": "application/json" };
  if (String(token ?? "").trim()) headers.Authorization = `Bearer ${String(token).trim()}`;
  const timeout = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : CHAT_LIMITS.timeoutMs;
  const linked = requestSignal(signal, timeout);
  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(payload), signal: linked.signal });
  } catch (error) {
    if (linked.timedOut()) throw new ChatRequestError("timeout", "MiniMax did not respond before the request timeout. The local blueprint and copyable request remain available.");
    if (signal?.aborted || error?.name === "AbortError") throw new ChatRequestError("aborted", "The MiniMax request was cancelled.");
    throw new ChatRequestError("network", "The endpoint could not be reached. Check HTTPS, CORS, the endpoint path and local network access.");
  } finally {
    linked.cleanup();
  }
  if (!response?.ok) {
    const status = Number(response?.status) || null;
    throw new ChatRequestError("http", `The model endpoint rejected the request${status ? ` (${status})` : ""}. Check the session token, model and endpoint.`, status);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new ChatRequestError("invalid_json", "The endpoint returned a non-JSON response."); }
  const raw = body?.choices?.[0]?.message;
  if (!isObject(raw)) throw new ChatRequestError("response_schema", "The endpoint returned no assistant message.");
  const assistantMessage = cloneJson(raw);
  if (JSON.stringify(assistantMessage).length > maxAssistantChars) throw new ChatRequestError("response_too_large", "The complete assistant response exceeds the browser retention limit. Ask for a shorter answer.");
  let toolCall;
  try { toolCall = validateAssistantToolCall(assistantMessage, validationContext); }
  catch (error) {
    if (error instanceof ChatContractError) throw new ChatRequestError(error.code, error.message);
    throw error;
  }
  return {
    user,
    assistantMessage,
    toolCall,
    model: typeof body.model === "string" ? body.model : String(model),
    usage: isObject(body.usage) ? cloneJson(body.usage) : null,
  };
}

export function buildOfflineRequest({ endpoint, model, history, systemPrompt, userMessage, pageUrl }) {
  const user = { role: "user", content: safeText(userMessage, "user message", { max: CHAT_LIMITS.maxUserChars }) };
  const system = { role: "system", content: safeText(systemPrompt, "system prompt", { max: 12000 }) };
  const messages = history?.messages ? history.messages({ system, user }) : [system, user];
  const url = chatCompletionsUrl(endpoint, pageUrl);
  const payload = buildChatPayload({ model, messages });
  const copyText = [
    `POST ${url}`,
    "Content-Type: application/json",
    "Authorization: Bearer <session-only token, if required>",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
  return {
    url,
    payload,
    copyText,
    instructions: {
      same_origin_gateway: "Post this payload through an approved same-origin HTTPS gateway that injects the MiniMax credential server-side and returns the unmodified Chat Completions response.",
      local_llm: "For Ollama or LM Studio, paste the system and user messages into the local client. For a compatible HTTPS endpoint, keep the same tools and return exactly one tool call.",
      credential: "Keep credentials in memory for the session only. Never paste a real token into a saved request artifact.",
    },
  };
}
