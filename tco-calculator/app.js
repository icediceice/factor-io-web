// app.js — demand entry, option comparison, results, sensitivity & provenance.
//
// UX rules are normative (SPEC 8): no number without provenance, no estimate
// without its reason list, stale/quarantined inputs visible at the point of
// use, and the word g-u-a-r-a-n-t-e-e never appears — a guarantee is a
// contract a human signs, not a number a model emits.
//
// NAMING CONTRACT (SPEC 8, normative): the strings "Lane", "Lane A", "Lane B"
// and "Lane C" MUST NOT appear in any rendered surface or in the exported quote.
// The engine keeps its internal A/B/C keys — 14 fixture call sites bind them to
// the F1–F10 acceptance anchors — so the rename happens HERE, at the render and
// export boundary, through OPTION. Renaming the engine instead would rewrite
// those fixtures, and they are the regression net for the ×3600 dimensional bug.
import { Dec, Rat, formatHalfUp, toRat, ratStr } from "./exact.js";
import { runComparison, matchEvidence, ratToDecExact, rentedGpuByProvider } from "./calculator.js?v=20260906-ux3";
import { loadManifest, loadFx, resolveResource, beginSelection, currentGeneration, freshnessView } from "./data.js";
import { normalizeFxDocument, toTHB, toUSD, fxProvenance } from "./currency.js";
import { fetchOpenRouterModels, compileLiveOpenRouter, replaceCatalogSource, fetchLiveFx } from "./live-pricing.js";
import { buildDemand, peakTokensPerSecond, gpusForLoad, validateMix, DemandRefusal, WORKLOAD_TYPES } from "./demand.js";
import { servingPlan, kvBytesPerToken, ServingRefusal } from "./serving.js";
import { nodesForFleet, cheapestConfigFor, cheapestBoxForLoad, serversForGpu, CapexRefusal } from "./capex.js?v=20260906-ux3";
import { subscriptionCost, billableQuantity, METERS, SubscriptionRefusal } from "./subscription.js";
import { configurePowerSeed, runningCost, PowerRefusal } from "./power.js";
// Progressive disclosure for the rail. It MOVES the authored .f blocks between a
// hidden vault and an overlay sheet, so every id below still resolves to the one
// real node this file reads and writes.
import { enhanceRail, syncChips, releaseFields } from "./fields.js?v=20260907-thb-chat";
import {
  INTERVIEW_QUESTIONS,
  MINIMAX_DEFAULTS,
  buildBlueprint,
  buildPlannerPlan,
  buildPrompt,
  createRequestFence,
  isInterviewComplete,
  requestRefinement,
} from "./planner.js?v=20260907-thb-chat";
import {
  buildOfflineRequest,
  createChatHistory,
  requestChatTurn,
  toolResultMessage,
  validateCalculatorProposal,
} from "./chat.js?v=20260907-thb-chat";

// The single place the engine's internal keys become user-facing names.
const OPTION = {
  A: { key: "self_hosted", label: "Self-hosted", color: "#B46EFF" },
  B: { key: "model_api", label: "Model API", color: "#22D3EE" },
  C: { key: "rented_gpu", label: "Rented GPU", color: "#34D399" },
};
const OPTION_KEYS = ["A", "B", "C"];

// The engine's routing keys are vocabulary, not English. Rendered surfaces get
// the sentence; the raw key stays in the provenance rows and the exported quote,
// which are the technical record and must keep the engine's own term.
const POLICY_WORDS = {
  local_first: "your own GPUs first",
  api_first: "the API first, falling back to your own GPUs",
  fixed_split: "a fixed split between the options",
};
const policyWords = (p) => POLICY_WORDS[p] ?? String(p);

// Mix/shape field ids use `graphrag`; the engine's workload type is `graph_rag`.
const MIX_FIELD = { chat: "chat", rag: "rag", graph_rag: "graphrag", agentic: "agentic" };

const $ = (id) => document.getElementById(id);
const state = {
  manifest: null,
  catalog: null,
  catalogGeneration: -1,
  catalogError: null,
  selecting: false,
  gpuPricing: null,
  workloadPresets: null,
  result: null,
  demand: null,
  // v0.3 serving model: the tables in serving-models.json, and the solved plan
  // for the current selection. servingGap holds the REASON a plan could not be
  // solved, so the fit panel can say what to change instead of going blank.
  servingData: null,
  serving: null,
  servingGap: null,
  // v0.5: the server-acquisition registry and the platform-licence registry, plus
  // the derived capex/licence for the current selection. capexGap and subGap hold
  // the REASON one could not be derived, so the note says what to change rather
  // than going blank — the same contract servingGap follows.
  serverPricing: null,
  subscriptions: null,
  fx: null,
  liveFailures: {},
  capexPlan: null,
  capexGap: null,
  subPlan: null,
  subGap: null,
  powerSeed: null,
  powerPlan: null,
  powerGap: null,
  // Live recompute must not fire mid-init: the catalog is not loaded yet and a
  // comparison over an empty catalog renders a gap the user never caused.
  ready: false,
};

const plannerState = {
  answers: {},
  questionIndex: 0,
  plan: null,
  blueprint: null,
  prompt: "",
  refinement: null,
  modelAttempted: false,
  focusAfterRender: false,
  applied: false,
  abortController: null,
};
const plannerFence = createRequestFence();
const chatState = {
  history: createChatHistory(),
  transcript: [],
  suggestions: [],
  pendingProposal: null,
  pendingSpec: null,
  offlineArtifact: null,
  busy: false,
  abortController: null,
};
const chatFence = createRequestFence();

const CHAT_FIELD_CONTRACTS = Object.freeze({
  "f-users": { kind: "integer", min: 1, max: 10000000 },
  "f-sessions-day": { kind: "number", min: 0, max: 100000 },
  "f-days": { kind: "integer", min: 1, max: 31 },
  "f-horizon": { kind: "integer", min: 1, max: 600 },
  "f-peak-frac": { kind: "number", min: 0, max: 100 },
  "f-tps-stream": { kind: "number", min: 1, max: 10000 },
  "f-mix-chat": { kind: "number", min: 0, max: 100 },
  "f-mix-rag": { kind: "number", min: 0, max: 100 },
  "f-mix-graphrag": { kind: "number", min: 0, max: 100 },
  "f-mix-agentic": { kind: "number", min: 0, max: 100 },
  "f-sv-model": { kind: "model" },
  "f-sv-ctx": { kind: "integer", min: 128, max: 10000000 },
  "f-sv-wquant": { kind: "enum" },
  "f-sv-runtime": { kind: "enum" },
  "f-sv-mode": { kind: "enum" },
  "f-sv-kvquant": { kind: "enum" },
  "f-sv-maxbatch": { kind: "integer", min: 1, max: 1000000 },
  "f-sh-gpu": { kind: "enum" },
  "f-rent-provider": { kind: "enum" },
  "f-rent-gpu": { kind: "enum" },
  "f-rent-util": { kind: "number", min: 1, max: 100 },
  "fb-feed": { kind: "enum" },
  "fb-model": { kind: "enum" },
  "fr-policy": { kind: "enum" },
  "fr-blend": { kind: "number", min: 0, max: 100 },
  "fr-failshare": { kind: "number", min: 0, max: 1 },
  "fr-failrate": { kind: "number", min: 0, max: 100 },
});

function controlValues(id) {
  return [...($(id)?.options ?? [])].map((option) => option.value).filter((value) => value !== "");
}

function chatValidationContext() {
  const fields = Object.fromEntries(Object.entries(CHAT_FIELD_CONTRACTS).map(([id, contract]) => {
    const spec = { ...contract };
    if (spec.kind === "model") spec.values = new Set((state.servingData?.models ?? []).map((model) => model.id));
    if (spec.kind === "enum") spec.values = controlValues(id);
    return [id, spec];
  }));
  return { fields };
}

function controlLabel(id) {
  const control = $(id);
  return control?.labels?.[0]?.textContent?.trim() || id;
}

function controlDisplay(id, value = $(id)?.value ?? "") {
  const control = $(id);
  if (control?.tagName === "SELECT") {
    const option = [...control.options].find((row) => row.value === value);
    if (option) return `${option.textContent.trim()} [${value}]`;
  }
  return String(value);
}

function renderChatTranscript() {
  const transcript = $("ai-transcript");
  transcript.innerHTML = chatState.transcript.map((message) => `<div class="ai-message" data-role="${escapeHtml(message.role)}"><span class="who">${message.role === "user" ? "You" : "Planning assistant"}</span>${escapeHtml(message.text)}</div>`).join("");
  transcript.scrollTop = transcript.scrollHeight;
}

function appendChat(role, text) {
  const message = String(text ?? "").trim();
  if (!message) return;
  chatState.transcript.push({ role, text: message });
  if (chatState.transcript.length > 40) chatState.transcript.splice(0, chatState.transcript.length - 40);
  renderChatTranscript();
}

function renderChatSuggestions(suggestions = []) {
  chatState.suggestions = suggestions.slice(0, 4);
  $("ai-suggestions").innerHTML = chatState.suggestions.map((suggestion, index) => `<button type="button" class="ai-suggestion" data-ai-suggestion="${index}">${escapeHtml(suggestion)}</button>`).join("");
}

function setPlannerReady(ready) {
  if ($("ai-apply")) $("ai-apply").disabled = !ready || chatState.busy || !chatState.pendingProposal;
  if ($("ai-send")) $("ai-send").disabled = !ready || chatState.busy;
  if ($("ai-request-spec")) $("ai-request-spec").disabled = !ready || !plannerState.blueprint || chatState.busy;
  $("ai-ready-note").textContent = ready
    ? (chatState.busy ? "Waiting for MiniMax. You can cancel this request." : "Ready. Send is explicit; proposals change nothing until you press Apply.")
    : "Loading calculator data. Send and Apply stay locked until the cited inputs are ready.";
}

function setChatBusy(busy) {
  chatState.busy = busy;
  $("ai-cancel").hidden = !busy;
  $("ai-message").disabled = busy;
  $("ai-progress").textContent = busy ? "CONTACTING MINIMAX" : chatState.pendingProposal ? "REVIEW PROPOSAL" : plannerState.applied ? "APPLIED" : "LOCAL FIRST";
  setPlannerReady(state.ready);
}

function dismissProposal() {
  chatState.pendingProposal = null;
  $("ai-proposal").hidden = true;
  $("ai-proposal-summary").textContent = "";
  $("ai-proposal-rows").innerHTML = "";
  $("ai-progress").textContent = plannerState.applied ? "APPLIED" : "LOCAL FIRST";
  setPlannerReady(state.ready);
}

function renderProposal(proposal) {
  chatState.pendingProposal = proposal;
  $("ai-proposal-summary").textContent = proposal.summary;
  $("ai-proposal-rows").innerHTML = proposal.changes.map((change) => `<tr><td>${escapeHtml(controlLabel(change.field))}</td><td>${escapeHtml(controlDisplay(change.field))}</td><td>${escapeHtml(controlDisplay(change.field, change.value))}</td><td>${escapeHtml(change.reason)}</td></tr>`).join("");
  $("ai-proposal").hidden = false;
  $("ai-progress").textContent = "REVIEW PROPOSAL";
  setPlannerReady(state.ready);
  $("ai-proposal").focus?.();
}

function compactLedger(result) {
  if (!result) return null;
  const ledger = buildComponentLedger(result);
  const recurring = Object.fromEntries(Object.entries(ledger.recurring ?? {}).map(([key, row]) => [key, {
    label: row.label,
    priced: row.priced,
    recurring_total: row.recurring_total,
    one_time: row.one_time,
    horizon_total: row.horizon_total,
    formula: row.formula,
  }]));
  return {
    schema: ledger.schema,
    currency_contract: ledger.currency_contract,
    demand: ledger.demand,
    sizing: ledger.sizing,
    recurring,
    capex: ledger.capex,
    power: ledger.power,
    subscription: ledger.subscription,
    routing: ledger.routing,
    commercial_overlay: ledger.commercial_overlay,
    exclusions: ledger.exclusions,
    freshness: ledger.freshness,
    formulas: ledger.formulas,
  };
}

function chatSystemPrompt(intent = "interview") {
  const fields = Object.keys(CHAT_FIELD_CONTRACTS).map((id) => ({
    id,
    label: controlLabel(id),
    value: $(id)?.value ?? "",
    allowed_values: CHAT_FIELD_CONTRACTS[id].kind === "enum" || CHAT_FIELD_CONTRACTS[id].kind === "model" ? controlValues(id) : undefined,
  }));
  const context = {
    request_mode: intent,
    current_controls: fields,
    model_candidates: (state.servingData?.models ?? []).slice(0, 32).map((model) => ({
      id: model.id,
      label: model.label ?? model.name ?? model.id,
      params_b: model.params_b,
      active_params_b: model.active_params_b,
      context_default: model.context_default,
      architecture: model.architecture,
    })),
    source_envelopes: state.manifest?.sources ?? {},
    deterministic_blueprint: plannerState.blueprint?.text ?? null,
    deterministic_component_ledger: compactLedger(state.result),
  };
  let encoded = JSON.stringify(context);
  if (encoded.length > 9500) {
    context.model_candidates = context.model_candidates.slice(0, 12);
    if (context.deterministic_component_ledger) {
      const ledger = context.deterministic_component_ledger;
      context.deterministic_component_ledger = {
        schema: ledger.schema,
        currency_contract: ledger.currency_contract,
        demand: ledger.demand,
        sizing: ledger.sizing,
        recurring: ledger.recurring,
        exclusions: ledger.exclusions,
        freshness: ledger.freshness,
        formulas: ledger.formulas,
      };
    }
    encoded = JSON.stringify(context);
  }
  return [
    "You are the specialized Factor IO local-LLM planning assistant.",
    "Return exactly one structured tool call and no free-form answer.",
    intent === "spec"
      ? "The user explicitly requested the post-Apply specification. Call present_local_llm_spec, grounded in the deterministic blueprint and component ledger."
      : "Interview naturally one concise question at a time with ask_user. When enough is known, call propose_calculator_changes with a complete planning_profile and only allowed current controls.",
    "Prefer a local-first Nutanix design. For every Nutanix-specific component, name a portable Kubernetes or Linux-VM equivalent.",
    "Treat model selection as an evaluation candidate, never a guarantee. Use only model IDs and enum values present in CURRENT_CONTEXT.",
    "Never invent or calculate prices, savings, licences, benchmarks or capacity. Explain costs only by citing deterministic ledger paths and their supplied values/formulas.",
    "Never request or propose credentials, endpoints, HTML, direct control mutation or unsupported fields. The user must preview and explicitly Apply every proposal.",
    "CURRENT_CONTEXT",
    encoded,
  ].join("\n");
}

function localLlmSpecText(spec) {
  const section = (heading, rows) => [heading.toUpperCase(), ...(rows ?? []).map((row) => `- ${row}`), ""];
  return [
    spec.title,
    "",
    spec.summary,
    "",
    "COMPONENTS",
    ...spec.components.flatMap((component) => [
      `- ${component.name}`,
      `  Nutanix: ${component.nutanix}`,
      `  Portable: ${component.portable}`,
      `  Why: ${component.why}`,
    ]),
    "",
    ...section("Workflow", spec.workflow),
    ...section("Security", spec.security),
    ...section("Operations", spec.operations),
    ...section("Evaluation", spec.evaluation),
    ...section("Rollout", spec.rollout),
    ...section("Cost components", spec.component_explanations.map((row) => `${row.ledger_path}: ${row.explanation}`)),
    ...section("Assumptions", spec.assumptions),
    ...section("Open decisions", spec.open_decisions),
  ].join("\n").trim();
}

function renderLocalLlmSpec(refinement) {
  const spec = refinement?.spec;
  if (!spec) {
    $("ai-refinement-text").textContent = refinement?.text ?? "";
    return;
  }
  const list = (heading, rows) => rows.length ? `<section><h4>${escapeHtml(heading)}</h4>${rows.map((row) => `<p>${escapeHtml(row)}</p>`).join("")}</section>` : "";
  $("ai-refinement-text").innerHTML = `<h3>${escapeHtml(spec.title)}</h3><p>${escapeHtml(spec.summary)}</p><div class="ai-spec-grid">${spec.components.map((component) => `<section><h4>${escapeHtml(component.name)}</h4><p><strong>Nutanix:</strong> ${escapeHtml(component.nutanix)}</p><p><strong>Portable:</strong> ${escapeHtml(component.portable)}</p><p>${escapeHtml(component.why)}</p></section>`).join("")}${list("Workflow", spec.workflow)}${list("Security", spec.security)}${list("Operations", spec.operations)}${list("Evaluation", spec.evaluation)}${list("Rollout", spec.rollout)}${list("Cost components", spec.component_explanations.map((row) => `${row.ledger_path}: ${row.explanation}`))}${list("Assumptions", spec.assumptions)}${list("Open decisions", spec.open_decisions)}</div>`;
}

function cancelChatRequest(message = "MiniMax request cancelled. The deterministic calculator and copyable request remain available.") {
  const cancelled = Boolean(chatState.abortController);
  chatFence.cancel();
  chatState.abortController?.abort();
  chatState.abortController = null;
  if (cancelled) {
    setChatBusy(false);
    if (message) appendChat("assistant", message);
    $("ai-model-status").textContent = message || "MiniMax request cancelled.";
  }
  return cancelled;
}

function clearPlannerOutput(message = "Apply a reviewed AI proposal to build a deployment blueprint.", { keepRefinement = false } = {}) {
  const refinement = keepRefinement ? plannerState.refinement : null;
  plannerState.refinement = refinement;
  plannerState.blueprint = null;
  plannerState.prompt = "";
  $("ai-blueprint").innerHTML = `<p class="muted">${escapeHtml(message)}</p>`;
  if (refinement) {
    refinement.stale = true;
    $("ai-refinement").hidden = false;
    $("ai-refinement").dataset.stale = "true";
    renderLocalLlmSpec(refinement);
    $("ai-copy-refinement").disabled = false;
    $("ai-workspace-status").textContent = "Calculator inputs changed. This MiniMax specification is stale; request a new explanation after the exact result rebuilds.";
  } else {
    $("ai-refinement").hidden = true;
    delete $("ai-refinement").dataset.stale;
    $("ai-refinement-text").textContent = "";
    $("ai-copy-refinement").disabled = true;
    $("ai-workspace-status").textContent = "The calculator remains authoritative for every number.";
  }
  $("ai-copy-blueprint").disabled = true;
  $("ai-copy-prompt").disabled = true;
  $("ai-download").disabled = true;
  $("ai-request-spec").disabled = true;
}

function applyPlannerAnswers() {
  if (!state.ready || chatState.busy || !chatState.pendingProposal) return;
  let proposal;
  try {
    proposal = validateCalculatorProposal(chatState.pendingProposal, chatValidationContext());
  } catch (error) {
    $("ai-model-status").textContent = `The proposal is no longer valid against the current controls: ${error.message}`;
    appendChat("assistant", "That proposal became stale after the calculator data changed. Please ask me to prepare it again.");
    dismissProposal();
    return;
  }
  const plan = buildPlannerPlan(proposal.planning_profile);
  applyWorkloadPreset(plan.presetId, { recompute: false });
  for (const [field, value] of Object.entries(plan.controlledFields)) {
    const control = $(field);
    if (control) control.value = value;
  }
  const modelChange = proposal.changes.find((change) => change.field === "f-sv-model");
  if (modelChange) {
    $("f-sv-model").value = modelChange.value;
    applyModelPreset(modelChange.value, { recompute: false });
  }
  for (const change of proposal.changes) {
    if (change.field !== "f-sv-model" && $(change.field)) $(change.field).value = change.value;
  }
  if (proposal.changes.some((change) => change.field === "f-rent-provider")) fillRentGpus();
  const rentGpu = proposal.changes.find((change) => change.field === "f-rent-gpu");
  if (rentGpu && controlValues("f-rent-gpu").includes(rentGpu.value)) $("f-rent-gpu").value = rentGpu.value;
  if (proposal.changes.some((change) => change.field === "f-rent-provider" || change.field === "f-rent-gpu")) renderRentNote();
  if (proposal.changes.some((change) => change.field === "f-sh-gpu")) fillServerConfigs();
  plannerState.answers = { ...proposal.planning_profile };
  plannerState.plan = plan;
  plannerState.applied = true;
  plannerState.refinement = null;
  $("ai-state").textContent = "Applied · reviewed proposal + local-first routing · assumptions remain editable";
  appendChat("assistant", "Applied the reviewed proposal once. The calculator is recomputing; inspect or override any assumption in the real controls.");
  dismissProposal();
  onLiveInput();
}

function currentPlannerContext() {
  const preset = state.workloadPresets?.presets?.find((row) => row.id === plannerState.plan?.presetId);
  const model = $("f-sv-model");
  return {
    presetLabel: preset?.label ?? "current",
    modelLabel: model?.selectedOptions?.[0]?.textContent?.trim() || model?.value || "",
  };
}

