// smoke.mjs — proves the proxy end to end against the real MiniMax API.
//
// Spawns server.mjs, waits for /healthz, then POSTs a Chat Completions body in
// the same shape tco-calculator/chat.js builds — WITHOUT an Authorization
// header — and asserts the proxy injected the credential and returned a real
// tool call. Prints only status, shape booleans and refusal codes: never the
// credential, never the completion text.
//
//   node ai-proxy/smoke.mjs        (MINIMAX_API_KEY must be in the environment)

import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = Number(process.env.SMOKE_PORT ?? 8791);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = "https://studio.factor-io.com";
const KEY = (process.env.MINIMAX_API_KEY ?? "").trim();

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  return pass;
};

if (!KEY) {
  console.error(JSON.stringify({ ok: false, code: "credential_not_injected" }, null, 2));
  process.exit(2);
}

const child = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (b) => { serverLog += b.toString(); });
child.stderr.on("data", (b) => { serverLog += b.toString(); });

const stop = async () => {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 3000))]);
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return response.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the proxy did not become healthy within 5s");
};

// The calculator's real contract: one tool, tool_choice required, thinking off.
const chatBody = {
  model: "MiniMax-M3",
  messages: [
    { role: "system", content: "You help plan a local-LLM deployment. Ask exactly one clarifying question." },
    { role: "user", content: "We want an internal knowledge assistant for about 500 staff." },
  ],
  tools: [{
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask one concise interview question.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          suggested_replies: { type: "array", maxItems: 4, items: { type: "string" } },
        },
        required: ["question", "suggested_replies"],
      },
    },
  }],
  tool_choice: "required",
  thinking: { type: "disabled" },
  temperature: 0.2,
  max_completion_tokens: 400,
  stream: false,
};

const post = (body, headers = {}) => fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

try {
  const health = await waitForHealth();
  check("healthz reports a loaded credential", health.credential === true);
  check("healthz never echoes the credential", !JSON.stringify(health).includes(KEY));

  // 1. the real round trip, with NO Authorization header from the caller
  const started = Date.now();
  const response = await post(chatBody);
  const elapsed = Date.now() - started;
  const raw = await response.text();
  check("live MiniMax call returns 200", response.status === 200, { status: response.status, ms: elapsed });
  check("CORS allows the calculator origin", response.headers.get("access-control-allow-origin") === ORIGIN);
  check("response body never contains the credential", !raw.includes(KEY));

  let payload = null;
  try { payload = JSON.parse(raw); } catch { /* reported below */ }
  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
  check("response parses as JSON", payload !== null);
  check("MiniMax returned a tool call", Boolean(toolCall));
  check("the tool call is ask_user", toolCall?.function?.name === "ask_user");
  let parsedArgs = null;
  try { parsedArgs = JSON.parse(toolCall?.function?.arguments ?? "null"); } catch { /* reported below */ }
  check("tool arguments parse and carry a question", typeof parsedArgs?.question === "string" && parsedArgs.question.length > 0);
  check("model echoed is MiniMax-M3", typeof payload?.model === "string" && payload.model.includes("MiniMax"));

  // 2. the refusals that keep this from being a general-purpose relay
  const wrongModel = await post({ ...chatBody, model: "gpt-4o" });
  check("a non-allowlisted model is refused", wrongModel.status === 400,
    { code: (await wrongModel.json())?.error?.code });

  const streamed = await post({ ...chatBody, stream: true });
  check("streaming is refused", streamed.status === 400, { code: (await streamed.json())?.error?.code });

  const oversize = await post(JSON.stringify({ ...chatBody, pad: "x".repeat(300000) }));
  check("an oversize body is refused", oversize.status === 413, { code: (await oversize.json())?.error?.code });

  const foreign = await post(chatBody, { Origin: "https://evil.example" });
  check("an unlisted origin gets no CORS grant", foreign.headers.get("access-control-allow-origin") === null);

  const preflight = await fetch(`${BASE}/v1/chat/completions`, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
  });
  check("preflight returns 204 with the origin", preflight.status === 204
    && preflight.headers.get("access-control-allow-origin") === ORIGIN);

  // 3. the logs must be clean
  check("server logs never contain the credential", !serverLog.includes(KEY));

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    passed: results.length - failed.length,
    total: results.length,
    checks: results,
  }, null, 2));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: String(error?.message ?? error), checks: results }, null, 2));
  process.exitCode = 3;
} finally {
  await stop();
}