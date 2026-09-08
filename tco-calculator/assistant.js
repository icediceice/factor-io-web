// Dedicated advisor controller. Never imports or runs the calculator DOM runtime.
import { INTERVIEW_QUESTIONS, MINIMAX_DEFAULTS, createRequestFence, isInterviewComplete, buildPlannerPlan } from "./planner.js?v=20260907-guided";
import { CHAT_LIMITS, createChatHistory, requestChatTurn, toolResultMessage, buildOfflineRequest } from "./chat.js?v=20260908-conversation-v4";
import { readHandoff, writeProposal, clearHandoffs, serial } from "./assistant-session.js";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function advisorValidation(record, questionId = null) {
  const fields = Object.fromEntries(Object.entries(record?.contracts ?? {}).map(([id, spec]) => [id, { ...spec, values: spec.kind === "model" ? new Set(spec.values ?? []) : spec.values }]));
  const questions = Object.fromEntries(INTERVIEW_QUESTIONS.filter(q => !questionId || q.id === questionId).map(q => [q.id, new Set(q.options.map(o => o.id))]));
  return { fields, questions };
}

export function advisorPrompt(record, { intent = "conversation", questionId = null, answers = {} } = {}) {
  const question = INTERVIEW_QUESTIONS.find(q => q.id === questionId);
  const head = [
    "You are the Factor IO local-AI planning advisor. Answer the visitor's actual question naturally and concisely.",
    "The supplied scenario is CAPTURED calculator evidence, not a live quote. Earlier exchanges are conversation, not pricing evidence. Never calculate or invent prices, savings, capacity, licences or benchmarks; refer to the captured figures displayed by the app without repeating currency or arithmetic in prose.",
    "One owned server has full upfront and idle running costs. Premium API calls remain for difficult work. Never lower demand, hide costs or claim task quality merely to manufacture savings. Spotify's bulk-read token result used Gemini workers, not local hardware and not a total billing reduction.",
    "Starter assumptions are not mutable through tools. A proposal enters CUSTOM SIZING and needs a complete planning_profile and only allowed fields. It does not reconfigure the starter case. Never invent field IDs, credentials, endpoints or markup. The calculator will expand all presets and show the full diff before explicit Apply.",
    "For Nutanix-specific components name a portable Kubernetes or Linux-VM equivalent. Treat models as evaluation candidates, not a guarantee.",
    intent === "spec" ? "Return exactly one present_local_llm_spec tool call, grounded in the applied blueprint and ledger; no free prose." : intent === "assist" ? "Explain only the named guided question. Optionally use answer_question for that question; never select an option." : "Write one to three short paragraphs. Optionally ask_user or propose_calculator_changes. Do not force an interview.",
    "CURRENT_CONTEXT",
  ].join("\n");
  const context = {
    request_mode: intent, guided_question: question ?? null, answers_so_far: answers,
    captured_at: record?.saved_at ?? null, current_scenario: record?.context ?? { status: "No calculator context. Offer general advice only; do not imply access to figures." },
    allowed_controls: record?.contracts ?? {}, deterministic_component_ledger: record?.ledger ?? null,
    deterministic_blueprint: record?.blueprint?.text ?? null,
  };
  const shrink = [
    () => { context.deterministic_blueprint = null; },
    () => { context.deterministic_component_ledger = null; },
    () => { context.allowed_controls = {}; },
    () => { context.current_scenario = record?.context ? { mode: record.context.mode, figures: record.context.figures, exclusions: record.context.exclusions, note: "Detailed context omitted to fit the request budget." } : context.current_scenario; },
  ];
  let encoded = serial(context);
  for (const drop of shrink) { if (head.length + encoded.length + 1 <= CHAT_LIMITS.maxSystemChars) break; drop(); encoded = serial(context); }
  if (head.length + encoded.length + 1 > CHAT_LIMITS.maxSystemChars) throw new Error("This context is too large to send. Reopen the advisor with a smaller scenario.");
  return `${head}\n${encoded}`;
}