function renderPlannerBlueprint() {
  if (!plannerState.plan || !plannerState.applied) return;
  const context = currentPlannerContext();
  const blueprint = buildBlueprint(plannerState.plan, context);
  plannerState.blueprint = blueprint;
  plannerState.prompt = buildPrompt({ plan: plannerState.plan, blueprint, context });
  $("ai-blueprint").innerHTML = `${blueprint.warnings.map((warning) => `<p class="ai-boundary"><strong>Boundary</strong> ${escapeHtml(warning)}</p>`).join("")}
    <div class="ai-spec-grid">${blueprint.sections.map((section) => `<section><h4>${escapeHtml(section.heading)}</h4>${section.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</section>`).join("")}</div>`;
  $("ai-copy-blueprint").disabled = false;
  $("ai-copy-prompt").disabled = false;
  $("ai-download").disabled = false;
  $("ai-request-spec").disabled = !state.ready || chatState.busy;
  if (plannerState.refinement) {
    $("ai-refinement").hidden = false;
    renderLocalLlmSpec(plannerState.refinement);
    $("ai-copy-refinement").disabled = false;
    if (plannerState.refinement.stale) {
      $("ai-refinement").dataset.stale = "true";
      $("ai-workspace-status").textContent = "Calculator inputs changed. The specification below was generated against the previous scenario — ask MiniMax again after reviewing the rebuilt ledger.";
    } else {
      delete $("ai-refinement").dataset.stale;
      $("ai-workspace-status").textContent = `Structured specification from ${plannerState.refinement.model}. It explains cited deterministic components but never changes calculator arithmetic.`;
    }
  } else {
    $("ai-refinement").hidden = true;
    delete $("ai-refinement").dataset.stale;
    $("ai-refinement-text").textContent = "";
    $("ai-copy-refinement").disabled = true;
    $("ai-workspace-status").textContent = "Blueprint ready locally. Ask MiniMax only when you want a grounded implementation specification and cost-component explanation.";
  }
}

async function copyText(text) {
  if (!text) throw new Error("Nothing is ready to copy.");
  if (globalThis.navigator?.clipboard?.writeText) {
    try { await globalThis.navigator.clipboard.writeText(text); return; } catch { /* use the static-file fallback */ }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand?.("copy");
  area.remove();
  if (!copied) throw new Error("Clipboard access is unavailable. Select the displayed text and copy it manually.");
}

async function copyPlannerArtifact(kind) {
  const text = kind === "prompt"
    ? plannerState.prompt
    : kind === "refinement"
      ? plannerState.refinement?.text
      : plannerState.blueprint?.text;
  const status = $("ai-model-status");
  try {
    await copyText(text);
    status.textContent = kind === "prompt"
      ? "Prompt copied. Paste it into Ollama, LM Studio or another local model client."
      : kind === "refinement"
        ? `Specification copied.${plannerState.refinement?.stale ? " It was generated against the previous scenario." : ""}`
        : "Blueprint copied.";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function copyOfflineRequest() {
  try {
    await copyText(chatState.offlineArtifact?.copyText);
    $("ai-model-status").textContent = "Token-free request copied. Use an approved same-origin gateway, or transfer the system and user messages into Ollama or LM Studio.";
  } catch (error) {
    $("ai-model-status").textContent = error.message;
  }
}

function downloadPlannerBlueprint() {
  if (!plannerState.blueprint?.text) return;
  const blob = new Blob([plannerState.blueprint.text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "local-llm-blueprint.txt";
  link.click();
  URL.revokeObjectURL(link.href);
  $("ai-model-status").textContent = "Blueprint downloaded as plain text.";
}

function handleChatTool(result) {
  const { toolCall } = result;
  if (toolCall.name === "ask_user") {
    const ask = toolCall.arguments;
    appendChat("assistant", [ask.question, ask.rationale].filter(Boolean).join("\n\n"));
    renderChatSuggestions(ask.suggested_replies);
    return { status: "displayed", calculator_mutated: false };
  }
  if (toolCall.name === "propose_calculator_changes") {
    const proposal = toolCall.arguments;
    renderProposal(proposal);
    appendChat("assistant", [proposal.summary, proposal.question].filter(Boolean).join("\n\n"));
    renderChatSuggestions(proposal.suggested_replies);
    return { status: "previewed", calculator_mutated: false, awaiting_explicit_apply: true };
  }
  const spec = toolCall.arguments;
  const text = localLlmSpecText(spec);
  chatState.pendingSpec = spec;
  plannerState.modelAttempted = true;
  plannerState.refinement = { spec, text, model: result.model, stale: false };
  renderPlannerBlueprint();
  appendChat("assistant", `${spec.title}\n\n${spec.summary}\n\nThe structured specification and deterministic cost-component explanations are ready in the workspace.`);
  renderChatSuggestions([]);
  $("ai-progress").textContent = "SPEC READY";
  return { status: "displayed", calculator_mutated: false, deterministic_ledger_authoritative: true };
}

async function sendChatMessage(message = $("ai-message").value, { intent = "interview", clearComposer = true } = {}) {
  const text = String(message ?? "").trim();
  if (!state.ready || chatState.busy || !text) return;
  const systemPrompt = chatSystemPrompt(intent);
  try {
    chatState.offlineArtifact = buildOfflineRequest({
      endpoint: $("ai-endpoint").value,
      model: $("ai-model").value,
      history: chatState.history,
      systemPrompt,
      userMessage: text,
      pageUrl: location.href,
    });
    $("ai-copy-request").disabled = false;
  } catch (error) {
    $("ai-model-status").textContent = error.message;
    return;
  }
  if (clearComposer) $("ai-message").value = "";
  appendChat("user", text);
  renderChatSuggestions([]);
  const generation = chatFence.begin();
  const controller = new AbortController();
  chatState.abortController = controller;
  setChatBusy(true);
  $("ai-model-status").textContent = "Sending only after your explicit action. The token remains in this tab's memory.";
  try {
    const result = await requestChatTurn({
      endpoint: $("ai-endpoint").value,
      model: $("ai-model").value,
      token: $("ai-token").value,
      history: chatState.history,
      systemPrompt,
      userMessage: text,
      validationContext: chatValidationContext(),
      pageUrl: location.href,
      signal: controller.signal,
    });
    if (!chatFence.isCurrent(generation)) return;
    const toolResult = toolResultMessage(result.toolCall, handleChatTool(result));
    chatState.history.append({ user: result.user, assistant: result.assistantMessage, tools: [toolResult] });
    $("ai-model-status").textContent = `Structured ${result.toolCall.name} response received from ${result.model}. Review before any Apply.`;
  } catch (error) {
    if (!chatFence.isCurrent(generation) || error?.code === "aborted") return;
    appendChat("assistant", `${error.message}\n\nThe deterministic calculator is unchanged. You can copy the prepared token-free request for a same-origin gateway or local model client.`);
    $("ai-model-status").textContent = error.message;
  } finally {
    if (chatFence.isCurrent(generation)) {
      chatState.abortController = null;
      setChatBusy(false);
    }
  }
}

function setupPlanner() {
  $("ai-endpoint").value = MINIMAX_DEFAULTS.endpoint;
  $("ai-model").value = MINIMAX_DEFAULTS.model;
  $("ai-composer").addEventListener("submit", (event) => {
    event.preventDefault();
    void sendChatMessage();
  });
  $("ai-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      $("ai-composer").requestSubmit();
    }
  });
  $("ai-suggestions").addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-ai-suggestion]");
    if (!suggestion) return;
    $("ai-message").value = chatState.suggestions[Number(suggestion.dataset.aiSuggestion)] ?? "";
    $("ai-message").focus();
  });
  $("ai-cancel").addEventListener("click", () => cancelChatRequest());
  $("ai-apply").addEventListener("click", applyPlannerAnswers);
  $("ai-dismiss").addEventListener("click", dismissProposal);
  $("ai-copy-request").addEventListener("click", () => void copyOfflineRequest());
  $("ai-copy-blueprint").addEventListener("click", () => void copyPlannerArtifact("blueprint"));
  $("ai-copy-refinement").addEventListener("click", () => void copyPlannerArtifact("refinement"));
  $("ai-copy-prompt").addEventListener("click", () => void copyPlannerArtifact("prompt"));
  $("ai-download").addEventListener("click", downloadPlannerBlueprint);
  $("ai-request-spec").addEventListener("click", () => void sendChatMessage("Create the grounded local-LLM implementation specification now. Explain how each deterministic ledger component contributes to the THB result, without doing new arithmetic.", { intent: "spec", clearComposer: false }));
  for (const id of ["ai-endpoint", "ai-model"]) {
    $(id).addEventListener("input", () => {
      chatState.offlineArtifact = null;
      $("ai-copy-request").disabled = true;
    });
  }
  appendChat("assistant", "What should AI help your users do, and what data must stay inside your environment?");
  renderChatSuggestions([
    "An internal knowledge assistant for sensitive documents",
    "A customer-support copilot with human handoff",
    "A governed automation agent that can call tools",
    "Several teams need a shared local AI service",
  ]);
  clearPlannerOutput();
  setPlannerReady(false);
}

// A total travels as a Dec, a Rat, or a reduced "n/d" string — a non-terminating
// division keeps full precision instead of collapsing to a float. ONE parser, so
// what gets displayed and what gets RANKED can never disagree about a price.
const moneyValue = (x) => {
  if (x === null || x === undefined) return null;
  if (x instanceof Dec || x instanceof Rat) return x;
  const s = String(x);
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  return m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(s);
};
const groupDecimal = (value) => {
  const [whole, fraction] = String(value).split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
};
const money = (x) => {
  const v = moneyValue(x);
  return v === null || !state.fx ? "—" : `฿${groupDecimal(formatHalfUp(toTHB(v, state.fx), 2))}`;
};
const intInput = (id) => { const v = $(id).value.trim().replace(/[ _,]/g, ""); return v === "" ? null : Number(v); };
const decInput = (id) => { const v = $(id).value.trim(); return v === "" ? null : v; };
const thbToEngine = (value) => ratStr(toUSD(String(value), state.fx));
const engineMoneyInput = (id) => {
  const value = decInput(id);
  return value === null ? null : thbToEngine(value);
};
// formatHalfUp always emits the full scale, so a percent readout reads "90.0000"
// without this. The decimal point is therefore always present, which is what
// makes stripping the trailing zeros and then the bare point safe.
const trimDecimals = (s) => s.replace(/0+$/, "").replace(/\.$/, "");

// The screen speaks PERCENT; every engine below speaks fractions, and the
// contract that a share sums to exactly 1 (demand.js:validateMix) is unchanged.
// This is the single conversion point between the two, and it is exact.
//
// MULTIPLY BY 0.01 — do NOT "simplify" this to .div(Dec.from("100")). Dec.div
// truncates in BigInt (`q = n / d.c`, exact.js:79) BEFORE rescaling, so it only
// succeeds when the numerator already divides the denominator: 70/100 computes
// q = 0, fails its own exactness check and THROWS. Multiplication is pure scale
// arithmetic (coefficient unchanged, scale += 2), so it is exact for every
// input and cannot throw — 12.5% is 0.125, never 0.1250000000000001.
//
// A malformed entry is returned AS TYPED rather than thrown on: the engines
// raise a readable DemandRefusal for it, and converting here would replace that
// refusal with a bare Error the UI has no path to render. That fallback must
// stay unreachable for well-formed numbers — under div() it fired on nearly
// every one of them and handed a percent to the engine as if it were a
// fraction, silently multiplying the modelled load by 100.
const pctInput = (id) => {
  const v = decInput(id);
  if (v === null) return null;
  try { return Dec.from(v).mul(Dec.from("0.01")).toString(); } catch { return v; }
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const groupInt = (s) => { const n = Number(s); return Number.isFinite(n) ? n.toLocaleString("en-US") : String(s); };

// Provenance popover — every rendered number is clickable into this.
const pop = $("pop");
document.addEventListener("click", (e) => {
  const t = e.target.closest(".src");
  if (!t) { pop.classList.remove("show"); return; }
  e.stopPropagation();
  const data = JSON.parse(t.dataset.prov);
  pop.innerHTML = `<h4>Provenance</h4>${data.rows.map((r) => `<div style="display:flex;justify-content:space-between;gap:10px"><span style="color:rgba(232,230,240,.5)">${escapeHtml(r[0])}</span><span style="font-family:ui-monospace,monospace">${escapeHtml(r[1])}</span></div>`).join("")}`;
  const rect = t.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 360) + window.scrollX + "px";
  pop.style.top = rect.bottom + window.scrollY + 6 + "px";
  pop.classList.add("show");
});

const prov = (rows) => `class="src" role="button" tabindex="0" aria-label="show provenance" data-prov='${JSON.stringify({ rows }).replaceAll("'", "")}'`;
function numProv(valueHtml, rows) { return `<span ${prov(rows)}>${valueHtml}</span>`; }

function showGap(msg) { $("gapbox").innerHTML = `<div class="gap"><strong>Data gap:</strong> ${msg}</div>`; }
function clearGap() { $("gapbox").innerHTML = ""; }

function renderBanner(fresh) {
  const b = $("banner");
  if (fresh.banner) {
    b.innerHTML = `<strong>${escapeHtml(fresh.banner.level)}</strong> — data past its freshness envelope from: ${fresh.banner.sources.map((s) => `${escapeHtml(s.source_id)} (observed ${s.observed_at.slice(0, 10)})`).join(", ")}. Numbers below cite the stale feed.`;
    b.classList.add("show");
  } else {
    b.classList.remove("show");
  }
}

// ---------------------------------------------------------- snapshot loading
async function init() {
  // Reload/reset must not inherit browser-restored form values. Dynamic fields
  // are subsequently derived by their own loaders, never replayed by id.
  for (const el of document.querySelectorAll(".rail input, .rail select")) {
    if (el.tagName === "INPUT") el.value = el.defaultValue;
    else el.selectedIndex = [...el.options].findIndex((o) => o.defaultSelected);
    if (el.tagName === "SELECT" && el.selectedIndex < 0) el.selectedIndex = 0;
  }
  setupPlanner();
  setupSliders();
  document.querySelector(".rail").inert = true;
  // UTC hour selector: the quote instant is a DECLARED input (determinism),
  // never silently wall-clock.
  const sel = $("f-utc");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (let h = 0; h < 24; h++) {
    const opt = document.createElement("option");
    const iso = `${today}T${String(h).padStart(2, "0")}:00:00Z`;
    opt.value = iso;
    opt.textContent = `${String(h).padStart(2, "0")}:00 UTC${h === now.getUTCHours() ? " (now)" : ""}`;
    sel.appendChild(opt);
  }
  sel.value = `${today}T${String(now.getUTCHours()).padStart(2, "0")}:00:00Z`;

  try {
    state.manifest = await loadManifest();
    const localManifest = state.manifest;
    const [catalogResult, fallbackFxResult, openRouterResult, liveFxResult] = await Promise.allSettled([
      resolveResource(localManifest, "catalog"),
      loadFx(localManifest),
      fetchOpenRouterModels(),
      fetchLiveFx(),
    ]);
    if (catalogResult.status !== "fulfilled") throw catalogResult.reason;
    if (fallbackFxResult.status !== "fulfilled") throw fallbackFxResult.reason;
    state.catalog = catalogResult.value;
    state.fx = normalizeFxDocument(fallbackFxResult.value, { integrity: "digest-pinned" });
    if (openRouterResult.status === "fulfilled") {
      const live = compileLiveOpenRouter(openRouterResult.value);
      const replacement = replaceCatalogSource(state.manifest, state.catalog, live);
      state.manifest = replacement.manifest;
      state.catalog = replacement.catalog;
    } else {
      state.liveFailures.openrouter = String(openRouterResult.reason?.message ?? openRouterResult.reason ?? "live fetch failed");
    }
    if (liveFxResult.status === "fulfilled") {
      state.fx = liveFxResult.value;
      state.manifest = {
        ...state.manifest,
        sources: {
          ...state.manifest.sources,
          fx: {
            source_id: "fx",
            status: "fresh",
            observed_at: `${state.fx.observed_at}T00:00:00.000Z`,
            last_success_at: new Date().toISOString(),
            expires_at: state.fx.expires_at,
            record_count: 1,
            origin: "live",
            integrity: state.fx.integrity,
          },
        },
      };
    } else {
      state.liveFailures.fx = String(liveFxResult.reason?.message ?? liveFxResult.reason ?? "live fetch failed");
    }
    renderBanner(freshnessView(state.manifest, Date.now()));
    await loadGpuPricing();
    await loadPowerData();
    await loadServingModels();
    await loadServerPricing();
    await loadSubscriptions();
    await wireInputs();
    await loadWorkloadPresets();
    // Server defaults need the completed example's fleet, not the first price
    // row's GPU count. Live-input batching must not decide initialization order.
    try {
      const { demand, peak, sizing } = computeDemand();
      state.demand = { demand, peak, sizing };
    } catch (e) {
      // A loaded example can be unsizable. Let run() explain the refusal after
      // readiness, so changing model, hardware or demand can still recover.
      state.demand = null;
      console.warn("initial sizing unavailable; using the default server fallback", e);
    }
    // Choose the accelerator the way a buyer would: the cheapest box that
    // actually HOLDS this load, ranked across every accelerator rather than
    // within whichever one loadGpuPricing defaulted to. Without this the owned
    // option is priced on the cheapest h100 NODE — $165,000 for 4 GPUs — even
    // when the load needs one GPU and fits a $53,333 2x workstation, which made
    // owning look like a rack purchase in every scenario.
    //
    // It runs HERE for two reasons: this is the only point where the peak
    // already exists (state.demand, just above) and the node has not been
    // chosen yet (fillServerConfigs, just below); and init is still
    // pre-state.ready, so the pick can never overwrite a user's own selection.
    if (state.demand) {
      try {
        const box = cheapestBoxForLoad({
          gpuIds: [...$("f-sh-gpu").options].map((o) => o.value),
          servers: state.serverPricing?.rows ?? [],
          priceBasis: $("f-srv-basis").value,
          // Each candidate is sized on ITS OWN accelerator — the same rule
          // buildScenario applies to the rented lane. Sizing every candidate on
          // the selected card would rank them by price at one card's throughput.
          sizeFor: (gpuId) => Math.max(1, Number(gpusForLoad({
            peakTokensPerSecond: state.demand.peak.peak_tokens_s.text,
            gpuId,
            serving: solveServingFor(gpuId),
          }).gpus_required.text)),
        });
        state.boxPick = box;
        if (box.best && box.best.gpu_id !== $("f-sh-gpu").value) {
          $("f-sh-gpu").value = box.best.gpu_id;
          // Re-derive against the accelerator just chosen. fillServerConfigs
          // picks the node from state.demand.sizing, and that count was solved
          // for the PREVIOUS card — a 1-GPU h100 answer would buy a 1x
          // workstation for a load that needs two of those cards.
          const { demand, peak, sizing } = computeDemand();
          state.demand = { demand, peak, sizing };
        }
      } catch (e) {
        // A pick that cannot be made is not a reason to show no numbers — the
        // previous default still prices a real, cited box.
        state.boxPick = null;
        console.warn("cheapest-box pick unavailable; keeping the default accelerator", e);
      }
    }
    $("f-srv-config").value = "";
    fillServerConfigs();
    // Collapse the rail LAST: every dynamic control (the model list, the server
    // configs, the rented accelerators, the attention-layer groups) exists by
    // now, so one pass enhances all of them. Running it earlier would leave
    // whatever loaded afterwards as a raw input beside the collapsed lines.
    enhanceRail();
    // Land on an answer, not an empty column. The default preset is a complete,
    // labelled scenario, so the first thing the screen shows is a worked example
    // the user edits — not a form they must fill before anything happens.
    state.ready = true;
    setPlannerReady(true);
    flushLiveInput();
  } catch (e) {
    invalidateResults("Example unavailable — reload to retry.");
    showGap(`the pricing snapshot could not be loaded (${escapeHtml(e.message)}). The calculator shows no numbers without its cited data.`);
    console.error("calculator initialization failed", e);
  } finally {
    document.querySelector(".rail").inert = false;
  }
}

// ------------------------------------------------------- GPU pricing registry
// Populates BOTH the self-hosted accelerator picker (which needs the hardware
// identity) and the rented-GPU provider/accelerator pickers (which need the
// rate). Every rented rate renders its confidence tier at the point of use —
// an indicative aggregator figure is never displayed as if it were a vendor quote.
async function loadGpuPricing() {
  const res = await fetch("./tco-calculator/data/gpu-pricing.json");
  if (!res.ok) throw new Error(`gpu-pricing.json ${res.status}`);
  state.gpuPricing = await res.json();

  const gpus = state.gpuPricing.gpus ?? {};
  const seen = [...new Set(state.gpuPricing.rows.map((r) => r.gpu_id))].sort();
  $("f-sh-gpu").innerHTML = seen
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(gpus[id]?.label ?? id)}</option>`)
    .join("");
  $("f-sh-gpu").value = seen.includes("h100") ? "h100" : seen[0];

  const provs = Object.entries(state.gpuPricing.providers ?? {})
    .sort((a, b) => (a[1].confidence === b[1].confidence ? a[1].label.localeCompare(b[1].label) : a[1].confidence === "first_party" ? -1 : 1));
  $("f-rent-provider").innerHTML = provs
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label)} — ${escapeHtml(v.confidence)}</option>`)
    .join("");
  $("f-rent-provider").value = provs.find(([, v]) => v.confidence === "first_party")?.[0] ?? provs[0]?.[0];

  fillRentGpus();
}

