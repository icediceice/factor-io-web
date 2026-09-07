// Guided local-LLM planner. This module owns authored recommendations and the
// opt-in OpenAI-compatible request contract. It never reads the DOM and never
// writes calculator inputs; app.js is the only bridge to the existing controls.

// The calculator now talks to Factor IO's own proxy, which injects the MiniMax
// credential server-side (ai-proxy/server.mjs). The page ships no token and has
// no key field. A visitor-owned OpenAI-compatible gateway remains possible by
// overriding the endpoint, but nothing on the page asks for one.
export const MINIMAX_DEFAULTS = Object.freeze({
  endpoint: "https://ai.factor-io.com/v1",
  model: "MiniMax-M3",
});

// The guided interview. Questions 1, 4, 5, 6 and 7 shape the authored
// architecture blueprint; questions 2, 3 and 8 carry `fields`/`input` and drive
// real calculator controls that already exist in app.js:CHAT_FIELD_CONTRACTS.
// An option is either a fixed answer (`fields`) or a typed one (`input`).
export const INTERVIEW_QUESTIONS = Object.freeze([
  {
    id: "use_case",
    eyebrow: "Workload",
    prompt: "What should AI help people do?",
    help: "This chooses the closest existing demand preset. Every calculator value remains editable.",
    options: [
      { id: "support", label: "Answer customer or staff questions", note: "Retrieval with a human handoff", presetId: "support_desk" },
      { id: "knowledge", label: "Search internal knowledge", note: "ACL-aware document retrieval", presetId: "internal_kb" },
      { id: "analytics", label: "Investigate linked data", note: "Multi-hop and Graph RAG", presetId: "graph_analyst" },
      { id: "automation", label: "Run tools and workflows", note: "Agents with approval gates", presetId: "agent_platform" },
      { id: "mixed", label: "Serve several teams", note: "A mixed enterprise starting point", presetId: "mixed_enterprise" },
    ],
  },
  {
    id: "scale",
    eyebrow: "Scale",
    prompt: "How many people will use it?",
    help: "This sets the calculator's user count, which is what demand and peak-second sizing are derived from.",
    options: [
      { id: "pilot", label: "A pilot team", note: "About 50 people", fields: { "f-users": "50" } },
      { id: "department", label: "One department", note: "About 200 people", fields: { "f-users": "200" } },
      { id: "company", label: "The whole company", note: "About 1,000 people", fields: { "f-users": "1000" } },
      { id: "enterprise", label: "A large enterprise", note: "About 5,000 people", fields: { "f-users": "5000" } },
      { id: "custom", label: "A specific number", note: "Enter your own headcount", input: { field: "f-users", min: 1, max: 10000000, step: 1, unit: "people", placeholder: "e.g. 750" } },
    ],
  },
  {
    id: "intensity",
    eyebrow: "Usage",
    prompt: "How often will each person use it on a working day?",
    help: "Sessions per user per day. Together with the user count this is what sets the peak the hardware must serve.",
    options: [
      { id: "occasional", label: "Occasionally", note: "About 2 sessions a day", fields: { "f-sessions-day": "2" } },
      { id: "routine", label: "As part of their routine", note: "About 6 sessions a day", fields: { "f-sessions-day": "6" } },
      { id: "constant", label: "Constantly — it is their main tool", note: "About 20 sessions a day", fields: { "f-sessions-day": "20" } },
      { id: "custom", label: "A specific rate", note: "Enter sessions per person per day", input: { field: "f-sessions-day", min: 0, max: 100000, step: 0.5, unit: "sessions per day", placeholder: "e.g. 12" } },
    ],
  },
  {
    id: "substrate",
    eyebrow: "Placement",
    prompt: "Where should the local runtime live?",
    help: "Nutanix is the guided path; every pattern also names its portable equivalent.",
    options: [
      { id: "nutanix", label: "Nutanix private cloud", note: "AHV or Kubernetes-backed runtime" },
      { id: "kubernetes", label: "Existing Kubernetes", note: "Portable GPU workloads and services" },
      { id: "vm", label: "Linux GPU virtual machines", note: "Small operational surface" },
      { id: "workstation", label: "One local GPU server", note: "Pilot before platform work" },
    ],
  },
  {
    id: "data_boundary",
    eyebrow: "Data boundary",
    prompt: "What data may the model see?",
    help: "The answer changes retrieval, identity and audit controls—not the calculator's prices.",
    options: [
      { id: "restricted", label: "Regulated or restricted data", note: "Deny-by-default access and full audit" },
      { id: "internal", label: "Internal company data", note: "Identity-aware retrieval and retention" },
      { id: "public", label: "Public or approved content", note: "Simpler policy boundary" },
    ],
  },
  {
    id: "interaction",
    eyebrow: "Workflow",
    prompt: "How will people use the result?",
    help: "This chooses the integration seam and the human-control pattern.",
    options: [
      { id: "assistant", label: "Chat or copilot", note: "Streaming answers with citations" },
      { id: "embedded", label: "Inside an existing application", note: "Stable API contract and evaluation set" },
      { id: "batch", label: "Scheduled or batch processing", note: "Queues, checkpoints and replay" },
      { id: "agent", label: "Tool-using automation", note: "Brokered tools and explicit approvals" },
    ],
  },
  {
    id: "overflow",
    eyebrow: "Fallback",
    prompt: "What happens when local capacity is unavailable?",
    help: "All choices remain local-first. External fallback is opt-in and should receive only policy-approved data.",
    options: [
      { id: "local_only", label: "Wait for local capacity", note: "No external inference", failshare: "0" },
      { id: "approved_api", label: "Use an approved API for exceptions", note: "Start with a 5% planning allowance", failshare: "0.05" },
      { id: "burst", label: "Burst during demand peaks", note: "Start with a 15% planning allowance", failshare: "0.15" },
    ],
  },
  {
    id: "horizon",
    eyebrow: "Horizon",
    prompt: "Over what period should the comparison run?",
    help: "Owned hardware pays back over time, so the horizon can change which option wins.",
    options: [
      { id: "y3", label: "Three years", note: "36 months — a typical refresh cycle", fields: { "f-horizon": "36" } },
      { id: "y5", label: "Five years", note: "60 months — the calculator default", fields: { "f-horizon": "60" } },
      { id: "custom", label: "A specific period", note: "Enter the number of months", input: { field: "f-horizon", min: 1, max: 600, step: 1, unit: "months", placeholder: "e.g. 48" } },
    ],
  },
]);

