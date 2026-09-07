import { MINIMAX_DEFAULTS, requestRefinement } from "../planner.js";

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
  const evidence = {
    status: null,
    response_json: false,
    choices_array: false,
    assistant_content: "missing",
    reported_model: false,
  };

  const inspectedFetch = async (url, init) => {
    const response = await fetch(url, init);
    evidence.status = response.status;
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        const payload = await response.json();
        evidence.response_json = !!payload && typeof payload === "object";
        evidence.choices_array = Array.isArray(payload?.choices);
        const content = payload?.choices?.[0]?.message?.content;
        evidence.assistant_content = Array.isArray(content) ? "array" : typeof content;
        evidence.reported_model = typeof payload?.model === "string" && payload.model.length > 0;
        return payload;
      },
    };
  };

  try {
    const result = await requestRefinement({
      endpoint,
      model,
      token: credential.value,
      prompt: "Protocol smoke test only. Reply with the single word READY and no other content.",
      fetchImpl: inspectedFetch,
      maxChars: 128,
    });
    console.log(JSON.stringify({
      ok: true,
      credential_env: credential.name,
      endpoint_origin: new URL(endpoint).origin,
      requested_model: model,
      returned_model: result.model,
      response_nonempty: result.text.length > 0,
      response_truncated: result.truncated,
      ...evidence,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      credential_env: credential.name,
      endpoint_origin: (() => { try { return new URL(endpoint).origin; } catch { return "invalid"; } })(),
      requested_model: model,
      code: error?.code ?? "unexpected",
      status: error?.status ?? evidence.status,
      message: error?.message ?? "MiniMax smoke failed without a normalized error.",
      response_json: evidence.response_json,
      choices_array: evidence.choices_array,
      assistant_content: evidence.assistant_content,
      reported_model: evidence.reported_model,
    }));
    process.exitCode = 1;
  }
}