async function loadPowerData() {
  const res = await fetch("./tco-calculator/data/power-seed.json");
  if (!res.ok) throw new Error(`power-seed.json ${res.status}`);
  state.powerSeed = await res.json();
  configurePowerSeed(state.powerSeed);
}

// ─────────────────────────────────────────── v0.5 server capex + licence layer

// Server configurations are keyed to the SAME gpu ids as gpu-pricing.json, so the
// picker re-fills whenever the accelerator changes. An accelerator with no
// published node price yields an empty list and a stated gap — never a borrowed
// price from a neighbouring card.
async function loadServerPricing() {
  const res = await fetch("./tco-calculator/data/server-pricing.json");
  if (!res.ok) throw new Error(`server-pricing.json ${res.status}`);
  state.serverPricing = await res.json();
  // loadGpuPricing builds the accelerator picker from the RENT rows, so an
  // accelerator with no rental market anywhere never appears in it — and its
  // capex rows, board power and bandwidth become unreachable data. The
  // workstation-class RTX PRO 6000 is exactly that: a card you buy, never one
  // you rent. Anything the capex registry can PRICE is self-hostable by
  // definition, so the two sets are unioned here.
  // This lives in loadServerPricing because init() loads gpu pricing BEFORE
  // server pricing — the server rows do not exist yet when the picker is first
  // built. Moving it into loadGpuPricing requires reordering init.
  const shSel = $("f-sh-gpu");
  const gpuLabels = state.gpuPricing?.gpus ?? {};
  const keepSelected = shSel.value;
  const offerable = [...new Set([
    ...[...shSel.options].map((o) => o.value),
    ...state.serverPricing.rows.map((r) => r.gpu_id),
  ])].sort();
  shSel.innerHTML = offerable
    .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(gpuLabels[id]?.label ?? id)}</option>`)
    .join("");
  shSel.value = keepSelected;
  // The server list is keyed to the accelerator, so it must re-fill when the
  // accelerator changes — otherwise an H100 node stays selected against a B200
  // fleet and prices the wrong hardware.
  fillServerConfigs();
}

function fillServerConfigs() {
  const gpuId = $("f-sh-gpu").value;
  const rows = serversForGpu(gpuId, state.serverPricing?.rows ?? []);
  const sel = $("f-srv-config");
  const previous = sel.value;
  sel.innerHTML = [`<option value="">— none (enter the hardware cost yourself) —</option>`]
    .concat(rows.map((r) => {
      const n = `${r.gpu_count}&times;`;
      const flag = r.verification?.status === "verified" ? "" : " ⚠";
      return `<option value="${escapeHtml(r.server_id)}">${n} ${escapeHtml(r.form_factor)} — ${money(r.usd_typical)}${flag}</option>`;
    }))
    .join("");
  // Keep the user's pick across an accelerator change when it still exists;
  // otherwise default to the cheapest config that holds the CURRENT fleet.
  if (previous && rows.some((r) => r.server_id === previous)) {
    sel.value = previous;
  } else if (rows.length) {
    const gpus = state.demand ? Number(state.demand.sizing.gpus_required.text) : rows[0].gpu_count;
    let pick = rows[0].server_id;
    try {
      const c = cheapestConfigFor({ gpuId, servers: state.serverPricing.rows, gpusRequired: Math.max(1, gpus), priceBasis: $("f-srv-basis").value });
      if (c.best) pick = c.best.server_id;
    } catch { /* fall through to the first row */ }
    sel.value = pick;
  } else {
    sel.value = "";
  }
}

const currentServerRow = () => (state.serverPricing?.rows ?? []).find((r) => r.server_id === $("f-srv-config").value) ?? null;

// The derived hardware capex for the sized fleet. An entered value in f-sh-capex
// OUTRANKS it — same basis contract as every other derived quantity (SPEC §2.4) —
// and the note says which of the two produced the number on screen.
// `publish` is FALSE for the sensitivity sweep. That grid reruns the whole
// pipeline at five other headcounts, so before this flag the LAST sweep row
// (x2 users) left ITS fleet in state — and the capex and licence notes then
// described a scenario the buyer never asked for while the totals directly
// below them priced the base one. The shared state belongs to the base
// scenario by definition; a sweep row only ever answers for itself.
function buildCapexPlan(gpusRequired, publish = true) {
  let plan = null;
  let gap = null;
  const server = currentServerRow();
  if (!server) {
    gap = serversForGpu($("f-sh-gpu").value, state.serverPricing?.rows ?? []).length === 0
      ? `no published integrated-node price for "${$("f-sh-gpu").value}" — enter the hardware cost yourself.`
      : `no server selected — enter the hardware cost yourself.`;
  } else {
    try {
      plan = nodesForFleet({ gpusRequired, server, priceBasis: $("f-srv-basis").value });
    } catch (e) {
      gap = e instanceof CapexRefusal ? e.message : String(e);
    }
  }
  if (publish) {
    state.capexPlan = plan;
    state.capexGap = gap;
  }
  return plan;
}

function buildPowerPlan(gpuId, capexPlan, gpuCount, publish = true) {
  let plan = null;
  let gap = null;
  try {
    const gpusProvisioned = capexPlan?.gpus_provisioned ?? gpuCount;
    plan = {
      ...runningCost({
        gpuId,
        gpusProvisioned,
        pue: decInput("f-power-pue") ?? "1.4",
        usdPerKwh: engineMoneyInput("f-power-rate") ?? thbToEngine("4"),
        nodeOverheadFraction: pctInput("f-power-overhead") ?? "0.2",
      }),
      fleet_basis: capexPlan ? "whole_node_provisioned" : "selected_gpu_count",
    };
  } catch (e) {
    if (!(e instanceof PowerRefusal)) throw e;
    gap = e.message;
  }
  if (publish) {
    state.powerPlan = plan;
    state.powerGap = gap;
  }
  return plan;
}

function renderPowerNote() {
  const el = $("f-power-note");
  if (!el) return;
  const entered = decInput("f-sh-fixed");
  const p = state.powerPlan;
  if (!p) {
    el.innerHTML = entered === null
      ? `${escapeHtml(state.powerGap ?? "running cost cannot be derived")} The self-hosted option is not costed until you enter a monthly figure.`
      : `Your entered running cost is in use. ${escapeHtml(state.powerGap ?? "The derived figure is unavailable.")}`;
    return;
  }
  const t = p.terms;
  const source = t.board_tdp_w.source_url
    ? `<a href="${escapeHtml(t.board_tdp_w.source_url)}" target="_blank" rel="noopener">source</a>`
    : "source unavailable";
  const derived = `${money(p.monthly_usd)} / month from ${p.gpus_provisioned} installed GPU${p.gpus_provisioned === 1 ? "" : "s"} × ${escapeHtml(t.board_tdp_w.value)}W <span class="tag tag-exact">published</span> (${source}), PUE ${escapeHtml(t.pue.value)} <span class="tag tag-est">assumed</span>, electricity ฿${escapeHtml(decInput("f-power-rate") ?? "4")}/kWh <span class="tag tag-est">assumed</span>, and ${escapeHtml(t.node_overhead_fraction.value)} non-GPU overhead <span class="tag tag-est">assumed</span>. Electricity only: rack/colocation, network/egress, staff, and support/maintenance are not included; add them to the monthly override.`;
  el.innerHTML = entered === null
    ? `Derived running cost: ${derived}`
    : `Your entered running cost is in use; derived comparison: ${derived}`;
}

async function loadSubscriptions() {
  const res = await fetch("./tco-calculator/data/subscription-pricing.json");
  if (!res.ok) throw new Error(`subscription-pricing.json ${res.status}`);
  state.subscriptions = await res.json();
  $("f-sub-row").innerHTML = state.subscriptions.rows
    .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`)
    .join("");
  $("f-sub-row").value = "none";
}

const currentSubRow = () => (state.subscriptions?.rows ?? []).find((r) => r.id === $("f-sub-row").value) ?? null;

// Both notes render the SAME two-part honesty the data files encode: what the
// number is, and how much authority it carries. A server price is never a vendor
// quote here, and a licence's meter is documented where its amount is not.
function renderServerNote() {
  const el = $("f-srv-note");
  if (!el) return;
  if (state.capexGap) { el.innerHTML = escapeHtml(state.capexGap); return; }
  const p = state.capexPlan;
  if (!p) { el.textContent = ""; return; }
  const entered = decInput("f-sh-capex") !== null;
  const waste = p.gpus_overprovisioned > 0
    ? ` You need ${p.gpus_required} GPU${p.gpus_required === 1 ? "" : "s"} and this buys ${p.gpus_provisioned}, so <strong>${p.gpus_overprovisioned}</strong> ${p.gpus_overprovisioned === 1 ? "is" : "are"} spare &mdash; a smaller node may fit better.`
    : "";
  // Two confidence tiers making DIFFERENT claims, so neither may borrow the
  // other's sentence. An `indicative` row reproduces a figure an integrator
  // actually published. A `derived_component` row has no published figure
  // behind it at all — it is CONSTRUCTED from a cited card price and a cited
  // GPU cost-share band — so it must name both inputs and must never claim a
  // published one. Rendering the constructed row through the indicative text
  // would assert a source that does not exist.
  const constructed = p.confidence === "derived_component" && p.derivation;
  const cited = Array.isArray(p.derived_from) ? p.derived_from : [];
  const link = (url, text) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
  // Three statuses, three different claims. Collapsing unreachable into "the
  // figure moved" turns a failed fetch on OUR side into an accusation about the
  // source — the one thing a provenance tier must never invent.
  const vstatus = p.verification?.status ?? null;
  const nCites = constructed && cited.length > 1 ? cited.length : 1;
  const checked = vstatus === "verified"
    ? `${nCites === 1 ? "citation" : "both citations"} re-checked at source`
    : vstatus === "citation_broken"
    ? `${nCites === 1 ? "the quoted figure is" : "a quoted figure is"} no longer at its source &mdash; treat with care`
    : vstatus === "unreachable"
    ? `the source could not be reached on the last check &mdash; a fact about that fetch, not about this figure`
    : `not re-checked at source`;
  // "constructed", not "derived": the basis sentence below already uses
  // "Derived" for the unrelated derived-vs-entered distinction.
  const cite = constructed
    ? `<span class="tag tag-est">constructed</span> not published &mdash; ${p.derivation.gpu_count} &times; ${money(p.derivation.card_usd)} of cards at a cited ${p.derivation.gpu_share_low_pct}&ndash;${p.derivation.gpu_share_high_pct}% GPU share of the build, ${checked}`
    : `<span class="tag tag-est">indicative</span> published integrator figure, ${checked}`;
  // A constructed figure links the inputs it was BUILT from, by role. Linking
  // only p.source_url would show one of the two and imply it published the node.
  const ROLE_LABEL = { card_price: "card price", gpu_cost_share: "GPU cost share" };
  const src = constructed && cited.length
    ? ` &middot; ${cited.map((c) => link(c.source_url, ROLE_LABEL[c.role] ?? c.role)).join(" &middot; ")}`
    : p.source_url ? ` &middot; ${link(p.source_url, "source")}` : "";
  const closing = constructed
    ? `No integrator publishes a price for this configuration, so this figure is built from its two cited inputs rather than quoted &mdash; the arithmetic is stated so you can falsify it.`
    : `No vendor publishes a list price for GPU servers, so this is a planning band, never a quote.`;
  const basis = entered
    ? `Your entered figure is in use; the derived one below is shown for comparison.`
    : `Derived, and overridable &mdash; type a figure to use your own quote.`;
  el.innerHTML = `${basis} <strong>${p.nodes} &times; ${escapeHtml(p.label)}</strong> at ${money(p.unit_price)} each = <strong>${money(p.capex)}</strong>.${waste} ${cite}${src}. ${closing}`;
}

// The meters whose quantity comes from the GPU fleet itself. Only these are
// affected by buying whole nodes; a seat or flat meter is not.
const GPU_FLEET_METERS = new Set(["per_gpu_ram_gb_year", "per_gpu_year", "per_accelerator_year", "per_gpu_hour"]);

// Several accelerators and appliances ship with a vendor licence already included,
// and the registry rows say which. Matching is by server_id and never by gpu_id:
// the H100 PCIe card carries a five-year NVIDIA AI Enterprise entitlement while the
// H100 SXM in an HGX node does not, and both are gpu_id "h100" — a gpu-level match
// would exempt the node that actually owes the licence.
function bundledExemptionFor(row) {
  const map = row?.bundled_server_ids;
  if (!map) return null;
  const server = currentServerRow();
  if (!server) return null;
  return map[server.server_id] ?? null;
}

function renderSubNote() {
  const el = $("f-sub-note");
  if (!el) return;
  const row = currentSubRow();
  if (!row || row.id === "none") { el.textContent = ""; return; }
  if (state.subGap) {
    const meterCite = row.meter_source_url
      ? ` The meter itself IS documented: <a href="${escapeHtml(row.meter_source_url)}" target="_blank" rel="noopener">${escapeHtml(row.vendor ?? "vendor")} states</a> &ldquo;${escapeHtml(String(row.meter_quote ?? "").slice(0, 180))}&rdquo;`
      : "";
    el.innerHTML = `${escapeHtml(state.subGap)}${meterCite}`;
    return;
  }
  const p = state.subPlan;
  if (!p) { el.textContent = ""; return; }
  const unitWord = {
    per_gpu_ram_gb_year: "GB of GPU memory across the fleet",
    per_gpu_year: "GPU", per_accelerator_year: "accelerator", per_gpu_hour: "GPU-hour",
    per_user_month: "user", per_vcpu_year: "vCPU", per_node_year: "node", flat_month: "month",
  }[p.meter] ?? p.meter;
  const meterTag = p.meter_confidence === "first_party"
    ? `<span class="tag tag-exact">meter: vendor-documented</span>`
    : `<span class="tag tag-est">meter: by definition</span>`;
  const priceTag = p.price_basis === "user_override"
    ? `<span class="tag tag-exact">price: your quote</span>`
    : `<span class="tag tag-est">price: indicative, not a vendor list price</span>`;
  const link = p.meter_source_url ? ` <a href="${escapeHtml(p.meter_source_url)}" target="_blank" rel="noopener">meter source</a>` : "";
  const applies = (p.applies_to ?? []).map((k) => OPTION[k]?.label ?? k).join(" and ");
  // Each option is metered on ITS OWN fleet, so each gets its own line. One
  // blended figure would read as the licence costing the same wherever you run
  // it, which is the claim the per-option quantity exists to disprove.
  const amountLine = (qty, monthly, oneTime) => {
    const once = moneyValue(oneTime).sign() > 0 ? ` plus ${money(oneTime)} once` : "";
    return `<strong>${groupInt(qty)}</strong> &times; ${escapeHtml(unitWord)} &rarr; <strong>${money(monthly)}/mo</strong>${once}`;
  };
  const per = p.by_option ?? {};
  const keys = Object.keys(per);
  const body = keys.length
    ? keys.map((k) => `${escapeHtml(OPTION[k]?.label ?? k)} &mdash; ${amountLine(per[k].quantity, per[k].monthly, per[k].one_time)}`).join("<br>")
    : `${amountLine(p.quantity, p.monthly, p.one_time)}, charged to ${escapeHtml(applies || "no option")}`;
  // The owned option is licensed on the GPUs the nodes physically carry. Where
  // that exceeds what the model needs, say so at the point the number is read —
  // it is the single most surprising figure on this line.
  const cp = state.capexPlan;
  const installedNote = cp && cp.gpus_overprovisioned > 0 && GPU_FLEET_METERS.has(p.meter)
    ? ` The owned figure counts all <strong>${cp.gpus_provisioned}</strong> GPUs installed in the ${cp.nodes} node${cp.nodes === 1 ? "" : "s"} you buy, not the ${cp.gpus_required} the model needs &mdash; both vendors meter installed GPUs, not used ones.`
    : "";
  // A licence some hardware already includes must not be charged twice. The row
  // documents its own exemptions; this is where the buyer actually sees them.
  const bundled = bundledExemptionFor(row);
  const bundledWarn = bundled
    ? ` <span class="tag tag-unknown">already bundled</span> ${escapeHtml(bundled)} Charging this row on top of that server double-counts the licence on the owned option &mdash; zero the price, or pick the row that matches what you are really buying.`
    : "";
  el.innerHTML = `${body} at ${money(p.unit_price)} per ${escapeHtml(unitWord)}.${installedNote} ${meterTag} ${priceTag}${link}${bundledWarn}`;
}

// Price the selected licence against the fleet. The quantity is DERIVED wherever
// the meter allows it — aggregate GPU RAM and per-GPU counts both come from the
// fleet this calculator already sized, so the licence re-prices when the fleet
// moves. Meters the calculator cannot model (vCPU, node, seat) take what they can
// from the demand model and are labelled as entered.
// `publish` follows the same rule as buildCapexPlan: only the base scenario
// owns the state the on-screen note is drawn from.
//
// The licence is priced against the fleet EACH OPTION actually runs, because those
// fleets are not the same one. Both vendor meters in the registry are explicit that
// they count GPUs INSTALLED — "every GPU installed on the server", "quantified
// across all GPUs in a cluster" — so the owned option is metered on the whole nodes
// it buys, while the rented option runs a different accelerator in a different count
// for metered hours. Charging one option's quantity to the other is a wrong number
// that looks right: the rented column would silently inherit the owned fleet's bill.
function buildSubPlan({ owned, rented, users }, publish = true) {
  let plan = null;
  let gap = null;
  const row = currentSubRow();
  if (row && row.id !== "none") {
    const perOption = { A: owned, B: {}, C: rented };
    const applies = Array.isArray(row.applies_to) ? row.applies_to : [];
    const priceOverride = engineMoneyInput("f-sub-price");
    const term = $("f-sub-term").value || null;
    try {
      const byOption = {};
      let primary = null;
      for (const k of applies) {
        const inputs = perOption[k];
        // An option this run does not price at all — no rented row, or the model
        // does not fit the rented accelerator — has no fleet to meter. It is
        // skipped rather than guessed; its totals already report as unpriced.
        if (!inputs) continue;
        const c = subscriptionCost({
          row,
          priceOverride,
          term,
          // The calculator models no vCPU count for licensing, so per_vcpu_year has
          // no source at all and refuses by naming the field it is missing.
          quantityInputs: { gpuHours: null, nodes: null, vcpus: null, ...inputs, users },
        });
        byOption[k] = {
          quantity: c.quantity,
          quantity_exact: c.quantity_exact,
          monthly: c.monthly,
          one_time: c.one_time,
        };
        if (primary === null) primary = c;
      }
      if (primary === null) {
        gap = `${row.label ?? row.id} applies to no option this comparison prices, so there is no fleet to meter it against.`;
      } else {
        // The top-level figures stay the FIRST applicable option's, for every
        // reader that wants one number; by_option is what the engine charges.
        plan = { ...primary, by_option: byOption };
      }
    } catch (e) {
      gap = e instanceof SubscriptionRefusal ? e.message : String(e);
    }
  }
  if (publish) {
    state.subPlan = plan;
    state.subGap = gap;
  }
  return plan;
}

function requireSubscriptionPrice(row, plan, reason) {
  if (row && row.id !== "none" && !plan) {
    throw new Error(`Platform licence is not priced: ${reason ?? "enter a valid price and term, or choose no platform subscription"}.`);
  }
}

// Option values are the registry ROW INDEX, never the gpu id. A provider
// routinely lists the same accelerator at several rates — different regions or
// instance families — and keying the option on gpu_id alone made every one of
// them resolve to the FIRST matching row: the user picked a $1.006 rate and was
// quoted $2.272791, silently. The sku is shown so the duplicates are tellable apart.
function fillRentGpus() {
  const p = $("f-rent-provider").value;
  const gpus = state.gpuPricing.gpus ?? {};
  const opts = state.gpuPricing.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.provider === p);
  $("f-rent-gpu").innerHTML = opts
    .map(({ r, i }) => `<option value="${i}">${escapeHtml(gpus[r.gpu_id]?.label ?? r.gpu_id)} — ${money(r.gpu_hourly_usd)}/GPU-hr · ${escapeHtml(r.sku)}</option>`)
    .join("");
  if (opts.length) $("f-rent-gpu").value = String(opts[0].i);
  renderRentNote();
}

function currentRentRow() {
  const v = $("f-rent-gpu").value;
  if (v === "") return null;
  const i = Number(v);
  const rows = state.gpuPricing?.rows ?? [];
  return Number.isInteger(i) && i >= 0 && i < rows.length ? rows[i] : null;
}