// The subset that forms the architecture profile. The MiniMax
// `propose_calculator_changes` tool supplies exactly these five and sets the
// quantitative fields through its own `changes[]`, so buildPlannerPlan must
// stay satisfiable from the profile alone.
export const PROFILE_QUESTION_IDS = Object.freeze(["use_case", "substrate", "data_boundary", "interaction", "overflow"]);

const QUESTION_BY_ID = new Map(INTERVIEW_QUESTIONS.map((question) => [question.id, question]));

// An answer is either a bare option id ("pilot") or, for a typed option,
// { id, value }. Accepting both keeps the model-supplied profile — which is
// always bare strings — working unchanged.
const answerId = (answer) => (typeof answer === "string" ? answer : answer?.id ?? null);
const answerValue = (answer) => (typeof answer === "string" ? null : answer?.value ?? null);

const USE_CASE = Object.freeze({
  support: { presetId: "support_desk", title: "Local support assistant", pattern: "retrieval-augmented answers with confidence thresholds and human handoff" },
  knowledge: { presetId: "internal_kb", title: "Internal knowledge service", pattern: "identity-aware retrieval with document-level access control and citations" },
  analytics: { presetId: "graph_analyst", title: "Linked-data analysis workspace", pattern: "Graph RAG with traceable multi-hop retrieval and analyst review" },
  automation: { presetId: "agent_platform", title: "Governed automation platform", pattern: "tool-calling agents behind a policy broker and human approval gates" },
  mixed: { presetId: "mixed_enterprise", title: "Shared enterprise AI service", pattern: "a routed service supporting chat, retrieval, graph analysis and governed agents" },
});