export function createAdvisor({ document, record = null, onReturn, requestTurn = requestChatTurn, pageUrl = "https://studio.factor-io.com/tco-assistant.html" }) {
  record = record ? JSON.parse(serial(record)) : null;
  const $ = id => document.getElementById(id);
  const history = createChatHistory();
  const fence = createRequestFence();
  const state = { transcript: [], answers: { ...(record?.answers ?? {}) }, questionIndex: 0, proposal: null, busy: false, controller: null, pending: null, offline: null, spec: null, advice: null };
  function append(role, text, figures = null) {
    state.transcript.push({ role, text: String(text ?? ""), figures });
    if (state.transcript.length > 40) state.transcript.splice(0, state.transcript.length - 40);
    $("ai-transcript").innerHTML = state.transcript.map(row => `<article class="advisor-message" data-role="${row.role}"><span class="who">${row.role === "user" ? "You" : row.role === "assistant" ? "AI advisor" : "Status"}</span><p>${esc(row.text).replace(/\n/g, "<br>")}</p>${row.figures ? `<details><summary>Captured calculator figures when you asked</summary><pre>${esc(serial(row.figures))}</pre></details>` : ""}</article>`).join("");
  }
  function busy(value) {
    state.busy = value; $("ai-send").disabled = value; $("ai-message").disabled = value; $("ai-cancel").hidden = !value;
    $("ai-review").disabled = value || !record || !state.proposal;
    $("ai-guided-review").disabled = value || !record || !isInterviewComplete(state.answers);
    $("ai-request-spec").disabled = value || !record?.applied || !record?.blueprint || !record?.ledger || !!state.proposal || serial(state.answers) !== serial(record?.answers ?? {});
  }
  function cancel(note = "Request cancelled. Your question is ready to retry.") {
    fence.cancel(); state.controller?.abort(); state.controller = null;
    if (state.pending && !$("ai-message").value.trim()) $("ai-message").value = state.pending;
    state.pending = null;
    if (state.busy) { append("status", note); $("ai-model-status").textContent = note; }
    busy(false);
  }
  function renderInterview() {
    const q = INTERVIEW_QUESTIONS[state.questionIndex];
    const answer = state.answers[q.id];
    const selected = typeof answer === "string" ? answer : answer?.id;
    $("ai-interview").innerHTML = `<p class="muted">Question ${state.questionIndex + 1} of ${INTERVIEW_QUESTIONS.length}</p><h2>${esc(q.prompt)}</h2><p>${esc(q.help)}</p><div class="advisor-options">${q.options.map(o => `<div><button class="btn" type="button" data-option="${esc(o.id)}" aria-pressed="${selected === o.id}">${esc(o.label)}${state.advice?.question_id === q.id && state.advice.recommended_option === o.id ? " · AI suggestion (not selected)" : ""}</button>${o.note ? `<p class="muted">${esc(o.note)}</p>` : ""}${o.input ? `<label>${esc(o.input.unit)}<input id="advisor-answer-value" type="text" inputmode="decimal" value="${esc(selected === o.id ? answer?.value ?? "" : "")}"></label>` : ""}</div>`).join("")}</div><div class="starter-actions"><button class="btn" type="button" data-question-back ${state.questionIndex ? "" : "disabled"}>Back</button><button class="btn" type="button" data-question-next ${state.questionIndex === INTERVIEW_QUESTIONS.length - 1 ? "disabled" : ""}>Next</button><button class="btn" type="button" data-question-ask ${state.busy ? "disabled" : ""}>Ask about this question</button></div>`;
    busy(state.busy);
  }
  async function send(message = $("ai-message").value, { intent = "conversation", questionId = null, clearComposer = true } = {}) {
    const text = String(message).trim(); if (!text || state.busy) return;
    if (intent === "spec" && (!record?.applied || !record?.blueprint || !record?.ledger || state.proposal || serial(state.answers) !== serial(record?.answers ?? {}))) { $("ai-model-status").textContent = "Return, review and Apply first, then reopen the advisor with the recomputed result."; return; }
    const tools = intent === "spec" ? ["present_local_llm_spec"] : intent === "assist" ? ["answer_question"] : record ? ["ask_user", "propose_calculator_changes"] : ["ask_user"];
    let systemPrompt;
    try {
      systemPrompt = advisorPrompt(record, { intent, questionId, answers: state.answers });
      state.offline = buildOfflineRequest({ ...MINIMAX_DEFAULTS, history, systemPrompt, userMessage: text, assist: intent !== "spec", toolNames: tools, pageUrl });
      $("ai-copy-request").disabled = false;
    } catch (error) { $("ai-model-status").textContent = error.message; return; }
    const generation = fence.begin(); const controller = new AbortController(); state.controller = controller; state.pending = text;
    if (clearComposer) $("ai-message").value = "";
    append("user", text); busy(true); $("ai-suggestions").innerHTML = "";
    $("ai-model-status").textContent = "Sending only after your explicit action. The calculator is unchanged.";
    try {
      const reply = await requestTurn({ ...MINIMAX_DEFAULTS, history, systemPrompt, userMessage: text, assist: intent !== "spec", toolNames: tools, pageUrl, signal: controller.signal, validationContext: advisorValidation(record, intent === "assist" ? questionId : null) });
      if (!fence.isCurrent(generation)) return;
      let outcome = { status: "displayed", calculator_mutated: false };
      const call = reply.toolCall;
      if (call && !tools.includes(call.name)) throw new Error("The reply used an unsupported action. Nothing changed; please retry.");
      const args = call?.arguments;
      let prose = reply.prose ?? "";
      if (call?.name === "ask_user") prose = [prose, args.question, args.rationale].filter(Boolean).join("\n\n");
      if (call?.name === "answer_question") { state.advice = args; prose = [prose || args.answer, args.why, ...(args.caveats ?? [])].filter(Boolean).join("\n\n"); renderInterview(); outcome.option_selected = false; }
      if (call?.name === "propose_calculator_changes") {
        state.proposal = args; $("ai-proposal").hidden = false; $("ai-proposal-summary").textContent = args.summary; $("ai-proposal").focus?.();
        prose = [prose, args.summary, "Nothing changed. Review the complete custom configuration in the calculator before Apply."].filter(Boolean).join("\n\n");
        outcome = { status: "previewed", calculator_mutated: false, awaiting_explicit_apply: true };
      }
      if (call?.name === "present_local_llm_spec") { state.spec = serial(args); $("advisor-spec-text").textContent = JSON.stringify(args, null, 2); $("advisor-spec").hidden = false; prose = `${args.title}\n\n${args.summary}`; }
      append("assistant", prose, record?.context?.figures ?? null);
      const suggestions = (args?.suggested_replies ?? []).slice(0, 4);
      $("ai-suggestions").innerHTML = suggestions.map((s, i) => `<button type="button" class="btn" data-suggestion="${i}">${esc(s)}</button>`).join(""); state.suggestions = suggestions;
      const calls = reply.assistantMessage.tool_calls ?? [];
      const retainable = Array.isArray(calls) && calls.every(c => typeof c?.id === "string" && c.id.trim() && c.type === "function" && typeof c.function?.name === "string" && typeof c.function?.arguments === "string") && new Set(calls.map(c => c.id)).size === calls.length;
      if (retainable) history.append({ user: reply.user, assistant: reply.assistantMessage, tools: calls.map(c => toolResultMessage(c, c.id === call?.id ? outcome : { status: "rejected", calculator_mutated: false, reason: reply.toolError ?? "unsupported_tool" })) });
      state.pending = null;
      $("ai-model-status").textContent = `Answer received. No controls changed. ${retainable ? "Up to eight complete exchanges are retained for follow-ups." : "This malformed exchange could not be retained."}${reply.toolError ? " An invalid optional suggestion was ignored." : ""}`;
    } catch (error) {
      if (!fence.isCurrent(generation)) return;
      if (state.pending && !$("ai-message").value.trim()) $("ai-message").value = state.pending;
      state.pending = null; append("status", `${error.message} Your question is ready to retry. Nothing changed.`); $("ai-model-status").textContent = error.message;
    } finally { if (fence.isCurrent(generation)) { state.controller = null; busy(false); } }
  }
  function returnForReview(proposal) { try { if (!record || state.busy) return; onReturn(proposal); } catch (error) { $("ai-model-status").textContent = error.message; } }
  async function copy(text) {
    if (!text) { $("ai-model-status").textContent = "Nothing is ready to copy."; return; }
    try { await globalThis.navigator?.clipboard?.writeText(text); if (!globalThis.navigator?.clipboard) throw new Error("unavailable"); }
    catch {
      const area = document.createElement("textarea"); area.value = text; area.setAttribute("readonly", ""); document.body.appendChild(area); area.select();
      const copied = document.execCommand?.("copy");
      if (!copied) { $("ai-model-status").textContent = "Clipboard unavailable. Select and copy the text below."; area.focus(); return; }
      area.remove();
    }
    $("ai-model-status").textContent = "Copied.";
  }
  $("ai-composer").addEventListener("submit", e => { e.preventDefault(); void send(); });
  $("ai-message").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } });
  $("ai-cancel").addEventListener("click", () => cancel());
  $("ai-copy-request").addEventListener("click", () => {
    try {
      const text = $("ai-message").value.trim();
      if (text) state.offline = buildOfflineRequest({ ...MINIMAX_DEFAULTS, history, systemPrompt: advisorPrompt(record, { answers: state.answers }), userMessage: text, assist: true, toolNames: record ? ["ask_user", "propose_calculator_changes"] : ["ask_user"], pageUrl });
      void copy(state.offline?.copyText);
    } catch (error) { $("ai-model-status").textContent = error.message; }
  });
  $("ai-suggestions").addEventListener("click", e => { const b = e.target.closest("[data-suggestion]"); if (b) { $("ai-message").value = state.suggestions[Number(b.dataset.suggestion)]; $("ai-message").focus(); } });
  $("ai-review").addEventListener("click", () => returnForReview({ kind: "proposal", value: state.proposal }));
  $("ai-dismiss").addEventListener("click", () => { state.proposal = null; $("ai-proposal").hidden = true; busy(state.busy); });
  $("ai-guided-review").addEventListener("click", () => { if (!isInterviewComplete(state.answers)) return; try { buildPlannerPlan(state.answers); returnForReview({ kind: "guided", answers: state.answers }); } catch (error) { $("ai-model-status").textContent = error.message; } });
  $("ai-interview").addEventListener("click", e => {
    const q = INTERVIEW_QUESTIONS[state.questionIndex]; const button = e.target.closest("[data-option]");
    if (button) { const option = q.options.find(o => o.id === button.dataset.option); if (!option) return; state.answers[q.id] = option.input ? { id: option.id, value: $("advisor-answer-value")?.value.trim() ?? "" } : option.id; renderInterview(); }
    if (e.target.closest("[data-question-back]") && state.questionIndex > 0) { state.questionIndex--; renderInterview(); }
    if (e.target.closest("[data-question-next]") && state.questionIndex < INTERVIEW_QUESTIONS.length - 1) { state.questionIndex++; renderInterview(); }
    if (e.target.closest("[data-question-ask]")) void send(`Help me decide: ${q.prompt}`, { intent: "assist", questionId: q.id, clearComposer: false });
  });
  $("ai-interview").addEventListener("input", e => { if (e.target.id !== "advisor-answer-value") return; const q = INTERVIEW_QUESTIONS[state.questionIndex]; const option = q.options.find(o => o.input); if (option) { state.answers[q.id] = { id: option.id, value: e.target.value.trim() }; busy(state.busy); } });
  $("ai-request-spec").addEventListener("click", () => void send("Explain the applied deployment blueprint and its supplied cost components without new arithmetic.", { intent: "spec", clearComposer: false }));
  $("ai-copy-blueprint").addEventListener("click", () => void copy(record?.blueprint?.text));
  $("ai-copy-prompt").addEventListener("click", () => void copy(record?.localPrompt));
  $("ai-copy-spec").addEventListener("click", () => void copy(state.spec));
  $("ai-download").addEventListener("click", () => { if (!record?.blueprint?.text) return; const url = URL.createObjectURL(new Blob([record.blueprint.text], { type: "text/plain" })); const link = document.createElement("a"); link.href = url; link.download = "local-llm-blueprint.txt"; link.click(); URL.revokeObjectURL(url); });
  $("advisor-context").innerHTML = record ? `<details><summary>Captured ${esc(record.context?.label ?? "calculator scenario")} · ${esc(new Date(record.saved_at).toISOString())}</summary><pre>${esc(JSON.stringify(record.context, null, 2))}</pre><p class="muted">Prices may change while you are here. The calculator revalidates and recomputes any applied configuration.</p></details>` : '<p class="starter-warning">No current calculator context. You can ask general questions, or return to the calculator and open this page from a selected example. Proposals and grounded specifications are unavailable.</p>';
  $("advisor-blueprint").hidden = !record?.applied || !record?.blueprint;
  $("advisor-blueprint-text").textContent = record?.blueprint?.text ?? "";
  renderInterview(); busy(false);
  return { state, history, send, cancel, renderInterview };
}

function initAdvisor() {
  const id = new URL(location.href).searchParams.get("scenario");
  let storage; let record = null;
  try { storage = sessionStorage; record = readHandoff(storage, id); } catch { /* useful general-context page */ }
  const advisor = createAdvisor({ document, record, pageUrl: location.href, onReturn(proposal) { writeProposal(storage, id, proposal); location.assign(`tco-calculator.html?advisor=${encodeURIComponent(id)}`); } });
  if (record) document.getElementById("advisor-back").href = `tco-calculator.html?advisor=${encodeURIComponent(id)}`;
  globalThis.addEventListener("pagehide", () => advisor.cancel("Navigation cancelled the pending request."));
  document.getElementById("advisor-reset").addEventListener("click", () => { if (!globalThis.confirm("Clear this tab's advisor scenarios, proposals and current conversation?")) return; advisor.cancel(); try { clearHandoffs(storage); } catch {} location.replace("tco-assistant.html"); });
}
if (typeof document !== "undefined" && document.getElementById("advisor-context")) initAdvisor();