function renderRentNote() {
  const row = currentRentRow();
  if (!row) { $("f-rent-note").textContent = "no rate for this pairing"; return; }
  const tier = row.confidence === "first_party"
    ? `<span class="tag tag-exact">first-party</span> the vendor's own price list, fetched without credentials`
    : `<span class="tag tag-est">indicative</span> public aggregator — the vendor's own API is credential-gated, so this is an order-of-magnitude planning figure, not a quote`;
  const seeded = row.seeded ? " This row is <strong>seeded</strong> from a cited secondary source rather than fetched live." : "";
  const basis = row.source_basis ? ` ${escapeHtml(row.source_basis)}` : "";
  $("f-rent-note").innerHTML = `${escapeHtml(row.sku)} · ${money(row.gpu_hourly_usd)}/GPU-hr · ${tier}.${seeded}${basis} Observed ${escapeHtml(String(row.observed_at).slice(0, 10))}.`;
}

// ═════════════════════════════════════════ v0.3: the model being served
// The v0.2 calculator sized every fleet from one constant per accelerator,
// pinned at an ~8B-class model. What a GPU actually delivers is a function of
// the model on it — size, context, attention architecture, quantisation — so
// these controls are not a detail panel, they are the sizing input. See
// serving.js for the roofline and SPEC §6.6 for the formulas.

async function loadServingModels() {
  const res = await fetch("./tco-calculator/data/serving-models.json");
  if (!res.ok) throw new Error(`serving-models.json ${res.status}`);
  state.servingData = await res.json();
  const d = state.servingData;

  // Two provenance classes, and the difference is worth showing in the list
  // itself. A DERIVED row was read out of the model's own config.json by the
  // refresh command and has never been checked by a human; a CURATED row
  // reproduces a per-token KV figure published independently, which the test
  // suite asserts against exactly. Same engine and same arithmetic either way —
  // what differs is how much independent confirmation stands behind the inputs.
  const opt = (m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`;
  const grp = (label, rows) => (rows.length
    ? `<optgroup label="${escapeHtml(label)}">${rows.map(opt).join("")}</optgroup>` : "");
  const derivedRows = d.models.filter((m) => m.basis === "derived");
  const customRows = d.models.filter((m) => m.id === "custom");
  const curatedRows = d.models.filter((m) => m.basis !== "derived" && m.id !== "custom");
  $("f-sv-model").innerHTML =
    grp(`Current — from Hugging Face, ${d.provenance?.observed ?? "undated"}`, derivedRows) +
    grp("Verified against a published KV figure", curatedRows) +
    grp("Your own configuration", customRows);
  const optsFor = (obj, labelKey) => Object.entries(obj)
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.label ?? k)}</option>`).join("");
  $("f-sv-wquant").innerHTML = optsFor(d.weight_quantization);
  $("f-sv-kvquant").innerHTML = optsFor(d.kv_quantization);
  $("f-sv-runtime").innerHTML = optsFor(d.runtimes);
  $("f-sv-wquant").value = "bf16";
  $("f-sv-kvquant").value = "bf16";
  $("f-sv-runtime").value = "vllm";

  const selection = firstServableModelId(d);
  $("f-sv-model").value = selection.chosenId;
  applyModelPreset(selection.chosenId);
  const note = $("f-sv-selection-note");
  if (note && selection.passedOver) {
    const top = d.models.find((m) => m.id === selection.passedOver.id);
    note.innerHTML = `Opened on the first model that fits this accelerator. Top-ranked ${escapeHtml(top?.label ?? selection.passedOver.id)} was passed over because ${escapeHtml(selection.passedOver.reason)} <button class="btn btn-s" type="button" id="load-top-model">Load it anyway</button>`;
    $("load-top-model").addEventListener("click", () => {
      $("f-sv-model").value = selection.topRankedId;
      applyModelPreset(selection.topRankedId);
      note.textContent = "Top-ranked model loaded; any fit refusal is shown in the sizing result.";
    });
  } else if (note) {
    note.textContent = "Opened on the top-ranked model.";
  }
}

// The default selection must be a model that actually SERVES on the default
// accelerator. Derived rows sort by trendingScore, so `models[0]` tracks whatever
// is trending — and a frontier model is precisely the one that will not fit a
// single node. The 2026-09-02 refresh replaced glm-5-3-flash with the full
// glm-5-3 (1,506.7 GB of weights against 72.0 GB usable, refusing at every
// tensor-parallel size up to 16) and the calculator then opened on a refusal card
// with no numbers in the right-hand column at all — breaking init()'s own "land
// on an answer, not an empty column" contract. Nothing in the suite caught it,
// because every test picks its own model. Reverting the data would only hide it
// until the next refresh: the selection RULE is the defect.
//
// The fit is not re-derived here. Each candidate is applied and put through the
// SAME servingPlan the comparison uses, so this cannot drift from the engine's
// own answer. Registry order is preserved, so the default is still the newest
// preset — just the newest one that fits.
function firstServableModelId(d) {
  const gpuId = $("f-sh-gpu").value;
  const top = d.models.find((m) => m.id !== "custom") ?? d.models[0];
  let topReason = null;
  for (const m of d.models) {
    if (m.id === "custom") continue;
    // The SELECT must move with the fields. currentModelSpec() resolves the model
    // by f-sv-model, while applyModelPreset fills the numeric inputs.
    $("f-sv-model").value = m.id;
    applyModelPreset(m.id);
    let refusal = null;
    try {
      const plan = solveServingFor(gpuId);
      if (plan !== null) {
        return {
          chosenId: m.id,
          topRankedId: top.id,
          passedOver: m.id === top.id ? null : { id: top.id, reason: topReason ?? "no complete serving plan" },
        };
      }
      refusal = "the serving data is incomplete for this accelerator";
    } catch (e) {
      if (!(e instanceof ServingRefusal)) throw e;
      refusal = e.message;
    }
    if (m.id === top.id) topReason = refusal;
  }
  // Nothing serves. Fall back to the top row and let the refusal card say why.
  return { chosenId: top.id, topRankedId: top.id, passedOver: null };
}

// The four architectures the buyer named are a per-LAYER-GROUP property, and a real
// model can mix them: Gemma runs sliding and full layers together, Qwen3-Next runs
// GDN and full. So the editor is GENERATED from the chosen preset's own groups —
// one block each — rather than offering a single architecture dropdown that would
// silently flatten a hybrid into whichever kind happened to be picked. That
// flattening is the exact error the layer-group model exists to prevent.
const GROUP_KINDS = [
  ["full", "Full attention — every token retained"],
  ["sliding", "Sliding window — retains only its span"],
  ["linear", "Linear / GDN — no growing cache"],
  ["mla", "MLA — compressed latent cache"],
];

const gf = (i, k) => `f-g${i}-${k}`;

function groupFieldsHtml(i, g) {
  const num = (k, label, val, sub) => `
    <div class="f">
      <label for="${gf(i, k)}">${label}</label>
      <input id="${gf(i, k)}" type="text" inputmode="numeric" value="${escapeHtml(String(val ?? ""))}">
      <span class="sub">${sub}</span>
    </div>`;
  if (g.kind === "linear") {
    return `<p class="muted" style="margin:0">These layers carry a constant recurrent state, so they add <strong>0 bytes per token</strong> however long the context runs. That state itself is <span class="tag tag-unknown">unmodelled</span>, not assumed to be zero.</p>
      ${`<div class="row one">${num("layers", "Layers", g.layers, "How many layers in this group.")}</div>`}`;
  }
  if (g.kind === "mla") {
    return `<div class="row three">
      ${num("layers", "Layers", g.layers, "Layers in this group.")}
      ${num("lora", "KV latent rank", g.kv_lora_rank, "The compressed dimension actually stored.")}
      ${num("rope", "RoPE head dim", g.qk_rope_head_dim, "Carried uncompressed alongside it.")}
    </div>`;
  }
  return `<div class="row three">
      ${num("layers", "Layers", g.layers, "Layers in this group.")}
      ${num("heads", "KV heads", g.kv_heads, "Grouped-query models share these across attention heads.")}
      ${num("dim", "Head dim", g.head_dim, "Width of one head.")}
    </div>
    <div class="row${g.kind === "sliding" ? "" : " one"}">
      ${num("tensors", "Tensors per layer", g.tensors ?? 2, "2 for separate K and V; 1 when the layer unifies them.")}
      ${g.kind === "sliding" ? num("window", "Window (tokens)", g.window_tokens, "Past this span an old token leaves as a new one arrives, so these layers stop growing.") : ""}
    </div>`;
}