const SUBSTRATE = Object.freeze({
  nutanix: {
    label: "Nutanix private cloud",
    runtime: "Run the OpenAI-compatible model service on Nutanix Kubernetes Platform or GPU-enabled AHV virtual machines; keep model weights and retrieval stores inside the governed cluster.",
    portable: "The same gateway and model-serving containers can move to another conformant Kubernetes cluster or Linux GPU virtual machines.",
  },
  kubernetes: {
    label: "portable Kubernetes",
    runtime: "Run vLLM or SGLang as a GPU workload behind an internal OpenAI-compatible service and standard Kubernetes scheduling, secrets and network policy.",
    portable: "Keep manifests, model storage and gateway contracts vendor-neutral so the workload can land on Nutanix Kubernetes Platform later.",
  },
  vm: {
    label: "Linux GPU virtual machines",
    runtime: "Run vLLM or SGLang under a supervised service on GPU virtual machines, with a separate gateway for identity, quotas and request logging.",
    portable: "Containerize the runtime and externalize model storage so a later move to Nutanix or Kubernetes does not change client APIs.",
  },
  workstation: {
    label: "single local GPU server",
    runtime: "Pilot with an OpenAI-compatible runtime such as Ollama, vLLM, SGLang or LM Studio on one controlled GPU host.",
    portable: "Use the same API contract and evaluation set when the pilot moves to Nutanix, Kubernetes or a larger VM fleet.",
  },
});

const DATA_CONTROLS = Object.freeze({
  restricted: "Authenticate every caller, authorize retrieval per document, encrypt model and index storage, redact prompts where required, and retain an auditable request/tool trail under the organisation's policy.",
  internal: "Propagate workforce identity into retrieval, enforce document ACLs, separate team indexes, define prompt/response retention, and audit administrative access.",
  public: "Allow only approved corpora, record corpus versions, validate citations, rate-limit callers, and keep an abuse and incident trail.",
});

const WORKFLOW = Object.freeze({
  assistant: "Client UI → identity-aware API → policy/router → retrieval → local model runtime → cited response → optional human handoff.",
  embedded: "Application service → stable OpenAI-compatible gateway → policy/router → local model runtime and retrieval → structured response → application validation.",
  batch: "Scheduler → durable queue → policy/router → local model workers → validated output store → retry/dead-letter review.",
  agent: "User or event → agent orchestrator → policy and tool broker → approval checkpoint → local model runtime → tool execution → immutable audit event.",
});

function answerOption(questionId, answer) {
  const question = QUESTION_BY_ID.get(questionId);
  const id = answerId(answer);
  return question?.options.find((option) => option.id === id) ?? null;
}

// The calculator fields one answer commits. A typed option contributes only when
// the visitor actually entered a value; a blank custom box commits nothing
// rather than writing an empty string into a real control.
export function answerFields(questionId, answer) {
  const option = answerOption(questionId, answer);
  if (!option) return {};
  if (option.input) {
    const value = answerValue(answer);
    const text = value === null || value === undefined ? "" : String(value).trim();
    return text === "" ? {} : { [option.input.field]: text };
  }
  return option.fields ? { ...option.fields } : {};
}

