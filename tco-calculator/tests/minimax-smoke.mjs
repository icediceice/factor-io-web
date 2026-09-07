import { MINIMAX_DEFAULTS } from "../planner.js";
import { createChatHistory, requestChatTurn, toolResultMessage } from "../chat.js";

const firstDefined = (names) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
};

const matchingEnvNames = (pattern) => Object.keys(process.env)
  .filter((name) => pattern.test(name) && process.env[name]?.trim())
  .sort();

const credential = firstDefined([
  "MINIMAX_API_KEY",
  "MINIMAX_API_TOKEN",
  "MINIMAX_TOKEN",
  "OPENAI_API_KEY",
  "API_KEY",
]) ?? (() => {
  const names = matchingEnvNames(/(?:MINIMAX|OPENAI).*(?:KEY|TOKEN)|^(?:API_KEY|TOKEN)$/i);
  return names.length === 1 ? { name: names[0], value: process.env[names[0]].trim() } : null;
})();

if (!credential) {
  const candidates = matchingEnvNames(/MINIMAX|OPENAI|TOKEN|API_KEY/i);
  console.error(JSON.stringify({
    ok: false,
    code: "credential_not_injected",
    message: "The Minimax Sub keychain did not expose one unambiguous API credential to the smoke process.",
    candidate_env_names: candidates,
  }));
  process.exitCode = 2;
} else {
  const endpoint = firstDefined([
    "MINIMAX_BASE_URL",
    "MINIMAX_ENDPOINT",
    "OPENAI_BASE_URL",
    "API_BASE_URL",
  ])?.value ?? MINIMAX_DEFAULTS.endpoint;
  const model = firstDefined([
    "MINIMAX_MODEL",
    "OPENAI_MODEL",
    "MODEL",
  ])?.value ?? MINIMAX_DEFAULTS.model;
  const evidence = { requests: [], responses: [] };

  const inspectedFetch = async (url, init) => {
    const request = JSON.parse(init.body);
    evidence.requests.push({
      endpoint_origin: new URL(url).origin,
      authorization_header: typeof init.headers?.Authorization === "string",
      credential_in_body: init.body.includes(credential.value),
      thinking_disabled: request.thinking?.type === "disabled",
      tool_choice_required: request.tool_choice === "required",
      tools_count: Array.isArray(request.tools) ? request.tools.length : null,
      message_roles: Array.isArray(request.messages) ? request.messages.map((message) => message.role) : [],
    });
    const response = await fetch(url, init);
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        const payload = await response.json();
        const message = payload?.choices?.[0]?.message;
        evidence.responses.push({
          status: response.status,
          response_json: !!payload && typeof payload === "object",
          choices_array: Array.isArray(payload?.choices),
          assistant_content: Array.isArray(message?.content) ? "array" : typeof message?.content,
          tool_call_name: message?.tool_calls?.[0]?.function?.name ?? "missing",
          tool_call_id: typeof message?.tool_calls?.[0]?.id === "string" && message.tool_calls[0].id.length > 0,
          reported_model: typeof payload?.model === "string" && payload.model.length > 0,
        });
        return payload;
      },
    };
  };

  try {
    const history = createChatHistory({ maxExchanges: 2, maxChars: 12000 });
    const validationContext = {
      fields: {
        "f-users": { kind: "integer", min: 1, max: 1000000 },
        "f-sv-model": { kind: "model", values: new Set(["smoke-model"]) },
      },
    };
    const systemPrompt = [
      "This is a non-sensitive two-turn protocol smoke for the calculator's structured planning contract.",
      "On the first turn, call ask_user exactly once with one concise question and one suggested reply.",
      "After a tool result is present, call propose_calculator_changes exactly once.",
      "That proposal must use summary 'Review this smoke proposal.', planning_profile {use_case:'support', substrate:'nutanix', data_boundary:'internal', interaction:'assistant', overflow:'local_only'}, and exactly two changes: f-users='500' because it matches the described support audience, and f-sv-model='smoke-model' because it is an evaluation candidate.",
      "Do not provide plain text, HTML, prices, equations, extra fields or another tool call.",
    ].join(" ");
    const first = await requestChatTurn({
      endpoint,
      model,
      token: credential.value,
      history,
      systemPrompt,
      userMessage: "Begin the structured interview smoke.",
      validationContext,
      fetchImpl: inspectedFetch,
    });
    if (first.toolCall.name !== "ask_user") {
      const error = new Error("The first smoke turn did not return ask_user.");
      error.code = "unexpected_first_tool";
      throw error;
    }
    history.append({
      user: first.user,
      assistant: first.assistantMessage,
      tools: [toolResultMessage(first.toolCall, {
        status: "shown",
        answer: "Plan an internal local support assistant on Nutanix and treat the smoke model as an evaluation candidate.",
      })],
    });
    const second = await requestChatTurn({
      endpoint,
      model,
      token: credential.value,
      history,
      systemPrompt,
      userMessage: "Use the recorded answer and return the required proposal now.",
      validationContext,
      fetchImpl: inspectedFetch,
    });
    if (second.toolCall.name !== "propose_calculator_changes") {
      const error = new Error("The second smoke turn did not return propose_calculator_changes.");
      error.code = "unexpected_second_tool";
      throw error;
    }
    console.log(JSON.stringify({
      ok: true,
      credential_env: credential.name,
      endpoint_origin: new URL(endpoint).origin,
      requested_model: model,
      returned_models: [first.model, second.model],
      exchange_count: history.snapshot().length,
      structured_tools: [first.toolCall.name, second.toolCall.name],
      request_count: evidence.requests.length,
      all_credentials_header_only: evidence.requests.every((request) => request.authorization_header && !request.credential_in_body),
      all_thinking_disabled: evidence.requests.every((request) => request.thinking_disabled),
      all_tool_choice_required: evidence.requests.every((request) => request.tool_choice_required),
      second_turn_roles: evidence.requests[1]?.message_roles ?? [],
      responses: evidence.responses,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      credential_env: credential.name,
      endpoint_origin: (() => { try { return new URL(endpoint).origin; } catch { return "invalid"; } })(),
      requested_model: model,
      code: error?.code ?? "unexpected",
      status: error?.status ?? evidence.responses.at(-1)?.status ?? null,
      message: error?.message ?? "MiniMax smoke failed without a normalized error.",
      request_count: evidence.requests.length,
      all_credentials_header_only: evidence.requests.every((request) => request.authorization_header && !request.credential_in_body),
      responses: evidence.responses,
    }));
    process.exitCode = 1;
  }
}