function renderArchGroups(groups) {
  state.archGroups = groups ?? [];
  const box = $("sv-groups");
  if (!box) return;
  // This innerHTML write destroys the group controls. If the sheet were holding
  // one, the node being edited would go with it; and the vaulted blocks sit
  // OUTSIDE this container, so they would survive the rewrite and leave two
  // elements sharing one id. Release both before the write, never after.
  releaseFields(box);
  box.innerHTML = state.archGroups.map((g, i) => `
    <div class="grp">
      <div class="glabel">Group ${i + 1}${state.archGroups.length > 1 ? ` of ${state.archGroups.length}` : ""}</div>
      <div class="row one">
        <div class="f">
          <label for="${gf(i, "kind")}">Attention type</label>
          <select id="${gf(i, "kind")}">${GROUP_KINDS.map(([k, l]) =>
            `<option value="${k}"${g.kind === k ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
        </div>
      </div>
      ${groupFieldsHtml(i, g)}
    </div>`).join("");

  // Delegated input handling also covers newly minted group controls.
  // Collapse the freshly built group fields. Skipped on the init pass, where
  // #field-vault does not exist yet; init's own enhanceRail() covers that.
  enhanceRail();
}

/**
 * Read the editor back into engine group shape.
 *
 * A blank or unparseable field falls back to the PRESET's value for that field
 * rather than propagating as a refusal: mid-typing states would otherwise blank the
 * whole comparison, and since v0.3 a refusal legitimately stops the sizing (§6.6.4).
 */
function readArchGroups() {
  const base = state.archGroups;
  if (!Array.isArray(base) || base.length === 0) return null;
  if (!$(gf(0, "kind"))) return null;
  return base.map((b, i) => {
    const n = (k, fallback) => {
      const v = intInput(gf(i, k));
      return v === null || !Number.isFinite(v) || v <= 0 ? fallback : v;
    };
    const kind = $(gf(i, "kind"))?.value ?? b.kind;
    const g = { kind, layers: n("layers", b.layers) };
    if (kind === "linear") return g;
    if (kind === "mla") {
      // Switching kind can ask for a field the preset group never had; the
      // engine's own count() would refuse, so a neutral 1 keeps the edit alive
      // and visible instead of blanking the screen mid-experiment.
      g.kv_lora_rank = n("lora", b.kv_lora_rank ?? 1);
      g.qk_rope_head_dim = n("rope", b.qk_rope_head_dim ?? 1);
      return g;
    }
    g.kv_heads = n("heads", b.kv_heads ?? 1);
    g.head_dim = n("dim", b.head_dim ?? 1);
    g.tensors = n("tensors", b.tensors ?? 2);
    if (kind === "sliding") g.window_tokens = n("window", b.window_tokens ?? null);
    return g;
  });
}

// Selecting a model fills the fields a user would otherwise have to look up in a
// config.json. Every one stays editable — the preset is a starting point, not a lock.
function applyModelPreset(id) {
  const m = state.servingData?.models.find((x) => x.id === id);
  if (!m) return;
  $("f-sv-params").value = m.params_b;
  $("f-sv-active").value = m.active_params_b;
  $("f-sv-ctx").value = String(m.context_default);
  $("f-sv-kvbytes").value = "";
  renderArchGroups(m.groups);
  onLiveInput();
}

// Which sentence describes this stack. Order matters: a hybrid is named by the
// property that changes the answer most, and "no growing cache at all" outranks
// "some layers slide", which outranks "everything is retained".
function archKeyOf(spec, preset) {
  if (spec?.kv_override) return preset?.architecture;
  const kinds = new Set((spec?.groups ?? []).map((g) => g.kind));
  if (kinds.has("linear")) return "gdn";
  if (kinds.has("mla")) return "mla";
  if (kinds.has("sliding")) return "sliding";
  if (kinds.has("full")) return "full";
  return preset?.architecture;
}

const ARCH_WORDS = {
  full: "Full attention — every layer keeps every token, so memory grows straight up with context.",
  sliding: "Sliding window — most layers only remember the last stretch of tokens, so long context stays affordable.",
  gdn: "Gated DeltaNet hybrid — most layers keep no growing cache at all, only the few full-attention ones do.",
  mla: "Latent attention — the cache is compressed before it is stored, so it stays small at long context.",
};

// The model spec actually handed to the engine: the preset's layer structure,
// with the user's own numbers on top.
function currentModelSpec() {
  const m = state.servingData?.models.find((x) => x.id === $("f-sv-model").value);
  if (!m) return null;
  const spec = {
    ...m,
    params_b: decInput("f-sv-params") ?? m.params_b,
    active_params_b: decInput("f-sv-active") ?? m.active_params_b,
  };
  // The architecture editor is authoritative over the preset when it is hydrated,
  // so an edited kind, layer count, window or MLA dimension reaches the engine.
  const edited = readArchGroups();
  if (edited) spec.groups = edited;
  const kvOverride = decInput("f-sv-kvbytes");
  if (kvOverride !== null) {
    // A flat bytes-per-token figure carries NO layer structure, so it cannot
    // express retention: a sliding window stops applying the moment you override.
    // Taken at the KV precision already selected, which is why the element size
    // passed alongside it is 1 — the user's number is the whole per-token cost.
    spec.groups = [{ kind: "full", layers: 1, tensors: 1, kv_heads: 1, head_dim: kvOverride }];
    spec.kv_override = true;
  }
  return spec;
}

// Solve the roofline for an ARBITRARY accelerator against the current model
// selection. Two distinct outcomes, and the difference matters downstream:
//   null  -> this accelerator has no published bandwidth, so the caller should
//            fall back to the v0.2 per-accelerator constant. Returning null
//            rather than throwing keeps such a provider IN the rented table.
//   throw -> ServingRefusal: the model genuinely does not fit at any TP size.
//            rentedGpuByProvider catches this and reports the provider as
//            unpriceable WITH the reason, which is the honest answer.
function solveServingFor(gpuId) {
  const d = state.servingData;
  if (!d) return null;
  const acc = d.accelerators?.[gpuId];
  const vramGb = state.gpuPricing?.gpus?.[gpuId]?.vram_gb;
  if (!acc || vramGb === undefined) return null;
  const model = currentModelSpec();
  if (!model) return null;

  const wq = d.weight_quantization[$("f-sv-wquant").value];
  const kq = d.kv_quantization[$("f-sv-kvquant").value];
  const rt = d.runtimes[$("f-sv-runtime").value];
  const interactive = $("f-sv-mode").value === "interactive";

  return servingPlan({
    model,
    contextTokens: decInput("f-sv-ctx") ?? model.context_default,
    bytesPerParam: wq.bytes_per_param,
    // An override is already the whole per-token cost (see currentModelSpec).
    kvBytesPerElement: model.kv_override ? "1" : kq.bytes_per_element,
    vramGb: String(vramGb),
    bandwidthGbS: acc.bandwidth_gb_s,
    runtimeEfficiency: rt.bandwidth_efficiency,
    tpEfficiency: d.tensor_parallel.efficiency_per_extra_gpu,
    vramOverheadFraction: d.vram_overhead_fraction.value,
    // In batch mode there is no floor to hold, so batch is bounded only by
    // memory — the classic throughput-vs-latency trade, made explicit.
    perStreamFloorTokS: interactive ? (decInput("f-tps-stream") ?? "30") : null,
    maxBatch: intInput("f-sv-maxbatch"),
  });
}

// The plan for the SELECTED self-hosted accelerator. Records the REASON on
// state.servingGap rather than throwing, because a model that does not fit is a
// normal answer the fit panel must render, not a crash.
function buildServingPlan() {
  state.serving = null;
  state.servingGap = null;
  state.servingRefusal = null;
  if (!state.servingData) return null;
  const gpuId = $("f-sh-gpu").value;
  try {
    const p = solveServingFor(gpuId);
    if (!p) {
      state.servingGap = `no memory-bandwidth figure is published here for "${gpuId}", so the fleet falls back to the per-accelerator planning constant instead of this model.`;
      return null;
    }
    state.serving = p;
    return p;
  } catch (e) {
    // The two outcomes are NOT interchangeable, and collapsing them was a real
    // defect: a null above means the DATA is missing, which SPEC §6.6.6 says the
    // v0.2 constant legitimately covers; a ServingRefusal means the model does not
    // physically fit, which §6.6.4 says is "never a silent fallback". The refusal
    // is recorded here and re-raised by computeDemand, so an impossible fleet is
    // not priced — only a measured figure, which outranks the roofline, may pass it.
    if (e instanceof ServingRefusal) {
      state.servingGap = e.message;
      state.servingRefusal = e;
      return null;
    }
    state.servingGap = `serving model error — ${e.message}`;
    return null;
  }
}

function renderServingNote() {
  const d = state.servingData;
  const m = d?.models.find((x) => x.id === $("f-sv-model").value);
  if (!m) return;
  const spec = currentModelSpec();
  let kvText = "—";
  try {
    const kq = d.kv_quantization[$("f-sv-kvquant").value];
    const bytes = kvBytesPerToken(spec.groups, spec.kv_override ? "1" : kq.bytes_per_element);
    kvText = `${groupInt(formatHalfUp(bytes, 0))} B/token`;
  } catch { kvText = "not computable from this configuration"; }

  const moe = spec && Number(spec.active_params_b) < Number(spec.params_b)
    ? ` Mixture-of-experts: all ${escapeHtml(String(spec.params_b))}B sit in memory, only ${escapeHtml(String(spec.active_params_b))}B are read per token.` : "";
  // Described from the groups ACTUALLY in play, not from the preset's label — an
  // edited architecture that still read "full attention" would be a lie on screen.
  $("sv-note").innerHTML = `${escapeHtml(ARCH_WORDS[archKeyOf(spec, m)] ?? "")} <strong>${escapeHtml(kvText)}</strong> of cache per token.${moe}`;

  // The claim on screen must match the provenance the row actually has. A derived
  // row was read by a script minutes ago and checked by nobody; saying it was
  // "verified" would be the kind of borrowed confidence this calculator exists to
  // refuse, and it is exactly the sentence a buyer would quote back.
  let cite;
  if (m.basis === "derived") {
    const activeWords = m.active_params_basis === "declared"
      ? `Active parameters are the vendor's own figure from the model name.`
      : m.active_params_basis === "derived"
        ? `Active parameters are <span class="tag tag-est">computed</span> from the config's expert geometry — no vendor figure was published, and the computation was accepted only because it reproduced the Hub's total parameter count to within 2%.`
        : `Every parameter is read each step; this model has no routed experts.`;
    cite = `<span class="tag tag-est">config-derived</span> Layer structure read automatically from <a href="${escapeHtml(m.config_url ?? m.source_url)}" rel="nofollow noopener">the model's own config.json</a> on ${escapeHtml(String(m.observed_at ?? "an unrecorded date"))}, and parameter counts from <a href="${escapeHtml(m.source_url)}" rel="nofollow noopener">its safetensors index</a>. No independently published per-token KV figure exists for this model, so unlike the verified presets nothing cross-checks the arithmetic below against an outside source. ${activeWords}`;
  } else if (m.source_url) {
    cite = `<span class="tag tag-exact">verified</span> Layer structure cited from <a href="${escapeHtml(m.source_url)}" rel="nofollow noopener">the published architecture</a>, verified against the model's own config, and its published per-token KV figure is asserted exactly by the test suite.`;
  } else {
    cite = `Nothing in this preset is cited — it is a starting shape for your own numbers.`;
  }
  const ovr = spec?.kv_override
    ? ` <span class="tag tag-est">override active</span> Your bytes-per-token figure replaces the layer structure, so window-based retention no longer applies and the figure is taken at the precision you already chose.`
    : "";
  $("sv-arch-note").innerHTML = `${cite}${ovr} ${escapeHtml(m.note ?? "")}`;
}

// The fit panel — the answer to "will this even run, and how fast".
function renderFitPanel() {
  const p = state.serving;
  const box = $("fit");
  if (!p) {
    // What happens NEXT differs by which of the two outcomes this is, so the panel
    // must not promise a fallback comparison that a refusal now correctly stops.
    const overridden = state.sizingBasis === "user_override";
    const after = state.servingRefusal
      ? overridden
        ? "Your measured tok/s per GPU outranks the model, so the comparison below still runs on it. Clear that field and the comparison stops rather than pricing a fleet that cannot hold the model."
        : "The comparison below does not run: sizing a fleet that cannot hold this model would put a price on a configuration you cannot buy."
      : "The comparison below still runs on the per-accelerator planning constant.";
    box.innerHTML = state.servingGap
      ? `<div class="card"><h3>Fit &amp; speed</h3><div class="gap"><strong>This configuration does not serve:</strong> ${escapeHtml(state.servingGap)}</div>
         <p class="muted">Try a smaller model, a lower precision, a shorter context, or a bigger accelerator. ${escapeHtml(after)}</p></div>`
      : "";
    return;
  }
  const gpuLabel = $("f-sh-gpu").selectedOptions[0]?.textContent ?? "";
  const d = state.servingData;
  const rtKey = $("f-sv-runtime").value;
  const rows = [
    ["formula", "t_step = (weights_read + batch x kv_per_seq) / (gpus x bandwidth x efficiency)"],
    ["weights read per step", `${p.weights_gb_read_per_step.text} GB`],
    ["weights resident", `${p.weights_gb_resident.text} GB`],
    ["KV per sequence", `${p.kv_gb_per_sequence.text} GB`],
    ["KV per token", `${groupInt(p.kv_bytes_per_token.text)} B`],
    ["bandwidth", `${d.accelerators[$("f-sh-gpu").value]?.bandwidth_gb_s ?? "—"} GB/s x ${d.runtimes[rtKey].bandwidth_efficiency} efficiency`],
    ["tensor parallel", `${p.gpus_per_replica}`],
    ["batch limited by", p.batch_bound_by],
    ["basis", "modelled from a bandwidth roofline — decode only, prefill not counted"],
  ];
  const tight = Number(p.batch.text) <= 2;
  return void (box.innerHTML = `<div class="card">
    <h3>Fit &amp; speed <span class="tag tag-est">modelled</span>${
      state.sizingBasis === "user_override"
        ? ` <span class="tag tag-unknown">did not size the fleet</span>`
        : ""}</h3>${
      state.sizingBasis === "user_override"
        ? `<p class="muted" style="margin:0 0 9px">Your measured tok/s per GPU outranks the model, so the numbers below describe what the roofline predicts &mdash; the fleet and the costs were sized from your figure.</p>`
        : ""}
    <div class="kpi">
      <div><label>Fits on</label><div class="v">${numProv(`${p.gpus_per_replica} &times; ${escapeHtml(gpuLabel)}`, rows)}</div></div>
      <div><label>VRAM used / usable</label><div class="v">${p.vram_gb_used_per_gpu.text} / ${p.vram_gb_usable_per_gpu.text} GB</div></div>
      <div><label>Requests at once</label><div class="v">${numProv(p.batch.text, rows)}</div></div>
      <div><label>Speed per user</label><div class="v">${p.per_stream_tokens_s.text} <span class="muted">tok/s</span></div></div>
      <div><label>Tokens/s per GPU</label><div class="v">${numProv(p.tokens_s_per_gpu.text, rows)}</div></div>
      <div><label>KV per request</label><div class="v">${p.kv_gb_per_sequence.text} <span class="muted">GB</span></div></div>
    </div>
    ${tight ? `<div class="gap"><strong>Only ${p.batch.text} request${p.batch.text === "1" ? "" : "s"} at a time.</strong> At this size and context there is almost no room left for concurrency, so throughput per GPU collapses. Shorter context or lower precision buys the most back.</div>` : ""}
    <p class="muted">Limited by <strong>${escapeHtml(p.batch_bound_by)}</strong>. Throughput is <span class="tag tag-est">assumed</span> — it rests on a stated bandwidth-efficiency figure, not a benchmark, and never backs a p95 verdict. Prefill is not modelled, so a long-prompt workload will run slower than this.</p>
  </div>`);
}

// ------------------------------------------------- level 0: workload presets
// Presets are PLANNING ASSUMPTIONS, never measurements. Selecting one fills
// exactly the inputs a user would otherwise type; every field stays editable.
async function loadWorkloadPresets() {
  const res = await fetch("./tco-calculator/data/workload-presets.json");
  state.workloadPresets = await res.json();
  const wrap = $("preset-cards");
  wrap.innerHTML = state.workloadPresets.presets.map((p) =>
    `<button type="button" class="chip" role="radio" aria-checked="false" data-preset="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
  ).join("");
  for (const b of wrap.querySelectorAll(".chip")) {
    b.addEventListener("click", () => applyWorkloadPreset(b.dataset.preset));
  }
  applyWorkloadPreset(state.workloadPresets.presets[0].id);
}

function applyWorkloadPreset(id, { recompute = true } = {}) {
  const p = state.workloadPresets.presets.find((x) => x.id === id);
  if (!p) return;
  for (const btn of $("preset-cards").querySelectorAll(".chip")) {
    btn.setAttribute("aria-checked", String(btn.dataset.preset === id));
  }
  // Per-workload token shapes come from the store's `defaults`, so a preset
  // changes WHO uses the system and in what mix, not what a turn costs.
  const shapes = state.workloadPresets.defaults?.shapes ?? {};
  for (const [type, field] of Object.entries(MIX_FIELD)) {
    const s = shapes[type];
    if (!s) continue;
    const set = (suffix, v) => { const el = $(`f-${field}-${suffix}`); if (el && v !== undefined) el.value = v; };
    set("turns", s.turns_per_session);
    set("in", s.in_tokens);
    set("out", s.out_tokens);
    set("cached", s.cached_tokens);
  }
  for (const [field, value] of Object.entries(p.fields ?? {})) {
    const el = $(field);
    if (el) el.value = value;
  }

  const pv = state.workloadPresets.provenance ?? {};
  const dated = pv.observed ? ` &middot; set ${escapeHtml(pv.observed)}, re-verify before ${escapeHtml(pv.re_verify_before)}` : "";
  $("preset-note").innerHTML = `<strong>${escapeHtml(p.label)}</strong> &mdash; every field is `
    + `<span class="tag ${p.assumption_label === "assumed" ? "tag-est" : "tag-unknown"}">${escapeHtml(p.assumption_label)}</span> `
    + `${escapeHtml(p.assumption_note)}${dated}. Change any number below.`;
  if (recompute) onLiveInput();
}

// ------------------------------------------------------------ input plumbing
// Returns the catalog load so init() can AWAIT it. Firing it un-awaited raced the
// first run(): the 2.4 MB catalog resolved after the initial paint, and nothing
// re-runs when it lands, so the screen sat on "Model API — not costed" until the
// user happened to touch an input. That is not a slow load, it is a WRONG first
// answer — the option is priced, and the landing state said it could not be. It
// only became visible once v0.5 made the landing state worth reading.
async function wireInputs() {
  document.addEventListener("input", handleControlEdit);
  document.addEventListener("change", handleControlEdit);
  $("run").addEventListener("click", async () => {
    if (state.catalogError) await fillModels(beginSelection());
    flushLiveInput();
  });
  $("reset-example").addEventListener("click", () => location.reload());
  $("mix-balance").addEventListener("click", balanceMix);
  await fillModels(beginSelection());
}

function isCostControl(el) {
  return !!el && /^(f-|fb-|fo-|fr-)/.test(el.id)
    && (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "range"));
}

function handleControlEdit(event) {
  const el = event.target;
  if (!isCostControl(el) || !state.ready) return;
  // Selects emit both events in modern browsers. Handle exactly one.
  if (event.type !== (el.tagName === "SELECT" ? "change" : "input")) return;
  if (el.id === "fb-feed") { void fillModels(beginSelection()); return; }
  if (el.id === "f-rent-provider") fillRentGpus();
  if (el.id === "f-rent-gpu") renderRentNote();
  if (el.id === "f-sh-gpu") fillServerConfigs();
  if (el.id === "f-sv-model") { applyModelPreset(el.value); return; }
  if (/^f-g\d+-kind$/.test(el.id)) renderArchGroups(readArchGroups() ?? state.archGroups);
  onLiveInput();
}

const SLIDERS = [
  { id: "f-users", min: 1, max: 5000, step: 1, unit: "people", inline: true },
  { id: "f-sessions-day", min: 0.5, max: 20, step: 0.5, unit: "sessions/day", inline: true },
  { id: "f-horizon", min: 1, max: 60, step: 1, unit: "months", inline: true },
  { id: "f-peak-frac", min: 1, max: 100, step: 1, unit: "% at once", inline: true },
  { id: "f-rent-util", min: 1, max: 100, step: 1, unit: "% utilization" },
];

function setupSliders() {
  for (const spec of SLIDERS) {
    const ctrl = $(spec.id);
    const field = ctrl.closest(".f");
    if (spec.inline) field.dataset.inline = "true";
    const range = document.createElement("input");
    range.type = "range";
    range.id = `slider-${spec.id}`;
    range.min = spec.min; range.max = spec.max; range.step = spec.step;
    range.setAttribute("aria-label", `${field.querySelector("label").textContent} — slider`);
    range.setAttribute("aria-describedby", `${range.id}-note`);
    const note = document.createElement("span");
    note.className = "slider-note"; note.id = `${range.id}-note`;
    field.append(range, note);
    range.addEventListener("input", () => {
      ctrl.value = range.value;
      ctrl.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  syncSliders();
}

function syncSliders() {
  for (const spec of SLIDERS) {
    const range = $(`slider-${spec.id}`);
    if (!range) continue;
    const text = $(spec.id).value.trim().replace(/[ _,]/g, "");
    const value = Number(text);
    const offScale = !text || !Number.isFinite(value) || value < spec.min || value > spec.max;
    range.disabled = offScale;
    range.hidden = offScale;
    // Setting a range value may clamp/round it. Never write that back to text.
    if (!offScale) range.value = text;
    $(`${range.id}-note`).textContent = offScale
      ? `Outside slider range (${spec.min}–${spec.max}); exact entry is in use.`
      : `${spec.min}–${spec.max} ${spec.unit} · or type an exact value`;
  }
}

function invalidateResults(message) {
  state.result = null;
  for (const id of ["verdict", "results", "sensitivity", "comparison-scope", "derived", "fit"]) {
    if ($(id)) $(id).innerHTML = "";
  }
  $("calculation-status").textContent = message;
  $("comparison").setAttribute("aria-busy", "true");
  if (plannerState.applied) clearPlannerOutput("Calculator inputs changed. Rebuilding this applied blueprint from the next exact result…", { keepRefinement: true });
}

// The headline recomputes as you type. A calculator with a button you must
// remember to press gets read wrong by somebody eventually — they change a
// number, see a stale total, and quote it. The button stays, for an explicit
// re-pull, but it is no longer what makes the answer correct.
let liveTimer = null;
function onLiveInput() {
  syncSliders();
  if (!state.ready) return;
  $("example-state").textContent = "Customized scenario · assumptions remain editable";
  invalidateResults("Updating comparison…");
  clearTimeout(liveTimer);
  liveTimer = setTimeout(flushLiveInput, 220);
}

function flushLiveInput() {
  clearTimeout(liveTimer);
  if (!state.ready || state.selecting) return;
  // One expensive pass per settled edit, in this order: derived placeholders
  // must exist before the spec lines read them. Run performs error cleanup.
  run();
}

// Mixes that do not sum to 100% are the single most common way this screen gets
// stuck, and the arithmetic to fix it is exactly the arithmetic the user came
// here to avoid doing. One button, and it says where the remainder went.
// The balance runs in the units ON SCREEN — percent — because it writes back
// into the fields the user is reading. validateMix above still judges the
// FRACTIONS readMix hands the engine; the two never mix in one expression.
function balanceMix() {
  const check = validateMix(readMix());
  if (check.ok) return;
  const others = ["rag", "graphrag", "agentic"].reduce(
    (acc, f) => acc.add(Dec.from(decInput(`f-mix-${f}`) ?? "0")), Dec.from("0"));
  const rest = Dec.from("100").sub(others);
  $("f-mix-chat").value = rest.sign() < 0 ? "0" : trimDecimals(formatHalfUp(rest, 4));
  onLiveInput();
}

function readMix() {
  const mix = {};
  for (const [type, field] of Object.entries(MIX_FIELD)) mix[type] = pctInput(`f-mix-${field}`) ?? "0";
  return mix;
}

function readShapes() {
  const shapes = {};
  for (const [type, field] of Object.entries(MIX_FIELD)) {
    shapes[type] = {
      turns_per_session: decInput(`f-${field}-turns`) ?? "0",
      in_tokens: decInput(`f-${field}-in`) ?? "0",
      out_tokens: decInput(`f-${field}-out`) ?? "0",
      cached_tokens: decInput(`f-${field}-cached`) ?? "0",
    };
  }
  return shapes;
}

// Build the demand model from the DOM. Throws DemandRefusal on bad input —
// callers render the refusal rather than substituting a guess.
// `usersOverride` lets a what-if scenario (the sensitivity grid) re-derive the
// WHOLE model at a different headcount rather than scaling the monthly total and
// leaving the fleet at its base size — see buildScenario.
function computeDemand(usersOverride = null) {
  const users = usersOverride ?? decInput("f-users");
  const demand = buildDemand({
    users,
    sessionsPerUserDay: decInput("f-sessions-day"),
    workingDaysMo: decInput("f-days"),
    mix: readMix(),
    shapes: readShapes(),
  });
  const peak = peakTokensPerSecond({
    users,
    peakConcurrencyFraction: pctInput("f-peak-frac"),
    tokensPerSecondPerStream: decInput("f-tps-stream"),
  });
  const gpuId = $("f-sh-gpu").value;
  // v0.3: solve what this accelerator actually delivers for THIS model before
  // sizing the fleet. A null plan is not a failure — it is the v0.2 fallback,
  // and gpusForLoad keeps the per-accelerator constant path for exactly that.
  const serving = buildServingPlan();
  const override = decInput("f-sh-tps-gpu");
  // A configuration the roofline REFUSED is not priced from the v0.2 constant.
  // That fallback exists for an accelerator with no published bandwidth (§6.6.6),
  // not for a model that cannot fit (§6.6.4). A measured figure outranks the
  // roofline, so it — and only it — may proceed past a refusal.
  if (state.servingRefusal && override === null) throw state.servingRefusal;
  const sizing = gpusForLoad({
    peakTokensPerSecond: peak.peak_tokens_s.text,
    gpuId,
    tokensPerSecondPerGpu: override,
    serving,
  });
  // Which input ACTUALLY sized the fleet. gpusForLoad gives the override
  // precedence, so branching on `serving` being truthy would credit the roofline
  // for a fleet the user's own benchmark sized — and print replica topology the
  // override path never produced.
  const sizingBasis = override !== null ? "user_override"
    : sizing.serving_basis === "roofline" ? "roofline"
    : "assumed";
  state.sizingBasis = sizingBasis;
  return { demand, peak, sizing, gpuId, serving, sizingBasis };
}

// The live readout under the demand inputs. It must never show a number derived
// from an invalid mix — a refusal is displayed instead, in full.
function refreshDerived() {
  const mixCheck = validateMix(readMix());
  const sumEl = $("mix-sum");
  const balanceBtn = $("mix-balance");
  if (mixCheck.ok) {
    sumEl.innerHTML = `<span class="tag tag-exact">sums to 100%</span>`;
    if (balanceBtn) balanceBtn.hidden = true;
  } else if (mixCheck.code === "mix_does_not_sum_to_one") {
    // validateMix reports the sum of the FRACTIONS it was given ("0.900000").
    // Echoing that verbatim under percent inputs would answer a question the
    // user did not ask, so it is restated in the units on screen.
    const sumPct = trimDecimals(formatHalfUp(Dec.from(mixCheck.sum_text).mul(100n), 4));
    sumEl.innerHTML = `<span class="tag tag-est">sums to ${escapeHtml(sumPct)}%</span>`;
    if (balanceBtn) balanceBtn.hidden = false;
  } else {
    sumEl.innerHTML = `<span class="tag tag-unknown">invalid</span>`;
    if (balanceBtn) balanceBtn.hidden = true;
  }

  renderServingNote();

  try {
    const { demand, peak, sizing, serving, sizingBasis } = computeDemand();
    state.demand = { demand, peak, sizing };
    if (!$("f-sh-tps-gpu").value.trim()) $("f-sh-tps-gpu").placeholder = `${sizing.tokens_s_per_gpu.text} (${serving ? "from the model" : "assumed"})`;
    $("f-sh-count-hint").textContent = `— ${sizing.gpus_required.text} needed at peak`;
    if (!$("f-sh-count").value.trim()) $("f-sh-count").placeholder = `${sizing.gpus_required.text} (derived)`;

    const perStreamWarn = peak.below_interactive_floor
      ? ` <span class="tag tag-est">below ${peak.interactive_floor_tokens_s.text} tok/s</span> at this per-stream rate an interactive answer reads as slow`
      : "";
    // Where tokens/s per GPU CAME FROM is the number the whole comparison turns
    // on, so it carries its basis inline rather than only inside a popover.
    const gpuBasis = sizingBasis === "roofline"
      ? `solved from ${escapeHtml($("f-sv-model").selectedOptions[0]?.textContent ?? "the model")} at ${groupInt(serving.context_tokens.text)} tokens of context`
      : sizingBasis === "user_override" ? "your measured figure, which outranks the model"
      : "a per-accelerator planning constant, not this model";
    const card = `<strong>${sizing.gpus_required.text}</strong> &times; ${escapeHtml($("f-sh-gpu").selectedOptions[0]?.textContent ?? "")}`;
    // Replica topology exists ONLY on the roofline path — gpusForLoad's override
    // and constant paths size a flat count and return no replicas, so printing
    // "? copies" there was the renderer inventing a structure that was never solved.
    const fleet = sizingBasis === "roofline"
      ? `${card} &mdash; ${sizing.replicas.text} cop${sizing.replicas.text === "1" ? "y" : "ies"} of the model, ${serving.gpus_per_replica} GPU${serving.gpus_per_replica === 1 ? "" : "s"} each`
      : card;

    $("derived").innerHTML = `
      <div class="kpi">
        <div><label>Sessions / month</label><div class="v">${groupInt(demand.sessions_mo.text)}</div></div>
        <div><label>Turns / month</label><div class="v">${groupInt(demand.turns_mo.text)}</div></div>
        <div><label>Tokens / month</label><div class="v">${groupInt(demand.tokens_mo.text)}</div></div>
        <div><label>Peak tokens / s</label><div class="v">${peak.peak_tokens_s.text}${perStreamWarn}</div></div>
      </div>
      <p class="muted" style="margin:14px 0 0">
        ${groupInt(peak.concurrent_peak.text)} concurrent sessions at peak &middot;
        in ${groupInt(demand.in_tokens_mo.text)} / out ${groupInt(demand.out_tokens_mo.text)} / cached ${groupInt(demand.cached_tokens_mo.text)} tokens per month &middot;
        ${fleet}
        to hold the peak at ${sizing.tokens_s_per_gpu.text} tok/s per GPU
        <span class="tag ${sizing.assumed ? "tag-est" : "tag-exact"}">${escapeHtml(gpuBasis)}</span>
      </p>`;
  } catch (e) {
    state.demand = null;
    state.sizingBasis = null;
    // A ServingRefusal here is the model not fitting, which is an ANSWER, not a
    // crash — it must read like one rather than as "input problem — ...".
    const why = (e instanceof DemandRefusal || e instanceof ServingRefusal)
      ? e.message : `input problem — ${e.message}`;
    const what = e instanceof ServingRefusal ? "This configuration cannot be served" : "Demand not computed";
    $("derived").innerHTML = `<div class="gap"><strong>${what}:</strong> ${escapeHtml(why)}</div>`;
  }

  renderFitPanel();
}

async function fillModels(sel) {
  const g = sel.generation;
  state.selecting = true;
  state.catalogError = null;
  if (state.ready) {
    clearTimeout(liveTimer);
    invalidateResults("Loading model prices…");
    $("example-state").textContent = "Customized scenario · assumptions remain editable";
  }
  $("fb-model").innerHTML = `<option value="">loading snapshot…</option>`;
  try {
    if (!state.catalog) {
      const cat = await resolveResource(state.manifest, "catalog", sel.signal);
      if (g !== currentGeneration()) return; // a newer selection superseded this fetch
      state.catalog = cat;
      state.catalogGeneration = g;
    }
  } catch (e) {
    if (g !== currentGeneration()) return;
    state.selecting = false;
    state.catalogError = `Model pricing could not be loaded. Recalculate to retry. ${e.message}`;
    $("fb-model").innerHTML = `<option value="">unavailable</option>`;
    invalidateResults("Model prices unavailable — no comparison to export.");
    $("comparison").setAttribute("aria-busy", "false");
    showGap(escapeHtml(state.catalogError));
    return;
  }
  const feed = $("fb-feed").value;
  const models = state.manifest.models.filter((m) => m.id.startsWith(`${feed}:`) && m.state !== "quarantined" && m.state !== "retired");
  const byName = [...models].sort((a, b) => a.name.localeCompare(b.name));
  $("fb-model").innerHTML = byName.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  const cur = byName.find((m) => /gpt-4o/.test(m.id)) ?? byName.find((m) => /claude/.test(m.id)) ?? byName[0];
  if (cur) $("fb-model").value = cur.id;
  const source = state.manifest.sources?.[feed] ?? {};
  const fallback = state.liveFailures[feed] ? ` · live unavailable, using dated fallback (${state.liveFailures[feed]})` : "";
  $("fb-model-note").textContent = `${models.length} models · ${source.origin ?? "snapshot"} ${String(source.observed_at ?? state.manifest.generated_at).slice(0, 10)} · ${source.integrity ?? "declared"}${fallback}`;
  state.selecting = false;
  if (state.ready) onLiveInput();
}

// --------------------------------------------------------------------- run()
// One scenario builder for the headline AND for every sensitivity cell, so a
// what-if can never disagree with the main result about how much hardware the
// demand needs. Scaling the user count re-derives sessions, tokens, the peak
// second AND the fleet; scaling only the monthly token total — which is what the
// pre-v0.2 demand axis did — holds the fleet at its base size and understates a
// scaled scenario. An EXPLICITLY entered GPU count or token budget is the user's
// declared fleet and stays fixed on purpose: that is the "my current hardware
// under more load" question, and it is theirs to ask.
function buildScenario(usersOverride = null) {
  const { demand, peak, sizing, gpuId } = computeDemand(usersOverride);

  // The engine consumes whole tokens and whole requests. The demand model is
  // exact, so rounding happens ONCE, here, at the boundary into the engine.
  const demandTokens = Math.round(Number(demand.tokens_mo.text));
  const requestCount = Math.round(Number(demand.turns_mo.text));
  const inTok = Number(demand.in_tokens_mo.text);
  const cachedTok = Number(demand.cached_tokens_mo.text);
  const outTok = Number(demand.out_tokens_mo.text);

  const workload = {
    demand_tokens_mo: demandTokens,
    request_count_mo: requestCount,
    // Per-request shape is the monthly total divided by turns: the engine
    // quotes ONE request and multiplies, so a blended average is correct here
    // precisely because the mix has already been applied upstream.
    prompt_tokens: requestCount > 0 ? Math.round(inTok / requestCount) : 0,
    output_tokens: requestCount > 0 ? Math.round(outTok / requestCount) : 0,
    cache_read_tokens_per_req: requestCount > 0 ? Math.round(cachedTok / requestCount) : 0,
    horizon_months: intInput("f-horizon") ?? 1,
    required_p95_tok_s: intInput("f-p95"),
    quote_utc: Date.parse($("f-utc").value),
    now: Date.now(),
    time_buckets: null,
  };
  if (demandTokens > 0) {
    workload.time_buckets = [{ hours: 730, tokens: demandTokens }];
  }

  // Self-hosted capacity: the sized fleet's aggregate throughput over the
  // month. Derived, and overridable — an entered budget wins.
  const gpuCount = intInput("f-sh-count") ?? Number(sizing.gpus_required.text);
  const fleetTokensS = gpuCount * Number(sizing.tokens_s_per_gpu.text);
  const derivedBudget = Math.round(fleetTokensS * 3600 * 730);

  // v0.5: hardware capex is DERIVED from the sized fleet and the chosen server,
  // and an entered figure outranks it. Before this the field shipped value="0",
  // so paybackMonths returned zero_capex on the DEFAULT scenario and the payback
  // block — the one this calculator exists to produce — was dead out of the box.
  // Only the base scenario publishes to state — the sensitivity grid's reruns
  // must not repaint the notes that describe THIS one.
  const publish = usersOverride === null;
  const capexPlan = buildCapexPlan(gpuCount, publish);
  const capexEntered = engineMoneyInput("f-sh-capex");
  const capex = capexEntered ?? (capexPlan ? capexPlan.capex : "0");
  const powerPlan = buildPowerPlan(gpuId, capexPlan, gpuCount, publish);
  const runningMonthly = engineMoneyInput("f-sh-fixed") ?? powerPlan?.monthly_usd ?? null;

  const laneA = {
    enabled: runningMonthly !== null && (capexEntered !== null || capexPlan !== null),
    fixed_monthly: runningMonthly ?? "0",
    capex,
    monthly_token_budget: intInput("f-sh-budget") ?? derivedBudget,
    tokens_s_ceiling: Math.round(fleetTokensS),
    hardware_topology: `${gpuCount}x ${gpuId}`,
  };
  const laneB = { enabled: true, offer_ids: [$("fb-model").value].filter(Boolean) };

  // The rented option is sized on the accelerator being RENTED, never on the
  // self-hosted pick: an L40S does not deliver H100 throughput, and charging one
  // accelerator's rate at another's capacity makes a provider look cheap for a
  // reason that has nothing to do with its price. An accelerator with no
  // throughput assumption is reported as a gap rather than silently borrowing
  // the self-hosted figure.
  const rentRow = currentRentRow();
  let rentSizing = null;
  let rentGap = null;
  if (rentRow) {
    try {
      rentSizing = gpusForLoad({
        peakTokensPerSecond: peak.peak_tokens_s.text,
        gpuId: rentRow.gpu_id,
        serving: solveServingFor(rentRow.gpu_id),
      });
    } catch (e) {
      // A ServingRefusal is the model not fitting on the RENTED accelerator —
      // as legitimate an answer as a demand refusal, and its message already
      // says which constraint bound, so it must not degrade to "[object Error]".
      rentGap = (e instanceof DemandRefusal || e instanceof ServingRefusal) ? e.message : String(e);
    }
  }
  const rentGpus = rentSizing ? Math.max(1, Number(rentSizing.gpus_required.text)) : 0;
  const laneC = {
    enabled: !!rentSizing,
    tokens_s: rentSizing ? Math.round(rentGpus * Number(rentSizing.tokens_s_per_gpu.text)) : 0,
    // The registry quotes PER GPU; the option rents the fleet size this
    // accelerator needs to hold the peak, so the hourly rate is scaled by that
    // count — exactly, because a float multiply would put binary dust in a
    // dollar figure.
    hourly_rate: rentSizing ? Dec.from(String(rentRow.gpu_hourly_usd)).mul(BigInt(rentGpus)).toString() : "0",
    utilization: pctInput("f-rent-util") ?? "0.7",
    hardware_topology: rentSizing ? `${rentGpus}x ${rentRow.gpu_label} @ ${rentRow.provider_label}` : null,
  };
  const routing = {
    policy: $("fr-policy").value,
    advisory_blend: { local_pct: intInput("fr-blend") ?? 70 },
    failover: { fallback: "A", share: decInput("fr-failshare") ?? "0", rate: decInput("fr-failrate") ?? "2" },
    pinned: { a_pct: 50, b_pct: 50 },
  };
  // Implementation has LEFT this overlay — see the one-time roll-up below. It is a
  // one-time cost paid once whichever way you serve the tokens, and the overlay
  // only ever annotated the per-1M basis: an amount left here would never reach
  // one_time, the curve, the horizon total or payback, which is precisely where a
  // one-time cost has to land now that those exist.
  const overlay = {
    fully_loaded: false, // commercial fees are itemized, never per-token prices
    components: [
      { name: "enterprise-licensing", basis: "monthly", amount: engineMoneyInput("fo-license") ?? "0" },
      { name: "ai-consulting", basis: "monthly", amount: engineMoneyInput("fo-consult") ?? "0" },
    ].filter((c) => toRat(c.amount).sign() > 0),
  };

  // GPU-hours are the RENTED option's own: its fleet, its utilization, computed
  // exactly rather than rounded to a whole hour — at 0.65 utilization the month
  // lands on a half-hour, and rounding it here would put the error inside a
  // figure the exact-rational meter is about to multiply by a price.
  const rentedHours = rentSizing
    ? Dec.from(String(pctInput("f-rent-util") ?? "0.7")).mul(BigInt(rentGpus * 730)).toString()
    : null;
  const vramOf = (id) => state.gpuPricing?.gpus?.[id]?.vram_gb ?? null;
  const subPlan = buildSubPlan({
    owned: {
      // Vendor meters count the GPUs INSTALLED, not the ones the model needs. You
      // buy whole nodes, so a 3-GPU requirement bought as one 8-GPU node is
      // licensed for 8 — the same surplus renderServerNote already reports on the
      // hardware line. With no server selected there is no installed count to
      // know, and the required fleet is the honest floor.
      gpus: capexPlan ? capexPlan.gpus_provisioned : gpuCount,
      gpuVramGb: vramOf(gpuId),
      nodes: capexPlan ? capexPlan.nodes : null,
    },
    rented: rentSizing
      ? { gpus: rentGpus, gpuVramGb: vramOf(rentRow.gpu_id), gpuHours: rentedHours }
      : null,
    users: Math.round(Number(demand.users.text)),
  }, usersOverride === null);

  requireSubscriptionPrice(currentSubRow(), subPlan, publish ? state.subGap : null);

  // One-time per option. A is the hardware capex (already on laneA.capex, so it
  // is NOT repeated here — the engine adds it). B and C carry their own upfronts,
  // which before v0.5 had nowhere to go and silently read as zero. Implementation
  // is charged ONCE TO EVERY OPTION, which is what the field has always claimed:
  // it is the same project whichever way the tokens are served, so it cancels out
  // of the payback difference while still showing in each option's own total.
  const implOnce = engineMoneyInput("fo-impl") ?? "0";
  const withImpl = (v) => ratStr(toRat(v).add(toRat(implOnce)));
  const oneTime = {
    A: implOnce,
    B: withImpl(engineMoneyInput("f-onetime-b") ?? "0"),
    C: withImpl(engineMoneyInput("f-onetime-c") ?? "0"),
  };

  return {
    demand, peak, sizing, gpuId, rentRow, rentGap, capexPlan, powerPlan, subPlan,
    inputs: {
      workload,
      catalog: state.catalog ?? { offers: {} },
      laneA, laneB, laneC, routing, overlay,
      subscription: subPlan,
      oneTime,
    },
  };
}

// A headcount is a whole number of people — demand.js refuses a fractional one —
// so a scaled sensitivity cell rounds to a real person rather than becoming a
// refusal, and never falls below the single user the model needs to mean anything.
function scaleUsers(baseUsers, multiplier) {
  const n = Math.round(Number(baseUsers) * multiplier);
  return String(Number.isFinite(n) && n > 1 ? n : 1);
}

function run() {
  clearTimeout(liveTimer);
  if (!state.ready || state.selecting) return;
  invalidateResults("Calculating comparison…");
  clearGap();
  try {
    if (state.catalogError) throw new Error(state.catalogError);
    refreshDerived();
    syncChips();
    syncSliders();
    const s = buildScenario();
    state.demand = { demand: s.demand, peak: s.peak, sizing: s.sizing };
    state.inputs = s.inputs;
    state.rentRow = s.rentRow;
    state.rentGap = s.rentGap;
    state.result = runComparison({ ...state.inputs, evidenceRows: [] });
    renderResults(state.result);
    renderPlannerBlueprint();
    renderServerNote();
    renderPowerNote();
    renderSubNote();
    $("calculation-status").textContent = `Comparison updated · ${state.result.horizon_months} months · THB`;
  } catch (e) {
    invalidateResults("Comparison unavailable — check your inputs.");
    if (e instanceof DemandRefusal || e instanceof ServingRefusal) {
      // Clear both output surfaces. Leaving the previous run's totals and verdict
      // standing under a refusal is how an impossible configuration keeps a price
      // tag — and the verdict is exactly the number a buyer reads first.
      state.result = null;
      $("results").innerHTML = "";
      $("verdict").innerHTML = "";
      const message = e.code === "mix_does_not_sum_to_one" && e.detail?.sum
        ? `Traffic shares add up to ${trimDecimals(formatHalfUp(Dec.from(e.detail.sum).mul(100n), 4))}%. They must total 100%. Adjust a share or use “Put the remainder in Chat”.`
        : e.message;
      showGap(escapeHtml(message));
      return;
    }
    // The visible gap can be overwritten by a later async load, so the stack also
    // goes to the console — a comparison that fails silently is the worst outcome.
    console.error("comparison failed", e);
    showGap(`The comparison could not run: ${escapeHtml(e.message)}`);
  } finally {
    $("comparison").setAttribute("aria-busy", "false");
  }
}

const srcTag = (quote) => quote && quote.exact
  ? `<span class="tag tag-exact">exact</span>`
  : `<span class="tag tag-est">estimated</span>`;

function quoteRows(offerId, quote) {
  const fx = fxProvenance(state.fx);
  return [
    ["snapshot digest", state.manifest.snapshot_digest],
    ["offer", offerId ?? "none"],
    ["exact", quote ? String(quote.exact) : "false"],
    ["reasons", quote && quote.reasons.length ? quote.reasons.join(", ") : "none"],
    ["applied overrides", quote ? JSON.stringify(quote.applied_overrides) : "[]"],
    ["meters", quote ? quote.meters.map((m) => `${m.meter}=${m.selected_key ?? "none"}x${m.quantity}`).join("; ") : "—"],
    ["sources", Object.entries(state.manifest.sources).map(([k, v]) => `${k}@${String(v.observed_at).slice(0, 10)}`).join("; ")],
    ["display currency", "THB"],
    ["engine/source currency", "USD"],
    ["FX exact", fx.rate_exact],
    ["FX formula", fx.formula],
    ["FX observed", fx.observed_at],
    ["snapshot generated", state.manifest.generated_at],
  ];
}

// ---------------------------------------------------------------- payback UI
// A non-converging payback is rendered with its REASON in words — never as a
// dash, an infinity, or a large number that reads like an answer (SPEC 2.5).
const PAYBACK_REASON = {
  opex_exceeds_target: "self-hosting costs more every month than this option, so it never catches up — no horizon changes that",
  zero_capex: "no up-front cost was entered, so there is nothing to pay back",
  negative_capex: "capex is negative, which the model does not interpret",
};

function paybackCard(r) {
  const p = r.payback ?? {};
  const targets = [["vs_model_api", OPTION.B.label], ["vs_rented_gpu", OPTION.C.label]].filter(([k]) => p[k]);
  if (!targets.length) return "";
  const rows = targets.map(([k, label]) => {
    const v = p[k];
    const rowsProv = [
      ["capex", money(v.capex)],
      ["self-hosted monthly", money(v.monthly_opex)],
      [`${label} monthly`, money(v.target_monthly)],
      ["monthly saving", money(v.monthly_savings)],
      ["formula", "ceil(capex / (target monthly − self-hosted monthly))"],
    ];
    if (!v.converges) {
      return `<tr><td>vs ${escapeHtml(label)}</td><td class="n"><strong>does not converge</strong></td>`
        + `<td>${numProv(escapeHtml(PAYBACK_REASON[v.reason] ?? v.reason), rowsProv)}</td></tr>`;
    }
    const beyond = v.beyond_horizon
      ? ` <span class="tag tag-est">beyond the ${escapeHtml(String(v.horizon_months))}-month horizon</span>`
      : "";
    return `<tr><td>vs ${escapeHtml(label)}</td>`
      + `<td class="n"><strong>${numProv(`${v.months} month${v.months === 1 ? "" : "s"}`, rowsProv)}</strong>${beyond}</td>`
      + `<td>saving ${money(v.monthly_savings)} / month against ${escapeHtml(label)}</td></tr>`;
  }).join("");
  return `<div class="card">
    <h3 style="margin-bottom:10px">Payback on the self-hosted capex</h3>
    <table><thead><tr><th>Compared with</th><th class="n">Pays back in</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">Capex ${money(p.self_hosted_capex)} one-time, ${money(p.self_hosted_monthly_opex)} per month running. A payback past the horizon is shown as the true month, never truncated — reporting "slow" as "never" is the more damaging error.</p>
  </div>`;
}

function sizingCard() {
  const d = state.demand;
  if (!d) return "";
  const { demand, peak, sizing } = d;
  const under = state.result && state.result.lanes.A.enabled
    && Number(state.inputs.laneA.tokens_s_ceiling) < Number(peak.peak_tokens_s.text);
  return `<div class="card">
    <h3 style="margin-bottom:10px">Demand and sizing</h3>
    <table>
      <tbody>
        <tr><td>Users</td><td class="n">${groupInt(demand.users.text)}</td><td class="muted">${escapeHtml(demand.users.basis)}</td></tr>
        <tr><td>Sessions / month</td><td class="n">${groupInt(demand.sessions_mo.text)}</td><td class="muted">${escapeHtml(demand.sessions_mo.basis)}</td></tr>
        <tr><td>Tokens / month</td><td class="n">${groupInt(demand.tokens_mo.text)}</td><td class="muted">${escapeHtml(demand.tokens_mo.basis)}</td></tr>
        <tr><td>Peak tokens / s</td><td class="n">${peak.peak_tokens_s.text}</td><td class="muted">${groupInt(peak.concurrent_peak.text)} concurrent &times; ${peak.tokens_s_per_stream.text} tok/s per stream</td></tr>
        <tr><td>GPUs to hold the peak</td><td class="n">${sizing.gpus_required.text}</td><td class="muted">${sizing.tokens_s_per_gpu.text} tok/s per GPU <span class="tag ${sizing.assumed ? "tag-est" : "tag-exact"}">${sizing.assumed ? "assumed" : "your figure"}</span></td></tr>
      </tbody>
    </table>
    ${under ? `<div class="gap"><strong>Under-provisioned at peak:</strong> the self-hosted fleet clears the monthly total but not ${peak.peak_tokens_s.text} tok/s at peak. Monthly capacity is not a substitute for peak capacity.</div>` : ""}
    <p class="muted">Per-workload rows appear in the exported quote. Every figure is derived unless marked <code>user_override</code>.</p>
  </div>`;
}

// Every provider in the registry, priced for THIS load. The picker answers one
// provider at a time, which is not the question a buyer comparing AWS against
// Azure against a Chinese cloud is actually asking — and asking it one selection
// at a time makes the comparison the buyer's clerical work rather than the
// calculator's output. Sets state.rentByProvider for the quote export.
function providerCard() {
  const d = state.demand;
  const inp = state.inputs;
  if (!d || !inp) { state.rentByProvider = null; return ""; }

  const cmp = rentedGpuByProvider({
    rows: state.gpuPricing?.rows ?? [],
    utilization: inp.laneC.utilization,
    servedTokens: inp.workload.demand_tokens_mo,
    // Sized on ITS OWN accelerator against the same peak second — never on the
    // self-hosted pick, which would price an L4 fleet as if it were H100s.
    // v0.3: and on the SAME model, so a provider's rank reflects what this model
    // actually costs to serve there. A refusal propagates — rentedGpuByProvider
    // turns it into an explained "not priced" row rather than a silent drop.
    sizeFor: (gpuId) => gpusForLoad({
      peakTokensPerSecond: d.peak.peak_tokens_s.text,
      gpuId,
      serving: solveServingFor(gpuId),
    }),
  });
  state.rentByProvider = cmp;

  if (!cmp.priced.length) {
    return `<div class="card"><h3>${OPTION.C.label} — every provider</h3><p class="muted">No provider could be priced for this load${cmp.reason ? ` (${escapeHtml(cmp.reason)})` : ""}.</p></div>`;
  }

  // Marked only when the provider AND the accelerator match: this table picks a
  // provider's cheapest holding SKU, which is often not the one selected above,
  // and marking on provider alone would label a different number as "yours".
  const selected = state.rentRow?.provider ?? null;
  const selectedGpu = state.rentRow?.gpu_id ?? null;
  const body = cmp.priced.map((p) => {
    const tier = p.confidence === "first_party" ? "tag-exact" : "tag-est";
    const word = p.confidence === "first_party" ? "first-party" : "indicative";
    const provRows = [
      ["sku", String(p.sku)],
      ["fleet", `${p.gpus_required} x ${p.gpu_label ?? p.gpu_id}`],
      ["per-GPU hourly", money(p.gpu_hourly_usd)],
      ["fleet hourly", money(p.fleet_hourly_usd)],
      ["GPU-hours / month", p.hours],
      ["confidence", p.confidence],
      ["source", String(p.source_url)],
      ["observed", String(p.observed_at).slice(0, 10)],
      ["snapshot digest", state.manifest.snapshot_digest],
    ];
    const mark = p.provider === selected && p.gpu_id === selectedGpu ? ` <span class="muted">your selection</span>` : "";
    return `<tr><td>${escapeHtml(p.provider_label)} <span class="tag ${tier}">${word}</span>${mark}</td>`
      + `<td>${escapeHtml(p.gpu_label ?? p.gpu_id)}</td>`
      + `<td class="n">${p.gpus_required}</td>`
      + `<td class="n">${money(p.gpu_hourly_usd)}</td>`
      + `<td class="n">${numProv(money(p.monthly_total), provRows)}</td></tr>`;
  }).join("");

  // The picker's own pairing could not be sized — say so here rather than let the
  // Rented GPU option quietly vanish from the results table with no explanation.
  const pickGap = state.rentGap
    ? `<div class="gap"><strong>Your selected pairing is not priced:</strong> ${escapeHtml(state.rentGap)} The comparison below still stands; the option row above is omitted rather than guessed.</div>`
    : "";

  // Reason codes are engine vocabulary; on a sales-facing surface they have to
  // read as English. Unmapped codes pass through rather than being swallowed.
  const WHY = {
    no_viable_configuration: "this model does not fit on that accelerator",
    unknown_gpu: "no throughput assumption for that accelerator",
    zero_capacity: "no GPUs required at this load",
    zero_throughput: "the plan delivers no tokens/s",
    sizing_failed: "could not be sized",
  };
  const missing = cmp.unservable.length
    ? `<p class="muted">Not priced: ${[...new Set(cmp.unservable.map((u) => `${u.provider_label} (${u.gpu_id} — ${WHY[u.reason] ?? u.reason})`))].map(escapeHtml).join(", ")}. An unpriceable provider is reported rather than dropped — vanishing from the table would read as "not offered" when the truth is "not modelled".</p>`
    : "";

  return `<div class="card">
    <h3>${OPTION.C.label} — every provider in the registry, priced for this load</h3>
    <table>
      <thead><tr><th>Provider</th><th>Accelerator</th><th class="n">GPUs</th><th class="n">฿/GPU-hr</th><th class="n">Cost / month</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${pickGap}
    <p class="muted">The cheapest SKU per provider that holds ${d.peak.peak_tokens_s.text} tok/s at peak, each sized on its own accelerator${state.serving ? " running the model you selected" : ""} — so providers rank by delivered capacity, not by sticker rate. <span class="tag tag-exact">first-party</span> is the vendor's own published price list; <span class="tag tag-est">indicative</span> is a public aggregator, an order-of-magnitude planning figure rather than a quote.</p>
    ${missing}
  </div>`;
}

// The question the calculator exists to answer, and until now the only one it
// computed and then discarded: runComparison has always returned a breakeven
// block and no render site ever read it. Stated as DEMAND first, because that is
// what the engine derives, with an approximate headcount beside it because that
// is what the reader actually entered.
function breakevenCard(r) {
  const be = r.breakeven ?? {};
  const rows = [];
  const usersNow = state.demand ? Number(state.demand.demand.users.text) : null;
  const tokensNow = Number(state.inputs?.workload?.demand_tokens_mo ?? 0);
  // An exact figure crosses this boundary as EITHER a decimal string or a reduced
  // n/d, and Number("2000000000/1") is NaN. Round through toRat before it ever
  // becomes a JS number — the same rule the curve geometry already follows.
  const tokNum = (v) => (v === null || v === undefined) ? null : Number(formatHalfUp(toRat(v), 0));
  const usersAt = (tokens) => {
    const t = tokNum(tokens);
    return (!usersNow || tokensNow <= 0 || t === null) ? null : Math.ceil(usersNow * (t / tokensNow));
  };
  const line = (label, b) => {
    if (!b) return;
    if (b.demand_tokens !== null && b.demand_tokens !== undefined) {
      const t = tokNum(b.demand_tokens);
      const u = usersAt(b.demand_tokens);
      // A ratio label, deliberately approximate and never money — the exact-money
      // rule governs dollars, and rendering "6.4x" to 20 places would be noise.
      const mult = tokensNow > 0 && t !== null ? (t / tokensNow).toFixed(1) : null;
      rows.push(`<tr><td>${escapeHtml(label)}</td>`
        + `<td class="n">${t === null ? "&mdash;" : groupInt(t)}</td>`
        + `<td class="n">${u === null ? "&mdash;" : `~${groupInt(u)}`}</td>`
        + `<td class="n">${mult === null ? "&mdash;" : `${mult}&times;`}</td></tr>`);
      return;
    }
    const why = b.reason === "already_cheaper"
      ? "already cheaper at any demand — that option's own upfront exceeds owning across the horizon"
      : b.reason === "out_of_capacity"
      ? `not reachable on this fleet — the crossing needs ${groupInt(tokNum(b.uncapped_demand_tokens) ?? 0)} tokens/mo but the fleet serves ${groupInt(tokNum(b.capacity_tokens) ?? 0)}`
      : b.reason === "zero_price" ? "the compared option carries no per-token price"
      : b.reason === "zero_horizon" ? "no planning horizon entered"
      : (b.reason ?? "unavailable");
    rows.push(`<tr><td>${escapeHtml(label)}</td><td class="n" colspan="3">${escapeHtml(why)}</td></tr>`);
  };
  line(`vs ${OPTION.B.label}`, be.horizon_vs_B);
  line(`vs ${OPTION.C.label}`, be.horizon_vs_C);
  if (rows.length === 0) return "";
  return `<div class="card"><h3>Where owning starts to win</h3>
      <table><thead><tr><th>Crossover</th><th class="n">Tokens / month</th><th class="n">Approx. users</th><th class="n">vs today</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table>
      <p class="muted">The demand at which ${escapeHtml(OPTION.A.label)}'s one-time cost plus running cost equals the other option across the full ${r.horizon_months}-month horizon. Headcount is scaled from the entered workload shape, so it moves whenever usage per user does. The capex is paid once at any demand, so it is higher demand that earns it back — not a longer wait.</p></div>`;
}

function renderResults(r) {
  const B = r.lanes.B;
  const q = B.primary_offer ? B.quotes[B.primary_offer] : null;
  const digest = [["snapshot digest", state.manifest.snapshot_digest]];

  // v0.5: the monthly column carries the licence wherever it applies, because
  // the cumulative column beside it does. An infra-only monthly sitting next to
  // a licence-inclusive total invites the reader to subtract one from the other
  // and arrive at a figure that is in neither — so both columns are stated on
  // the same basis, and the hover decomposes it into infrastructure + licence.
  const monthlyCell = (k, fallback) => {
    const row = r.totals?.[k];
    return row && row.priced ? row.monthly_total : fallback;
  };
  const monthlyProv = (k) => {
    const row = r.totals?.[k];
    if (!row || !row.priced) return [];
    const licAmount = row.subscription_applies ? moneyValue(row.subscription_monthly) : null;
    const lic = licAmount !== null && licAmount !== undefined && licAmount.sign() > 0
      ? [["platform licence", `${money(row.subscription_monthly)} / month`]]
      : (r.subscription ? [["platform licence", "not applicable to this option"]] : []);
    return [["infrastructure", `${money(row.infra_monthly)} / month`], ...lic];
  };
  const curveCell = (k, rows) => r.totals?.[k]?.horizon_total === null || r.totals?.[k]?.horizon_total === undefined
    ? "— (not costed)"
    : numProv(money(r.totals[k].horizon_total), rows);

  const rows = [`<tr><td>${OPTION.B.label} — <code>${escapeHtml(B.primary_offer ?? "none")}</code>${srcTag(q)}</td>` +
    `<td class="n">${B.monthly_total === null ? "—" : numProv(money(monthlyCell("B", B.monthly_total)), [...quoteRows(B.primary_offer, q), ...monthlyProv("B")])}</td>` +
    `<td class="n">${B.per_1m.value === null ? `— (${B.per_1m.reason})` : numProv(fmtPer1M(B.per_1m.value), quoteRows(B.primary_offer, q))}</td>` +
    `<td class="n">${curveCell("B", quoteRows(B.primary_offer, q))}</td></tr>`];

  if (r.lanes.A.enabled) {
    const A = r.lanes.A;
    const aRows = [
      ...digest,
      ["fixed monthly", money(A.lines.find((l) => l.item === "lane_a_fixed")?.amount ?? "0") + " — charged once"],
      ["capex (one-time)", money(r.payback?.self_hosted_capex ?? "0")],
      ["served / overflow tokens", `${A.served_tokens} / ${A.overflow_tokens}`],
      ["utilization", A.utilization === null ? (A.utilization_reason ?? "—") : String(A.utilization)],
      ["fleet", state.inputs.laneA.hardware_topology],
    ];
    const per1mA = A.per_1m && A.per_1m.value !== null ? numProv(fmtPer1M(A.per_1m.value), aRows) : `— (${A.per_1m?.reason ?? "n/a"})`;
    // The over-provisioning belongs BESIDE the number it explains. renderServerNote
    // already states it, but that sentence lives under the server picker in the
    // rail, so a reader comparing horizon totals never learns why the owned column
    // carries the capex it does. Silent when the node fits the fleet exactly —
    // a zero-spare buy has nothing to disclose and saying so would be noise.
    const cp = state.capexPlan;
    const spare = cp && cp.gpus_overprovisioned > 0
      ? `<div class="muted">Buys ${cp.gpus_provisioned} GPUs to use ${cp.gpus_required} &mdash; ${cp.gpus_overprovisioned} spare, charged in full because a node is not divisible. A smaller node may fit better.</div>`
      : "";
    if (cp && cp.gpus_overprovisioned > 0) {
      aRows.push(["GPUs bought / needed", `${cp.gpus_provisioned} / ${cp.gpus_required} — ${cp.gpus_overprovisioned} spare`]);
    }
    rows.push(`<tr><td>${OPTION.A.label}${spare}</td>`
      + `<td class="n">${numProv(money(monthlyCell("A", A.monthly_total)), [...aRows, ...monthlyProv("A")])}</td>`
      + `<td class="n">${per1mA}</td>`
      + `<td class="n">${curveCell("A", aRows)}</td></tr>`);
  } else {
    const gap = escapeHtml(state.capexGap ?? state.powerGap ?? "self-hosted cost is unavailable");
    rows.push(`<tr><td>${OPTION.A.label}<div class="muted">${gap}</div></td>`
      + `<td class="n">— (not costed)</td>`
      + `<td class="n">— (not costed)</td>`
      + `<td class="n">${curveCell("A", [])}</td></tr>`);
  }

  if (r.lanes.C.enabled) {
    const C = r.lanes.C;
    const row = state.rentRow;
    const tier = row?.confidence === "first_party" ? "tag-exact" : "tag-est";
    const tierWord = row?.confidence === "first_party" ? "first-party" : "indicative";
    const cRows = [
      ...digest,
      ["provider", row ? row.provider_label : "—"],
      ["sku", row ? row.sku : "—"],
      ["per-GPU hourly", row ? money(row.gpu_hourly_usd) : "—"],
      ["confidence", row ? row.confidence : "unknown"],
      ["source", row ? row.source_url : "—"],
      ["observed", row ? String(row.observed_at).slice(0, 10) : "—"],
      ["hours", String(C.hours)],
      ["utilization", String(C.utilization)],
    ];
    const cPer1m = C.per_1m ?? { value: null, reason: C.per_1m_reason };
    const per1mC = cPer1m.value === null || cPer1m.value === undefined
      ? `— (${cPer1m.reason ?? "unknown"})`
      : numProv(fmtPer1M(cPer1m.value), cRows);
    rows.push(`<tr><td>${OPTION.C.label}${row ? ` — ${escapeHtml(row.provider_label)}` : ""} <span class="tag ${tier}">${tierWord}</span></td>`
      + `<td class="n">${numProv(money(monthlyCell("C", C.monthly_total)), [...cRows, ...monthlyProv("C")])}</td>`
      + `<td class="n">${per1mC}</td>`
      + `<td class="n">${curveCell("C", cRows)}</td></tr>`);
  }

  const rec = (r.routing_result.recommended_monthly_total === null || r.routing_result.recommended_monthly_total === undefined) ? "" :
    `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 6px">Operational routing estimate — send ${escapeHtml(policyWords(r.policy))}</h3><div style="font-size:1.6rem;font-weight:700">${numProv(money(r.routing_result.recommended_monthly_total), [["policy", r.policy], ["basis", "engine-derived result under the declared routing policy"], ...digest])}<span class="muted" style="font-size:.85rem"> / month at the entered demand</span></div><p>Infrastructure routing only. Excludes acquisition, platform subscriptions and commercial fees; not an investment recommendation.</p></div>`;

  const adv = r.routing_result.advisory
    ? `<p class="muted">Advisory blend ${money(r.routing_result.advisory.total)} — <strong>${escapeHtml(r.routing_result.advisory.status)}</strong>${r.routing_result.advisory.delta ? ` (delta ${money(r.routing_result.advisory.delta)})` : ""}. ${escapeHtml(r.routing_result.advisory.note)}</p>`
    : "";
  const don = r.routing_result.derived_optimum_note
    ? `<p class="muted">Derived optimum for comparison: ${money(r.routing_result.derived_optimum_note.total)} — ${escapeHtml(r.routing_result.derived_optimum_note.note)}</p>`
    : "";
  const failover = r.routing_result.failover
    ? `<p class="muted">Failover: fallback option ${escapeHtml(OPTION[r.routing_result.failover.fallback]?.label ?? r.routing_result.failover.fallback)} at share ${escapeHtml(r.routing_result.failover.share)} &times; rate ${escapeHtml(r.routing_result.failover.rate)}.</p>`
    : "";
  const pinned = r.routing_result.pinned
    ? `<p class="muted">Pinned split honored: ${r.routing_result.pinned.lines.map((l) => `${escapeHtml(OPTION[l.lane]?.label ?? l.lane)} ${money(l.amount)}`).join(" · ")} — total ${money(r.routing_result.pinned.total)}.</p>`
    : "";

  const verdictLi = (label, v) => v === null ? "" : `<li>${label}: <strong>${v.verdict}</strong>${v.verdict === "unknown" ? ` <span class="tag tag-unknown">no evidence row matches all dimensions</span>` : ` @ ${v.modelled_p95_capacity} tok/s`}${v.annotation ? ` <span class="muted">partial: ${v.annotation.mismatched_dimensions.join(", ")} differ</span>` : ""}</li>`;

  $("results").innerHTML = `
    ${rec}
    ${paybackCard(r)}
    ${breakevenCard(r)}
    <div class="card">
      <table>
        <thead><tr><th>Option</th><th class="n">Cost / month</th><th class="n">Infrastructure / 1M tokens</th><th class="n">${r.horizon_months}-month modelled cost</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <p class="muted">Monthly and horizon columns include applicable platform subscriptions; per-token prices are infrastructure only. Consulting and enterprise-licensing fees are additional, itemized above.</p>
      ${adv}${don}${failover}${pinned}
      ${r.reasons.length ? `<div class="gap"><strong>Honest caveats:</strong> ${r.reasons.map(escapeHtml).join("; ")}</div>` : ""}
      ${B.gaps.map((g) => `<div class="gap"><strong>${escapeHtml(g.offer_id)}</strong>: ${escapeHtml(g.gap_reason ?? "unservable")} — the option falls back or reports the gap.</div>`).join("")}
    </div>
    ${sizingCard()}
    ${providerCard()}
    <div class="card">
      <h3>Feasibility</h3>
      <ul style="color:rgba(232,230,240,.72)">${verdictLi(`${OPTION.A.label} p95 vs SLO`, r.throughput.verdicts.lane_A)}${verdictLi(`${OPTION.C.label} p95 vs SLO`, r.throughput.verdicts.lane_C)}</ul>
      <p class="muted">Feasibility verdicts are evidence-gated: unknown beats invented. The shipped evidence store is empty by mandate (SPEC 6.5).</p>
    </div>
    <div class="card">
      <h3>Cumulative modelled cost over ${r.horizon_months} months</h3>
      ${renderCurve(r.curve, r.payback)}
      <p class="muted">Infrastructure, applicable platform subscriptions and entered one-time costs. Consulting and enterprise-licensing fees are excluded from both this curve and payback. Self-hosted starts at its capex; a crossing marks payback, not guaranteed savings.</p>
    </div>
    ${printInputsAppendix()}
    <p><button class="btn btn-s" id="export">Export estimate (JSON)</button> <button class="btn btn-s" id="print-summary">Print / save PDF</button> <span class="muted">Inputs, cost scope and cited prices. A planning estimate, not a binding quote.</span></p>
  `;
  $("export").addEventListener("click", () => exportQuote(r));
  $("print-summary").addEventListener("click", () => { if (state.result === r) window.print(); });
  renderOptionTotals(r);
  renderSensitivity();
}

function horizonComparison(r) {
  const cards = OPTION_KEYS.map((k) => {
    const row = r.totals?.[k];
    const on = !!r.lanes[k]?.enabled && !!row?.priced && row.horizon_total != null;
    return { k, on, value: on ? Rat.from(moneyValue(row.horizon_total)) : null };
  });
  const priced = cards.filter((c) => c.on);
  const best = priced.reduce((a, b) => !a || b.value.lt(a.value) ? b : a, null);
  for (const c of cards) c.win = !!best && c.on && c.value.sub(best.value).sign() === 0;
  return { cards, best, tied: cards.filter((c) => c.win).length > 1 };
}

const COMPARISON_EXCLUSIONS = "Owned running cost defaults to electricity only; include rack space, staffing, maintenance and network costs in its monthly override. Rental infrastructure is billed on modelled usage-hours, not an always-on reserved fleet. Unentered implementation, integration and other fees default to zero. Taxes, financing, depreciation/resale and model-quality differences are not modelled. Validate capacity, availability and prices before a client decision.";

// Read the same real controls for JSON and print, including vaulted/dynamic
// fields but never their range companions. Render alongside the result so
// invalidation clears the appendix too; printing cannot pair old/new inputs.
function enteredControls() {
  return [...document.querySelectorAll("input, select")].filter(isCostControl);
}

function printInputsAppendix() {
  const rows = enteredControls().map((el) => {
    const label = el.labels?.[0]?.textContent?.trim() || el.id;
    const selected = el.tagName === "SELECT" ? el.selectedOptions?.[0]?.textContent?.trim() : "";
    const value = el.value === "" ? `Not entered${el.placeholder ? ` — ${el.placeholder}` : " (automatic where available)"}` : el.value;
    return `<div><dt>${escapeHtml(label)} <code>${escapeHtml(el.id)}</code></dt><dd>${escapeHtml(value)}${selected && selected !== el.value ? ` — ${escapeHtml(selected)}` : ""}</dd></div>`;
  }).join("");
  return `<section class="print-only print-inputs"><h2>Scenario inputs</h2><p>Exact entries used for this estimate. Blank overrides use the displayed derived/default basis where available; blank commercial fees default to zero. Slider positions are not separate inputs. Snapshot: ${escapeHtml(state.manifest.snapshot_digest)}.</p><dl>${rows}</dl></section>`;
}

function renderOptionTotals(r) {
  const { cards, best, tied } = horizonComparison(r);
  const months = r.horizon_months;
  const overlay = r.overlay;
  $("comparison-scope").innerHTML = `<h2>Modelled cost over ${months} month${months === 1 ? "" : "s"}</h2>
    <p>Infrastructure + platform licence + one-time costs · THB · lowest among priced options, not a like-for-like quality recommendation.</p>
    <p><strong>Additional commercial fees: ${money(overlay?.overlay_total ?? "0")} over ${months} months.</strong> Consulting and enterprise licensing are excluded from the comparison, curve and payback below.${overlay?.itemized.length ? ` ${overlay.itemized.map((i) => `${escapeHtml(i.name)}: ${money(i.amount)}/${i.basis === "monthly" ? "month" : "one-time"} (${money(i.extended)} across the period)`).join("; ")}.` : " No commercial fees entered; zero does not mean none will be required."}</p>
    <details class="screen-only"><summary>Review assumptions &amp; exclusions</summary><p>${COMPARISON_EXCLUSIONS}</p></details>
    <div class="print-only"><h3>Assumptions &amp; exclusions</h3><p>${COMPARISON_EXCLUSIONS}</p></div>`;
  $("verdict").innerHTML = cards.map((c) => {
    const row = r.totals?.[c.k];
    const delta = c.on && best ? c.value.sub(best.value) : null;
    const more = delta && delta.sign() > 0
      ? (money(delta) === "฿0.00" ? "Less than ฿0.01 more across the period" : `${money(delta)} more across the period`) : "";
    const sub = !c.on ? "Not fully costed — check pricing and configuration" : c.win
      ? `${tied ? "Joint lowest" : "Lowest"} modelled cost across the period` : more;
    return `<div class="vcard${c.win ? " best" : ""}">
      <h4>${escapeHtml(OPTION[c.k].label)}${c.win ? ` <span class="tag tag-est">${tied ? "joint lowest" : "lowest"}</span>` : ""}</h4>
      <div class="n">${c.on ? money(row.horizon_total) : "&mdash;"}</div>
      <div class="s">${sub}</div>
      ${c.on ? `<div class="s">${money(row.monthly_total)} / month + ${money(row.one_time)} one-time</div><div class="s">${row.subscription_applies ? `${money(row.subscription_monthly)} / month platform licence included` : "No platform licence applied"}</div>` : ""}
    </div>`;
  }).join("");
}

const coerce = (v) => {
  if (v instanceof Dec || v instanceof Rat) return v;
  const s = String(v);
  const m = /^(-?\d+)\/(\d+)$/.exec(s);
  return m ? new Rat(BigInt(m[1]), BigInt(m[2])) : Dec.from(s);
};
const fmt = (v, places) => (v === null || v === undefined ? "—" : formatHalfUp(coerce(v), places));

const fmtPer1M = (v) => {
  if (v === null || v === undefined) return "—";
  return `฿${groupDecimal(formatHalfUp(toTHB(moneyValue(v), state.fx), 6))}`;
};

function renderCurve(curve, payback = {}) {
  const w = 900, h = 260;
  const pad = { left: 78, right: 128, top: 42, bottom: 34 };
  const chartNumber = (raw) => {
    const value = toTHB(moneyValue(raw), state.fx);
    return value instanceof Rat ? Number(value.n) / Number(value.d) : Number(value.toString());
  };
  const series = OPTION_KEYS.map((key) => ({
    key,
    points: curve
      .filter((p) => p[key] !== null && p[key] !== undefined)
      .map((p) => ({ month: p.month, raw: p[key], value: chartNumber(p[key]) })),
  }));
  const numeric = series.flatMap((s) => s.points.map((p) => p.value)).filter(Number.isFinite);
  const maxV = Math.max(...numeric, 1);
  const x = (m) => pad.left + ((m - 1) / Math.max(1, curve.length - 1)) * (w - pad.left - pad.right);
  const y = (v) => h - pad.bottom - (v / maxV) * (h - pad.top - pad.bottom);
  const tickMoney = new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    currencyDisplay: "narrowSymbol",
    notation: maxV >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  });

  const grid = Array.from({ length: 4 }, (_, i) => {
    const value = maxV * (i / 3);
    const yy = y(value);
    return `<line x1="${pad.left}" y1="${yy.toFixed(1)}" x2="${w - pad.right}" y2="${yy.toFixed(1)}" stroke="rgba(232,230,240,.12)" />`
      + `<text x="${pad.left - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="rgba(232,230,240,.5)" font-size="10" font-family="monospace">${escapeHtml(tickMoney.format(value))}</text>`;
  }).join("");

  const paths = series.map((s) => {
    if (!s.points.length) return "";
    const pts = s.points.map((p) => `${x(p.month).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${OPTION[s.key].color}" stroke-width="2" />`;
  }).join("");

  const legend = series.map((s, i) => {
    const suffix = s.points.length ? "" : " — not costed";
    const color = s.points.length ? OPTION[s.key].color : "rgba(232,230,240,.45)";
    return `<text x="${pad.left + i * 225}" y="18" fill="${color}" font-size="11" font-family="monospace">${escapeHtml(OPTION[s.key].label + suffix)}</text>`;
  }).join("");

  const endLabels = series.map((s) => {
    const last = s.points.at(-1);
    if (!last) return "";
    return `<text x="${(x(last.month) + 7).toFixed(1)}" y="${(y(last.value) + 4).toFixed(1)}" fill="${OPTION[s.key].color}" font-size="10" font-family="monospace">${escapeHtml(money(last.raw))}</text>`;
  }).join("");

  const paybackRules = [
    { value: payback.vs_model_api, target: "B" },
    { value: payback.vs_rented_gpu, target: "C" },
  ].filter(({ value }) => value?.converges && value.months >= 1 && value.months <= curve.length)
    .map(({ value, target }, i) => {
      const xx = x(value.months);
      return `<line x1="${xx.toFixed(1)}" y1="${pad.top}" x2="${xx.toFixed(1)}" y2="${h - pad.bottom}" stroke="${OPTION[target].color}" stroke-width="1" stroke-dasharray="4 4" opacity=".8" />`
        + `<text x="${(xx + 4).toFixed(1)}" y="${pad.top + 11 + i * 12}" fill="${OPTION[target].color}" font-size="9" font-family="monospace">payback vs ${escapeHtml(OPTION[target].label)} · mo ${value.months}</text>`;
    }).join("");

  const axis = `<line x1="${pad.left}" y1="${h - pad.bottom}" x2="${w - pad.right}" y2="${h - pad.bottom}" stroke="rgba(232,230,240,.3)" />`
    + `<text x="${pad.left}" y="${h - 9}" fill="rgba(232,230,240,.5)" font-size="10" font-family="monospace">mo 1</text>`
    + `<text x="${w - pad.right - 34}" y="${h - 9}" fill="rgba(232,230,240,.5)" font-size="10" font-family="monospace">mo ${curve.length}</text>`;
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="cumulative cost over the horizon">${legend}${grid}${paybackRules}${paths}${endLabels}${axis}</svg>`;
}

// Scale one offer's prices by an exact rational factor — the sensitivity's
// price axis re-quotes a scaled TARIFF through the engine; it never rescales a
// displayed number with floating-point math (peer G9).
function scaleOfferPrices(offer, pm) {
  const scale = (s) => {
    const p = Rat.from(Dec.from(s)).mul(Rat.from(Dec.from(String(pm))));
    const d = ratToDecExact(p);
    return d === null ? null : d.toString();
  };
  const clone = JSON.parse(JSON.stringify(offer));
  for (const k of Object.keys(clone.prices ?? {})) {
    const v = scale(clone.prices[k]);
    if (v === null) return null;
    clone.prices[k] = v;
  }
  for (const o of clone.overrides ?? []) {
    for (const k of Object.keys(o.prices ?? {})) {
      const v = scale(o.prices[k]);
      if (v === null) return null;
      o.prices[k] = v;
    }
  }
  return clone;
}

function renderSensitivity() {
  const r = state.result;
  const inp = state.inputs;
  const primary = inp?.laneB?.offer_ids?.[0] ?? null;
  if (!r || !inp || !primary || !state.catalog?.offers?.[primary]) {
    $("sensitivity").innerHTML = `<div class="card"><h3>Sensitivity</h3><p class="muted">Select a priced API model — the user/price grid reruns the full comparison per cell and needs a priced offer.</p></div>`;
    return;
  }
  const baseUsers = decInput("f-users");
  const userMultipliers = [0.5, 0.75, 1, 1.5, 2];
  const priceMultipliers = [0.8, 1, 1.25];
  const head = `<tr><th>users \\ API price</th>${priceMultipliers.map((p) => `<th class="n">&times;${p}</th>`).join("")}</tr>`;
  const body = userMultipliers.map((um) => {
    const users = scaleUsers(baseUsers, um);
    // Each row is a WHOLE scenario at that headcount: sessions, tokens, the peak
    // second and the fleet are re-derived together, so a row that crosses a GPU
    // boundary is priced on the bigger fleet instead of silently reusing the base one.
    let scen;
    try {
      scen = buildScenario(users);
    } catch {
      return `<tr><td>${groupInt(users)} <span class="muted">&times;${um}</span></td>${priceMultipliers.map(() => `<td class="n muted">n/d</td>`).join("")}</tr>`;
    }
    const fleet = `${scen.sizing.gpus_required.text} &times; ${escapeHtml(scen.gpuId)}`;
    const cells = priceMultipliers.map((pm) => {
      let catalog = scen.inputs.catalog;
      if (pm !== 1) {
        const scaled = scaleOfferPrices(state.catalog.offers[primary], pm);
        if (scaled === null) return `<td class="n muted">n/d</td>`;
        catalog = { offers: { [primary]: scaled } };
      }
      const res = runComparison({ ...scen.inputs, catalog, evidenceRows: [] });
      // The winning OPTION and its horizon total — not the routing monthly. Under
      // local_first the routing monthly is ALWAYS lane A's, and lane A's monthly
      // excludes the capex that decides the answer, so every cell in this grid
      // read the same figure and the panel built to expose the crossover could
      // not expose one. Ranking on horizon_total is what makes a cell flip.
      const cls = um === 1 && pm === 1 ? `style="color:#E8E6F0"` : "";
      const ranked = ["A", "B", "C"]
        .filter((k) => res.totals?.[k]?.priced && res.totals[k].horizon_total !== null)
        .sort((a, b) => toRat(res.totals[a].horizon_total).cmp(toRat(res.totals[b].horizon_total)));
      if (ranked.length === 0) return `<td class="n muted">n/d</td>`;
      const win = ranked[0];
      const runnerUp = ranked[1] ?? null;
      // Exact difference, and omitted rather than approximated when the quotient
      // does not terminate — the same rule every other money figure here follows.
      const marginStr = runnerUp
        ? ratToDecExact(toRat(res.totals[runnerUp].horizon_total).sub(toRat(res.totals[win].horizon_total)))
        : null;
      return `<td class="n" ${cls}>${numProv(`${escapeHtml(OPTION[win].label)} ${money(res.totals[win].horizon_total)}`, [
        ["scenario", `${groupInt(users)} users, API price x${pm}`],
        ["peak", `${scen.peak.peak_tokens_s.text} tok/s`],
        ["fleet at this scale", `${scen.sizing.gpus_required.text} x ${scen.gpuId}`],
        ...ranked.map((k) => [OPTION[k].label, `${money(res.totals[k].horizon_total)} over ${res.horizon_months} months`]),
        ...(marginStr ? [["margin over runner-up", money(marginStr)]] : []),
        ["basis", "full engine rerun — demand, peak second, fleet, capex and every one-time cost re-derived"],
        ["snapshot digest", state.manifest.snapshot_digest],
      ])}</td>`;
    }).join("");
    return `<tr><td>${groupInt(users)} <span class="muted">&times;${um} &middot; ${fleet}</span></td>${cells}</tr>`;
  }).join("");
  $("sensitivity").innerHTML = `<div class="card"><h3>Which option wins, and where that flips</h3><table><thead>${head}</thead><tbody>${body}</tbody></table><p class="muted">Each cell names the lowest ${r.horizon_months}-month modelled cost at that scenario — infrastructure, applicable platform subscriptions and one-time costs, the same basis as the comparison table. Each cell reruns demand, peak load, GPU sizing and capex; entered GPU counts or budgets stay fixed. Consulting and enterprise-licensing fees remain excluded. The API-price axis re-quotes a tariff scaled exactly. A row where the named option changes is the crossover.</p></div>`;
}

// Exported calculator money is never a bare number. Every record carries the
// exact source/engine USD value and its exact + rounded THB presentation value,
// so a downstream reader cannot mistake one unit for the other. Conversion is
// performed once here, at the export boundary, using the same exact Rat as the UI.
const THB_MONEY_INPUT_IDS = new Set([
  "f-sh-capex", "f-sub-price", "f-sh-fixed", "f-power-rate", "fo-license",
  "fo-consult", "f-onetime-b", "f-onetime-c", "fo-impl",
]);
const EXPORT_MONEY_KEYS = new Set([
  "amount", "capex", "cost", "delta", "extended", "fixed_monthly",
  "fully_loaded_total", "horizon_total", "hourly_rate", "infra_monthly",
  "infra_total", "line_cost", "monthly", "monthly_opex", "monthly_savings",
  "monthly_total", "one_time", "overlay_total", "per_token", "request_cost",
  "recommended_monthly_total", "self_hosted_capex", "self_hosted_monthly_opex",
  "self_hosted_one_time_total", "subscription_monthly", "target_monthly", "total",
  "unit_price",
]);

function exportMoneyRecord(value) {
  if (value === null || value === undefined) return null;
  const usd = toRat(moneyValue(value));
  const thb = toTHB(usd, state.fx);
  return {
    engine_currency: "USD",
    engine_exact: ratStr(usd),
    presentation_currency: "THB",
    presentation_exact: ratStr(thb),
    presentation_rounded: formatHalfUp(thb, 2),
  };
}

function isExportMoneyField(key, path) {
  const parent = path[path.length - 1] ?? "";
  if (EXPORT_MONEY_KEYS.has(key) || /_usd$/.test(key)) return true;
  if (key === "value" && (EXPORT_MONEY_KEYS.has(parent) || /_usd$/.test(parent) || parent === "per_1m")) return true;
  if (path.includes("curve") && key !== "month") return true;
  if (path.includes("one_time") && /^[ABC]$/.test(key)) return true;
  return false;
}

function exportMoneyTree(value, path = []) {
  if (Array.isArray(value)) return value.map((item, i) => exportMoneyTree(item, [...path, String(i)]));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const nextPath = [...path, key];
    if (child !== null && typeof child !== "object" && isExportMoneyField(key, path)) {
      return [key, exportMoneyRecord(child)];
    }
    return [key, exportMoneyTree(child, nextPath)];
  }));
}

function buildComponentLedger(r) {
  const d = state.demand;
  const fx = fxProvenance(state.fx);
  const option = (k) => {
    const total = r.totals?.[k] ?? {};
    return {
      option: OPTION[k].key,
      label: OPTION[k].label,
      recurring_infrastructure: exportMoneyRecord(total.infra_monthly),
      recurring_subscription: exportMoneyRecord(total.subscription_monthly),
      recurring_total: exportMoneyRecord(total.monthly_total),
      one_time: exportMoneyRecord(total.one_time),
      horizon_total: exportMoneyRecord(total.horizon_total),
      formula: "horizon_total = recurring_total × horizon_months + one_time",
      priced: !!total.priced,
    };
  };
  const sources = Object.fromEntries(Object.entries(state.manifest?.sources ?? {}).map(([id, source]) => [id, {
    origin: source.origin ?? "snapshot",
    status: source.status,
    observed_at: source.observed_at,
    last_success_at: source.last_success_at,
    integrity: source.integrity,
    record_count: source.record_count,
  }]));
  return {
    schema: "factor-io.tco-component-ledger/1.0.0",
    currency_contract: {
      authored_inputs: "THB",
      engine_and_source_prices: "USD",
      presentation_and_export: "THB",
      rounding: "round half up to 2 places at presentation only",
      fx,
    },
    demand: d ? {
      users: d.demand.users.text,
      sessions_per_month: d.demand.sessions_mo.text,
      tokens_per_month: d.demand.tokens_mo.text,
      peak_tokens_per_second: d.peak.peak_tokens_s.text,
      formula: "sessions/month = users × sessions/day × working days; tokens/month = Σ workload share × turns × token shape; peak tok/s = concurrent peak × stream tok/s",
      per_workload: d.demand.workloads.map((w) => ({ type: w.type, share: w.share.text, turns_mo: w.turns_mo.text, tokens_mo: w.tokens_mo.text })),
    } : null,
    sizing: d ? {
      gpu_id: state.inputs?.laneA?.hardware_topology ?? null,
      gpus_required: d.sizing.gpus_required.text,
      tokens_per_second_per_gpu: d.sizing.tokens_s_per_gpu.text,
      assumed: d.sizing.assumed,
      formula: "GPUs required = ceil(peak tok/s ÷ modelled or measured tok/s per GPU), subject to model memory fit",
    } : null,
    recurring: Object.fromEntries(OPTION_KEYS.map((k) => [OPTION[k].key, option(k)])),
    capex: state.capexPlan ? exportMoneyTree(state.capexPlan, ["capex"]) : { unavailable: state.capexGap },
    power: state.powerPlan ? exportMoneyTree(state.powerPlan, ["power"]) : { unavailable: state.powerGap },
    subscription: state.subPlan ? exportMoneyTree(state.subPlan, ["subscription"]) : { unavailable: state.subGap },
    routing: exportMoneyTree(r.routing_result, ["routing"]),
    commercial_overlay: exportMoneyTree(r.overlay, ["commercial_overlay"]),
    exclusions: {
      comparison: COMPARISON_EXCLUSIONS,
      overlay_treatment: "Consulting and enterprise licensing are itemized but excluded from option totals, curve and payback.",
    },
    freshness: { sources, live_failures: { ...state.liveFailures } },
    formulas: [
      "API monthly = Σ(meter unit price × request quantity) × requests/month",
      "Rental monthly = fleet hourly price × modelled GPU-hours/month",
      "Power monthly = facility kW × 730 hours × electricity tariff",
      "Capex = whole nodes purchased × selected server unit price",
      "Subscription = billable meter quantity × unit price, normalized by term",
      "Horizon total = recurring monthly total × horizon months + one-time total",
    ],
  };
}

// The exported quote carries the OPTION names, never the engine's internal
// A/B/C keys — the naming contract binds the export surface too (SPEC 8).
function exportQuote(r) {
  if (!r || state.result !== r || state.selecting) return;
  const named = {};
  for (const k of OPTION_KEYS) named[OPTION[k].key] = r.lanes[k];
  const d = state.demand;
  const payload = {
    cost_scope: "Horizon totals include modelled infrastructure, applicable platform subscription and one-time costs. Consulting and enterprise-licensing overlay is additional, excluded from totals, curve and payback. Per-token figures and routing sensitivity are infrastructure-only. Planning estimate, not a binding quote.",
    currency_contract: {
      authored_inputs: "THB",
      engine_and_source_prices: "USD",
      presentation_and_export: "THB",
      fx: fxProvenance(state.fx),
    },
    entered_inputs: Object.fromEntries(enteredControls().map((el) => [el.id, el.value])),
    entered_input_units: Object.fromEntries(enteredControls().map((el) => [el.id, THB_MONEY_INPUT_IDS.has(el.id) ? "THB" : null])),
    generated_at: new Date().toISOString(),
    snapshot: { digest: state.manifest.snapshot_digest, generated_at: state.manifest.generated_at, schema: state.manifest.schema },
    demand: d ? {
      users: d.demand.users.text,
      sessions_mo: { value: d.demand.sessions_mo.text, basis: d.demand.sessions_mo.basis },
      turns_mo: { value: d.demand.turns_mo.text, basis: d.demand.turns_mo.basis },
      tokens_mo: { value: d.demand.tokens_mo.text, basis: d.demand.tokens_mo.basis },
      in_tokens_mo: d.demand.in_tokens_mo.text,
      out_tokens_mo: d.demand.out_tokens_mo.text,
      cached_tokens_mo: d.demand.cached_tokens_mo.text,
      per_workload: d.demand.workloads.map((w) => ({
        type: w.type,
        share: w.share.text,
        turns_mo: { value: w.turns_mo.text, basis: w.turns_mo.basis },
        tokens_mo: w.tokens_mo.text,
      })),
      peak: {
        concurrent_sessions: d.peak.concurrent_peak.text,
        tokens_s_per_stream: d.peak.tokens_s_per_stream.text,
        peak_tokens_s: d.peak.peak_tokens_s.text,
        below_interactive_floor: d.peak.below_interactive_floor,
      },
      sizing: {
        gpus_required: d.sizing.gpus_required.text,
        tokens_s_per_gpu: { value: d.sizing.tokens_s_per_gpu.text, basis: d.sizing.tokens_s_per_gpu.basis },
        assumed: d.sizing.assumed,
      },
    } : null,
    rented_gpu_source: state.rentRow ? exportMoneyTree({
      provider: state.rentRow.provider_label,
      sku: state.rentRow.sku,
      gpu_hourly_usd: state.rentRow.gpu_hourly_usd,
      confidence: state.rentRow.confidence,
      source_url: state.rentRow.source_url,
      observed_at: state.rentRow.observed_at,
    }, ["rented_gpu_source"]) : null,
    // The cross-provider comparison travels with the quote: whoever receives this
    // file needs the alternatives that were rejected, not only the one selected.
    rented_gpu_by_provider: state.rentByProvider
      ? exportMoneyTree({ priced: state.rentByProvider.priced, unservable: state.rentByProvider.unservable }, ["rented_gpu_by_provider"])
      : null,
    // v0.5: the hardware the capex was derived from travels with the quote. A
    // price band with no citation is not reviewable, so the row's source and
    // its verification status ship beside the number.
    server_config: state.capexPlan
      ? exportMoneyTree({
          server_id: state.capexPlan.server_id,
          label: state.capexPlan.label,
          gpu_id: state.capexPlan.gpu_id,
          price_basis: state.capexPlan.price_basis,
          unit_price: state.capexPlan.unit_price,
          nodes: state.capexPlan.nodes,
          gpus_required: state.capexPlan.gpus_required,
          gpus_provisioned: state.capexPlan.gpus_provisioned,
          gpus_overprovisioned: state.capexPlan.gpus_overprovisioned,
          capex: state.capexPlan.capex,
          confidence: state.capexPlan.confidence,
          source_url: state.capexPlan.source_url,
          observed_at: state.capexPlan.observed_at,
          verification: state.capexPlan.verification,
          // A derived_component figure is only reviewable if the quote carries
          // the arithmetic that built it — the card price, the GPU cost-share
          // band, the formula and both cited inputs. Shipping the number with
          // just a confidence tag would ask the reader to trust a construction
          // they cannot re-run. Null on an indicative row, which cites instead.
          derivation: state.capexPlan.derivation,
          derived_from: state.capexPlan.derived_from,
        }, ["server_config"])
      : { unavailable: state.capexGap },
    // Which of the two the engine actually charged. An entered figure outranks
    // the derived one, and a quote that does not say which was used cannot be
    // audited against the registry it cites.
    capex_basis: $("f-sh-capex").value.trim() === "" ? "derived" : "user_override",
    // The licence's meter and its amount have different authorities, so both
    // provenance fields travel — collapsing them would present an aggregator's
    // estimate as a vendor list price.
    subscription_source: state.subPlan ? exportMoneyTree({ ...state.subPlan }, ["subscription_source"]) : { unavailable: state.subGap },
    component_ledger: buildComponentLedger(r),
    result: exportMoneyTree({
      policy: r.policy,
      options: named,
      routing_result: r.routing_result,
      payback: r.payback,
      breakeven: r.breakeven,
      throughput: r.throughput,
      overlay: r.overlay,
      // The three v0.5 additions: the licence as applied (with the options it
      // was and was NOT charged to), the one-time roll-up per option, and the
      // combined totals the verdict cards rank on. lanes[] stays infra-only, so
      // without these a reader of the quote could not reproduce the ranking.
      subscription: r.subscription,
      one_time: r.one_time,
      totals: r.totals,
      curve: r.curve.map((p) => ({
        month: p.month,
        [OPTION.A.key]: p.A === null ? null : p.A,
        [OPTION.B.key]: p.B === null ? null : p.B,
        [OPTION.C.key]: p.C === null ? null : p.C,
      })),
      horizon_months: r.horizon_months,
      reasons: r.reasons,
    }, ["result"]),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tco-quote-${state.manifest.snapshot_digest}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

init();