// Every question answered — the gate for the guided flow's Apply.
export function isInterviewComplete(answers = {}) {
  return INTERVIEW_QUESTIONS.every((question) => {
    const option = answerOption(question.id, answers[question.id]);
    if (!option) return false;
    if (!option.input) return true;
    const value = answerValue(answers[question.id]);
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

// Only the architecture profile — the five keys MiniMax supplies in
// planning_profile. Kept separate so a model proposal, which never carries the
// quantitative answers, can still build a plan.
export function isProfileComplete(answers = {}) {
  return PROFILE_QUESTION_IDS.every((id) => !!answerOption(id, answers[id]));
}

export function buildPlannerPlan(answers = {}) {
  if (!isProfileComplete(answers)) throw new TypeError("Complete every planning question before applying the plan.");
  const useCase = USE_CASE[answerId(answers.use_case)];
  const substrate = SUBSTRATE[answerId(answers.substrate)];
  const overflow = answerOption("overflow", answers.overflow);
  // Quantitative answers are folded in only when present, so the model path
  // (five keys, no scale/intensity/horizon) yields exactly the routing set it
  // always did and sets those fields through its own reviewed changes[].
  const quantitative = Object.assign({}, ...INTERVIEW_QUESTIONS
    .filter((question) => !PROFILE_QUESTION_IDS.includes(question.id))
    .map((question) => answerFields(question.id, answers[question.id])));
  return {
    answers: Object.fromEntries(INTERVIEW_QUESTIONS
      .filter((question) => answers[question.id] !== undefined)
      .map((question) => [question.id, answers[question.id]])),
    title: useCase.title,
    presetId: useCase.presetId,
    pattern: useCase.pattern,
    substrate,
    dataControls: DATA_CONTROLS[answerId(answers.data_boundary)],
    workflow: WORKFLOW[answerId(answers.interaction)],
    overflow: {
      label: overflow.label,
      note: overflow.note,
      failshare: overflow.failshare,
    },
    controlledFields: {
      "fr-policy": "local_first",
      "fr-blend": "100",
      "fr-failshare": overflow.failshare,
      "fr-failrate": "2",
      ...quantitative,
    },
  };
}

export function buildBlueprint(plan, context = {}) {
  if (!plan?.presetId || !plan?.substrate) throw new TypeError("A complete planner plan is required.");
  const model = context.modelLabel ? `Selected model: ${context.modelLabel}.` : "Choose the model in the calculator before validating capacity.";
  const scenario = context.presetLabel
    ? `The planner applied the calculator's ${context.presetLabel} demand preset; any later edits remain authoritative.`
    : "The calculator scenario remains the authority for demand, capacity and cost.";
  const warnings = [
    "This architecture pattern is authored guidance, not a priced recommendation. The calculator remains the only cost surface.",
  ];
  if (plan.answers.substrate === "nutanix") {
    warnings.push("Nutanix Enterprise AI has no public list price in this calculator. Enter your vendor quote under Platform software subscription before treating the total as a Nutanix platform cost.");
  }
  const sections = [
    {
      heading: "Operating intent",
      lines: [
        `${plan.title}: ${plan.pattern}.`,
        `${scenario} ${model}`,
        `Routing stays local-first. Capacity exception: ${plan.overflow.label.toLowerCase()}.`,
      ],
    },
    {
      heading: "Reference flow",
      lines: [plan.workflow],
    },
    {
      heading: `Runtime on ${plan.substrate.label}`,
      lines: [
        plan.substrate.runtime,
        "Put authentication, policy, quotas and audit at the gateway; keep vLLM, SGLang, Ollama or another compatible runtime replaceable behind it.",
        plan.substrate.portable,
      ],
    },
    {
      heading: "Data and safety controls",
      lines: [
        plan.dataControls,
        "Treat retrieved text and tool output as untrusted input. Constrain tool identities, arguments, timeouts and egress independently of the model.",
      ],
    },
    {
      heading: "Delivery pattern",
      lines: [
        "Create a representative evaluation set before choosing a model; score answer quality, citation faithfulness, latency, refusal behaviour and task completion.",
        "Pilot behind the gateway, observe queue depth and GPU saturation, then scale replicas or admit a policy-approved fallback without changing application clients.",
        "Promote model, prompt, retrieval and tool-policy changes as separately versioned releases with rollback criteria.",
      ],
    },
  ];
  const text = [
    plan.title,
    "",
    ...warnings.map((warning) => `IMPORTANT: ${warning}`),
    "",
    ...sections.flatMap((section) => [section.heading.toUpperCase(), ...section.lines.map((line) => `- ${line}`), ""]),
  ].join("\n").trim();
  return { title: plan.title, warnings, sections, text };
}

export function buildPrompt({ plan, blueprint, context = {} }) {
  if (!plan || !blueprint?.text) throw new TypeError("A planner plan and deterministic blueprint are required.");
  return [
    "Act as an enterprise local-LLM platform architect.",
    "Refine the authored blueprint below into an implementation specification for the stated environment.",
    "Preserve local-first routing, the portable OpenAI-compatible gateway seam, identity-aware retrieval, evaluation gates, rollback, observability and human approval for consequential tools.",
    "Bias the primary deployment toward Nutanix when Nutanix was selected, but name a portable Kubernetes or Linux-VM equivalent for every Nutanix-specific component.",
    "Do not invent prices, savings, benchmark results, licence inclusions or capacity figures. Refer readers back to the calculator for cost and sizing. Mark assumptions and open decisions explicitly.",
    "Return concise plain-text Markdown with these headings: Scope, Workflow, Components, Security, Operations, Evaluation, Rollout, Open decisions.",
    context.modelLabel ? `Calculator-selected model: ${context.modelLabel}` : "Calculator-selected model: not supplied",
    "",
    "AUTHORED BLUEPRINT",
    blueprint.text,
  ].join("\n");
}

export class PlannerRequestError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "PlannerRequestError";
    this.code = code;
    this.status = status;
  }
}

export function chatCompletionsUrl(endpoint, pageUrl = "https://localhost/") {
  const raw = String(endpoint ?? "").trim();
  if (!raw) throw new PlannerRequestError("endpoint_required", "Enter an OpenAI-compatible HTTPS endpoint.");
  const rootRelative = raw.startsWith("/") && !raw.startsWith("//");
  if (!rootRelative && !/^https?:\/\//i.test(raw)) {
    throw new PlannerRequestError("endpoint_scheme", "Enter the full endpoint including https:// — for example https://api.minimax.io/v1. Use a leading / only for an intentional same-origin development gateway.");
  }
  let url;
  let page;
  try {
    page = new URL(pageUrl);
    url = new URL(raw, page);
  } catch {
    throw new PlannerRequestError("endpoint_invalid", "The endpoint is not a valid URL.");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new PlannerRequestError("endpoint_protocol", "Use an HTTPS endpoint or a same-origin HTTP development gateway.");
  }
  if (page.protocol === "https:" && url.protocol === "http:") {
    throw new PlannerRequestError("mixed_content", "This HTTPS page cannot call an HTTP local runtime. Copy the prompt into Ollama or LM Studio, or expose the runtime through an approved HTTPS gateway with CORS enabled.");
  }
  if (!/\/chat\/completions\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`;
  }
  return url.toString();
}

const responseText = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("\n");
  return "";
};

export async function requestRefinement({ endpoint, model, token, prompt, pageUrl, signal, fetchImpl = globalThis.fetch, maxChars = 16000 }) {
  if (typeof fetchImpl !== "function") throw new PlannerRequestError("fetch_unavailable", "This browser cannot send the request. Copy the prompt into your model client instead.");
  const chosenModel = String(model ?? "").trim();
  if (!chosenModel) throw new PlannerRequestError("model_required", "Enter the model name exposed by your endpoint.");
  if (!String(prompt ?? "").trim()) throw new PlannerRequestError("prompt_required", "Generate the deterministic blueprint before requesting a refinement.");
  const url = chatCompletionsUrl(endpoint, pageUrl);
  const headers = { "Content-Type": "application/json" };
  if (String(token ?? "").trim()) headers.Authorization = `Bearer ${String(token).trim()}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: "You refine authored local-LLM deployment plans. Never invent prices, savings, licences, benchmarks or capacity." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
        stream: false,
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new PlannerRequestError("aborted", "The superseded request was cancelled.");
    throw new PlannerRequestError("network", "The endpoint could not be reached. Check HTTPS, CORS, the endpoint path and local network access.");
  }
  if (!response?.ok) {
    const status = Number(response?.status) || null;
    const label = status ? ` (${status})` : "";
    throw new PlannerRequestError("http", `The model endpoint rejected the request${label}. Check the subscription token, model name and endpoint.`, status);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new PlannerRequestError("invalid_json", "The endpoint returned a non-JSON response.");
  }
  const fullText = responseText(payload?.choices?.[0]?.message?.content).trim();
  if (!fullText) throw new PlannerRequestError("empty_response", "The endpoint returned no assistant text.");
  const limit = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 16000;
  const truncated = fullText.length > limit;
  return {
    text: truncated ? `${fullText.slice(0, limit)}\n\n[Response truncated in the browser. Ask for a shorter specification.]` : fullText,
    truncated,
    model: payload?.model ?? chosenModel,
  };
}

export function createRequestFence() {
  let generation = 0;
  return {
    begin() { generation += 1; return generation; },
    isCurrent(candidate) { return candidate === generation; },
    cancel() { generation += 1; return generation; },
  };
}
