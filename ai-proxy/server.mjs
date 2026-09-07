// server.mjs — Factor IO MiniMax proxy.
//
// Holds the MiniMax credential server-side so the calculator page can ship with
// no API-key field and no token in its JavaScript. The browser POSTs the exact
// OpenAI-compatible Chat Completions body it already builds in chat.js and sends
// NO Authorization header; this process adds one from the environment and
// returns the upstream response unmodified.
//
// Deliberately zero-dependency: node:http plus global fetch. There is no build
// step, no lockfile to drift and nothing to audit but this file.
//
// NOT a general-purpose relay. The request contract is pinned to the calculator's
// own usage (one model, bounded body, no streaming) so an open prototype endpoint
// cannot be repurposed as free inference for someone else's traffic. That is
// contract hygiene, not rate limiting — there is deliberately no quota here; the
// operator is adding authentication separately.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? "127.0.0.1";
const UPSTREAM = (process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1").replace(/\/+$/, "");
const API_KEY = (process.env.MINIMAX_API_KEY ?? "").trim();

// The calculator only ever asks for this model. Anything else is not our traffic.
const ALLOWED_MODELS = new Set(
  (process.env.MINIMAX_ALLOWED_MODELS ?? "MiniMax-M3").split(",").map((m) => m.trim()).filter(Boolean),
);

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? [
    "https://studio.factor-io.com",
    "http://127.0.0.1:8781",
    "http://localhost:8781",
  ].join(",")).split(",").map((o) => o.trim()).filter(Boolean),
);

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 262144); // 256 KB
const MAX_COMPLETION_TOKENS = Number(process.env.MAX_COMPLETION_TOKENS ?? 4096);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 60000);

// ── logging ────────────────────────────────────────────────────────────────
// Never logs the credential, the prompt, or the completion. Shape and status only.
const log = (fields) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`);
};

const corsHeaders = (origin) => {
  const headers = { Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
};

const send = (res, status, payload, origin) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...corsHeaders(origin),
  });
  res.end(body);
};

const fail = (res, status, code, message, origin) =>
  send(res, status, { error: { code, message, type: "factor_io_proxy" } }, origin);

// ── body reading, capped ───────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    // Drain past the cap rather than destroying the socket immediately: a
    // destroyed request never delivers the 413 the caller needs to see, it
    // surfaces as an opaque "fetch failed" instead. nginx caps at 512k in front
    // of this, and the ceiling below bounds the direct-to-node path.
    const hardCeiling = MAX_BODY_BYTES * 4;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!over) {
          over = true;
          chunks.length = 0; // stop holding a payload we have already refused
        }
        if (size > hardCeiling) {
          reject(Object.assign(new Error("body_too_large"), { code: "body_too_large", fatal: true }));
          req.destroy();
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (over) {
        reject(Object.assign(new Error("body_too_large"), { code: "body_too_large" }));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

// ── request contract ───────────────────────────────────────────────────────
// Returns { payload } on success or { code, message } on refusal.
function validateChatRequest(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { code: "invalid_json", message: "The request body is not valid JSON." };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { code: "invalid_body", message: "The request body must be a JSON object." };
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return { code: "model_required", message: "The request must name a model." };
  if (!ALLOWED_MODELS.has(model)) {
    return {
      code: "model_not_allowed",
      message: `This endpoint serves ${[...ALLOWED_MODELS].join(", ")} only.`,
    };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { code: "messages_required", message: "The request must carry a non-empty messages array." };
  }
  if (body.stream === true) {
    return { code: "stream_unsupported", message: "This endpoint returns complete responses only." };
  }
  // Clamp rather than refuse: the calculator asks for 1800 and a clamp keeps a
  // slightly larger honest request working instead of failing it outright.
  const payload = { ...body, stream: false };
  for (const key of ["max_completion_tokens", "max_tokens"]) {
    if (typeof payload[key] === "number" && payload[key] > MAX_COMPLETION_TOKENS) {
      payload[key] = MAX_COMPLETION_TOKENS;
    }
  }
  return { payload };
}

// ── upstream ───────────────────────────────────────────────────────────────
async function forward(payload) {
  const response = await fetch(`${UPSTREAM}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await response.text();
  return { status: response.status, text };
}

// ── server ─────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const started = Date.now();
  const origin = req.headers.origin ?? "";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const route = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method === "GET" && (route === "/healthz" || route === "/")) {
    send(res, 200, {
      ok: true,
      service: "factor-io-ai-proxy",
      credential: API_KEY.length > 0,
      upstream: new URL(UPSTREAM).origin,
      models: [...ALLOWED_MODELS],
    }, origin);
    return;
  }

  if (route !== "/v1/chat/completions" && route !== "/chat/completions") {
    fail(res, 404, "not_found", "Unknown route. This proxy serves POST /v1/chat/completions.", origin);
    return;
  }

  if (req.method !== "POST") {
    fail(res, 405, "method_not_allowed", "Use POST.", origin);
    return;
  }

  if (!API_KEY) {
    log({ level: "error", event: "credential_missing" });
    fail(res, 503, "credential_missing", "The proxy has no MiniMax credential configured.", origin);
    return;
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (error) {
    const tooLarge = error?.code === "body_too_large";
    log({ level: "warn", event: "body_rejected", code: error?.code ?? "read_error", fatal: Boolean(error?.fatal) });
    // A fatal overrun destroyed the socket, so there is nothing left to write to.
    if (!res.headersSent && res.writable) {
      fail(
        res,
        tooLarge ? 413 : 400,
        tooLarge ? "body_too_large" : "body_unreadable",
        tooLarge ? `The request body exceeds ${MAX_BODY_BYTES} bytes.` : "The request body could not be read.",
        origin,
      );
    }
    return;
  }

  const verdict = validateChatRequest(raw);
  if (verdict.code) {
    log({ level: "warn", event: "request_refused", code: verdict.code, bytes: raw.length });
    fail(res, 400, verdict.code, verdict.message, origin);
    return;
  }

  try {
    const upstream = await forward(verdict.payload);
    log({
      level: "info",
      event: "forwarded",
      model: verdict.payload.model,
      request_bytes: raw.length,
      upstream_status: upstream.status,
      ms: Date.now() - started,
    });
    res.writeHead(upstream.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(upstream.text),
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    });
    res.end(upstream.text);
  } catch (error) {
    // A thrown fetch error can carry the request init in some runtimes; report a
    // fixed string rather than the error object so a credential can never leak.
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    log({ level: "error", event: "upstream_failed", timed_out: timedOut, ms: Date.now() - started });
    fail(
      res,
      timedOut ? 504 : 502,
      timedOut ? "upstream_timeout" : "upstream_unreachable",
      timedOut
        ? "MiniMax did not respond before the proxy timeout."
        : "The proxy could not reach MiniMax.",
      origin,
    );
  }
});

server.headersTimeout = UPSTREAM_TIMEOUT_MS + 10000;
server.requestTimeout = UPSTREAM_TIMEOUT_MS + 10000;

server.listen(PORT, HOST, () => {
  log({
    level: "info",
    event: "listening",
    host: HOST,
    port: PORT,
    upstream: new URL(UPSTREAM).origin,
    credential: API_KEY.length > 0,
    models: [...ALLOWED_MODELS],
    origins: [...ALLOWED_ORIGINS],
  });
  if (!API_KEY) {
    log({ level: "error", event: "credential_missing", detail: "Set MINIMAX_API_KEY in the EnvironmentFile." });
  }
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log({ level: "info", event: "shutdown", signal });
    server.close(() => process.exit(0));
  });
}