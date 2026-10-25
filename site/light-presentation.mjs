import { config } from './config.mjs';
import { esc, renderJsonLd } from './templates.mjs';

export const lightContent = {
  en: {
    metaTitle: 'Light | Declarative AI Agent Governance & Execution Control Plane | Factor IO',
    metaDescription: 'Light is the declarative governance and execution control plane for enterprise AI coding and operations agents. Solve mid-to-large scale AI adoption with scoped plans, independent multi-model review, 97.5% lower tool-return token volume, and hash-chained audit receipts.',
    skipLink: 'Skip to main presentation content',
    brandSub: 'Declarative AI Governance Control Plane',
    navProblem: '01. Adoption Wall',
    navArchitecture: '02. Control Plane',
    navVelocity: '03. Velocity Engine',
    navEconomics: '04. Self-Funding ROI',
    navEvidence: '05. Proof & CISO Map',
    navPilot: '06. 30-Day Rollout',
    modeReading: 'Dossier Read',
    modePresentation: 'Slide Walk',
    fullscreenBtn: 'Fullscreen',
    langToggleLabel: 'Switch language',
    backToStudio: 'Factor IO Studio',
    offeringsLink: 'Service Catalog',
    lightopsLink: 'LightOps AI',
    chapterIndicatorPrefix: 'Chapter',
    prevChapter: 'Previous chapter',
    nextChapter: 'Next chapter',

    heroEyebrow: 'ENTERPRISE AI ADOPTION & GOVERNANCE DOSSIER (EN / TH)',
    heroTitle: 'Scale AI agents across engineering and operations without losing the wheel.',
    heroLead: 'Enterprise AI adoption rarely stalls because models cannot write code. It stalls at 50 to 500 seats when unscoped file mutations, 441% longer PR review queues, and unverified deployments force leadership to choose between developer velocity and operational control. Light governs every agent action through one declarative control plane that pays for itself in recovered engineering hours and avoided context waste.',
    heroPrimaryCta: 'Model Your Team Economics',
    heroSecondaryCta: 'Inspect 6-Layer Architecture',
    heroBriefingCta: 'Request 30-Day Shadow Pilot',
    heroBoundaryTitle: 'Enforcement & Dialect Scope Boundary',
    heroBoundaryBody: 'Light governs the actions routed through it; native-tool restrictions ship as launch configuration, and actions taken outside Light are not covered. Harness integrations are declarative for known dialects (\'integration defined in the stack\' across seven harness specifications and six product families: Claude Code, Codex, Antigravity, ZCode, Muse and Pi) and no operational-history claim is made for any integration.',

    stat1Value: '1,000,000+',
    stat1Label: 'Governed tool calls in Light\'s reference deployment since March 2026 (U-1)',
    stat2Value: '97.5%',
    stat2Label: 'Lower tool-return token volume via tree-sitter smart index across 3,766 turns (L-14, E-6)',
    stat3Value: '8,600+',
    stat3Label: 'Out-of-scope or out-of-phase tool calls refused before execution in reference deployment (U-3)',
    stat4Value: '3,300+',
    stat4Label: 'Plans closed (including aborted plans), 70,000+ attributed commits, 1,400+ release runs (U-2)',

    ch1Code: 'CHAPTER 01 / THE ADOPTION WALL',
    ch1Title: 'Why mid-to-large scale AI adoption hits a wall after the pilot',
    ch1Summary: 'Giving every engineer an AI coding assistant increases individual output, but without a control plane between the agent and your repositories, the bottleneck shifts directly onto senior reviewers, release engineers, and production stability.',
    splitLeftBadge: '[UNGOVERNED STATE]',
    splitLeftTitle: 'Ungoverned Agent Sprawl',
    splitLeftSub: 'Observed industry bottlenecks when agents mutate repositories and infrastructure directly',
    splitLeftItem1Metric: '+441% PR Review Wait',
    splitLeftItem1Body: 'Faros AI (2026) telemetry across >10,000 developers shows median PR review time jumped 441%, PRs grew 51.3% larger, 31% more PRs merged without review, and production incidents per PR increased 242.7% (X-3).',
    splitLeftItem2Metric: '89% -> 68% Reviewed Share',
    splitLeftItem2Body: 'A 2026 multi-year study found the share of pull requests receiving human review dropped from 89% in 2023 to 68% in 2025 as agent output outpaced senior reviewer capacity (X-4).',
    splitLeftItem3Metric: '>40% Canceled by 2027',
    splitLeftItem3Body: 'Gartner (June 2025) forecasts over 40% of agentic AI projects will be canceled by end of 2027 due to escalating costs, unclear business value, or inadequate risk controls (A-1).',
    splitLeftItem4Metric: '19% Slower in Controlled RCT',
    splitLeftItem4Body: 'METR (2025) randomized controlled trial found experienced developers took 19% longer to complete tasks with AI tools while perceiving a 20% speedup from unverified rework loops (X-10).',

    splitRightBadge: '[GOVERNED CONTROL PLANE]',
    splitRightTitle: 'Light Declarative Governance',
    splitRightSub: 'Every tool call, file mutation, peer check, and deployment runs inside an approved manifest',
    splitRightItem1Metric: 'Scoped Plan Manifest First',
    splitRightItem1Body: 'No write tool executes until the agent declares its exact file targets, shell requests, and verification steps in a structured manifest and receives human or policy approval (L-03, L-04).',
    splitRightItem2Metric: 'Cross-Model Peer Falsification',
    splitRightItem2Body: 'Before approval and before closure, Light dispatches the plan and diff to an independent model slot configured to falsify assumptions and check unimplemented promises (L-05, L-06).',
    splitRightItem3Metric: 'Separate Ability vs. Scope',
    splitRightItem3Body: 'Addresses Gartner\'s May 2026 warning that uniform governance fails to separate an agent\'s ability to act from its scope of access (A-3): Light binds permissions to the active plan step.',
    splitRightItem4Metric: 'Cryptographic Receipt Chain',
    splitRightItem4Body: 'Every test and build produces an authenticated receipt recording exit status and source tree byte equality at start and finish, stored in a SHA-256 hash-chained ledger (L-07, L-17).',

    analystNoteTitle: 'Analyst Forecast vs. Light Architectural Position',
    analystNoteBody: 'Gartner forecasts (A-1, A-2, A-3, A-4, A-6) are independent analyst research cited with publication dates. Gartner does not endorse Light or any vendor depicted; Light\'s mapping to the Guardian Agent pattern (A-6) is our architectural interpretation.',

    ch2Code: 'CHAPTER 02 / DECLARATIVE CONTROL PLANE',
    ch2Title: 'One control plane across six harness families and two synchronized lifecycles',
    ch2Summary: 'Instead of maintaining brittle per-tool wrappers or relying on developer memory, Light interposes a deterministic state machine on the MCP tool channel and binds every mutation to a live plan lifecycle.',
    track1Title: 'Track A: Internal Session State Machine (L-02, 4 States)',
    track1Sub: 'Enforced per agent session by the Light MCP gate before any tool call is admitted',
    fsm1Code: '01 / boot_locked',
    fsm1Name: 'Boot Locked',
    fsm1Desc: 'All repository reads and writes are refused until light_bootstrap declares workspace root and task tier.',
    fsm2Code: '02 / booted',
    fsm2Name: 'Booted & Recalled',
    fsm2Desc: 'Read-only code intelligence and persistent KB constraints load automatically before planning.',
    fsm3Code: '03 / grounded',
    fsm3Name: 'Grounded & Planned',
    fsm3Desc: 'Manifest declares exact target files, commands, and creates; peer review runs; mutations stay blocked until Go.',
    fsm4Code: '04 / executing',
    fsm4Name: 'Executing (Manifest-Bound)',
    fsm4Desc: 'Only declared files and commands are admitted with step tracking; out-of-scope edits trigger immediate refusal.',

    track2Title: 'Track B: Visible Work & Approval Lifecycle (L-10, 5 Stages)',
    track2Sub: 'Operator-visible governance record from initial proposal through cryptographic verification',
    work1Code: 'STAGE 1 / proposed',
    work1Name: 'Proposed',
    work1Desc: 'Agent submits manifest (targets, requests, creates) and design rationale for peer falsification.',
    work2Code: 'STAGE 2 / approved',
    work2Name: 'Approved (Go)',
    work2Desc: 'Operator or policy grants authority for the exact manifest; scope changes require re-approval.',
    work3Code: 'STAGE 3 / executing',
    work3Name: 'Executing',
    work3Desc: 'Step-indexed mutations, checkpoint commits, and sequenced release convoy participation.',
    work4Code: 'STAGE 4 / verified',
    work4Name: 'Verified',
    work4Desc: 'Authenticated test/build receipts (source_matches=true) plus independent verify-ship peer reconciliation.',
    work5Code: 'STAGE 5 / closed',
    work5Name: 'Closed',
    work5Desc: 'Scoped paths committed and pushed, durable KB lessons recorded, and hash-chained audit trail sealed.',

    layersHeading: 'Six-Layer Governance & Execution Stack (L-01 to L-22)',
    layer1Code: 'LAYER 01',
    layer1Title: 'Boot Lock & Institutional Memory Recall (L-01, L-02, L-15, L-16)',
    layer1Body: 'Every session boots into a locked gate, declares its complexity tier (patch, task, deep), and automatically retrieves project constraints, killed approaches, and past failure patterns.',
    layer2Code: 'LAYER 02',
    layer2Title: 'Manifest-Bound Planning & Diff/Patch Budgets (L-03, L-04, L-11, L-12, L-20)',
    layer2Body: 'Plans specify exact file targets and shell commands up front. The gate enforces per-plan write budgets, repeat-call circuit breakers, and automatic plan revocation if scope expands.',
    layer3Code: 'LAYER 03',
    layer3Title: 'Single-Binary Tree-Sitter Code Intelligence (L-13, L-14, E-6)',
    layer3Body: 'Replaces recursive grep and whole-file dumps with symbol-level locators, call-graph impact analysis, and 97.5% smaller tool-return payloads.',
    layer4Code: 'LAYER 04',
    layer4Title: 'Cross-Model Peer Review & Verify-Ship Gate (L-05, L-06)',
    layer4Body: 'Routes design drafts and post-implementation diffs to a separate model family to surface counterexamples, missing edge cases, and unfulfilled plan promises.',
    layer5Code: 'LAYER 05',
    layer5Title: 'Authenticated Receipts, RBAC & Hash-Chained Audit (L-07, L-17, L-18, L-22)',
    layer5Body: 'Records tamper-evident SHA-256 hash-chained logs, source-tree byte equality receipts across test runs, role-based access control, and hardware-key / WebAuthn approval support.',
    layer6Code: 'LAYER 06',
    layer6Title: 'Release Conductor, Health Gate & Epic Orchestration (L-08, L-09, L-19, L-21)',
    layer6Body: 'Serializes multi-agent deploys through a single release convoy with post-deploy health probes, automatic rollback triggers, and dependency-ordered epic execution.',

    harnessHeading: 'Declarative Multi-Harness Dialect Coverage (H-1 to H-7)',
    harnessSub: 'Integration defined in the stack across 7 harness specifications and 6 product families. No operational-history claim is made per dialect beyond Light\'s reference deployment.',
    harnessColSpec: 'Harness Dialect / Spec',
    harnessColFamily: 'Product Family',
    harnessColHook: 'Enforcement & Launch Mechanism',
    harnessColStatus: 'Stack Integration Status',
    harnessRow1Spec: 'claude-code (H-1)',
    harnessRow1Family: 'Anthropic Claude Code',
    harnessRow1Hook: 'PreToolUse hook + MCP stdio/HTTP seat bridge + native tool policy lock',
    harnessRow1Status: '[DEFINED IN STACK]',
    harnessRow2Spec: 'codex-cli (H-2)',
    harnessRow2Family: 'OpenAI Codex CLI',
    harnessRow2Hook: 'Sandboxed wrapper + seat bearer token + governed MCP tool routing',
    harnessRow2Status: '[DEFINED IN STACK]',
    harnessRow3Spec: 'antigravity / agy (H-3)',
    harnessRow3Family: 'Google Antigravity (agy)',
    harnessRow3Hook: 'PreToolUse tool-policy.py admits only call_mcp_tool ServerName=Light light_*',
    harnessRow3Status: '[DEFINED IN STACK]',
    harnessRow4Spec: 'zcode (H-4)',
    harnessRow4Family: 'ZCode Agent Harness',
    harnessRow4Hook: 'Declarative harnessspec + MCP seat bridge + manifest gate binding',
    harnessRow4Status: '[DEFINED IN STACK]',
    harnessRow5Spec: 'muse (H-5)',
    harnessRow5Family: 'Muse Coding Agent',
    harnessRow5Hook: 'Declarative harnessspec + governed tool admission + session lifecycle lock',
    harnessRow5Status: '[DEFINED IN STACK]',
    harnessRow6Spec: 'pi-cli & pi-sdk (H-6, H-7)',
    harnessRow6Family: 'Pi Agent Family (2 specs)',
    harnessRow6Hook: 'Dual CLI and SDK specifications with shared MCP governance contract and receipt verification',
    harnessRow6Status: '[DEFINED IN STACK]',

    ch3Code: 'CHAPTER 03 / VELOCITY ENGINE',
    ch3Title: 'Governance that speeds developers up instead of slowing them down',
    ch3Summary: 'Traditional security gates add ticket queues after code is written. Light embeds code intelligence, peer verification, and release coordination inside the agent loop so engineers ship cleaner code on the first pass.',
    velCard1Tag: 'CONTEXT COMPRESSION (L-13, L-14, E-6)',
    velCard1Title: '97.5% Reduction in Tool-Return Token Volume',
    velCard1Metric: '~1,182 vs ~47,000 tokens/turn',
    velCard1Body: 'Across 3,766 recorded turns in Light\'s reference deployment, tree-sitter symbol indexing and bounded slices returned ~1,182 tokens per turn compared with ~47,000 tokens for raw file reads (97.5% reduction). Qualifier (E-6): this measures what tools return to the model, not model reasoning/output tokens. On metered APIs it reduces input token spend; on flat-rate seats it prevents mid-task quota exhaustion and context-window rot.',
    velCard2Tag: 'INDEPENDENT PEER FALSIFICATION (L-05, L-06)',
    velCard2Title: 'Automated Cross-Model Design & Ship Review',
    velCard2Metric: '2-Stage Independent Audit',
    velCard2Body: 'Before an operator approves a medium or large plan, an independent peer model attempts to falsify the design with concrete counterexamples and a rival architecture. Before the plan closes, a verify-ship peer inspects the actual git diff against every promise in the manifest.',
    velCard3Tag: 'RELEASE CONDUCTOR & CONVOY (L-08, L-19)',
    velCard3Title: 'Zero Collision Deploys Across Concurrent Agents',
    velCard3Metric: '1,400+ Sequenced Release Runs',
    velCard3Body: 'When multiple agents finish work simultaneously, Light\'s release conductor queues and batches deployments through registry-defined service manifests, runs post-deploy health gates, and blocks raw ssh, scp, systemctl, or pm2 improvisation.',
    velCard4Tag: 'INSTITUTIONAL MEMORY (L-15, L-16)',
    velCard4Title: 'Killed Approaches Never Repeat Twice',
    velCard4Metric: 'Auto-Injected on Smart Index',
    velCard4Body: 'Every closed plan records architectural constraints, root-cause diagnoses, and killed approaches into the project knowledge base. Subsequent sessions receive matching constraints automatically when navigating those files.',

    ch4Code: 'CHAPTER 04 / SELF-FUNDING ECONOMICS',
    ch4Title: 'Why Light practically pays for itself: the four cost lines and live workload estimator',
    ch4Summary: 'Light acts directly on the four largest hidden cost centers of scaled AI engineering (E-1). Enter your organization\'s own seat count, compensation, billing model, and target subscription budget below to calculate your break-even threshold and recoverable engineering capacity.',
    econPolicyBanner: 'Transparency & Claim Policy (E-1, E-6): The four cost lines below are structural mechanisms supported by reference-deployment telemetry (L-14) and cited industry benchmarks (X-3, X-4, X-6). All dollar outputs in the interactive calculator are computed solely from the workload assumptions you enter below, never presented as fixed vendor pricing or guaranteed savings.',
    costLine1Code: 'COST LINE 01 / CONTEXT & QUOTA EFFICIENCY (E-1, L-14, E-6)',
    costLine1Title: 'Tool-Return Token Spend & Seat Quota Headroom',
    costLine1Body: 'Raw file dumps flood context windows. Light\'s 97.5% reduction in tool-return tokens (L-14) cuts metered API input spend directly; on flat-rate seats (E-6), cash token savings are $0, and the gain appears as roughly 3x-5x more active engineering tasks before hitting seat rate limits.',
    costLine2Code: 'COST LINE 02 / SENIOR PR REVIEW CAPACITY (E-1, X-3, X-4)',
    costLine2Title: 'Senior Engineering Hours Spent Reviewing Unscoped Diffs',
    costLine2Body: 'Industry PR review times jumped +441% (X-3) and unreviewed merges rose as human review fell from 89% to 68% (X-4). Manifest-bound scope, pre-build peer falsification, and verify-ship checks shrink diff bloat before a human reviewer opens the PR.',
    costLine3Code: 'COST LINE 03 / UNSCOPED CHANGE INCIDENTS (E-1, X-3, X-6)',
    costLine3Title: 'Production Rework & Outage Exposure from Out-of-Scope Mutations',
    costLine3Body: 'Incidents per PR rose +242.7% with ungoverned AI adoption (X-3), while enterprise downtime exceeds $300,000/hour for 91% of mid/large organizations (ITIC 2024, X-6). Light refused 8,600+ out-of-scope tool calls before execution in its reference deployment (U-3).',
    costLine4Code: 'COST LINE 04 / RELEASE & SRE TOIL (E-1, L-08, L-19)',
    costLine4Title: 'Deployment Coordination, Drift Triage & Audit Evidence Preparation',
    costLine4Body: 'Replaces ad-hoc deployment scripts and manual compliance evidence gathering with registry-driven release convoys, automated health verification, and hash-chained execution receipts.',

    calcHeading: 'Interactive Buyer Workload & Break-Even Estimator',
    calcSub: 'Adjust any parameter to model your engineering and SRE organization. Keyboard arrow keys work normally inside all inputs.',
    calcPresetMid: 'Load 50-Seat Mid-Market Sample',
    calcPresetEnt: 'Load 250-Seat Enterprise Sample',
    calcPresetSre: 'Include 15-Seat SRE / Ops Pod',
    calcResetBtn: 'Reset Inputs',
    calcBillingLabel: 'Agent Seat Billing Mode (E-6)',
    calcBillingFlat: 'Flat-Rate Seats ($0 direct token cash savings; quota headroom)',
    calcBillingMetered: 'Metered API Spend (Direct tool-return token savings)',
    calcSeatsLabel: 'Engineering Seats Using AI Agents',
    calcHourlyLabel: 'Fully Loaded Engineer Hourly Cost (USD)',
    calcReviewHrsLabel: 'PR Review & AI Rework Hours / Engineer / Week',
    calcReviewRedLabel: 'Expected Review & Rework Time Reduction (%)',
    calcMeteredSpendLabel: 'Metered API Input Spend / Seat / Month (USD)',
    calcTokenShareLabel: 'Share of Input Tokens from Tool Returns (%)',
    calcIncidentsLabel: 'Change-Induced Production Incidents / Year',
    calcIncidentCostLabel: 'Mean Cost / Engineering Rework per Incident (USD)',
    calcIncidentRedLabel: 'Expected Incident Reduction from Scoped Gates (%)',
    calcReleaseHrsLabel: 'Team Release & Audit Prep Hours / Week',
    calcReleaseRedLabel: 'Release & Audit Toil Reduction (%)',
    calcSubCostLabel: 'Target Governance Budget / Seat / Month (USD)',
    calcSreSeatsLabel: 'Platform / SRE Seats (Optional)',
    calcSreHourlyLabel: 'Fully Loaded SRE Hourly Cost (USD)',
    calcTriageHrsLabel: 'Alert & Drift Triage Hours / SRE / Week',
    calcTriageRedLabel: 'SRE Triage Reduction (%)',

    calcOutBreakEvenLabel: 'Break-Even Time Saved / Seat / Month',
    calcOutBreakEvenUnit: 'minutes / month',
    calcOutBreakEvenDesc: 'At your entered hourly cost and target seat budget, Light pays for a seat the moment it saves this many minutes of engineering time per month.',
    calcOutGrossMonthlyLabel: 'Estimated Gross Monthly Value Recovered',
    calcOutNetAnnualLabel: 'Estimated Net Annual Impact (After Budget)',
    calcOutMultipleLabel: 'Estimated Value-to-Budget Multiple',
    calcOutHoursSeatLabel: 'Recovered Engineering Hours / Seat / Month',
    calcOutLine1Label: 'Line 1: Metered Tool-Return Token Savings (E-6)',
    calcOutLine2Label: 'Line 2: Senior Review & Rework Capacity Recovered',
    calcOutLine3Label: 'Line 3: Avoided Unscoped-Change Incident Cost',
    calcOutLine4Label: 'Line 4: Release Convoy & SRE Triage Capacity',
    calcFlatRateNote: 'Flat-rate mode active (E-6): Line 1 cash savings are set to $0 because seats pay a fixed monthly fee. The 97.5% tool-return reduction instead preserves seat quota headroom and avoids mid-session lockouts.',
    calcMeteredNote: 'Metered API mode active (E-6): Line 1 applies the 97.5% tool-return reduction (L-14) only to the share of input tokens originating from tool returns.',
    calcErrorOutOfRange: 'Input validation error: All workload counts and costs must be finite non-negative numbers, and percentages must be between 0% and 100%. Adjust the highlighted field to resume calculation.',
    calcStatusReady: '[READY · BUYER-ENTERED ASSUMPTIONS]',
    calcStatusSaved: '[SCENARIO UPDATED]',

    ch5Code: 'CHAPTER 05 / PROOF, MARKET COMPARISON & CISO CONTROL MAP',
    ch5Title: 'Reference-deployment telemetry, 6-category market landscape, and CISO control mapping',
    ch5Summary: 'Every capability claim is anchored to an inspectable mechanism in the Light stack, reference-deployment telemetry since March 2026, or documented public sources.',
    telemetryNote: 'Attribution Rule (B-10, B-11): Telemetry below comes from Light\'s own production reference deployment running since March 2026 across five harness families. It is not presented as third-party customer telemetry. "Plans closed" includes aborted plans, and "tool calls refused" are out-of-scope policy refusals prior to execution, not blocked cyberattacks.',

    compHeading: 'Six-Category Market Comparison (As of October 2026)',
    compSub: 'Filter by capability status to inspect how Light compares with single-vendor hooks, LLM proxy gateways, code-review bots, and workflow frameworks.',
    compFilterAll: 'All Categories (6)',
    compFilterDoc: 'Documented Native Hook (Claude Code)',
    compFilterGap: 'Pre-Execution Gate Gaps',
    compResetFilter: 'Reset filter to show all 6 categories',
    compEmptyState: 'No market categories match the active filter. Reset the filter to inspect all 6 categories.',
    compColCategory: 'Market Category & Representative Tools',
    compColPreExec: 'Pre-Execution Tool Gate',
    compColManifest: 'Manifest-Bound File Scope',
    compColPeer: 'Cross-Model Peer Falsification',
    compColReceipt: 'Source-Verified Receipts & Release Convoy',
    compRow1Cat: 'Light Declarative Governance Control Plane (6 harness families)',
    compRow1Pre: '[DOCUMENTED] Session FSM + PreToolUse / MCP seat gate (L-01, L-02)',
    compRow1Man: '[DOCUMENTED] Target files & commands approved before write (L-03, L-04)',
    compRow1Peer: '[DOCUMENTED] Independent model draft & verify-ship review (L-05, L-06)',
    compRow1Rec: '[DOCUMENTED] Byte-verified test receipts + sequenced release conductor (L-07, L-08)',
    compRow2Cat: 'Single-Vendor CLI Hooks (Anthropic Claude Code Hooks, docs.anthropic.com, Oct 2026, M-1)',
    compRow2Pre: '[DOCUMENTED] PreToolUse / PostToolUse / PermissionRequest per-call allow/deny/ask',
    compRow2Man: '[PARTIAL] Hook primitives exist; org must build its own manifest state & approval workflow',
    compRow2Peer: '[NOT ESTABLISHED] Single-vendor CLI; no built-in cross-model peer review orchestration',
    compRow2Rec: '[NOT ESTABLISHED] No built-in source-hash test receipt or multi-service release convoy',
    compRow3Cat: 'AI IDE Assistants (Cursor, GitHub Copilot, Windsurf, vendor docs Oct 2026, M-2, M-3)',
    compRow3Pre: '[PARTIAL] Local workspace permissions & instruction files (.cursorrules / copilot-instructions)',
    compRow3Man: '[NOT ESTABLISHED] Advisory prompt rules; no server-enforced pre-approval file manifest',
    compRow3Peer: '[NOT ESTABLISHED] Single-session generation without independent cross-model falsification gate',
    compRow3Rec: '[NOT ESTABLISHED] Relies on downstream CI after branch push',
    compRow4Cat: 'LLM API Gateways & Guardrails (LiteLLM, Portkey, Lakera, vendor docs Oct 2026, M-6)',
    compRow4Pre: '[PARTIAL] Token budgets, PII filtering, and prompt/response guardrails on HTTP inference calls',
    compRow4Man: '[NOT ESTABLISHED] No awareness of git working tree, plan step, or per-file write manifest',
    compRow4Peer: '[NOT ESTABLISHED] Routes model calls; does not orchestrate adversarial design/diff verification',
    compRow4Rec: '[NOT ESTABLISHED] Logs prompt/completion tokens, not local command exit & source byte equality',
    compRow5Cat: 'PR Review Bots (CodeRabbit, Qodo Merge, GitHub Copilot PR Review, Oct 2026, M-5)',
    compRow5Pre: '[NOT ESTABLISHED] Operates post-commit / post-PR after unreviewed mutations already occurred',
    compRow5Man: '[NOT ESTABLISHED] Comments on diffs after creation; cannot block local shell or file edits',
    compRow5Peer: '[PARTIAL] Automated PR comments, but no pre-coding design falsification or plan binding',
    compRow5Rec: '[NOT ESTABLISHED] Does not govern local test receipts or production release sequencing',
    compRow6Cat: 'Agent Application Frameworks (LangGraph, CrewAI, AutoGen, vendor docs Oct 2026, M-7)',
    compRow6Pre: '[PARTIAL] Programmable graph nodes and human-in-the-loop breakpoints for custom apps',
    compRow6Man: '[NOT ESTABLISHED] SDK for building bespoke agents; does not govern off-the-shelf coding CLIs',
    compRow6Peer: '[PARTIAL] Custom multi-agent graphs possible if engineered and maintained by customer',
    compRow6Rec: '[NOT ESTABLISHED] No turnkey engineering CLI governance, smart-index, or release conductor',
    compOverflowNote: 'Showing all 6 documented market categories from 05-competitive-comparison.md (as of October 2026). Status labels follow strict claim-register definitions: [DOCUMENTED], [PARTIAL], [NOT ESTABLISHED].',

    cisoHeading: 'CISO Capability-to-Control & Regulatory Mapping (C-1 to C-11, R-1 to R-4)',
    cisoDisclaimer: 'Scope Note: This table maps technical capabilities in Light to enterprise security controls and regulatory articles (EU AI Act, NIST AI RMF, ISO/IEC 42001, SOC 2 / DORA / SR 11-7). It is an architectural capability-to-control mapping for security review, not a legal compliance certification.',
    cisoColId: 'Control ID & Threat Vector',
    cisoColReq: 'CISO / Regulatory Requirement',
    cisoColMech: 'Light Enforcement Mechanism',
    cisoColFramework: 'Aligned Framework Reference',
    cisoRow1Id: 'C-1 / Unbounded Action Scope',
    cisoRow1Req: 'Separate agent ability to act from approved scope of access (Gartner A-3)',
    cisoRow1Mech: 'Manifest-bound file targets[], command requests[], and creates[] enforced per plan step (L-03, L-04)',
    cisoRow1Fw: 'NIST AI RMF Govern 1.2 / Map 3.5 (R-2)',
    cisoRow2Id: 'C-2 / Unapproved Production Mutation',
    cisoRow2Req: 'Mandatory human-in-the-loop authorization before high-impact changes',
    cisoRow2Mech: 'Session boot_locked/grounded gate blocks all writes until operator Go or WebAuthn hardware approval (L-02, L-10, L-22)',
    cisoRow2Fw: 'EU AI Act Art. 14 Human Oversight (R-1)',
    cisoRow3Id: 'C-3 / Tamperable Execution Logs',
    cisoRow3Req: 'Non-repudiable audit trail of every agent action and command result',
    cisoRow3Mech: 'SHA-256 hash-chained audit ledger + authenticated command receipts with source_matches byte checks (L-07, L-17)',
    cisoRow3Fw: 'EU AI Act Art. 12 Record-Keeping / SOC 2 CC7.2 (R-1, R-4)',
    cisoRow4Id: 'C-4 / Single-Model Hallucination & Blind Spots',
    cisoRow4Req: 'Independent validation of AI-generated designs and code before release',
    cisoRow4Mech: 'Cross-model peer review (draft falsification + verify-ship reconciliation) on separate model family (L-05, L-06)',
    cisoRow4Fw: 'SR 11-7 Model Risk Validation / ISO 42001 A.6.2 (R-3, R-4)',
    cisoRow5Id: 'C-5 / Uncoordinated Production Deploys',
    cisoRow5Req: 'Prevent concurrent agent sessions from racing or bypassing release controls',
    cisoRow5Mech: 'Release conductor convoy serialization + service registry manifests + post-deploy health gate (L-08, L-19)',
    cisoRow5Fw: 'DORA Art. 9 ICT Change Management / SOC 2 CC8.1 (R-4)',
    cisoRow6Id: 'C-6 / Runaway Agent Loops & Cost Spikes',
    cisoRow6Req: 'Bound blast radius of stuck or looping autonomous sessions',
    cisoRow6Mech: 'Per-plan patch budgets, repeat-call circuit breakers, and automatic plan revocation on scope drift (L-11, L-12, L-20)',
    cisoRow6Fw: 'NIST AI RMF Manage 2.4 / ISO 42001 A.8 (R-2, R-3)',

    personaHeading: 'Executive & Engineering Persona Value Matrix',
    personaFilterAll: 'All Buyers (5)',
    personaFilterExec: 'Executive (CTO / CISO / CFO)',
    personaFilterEng: 'Engineering (Platform / Developer)',
    persona1Role: 'CTO / VP Engineering',
    persona1Focus: 'Scale AI velocity across 50-500 engineers without PR gridlock',
    persona1Gain: 'Converts chaotic agent output into manifest-scoped, peer-falsified changes that senior engineers can review in minutes instead of hours.',
    persona2Role: 'CISO / Head of Security',
    persona2Focus: 'Pre-execution policy enforcement and tamper-evident auditability',
    persona2Gain: 'Replaces advisory markdown rules with a hard pre-execution gate, RBAC/WebAuthn approvals, and SHA-256 hash-chained receipts mapped to EU AI Act Art. 12/14 and NIST AI RMF.',
    persona3Role: 'CFO / FinOps Lead',
    persona3Focus: 'Predictable AI unit economics and measurable payback',
    persona3Gain: 'Cuts tool-return context volume by 97.5% (L-14) and recovers senior review and incident rework hours so the control plane pays for itself within minutes saved per seat.',
    persona4Role: 'Platform / SRE Lead',
    persona4Focus: 'Eliminate wild-west SSH/Docker commands and deploy collisions',
    persona4Gain: 'Routes all deployments through declarative service manifests and a sequenced release convoy with automated health checks.',
    persona5Role: 'Staff / Senior Developer',
    persona5Focus: 'Fast codebase navigation and zero repeat debugging',
    persona5Gain: 'Sub-second tree-sitter symbol navigation (light_smart_index) with automatic recall of past architectural constraints and killed approaches.',

    ch6Code: 'CHAPTER 06 / 30-DAY SHADOW-TO-ENFORCE ROLLOUT',
    ch6Title: 'Adopt Light in 30 days without disrupting active sprints',
    ch6Summary: 'Start in read-only observation mode on one engineering squad, measure your baseline token and review metrics, then enable manifest gates and release orchestration step by step.',
    week1Code: 'WEEK 01 / SHADOW & BASELINE',
    week1Title: 'Connect Harnesses & Baseline Telemetry',
    week1Body: 'Attach existing Claude Code, Codex, or Antigravity seats to the Light MCP bridge. Enable tree-sitter smart index (L-13) and measure baseline tool-return token volume and PR review cycle times.',
    week2Code: 'WEEK 02 / MANIFEST & PLAN GATE',
    week2Title: 'Enable Scoped Plans & Write Admission',
    week2Body: 'Turn on session boot lock and manifest-bound planning (L-02, L-03) for medium and large tasks. Out-of-scope file mutations and raw destructive shell commands are refused before execution.',
    week3Code: 'WEEK 03 / PEER FALSIFICATION & RELEASE CONVOY',
    week3Title: 'Wire Cross-Model Peer Review & Service Registry',
    week3Body: 'Configure a second model family for pre-Go design falsification and verify-ship checks (L-05, L-06). Register deploy targets in the release conductor (L-08).',
    week4Code: 'WEEK 04 / EXECUTIVE AUDIT & ROI READOUT',
    week4Title: 'Compare Measured Velocity, Refusals & Cost Lines',
    week4Body: 'Export hash-chained execution receipts, refused-call audit logs, and measured review/context savings across the four cost lines (E-1) for CTO, CISO, and CFO sign-off.',

    ctaBoxTitle: 'Ready to evaluate Light on your engineering organization?',
    ctaBoxBody: 'Walk through the architecture, inspect live reference-deployment telemetry, or scope a 30-day shadow-to-enforce pilot with Factor IO.',
    ctaPrimary: 'Book Executive Architecture Briefing',
    ctaSecondary: 'Explore Factor IO Service Catalog',
    ctaEmailLabel: 'Direct Engineering Contact:',
    footerLegal: 'Factor IO Co., Ltd. (บริษัท แฟคเคอร์ ไอ โอ จำกัด) · Registration / Tax ID 0105562205512 · Bangkok, Thailand',
  },
  th: {
    metaTitle: 'Light | แพลตฟอร์มควบคุมและกำกับดูแล AI Agent แบบประกาศ (Declarative Governance) | Factor IO',
    metaDescription: 'Light คือระบบควบคุมและกำกับดูแลการทำงานของ AI Agent สำหรับองค์กรขนาดกลางและขนาดใหญ่ แก้ปัญหาคอขวดการตรวจโค้ด ลดปริมาณโทเค็นจากเครื่องมือลง 97.5% พร้อมใบรับรองการรันที่ตรวจสอบย้อนหลังได้',
    skipLink: 'ข้ามไปยังเนื้อหาหลักของงานนำเสนอ',
    brandSub: 'ระบบควบคุมและกำกับดูแล AI Agent แบบประกาศ',
    navProblem: '01. คอขวดการขยายผล',
    navArchitecture: '02. สถาปัตยกรรมควบคุม',
    navVelocity: '03. เครื่องจักรเร่งความเร็ว',
    navEconomics: '04. ความคุ้มทุนและ ROI',
    navEvidence: '05. หลักฐานและ CISO Map',
    navPilot: '06. แผนเริ่มใช้งาน 30 วัน',
    modeReading: 'โหมดอ่านละเอียด',
    modePresentation: 'โหมดนำเสนอทีละบท',
    fullscreenBtn: 'เต็มหน้าจอ',
    langToggleLabel: 'สลับภาษา',
    backToStudio: 'หน้าหลัก Factor IO',
    offeringsLink: 'แคตตาล็อกบริการ',
    lightopsLink: 'LightOps AI',
    chapterIndicatorPrefix: 'บทที่',
    prevChapter: 'บทก่อนหน้า',
    nextChapter: 'บทถัดไป',

    heroEyebrow: 'เอกสารสถาปัตยกรรมและการลงทุนระบบกำกับดูแล AI ระดับองค์กร (EN / ไทย)',
    heroTitle: 'ขยายผลการใช้ AI Agent ทั้งฝ่ายวิศวกรรมและปฏิบัติการโดยไม่สูญเสียการควบคุม',
    heroLead: 'การนำ AI มาใช้ในองค์กรขนาดกลางถึงใหญ่ไม่ได้สะดุดเพราะโมเดลเขียนโค้ดไม่ได้ แต่สะดุดเมื่อขยายสู่ 50 ถึง 500 ที่นั่ง แล้วเกิดการแก้ไฟล์นอกขอบเขต คิวตรวจ PR ที่นานขึ้น 441% และการปล่อยระบบที่ขาดการตรวจสอบ จนผู้บริหารต้องเลือกระหว่างความเร็วกับความปลอดภัย Light แก้ปัญหานี้ด้วยระนาบควบคุมเดียวที่บังคับใช้แผนงานก่อนแก้ไขจริง และคืนทุนด้วยชั่วโมงวิศวกรที่ประหยัดได้จริง',
    heroPrimaryCta: 'คำนวณความคุ้มทุนของทีมคุณ',
    heroSecondaryCta: 'ดูสถาปัตยกรรมควบคุม 6 ชั้น',
    heroBriefingCta: 'นัดหมายทำ Pilot 30 วัน',
    heroBoundaryTitle: 'ขอบเขตการบังคับใช้และการรองรับตระกูล AI Harness',
    heroBoundaryBody: 'Light กำกับดูแลเฉพาะการกระทำที่วิ่งผ่านระบบของ Light เท่านั้น ข้อจำกัดของเครื่องมือพื้นฐานถูกส่งมอบเป็นค่าตั้งต้นตอนเปิดใช้งาน และการกระทำที่เกิดขึ้นนอก Light จะไม่อยู่ในขอบเขตการคุ้มครอง การเชื่อมต่อกับแต่ละ Harness ถูกนิยามไว้แบบประกาศสำหรับตระกูลที่รู้จัก ("integration defined in the stack" ครอบคลุมข้อกำหนด 7 รูปแบบใน 6 ตระกูลผลิตภัณฑ์ ได้แก่ Claude Code, Codex, Antigravity, ZCode, Muse และ Pi) โดยไม่มีการอ้างประวัติการใช้งานจริงแยกตามตระกูลนอกเหนือจากระบบอ้างอิงของ Light',

    stat1Value: '1,000,000+',
    stat1Label: 'คำสั่งเครื่องมือที่ผ่านการกำกับดูแลในระบบอ้างอิงของ Light ตั้งแต่มีนาคม 2026 (U-1)',
    stat2Value: '97.5%',
    stat2Label: 'ลดปริมาณโทเค็นที่เครื่องมือส่งกลับด้วยดัชนีโค้ด tree-sitter จากการวัด 3,766 รอบ (L-14, E-6)',
    stat3Value: '8,600+',
    stat3Label: 'คำสั่งที่อยู่นอกขอบเขตแผนหรือผิดขั้นตอนถูกปฏิเสธก่อนรันจริงในระบบอ้างอิง (U-3)',
    stat4Value: '3,300+',
    stat4Label: 'แผนงานที่ปิดแล้ว (รวมแผนที่ยกเลิก) 70,000+ คอมมิตระบุที่มา และ 1,400+ รอบการปล่อยระบบ (U-2)',

    ch1Code: 'บทที่ 01 / กำแพงการขยายผลระดับองค์กร',
    ch1Title: 'ทำไมการใช้ AI Agent ในระดับองค์กรจึงชนกำแพงหลังจบช่วงทดลอง (Pilot)',
    ch1Summary: 'การแจกเครื่องมือช่วยเขียนโค้ดให้วิศวกรทุกคนช่วยเพิ่มปริมาณงานรายบุคคล แต่หากไม่มีระนาบควบคุมคั่นกลางระหว่าง Agent กับคลังโค้ด คอขวดทั้งหมดจะถูกผลักไปที่วิศวกรอาวุโสผู้ตรวจ PR ทีมปล่อยระบบ และเสถียรภาพของระบบจริง',
    splitLeftBadge: '[สภาวะไร้ระบบกำกับดูแล]',
    splitLeftTitle: 'การปล่อยให้ Agent ทำงานแบบไร้การควบคุม',
    splitLeftSub: 'คอขวดและผลกระทบที่พบจริงในอุตสาหกรรมเมื่อปล่อยให้ Agent แก้ไขโค้ดและโครงสร้างพื้นฐานโดยตรง',
    splitLeftItem1Metric: 'เวลารอตรวจ PR พุ่ง +441%',
    splitLeftItem1Body: 'ข้อมูลของ Faros AI (2026) จากนักพัฒนากว่า 10,000 คนชี้ว่าเวลามัธยฐานในการรอตรวจ PR เพิ่มขึ้น 441% ขนาด PR ใหญ่ขึ้น 51.3% มี PR ที่ถูกควบรวมโดยไม่ผ่านคนตรวจเพิ่มขึ้น 31% และเหตุขัดข้องต่อ PR เพิ่มขึ้น 242.7% (X-3)',
    splitLeftItem2Metric: 'สัดส่วนคนตรวจลดจาก 89% -> 68%',
    splitLeftItem2Body: 'งานวิจัยปี 2026 พบว่าสัดส่วน Pull Request ที่ได้รับการตรวจโดยมนุษย์ลดลงจาก 89% ในปี 2023 เหลือ 68% ในปี 2025 เนื่องจากปริมาณโค้ดจาก AI เกินกำลังของวิศวกรอาวุโส (X-4)',
    splitLeftItem3Metric: '>40% เสี่ยงถูกยกเลิกภายในปี 2027',
    splitLeftItem3Body: 'Gartner (มิถุนายน 2025) คาดการณ์ว่าโครงการ Agentic AI กว่า 40% จะถูกยกเลิกภายในสิ้นปี 2027 จากต้นทุนที่บานปลาย คุณค่าทางธุรกิจไม่ชัดเจน หรือการควบคุมความเสี่ยงไม่เพียงพอ (A-1)',
    splitLeftItem4Metric: 'ช้าลง 19% ในการทดลองแบบสุ่ม',
    splitLeftItem4Body: 'การทดลองแบบสุ่มมีกลุ่มควบคุมของ METR (2025) พบว่านักพัฒนาที่มีประสบการณ์ใช้เวลาทำงานนานขึ้น 19% เมื่อใช้ AI แม้จะเข้าใจไปเองว่าเร็วขึ้น 20% เพราะเสียเวลาแก้โค้ดที่ไม่ได้ตรวจสอบ (X-10)',

    splitRightBadge: '[ระนาบควบคุมของ LIGHT]',
    splitRightTitle: 'การกำกับดูแลแบบประกาศด้วย Light',
    splitRightSub: 'ทุกคำสั่งเครื่องมือ การแก้ไขไฟล์ การทบทวนโดยโมเดลอิสระ และการปล่อยระบบ ทำงานอยู่ภายใต้ขอบเขตแผนที่อนุมัติแล้ว',
    splitRightItem1Metric: 'ประกาศแผนและขอบเขตไฟล์ก่อนแก้',
    splitRightItem1Body: 'ไม่มีเครื่องมือเขียนไฟล์ใดทำงานได้จนกว่า Agent จะระบุไฟล์เป้าหมาย คำสั่งเชลล์ และขั้นตอนตรวจสอบลงในแผนงานที่มีโครงสร้างชัดเจน และได้รับการอนุมัติ (L-03, L-04)',
    splitRightItem2Metric: 'โมเดลอิสระช่วยจับผิดก่อนอนุมัติและก่อนปิดงาน',
    splitRightItem2Body: 'ก่อนขออนุมัติและก่อนปิดงาน Light จะส่งแผนและโค้ดที่แก้ไปให้โมเดลอิสระอีกตระกูลทำการโต้แย้งหาช่องโหว่และตรวจสอบสิ่งที่สัญญาไว้แต่ยังไม่ได้ทำ (L-05, L-06)',
    splitRightItem3Metric: 'แยกความสามารถในการทำงานออกจากขอบเขตสิทธิ์',
    splitRightItem3Body: 'ตอบโจทย์คำเตือนของ Gartner (พฤษภาคม 2026) ที่ชี้ว่าการกำกับดูแลแบบเหมารวมล้มเหลวเพราะแยกความสามารถของ Agent ออกจากขอบเขตสิทธิ์ไม่ได้ (A-3): Light ผูกสิทธิ์เข้ากับขั้นตอนของแผนที่กำลังทำอยู่เท่านั้น',
    splitRightItem4Metric: 'ใบรับรองผลการรันและบันทึก Hash-Chained',
    splitRightItem4Body: 'ทุกการทดสอบและคอมไพล์จะสร้างใบรับรองที่ตรวจสอบความเท่ากันของไบต์ซอร์สโค้ดตั้งแต่เริ่มจนจบ และบันทึกในสมุดบัญชี SHA-256 ที่แก้ไขย้อนหลังไม่ได้ (L-07, L-17)',

    analystNoteTitle: 'หมายเหตุการอ้างอิงบทวิเคราะห์และมุมมองสถาปัตยกรรม',
    analystNoteBody: 'ตัวเลขคาดการณ์ของ Gartner (A-1, A-2, A-3, A-4, A-6) เป็นงานวิจัยอิสระที่อ้างอิงตามวันที่เผยแพร่ Gartner ไม่ได้รับรอง Light หรือผู้ให้บริการรายใด และการเชื่อมโยงเข้ากับแนวคิด Guardian Agent (A-6) เป็นการตีความเชิงสถาปัตยกรรมของ Light เอง',

    ch2Code: 'บทที่ 02 / สถาปัตยกรรมระนาบควบคุมแบบประกาศ',
    ch2Title: 'ระนาบควบคุมเดียวครอบคลุม 6 ตระกูล Harness และวงจรสถานะคู่ขนาน 2 แกน',
    ch2Summary: 'แทนที่จะเขียนสคริปต์ดักจับแยกตามเครื่องมือหรือพึ่งพาความจำของนักพัฒนา Light แทรกเครื่องจักรสถานะ (State Machine) ลงบนช่องทาง MCP และผูกการเปลี่ยนแปลงทั้งหมดเข้ากับวงจรชีวิตของแผนงาน',
    track1Title: 'แกน A: เครื่องจักรสถานะเซสชันภายใน (L-02, 4 สถานะ)',
    track1Sub: 'บังคับใช้ต่อเซสชันโดยเกต MCP ของ Light ก่อนอนุญาตให้คำสั่งเครื่องมือใดๆ ทำงาน',
    fsm1Code: '01 / boot_locked',
    fsm1Name: 'ล็อกเริ่มต้น (Boot Locked)',
    fsm1Desc: 'ปฏิเสธการอ่านและเขียนคลังโค้ดทั้งหมดจนกว่าจะเรียก light_bootstrap เพื่อระบุโฟลเดอร์โครงการและระดับงาน',
    fsm2Code: '02 / booted',
    fsm2Name: 'บูตและดึงความจำองค์กร (Booted)',
    fsm2Desc: 'อนุญาตเฉพาะการค้นหาโค้ดแบบอ่านอย่างเดียว พร้อมดึงข้อจำกัดและแนวทางที่เคยล้มเหลวจากคลังความรู้โดยอัตโนมัติ',
    fsm3Code: '03 / grounded',
    fsm3Name: 'วางหลักฐานและร่างแผน (Grounded)',
    fsm3Desc: 'ระบุรายการไฟล์เป้าหมาย คำสั่ง และไฟล์สร้างใหม่ ส่งให้โมเดลคู่เทียบทบทวน โดยยังบล็อกการแก้ไขไฟล์จนกว่าจะได้สัญญาณ Go',
    fsm4Code: '04 / executing',
    fsm4Name: 'ดำเนินการตามกรอบแผน (Executing)',
    fsm4Desc: 'อนุญาตเฉพาะไฟล์และคำสั่งที่ประกาศไว้พร้อมระบุหมายเลขขั้นตอน หากแตะไฟล์นอกขอบเขตจะถูกปฏิเสธทันที',

    track2Title: 'แกน B: วงจรชีวิตงานและการอนุมัติที่ผู้ดูแลมองเห็น (L-10, 5 ขั้นตอน)',
    track2Sub: 'บันทึกการกำกับดูแลที่ตรวจสอบได้ตั้งแต่เริ่มเสนอแผนจนถึงการตรวจรับด้วยใบรับรองคริปโตกราฟี',
    work1Code: 'ขั้นที่ 1 / proposed',
    work1Name: 'เสนอแผน (Proposed)',
    work1Desc: 'Agent ส่งรายการไฟล์ คำสั่ง และเหตุผลเชิงสถาปัตยกรรมเพื่อรับการตรวจสอบและโต้แย้งจากโมเดลคู่เทียบ',
    work2Code: 'ขั้นที่ 2 / approved',
    work2Name: 'อนุมัติ (Approved / Go)',
    work2Desc: 'ผู้ดูแลหรือนโยบายอนุมัติขอบเขตงานตามแผน หากต้องแก้ไฟล์นอกแผนต้องปรับแผนและขออนุมัติใหม่',
    work3Code: 'ขั้นที่ 3 / executing',
    work3Name: 'กำลังดำเนินการ (Executing)',
    work3Desc: 'แก้ไขไฟล์ตามลำดับขั้น บันทึกคอมมิตอัตโนมัติ และเข้าคิวปล่อยระบบผ่านตัวจัดการขบวนปล่อย (Release Convoy)',
    work4Code: 'ขั้นที่ 4 / verified',
    work4Name: 'ตรวจสอบแล้ว (Verified)',
    work4Desc: 'ตรวจใบรับรองผลการรันชุดทดสอบ (source_matches=true) ร่วมกับการตรวจโค้ดจริงเทียบคำสัญญาโดยโมเดลอิสระ',
    work5Code: 'ขั้นที่ 5 / closed',
    work5Name: 'ปิดงานสมบูรณ์ (Closed)',
    work5Desc: 'คอมมิตและส่งโค้ดเฉพาะไฟล์ในขอบเขต บันทึกบทเรียนลงคลังความรู้ และปิดผนึกบันทึกตรวจสอบแบบเชื่อมแฮช',

    layersHeading: 'สถาปัตยกรรมควบคุมและการทำงาน 6 ชั้น (L-01 ถึง L-22)',
    layer1Code: 'ชั้นที่ 01',
    layer1Title: 'เกตล็อกเริ่มต้นและการดึงความจำสถาปัตยกรรม (L-01, L-02, L-15, L-16)',
    layer1Body: 'ทุกเซสชันเริ่มในสถานะล็อก ต้องระบุระดับความซับซ้อน (patch, task, deep) และดึงข้อจำกัดของระบบรวมถึงแนวทางที่เคยล้มเหลวมาแสดงก่อนวางแผน',
    layer2Code: 'ชั้นที่ 02',
    layer2Title: 'แผนงานผูกขอบเขตไฟล์และงบประมาณการแก้ไข (L-03, L-04, L-11, L-12, L-20)',
    layer2Body: 'แผนงานต้องระบุไฟล์และคำสั่งล่วงหน้า เกตจะจำกัดจำนวนครั้งการแก้ต่อแผน ตัดวงจรคำสั่งซ้ำซ้อน และเพิกถอนสิทธิ์ทันทีเมื่อขอบเขตงานเปลี่ยน',
    layer3Code: 'ชั้นที่ 03',
    layer3Title: 'ดัชนีค้นหาโค้ด Tree-Sitter ไบนารีเดียว (L-13, L-14, E-6)',
    layer3Body: 'แทนที่การทำ grep ทั้งโฟลเดอร์และการอ่านไฟล์เต็มด้วยตัวชี้ตำแหน่งระดับสัญลักษณ์ การวิเคราะห์ผลกระทบของผู้เรียกใช้ และลดโทเค็นตอบกลับลง 97.5%',
    layer4Code: 'ชั้นที่ 04',
    layer4Title: 'การทบทวนและตรวจรับข้ามตระกูลโมเดล (L-05, L-06)',
    layer4Body: 'ส่งร่างแผนงานและโค้ดที่แก้เสร็จแล้วไปยังโมเดลอีกตระกูลที่เป็นอิสระ เพื่อหาตัวอย่างค้าน กรณีตกหล่น และคำสัญญาในแผนที่ยังไม่ได้ทำจริง',
    layer5Code: 'ชั้นที่ 05',
    layer5Title: 'ใบรับรองผลการรัน สิทธิ์ RBAC และบัญชีแฮชลูกโซ่ (L-07, L-17, L-18, L-22)',
    layer5Body: 'บันทึกประวัติแบบ SHA-256 hash-chained ใบรับรองความเท่ากันของไบต์ซอร์สโค้ดขณะรันเทสต์ การกำหนดสิทธิ์ตามบทบาท และการอนุมัติด้วยคีย์ฮาร์ดแวร์ WebAuthn',
    layer6Code: 'ชั้นที่ 06',
    layer6Title: 'ผู้ควบคุมขบวนปล่อยระบบ เกตตรวจสุขภาพ และการบริหาร Epic (L-08, L-09, L-19, L-21)',
    layer6Body: 'จัดคิวการปล่อยระบบของหลาย Agent ไม่ให้ชนกันด้วยขบวนปล่อยเดียว พร้อมตรวจสุขภาพหลังปล่อย ทริกเกอร์ย้อนกลับอัตโนมัติ และการรันงานใหญ่แบบเรียงลำดับพึ่งพา',

    harnessHeading: 'การรองรับตระกูล AI Harness แบบประกาศ (H-1 ถึง H-7)',
    harnessSub: 'การเชื่อมต่อถูกนิยามไว้ในสแต็กครอบคลุมข้อกำหนด 7 รูปแบบใน 6 ตระกูลผลิตภัณฑ์ ไม่มีการอ้างประวัติการใช้งานแยกตามตระกูลนอกเหนือจากระบบอ้างอิงของ Light',
    harnessColSpec: 'รหัสข้อกำหนด / Dialect',
    harnessColFamily: 'ตระกูลผลิตภัณฑ์',
    harnessColHook: 'กลไกการบังคับใช้และการเชื่อมต่อ',
    harnessColStatus: 'สถานะในสแต็ก',
    harnessRow1Spec: 'claude-code (H-1)',
    harnessRow1Family: 'Anthropic Claude Code',
    harnessRow1Hook: 'PreToolUse hook + สะพานเชื่อมที่นั่ง MCP stdio/HTTP + ล็อกนโยบายเครื่องมือพื้นฐาน',
    harnessRow1Status: '[นิยามไว้ในสแต็ก]',
    harnessRow2Spec: 'codex-cli (H-2)',
    harnessRow2Family: 'OpenAI Codex CLI',
    harnessRow2Hook: 'ตัวหุ้มแซนด์บ็อกซ์ + โทเค็นระบุที่นั่ง + การบังคับเส้นทางคำสั่งผ่าน MCP',
    harnessRow2Status: '[นิยามไว้ในสแต็ก]',
    harnessRow3Spec: 'antigravity / agy (H-3)',
    harnessRow3Family: 'Google Antigravity (agy)',
    harnessRow3Hook: 'PreToolUse tool-policy.py อนุญาตเฉพาะ call_mcp_tool ที่เรียก ServerName=Light light_*',
    harnessRow3Status: '[นิยามไว้ในสแต็ก]',
    harnessRow4Spec: 'zcode (H-4)',
    harnessRow4Family: 'ZCode Agent Harness',
    harnessRow4Hook: 'ข้อกำหนด harnessspec แบบประกาศ + สะพานเชื่อมที่นั่ง MCP + การผูกเกตแผนงาน',
    harnessRow4Status: '[นิยามไว้ในสแต็ก]',
    harnessRow5Spec: 'muse (H-5)',
    harnessRow5Family: 'Muse Coding Agent',
    harnessRow5Hook: 'ข้อกำหนด harnessspec แบบประกาศ + เกตคัดกรองคำสั่ง + ล็อกวงจรสถานะเซสชัน',
    harnessRow5Status: '[นิยามไว้ในสแต็ก]',
    harnessRow6Spec: 'pi-cli & pi-sdk (H-6, H-7)',
    harnessRow6Family: 'ตระกูล Pi Agent (2 ข้อกำหนด)',
    harnessRow6Hook: 'รองรับทั้งรูปแบบ CLI และ SDK ด้วยสัญญาการกำกับดูแล MCP และการตรวจใบรับรองเดียวกัน',
    harnessRow6Status: '[นิยามไว้ในสแต็ก]',

    ch3Code: 'บทที่ 03 / เครื่องจักรเร่งความเร็ววิศวกรรม',
    ch3Title: 'การกำกับดูแลที่ทำให้นักพัฒนาทำงานเร็วขึ้น ไม่ใช่ช้าลง',
    ch3Summary: 'เกตความปลอดภัยแบบเดิมสร้างคิวรออนุมัติหลังจากเขียนโค้ดเสร็จแล้ว แต่ Light ฝังดัชนีค้นหาโค้ด การตรวจทานข้ามโมเดล และการจัดคิวปล่อยระบบไว้ในวงจรของ Agent เพื่อให้งานจบตั้งแต่รอบแรก',
    velCard1Tag: 'การบีบอัดบริบท (L-13, L-14, E-6)',
    velCard1Title: 'ลดปริมาณโทเค็นที่เครื่องมือส่งกลับลง 97.5%',
    velCard1Metric: '~1,182 เทียบกับ ~47,000 โทเค็น/รอบ',
    velCard1Body: 'จากการวัดผล 3,766 รอบในระบบอ้างอิงของ Light ดัชนีสัญลักษณ์ tree-sitter และการตัดช่วงบรรทัดส่งข้อมูลกลับเพียง ~1,182 โทเค็นต่อรอบ เทียบกับ ~47,000 โทเค็นเมื่ออ่านไฟล์เต็ม (ลดลง 97.5%) ข้อกำหนด (E-6): ตัวเลขนี้วัดเฉพาะสิ่งที่เครื่องมือส่งกลับให้โมเดล ไม่ใช่โทเค็นความคิดหรือคำตอบของโมเดล ในระบบคิดเงินตามจริงจะช่วยลดค่า API โดยตรง ส่วนในระบบเหมาจ่ายรายที่นั่งจะช่วยเพิ่มเพดานโควตาและลดปัญหาบริบทเต็มกลางคัน',
    velCard2Tag: 'การตรวจสอบข้ามโมเดลอิสระ (L-05, L-06)',
    velCard2Title: 'ตรวจจับจุดบอดของการออกแบบและโค้ดก่อนส่งมอบอัตโนมัติ',
    velCard2Metric: 'การตรวจสอบอิสระ 2 ขั้นตอน',
    velCard2Body: 'ก่อนที่ผู้ดูแลจะอนุมัติแผนขนาดกลางหรือใหญ่ โมเดลคู่เทียบที่เป็นอิสระจะพยายามหาข้อโต้แย้งและเสนอสถาปัตยกรรมทางเลือก และก่อนปิดงาน โมเดลตรวจรับจะตรวจ git diff จริงเทียบกับทุกข้อที่สัญญาไว้ในแผน',
    velCard3Tag: 'ผู้ควบคุมขบวนปล่อยระบบ (L-08, L-19)',
    velCard3Title: 'ปล่อยงานพร้อมกันจากหลาย Agent โดยไม่ชนกัน',
    velCard3Metric: '1,400+ รอบการปล่อยระบบตามลำดับ',
    velCard3Body: 'เมื่อหลาย Agent ทำงานเสร็จพร้อมกัน ผู้ควบคุมขบวนปล่อยของ Light จะจัดคิวและรวมรอบการปล่อยผ่านรายการบริการที่ลงทะเบียนไว้ ตรวจสุขภาพระบบหลังปล่อย และบล็อกการใช้คำสั่ง ssh, scp, systemctl หรือ pm2 โดยพลการ',
    velCard4Tag: 'ความจำระดับองค์กร (L-15, L-16)',
    velCard4Title: 'ไม่เสียเวลาซ้ำกับแนวทางที่เคยพิสูจน์แล้วว่าล้มเหลว',
    velCard4Metric: 'แนบข้อมูลอัตโนมัติเมื่อค้นหาโค้ด',
    velCard4Body: 'ทุกแผนที่ปิดลงจะบันทึกข้อจำกัดทางสถาปัตยกรรม สาเหตุรากฐานของปัญหา และแนวทางที่ถูกปัดตกไว้ในคลังความรู้ เซสชันถัดไปจะได้รับข้อจำกัดเหล่านี้อัตโนมัติทันทีที่ค้นหาไฟล์ที่เกี่ยวข้อง',

    ch4Code: 'บทที่ 04 / ความคุ้มทุนที่จ่ายตัวเองคืนได้จริง',
    ch4Title: 'ทำไม Light จึงแทบจะจ่ายค่าตัวมันเอง: 4 รายการต้นทุนหลักและเครื่องคำนวณภาระงานจริง',
    ch4Summary: 'Light เข้าไปลดต้นทุนแฝง 4 ด้านที่ใหญ่ที่สุดของการใช้ AI ในทีมวิศวกรรม (E-1) กรอกจำนวนที่นั่ง ต้นทุนต่อชั่วโมง รูปแบบการคิดค่าบริการ และงบประมาณเป้าหมายขององค์กรคุณด้านล่าง เพื่อคำนวณจุดคุ้มทุนและเวลาวิศวกรที่ได้กลับคืน',
    econPolicyBanner: 'นโยบายความโปร่งใสของข้อมูล (E-1, E-6): รายการต้นทุนทั้ง 4 ด้านด้านล่างเป็นกลไกเชิงโครงสร้างที่อ้างอิงจากข้อมูลวัดผลในระบบอ้างอิง (L-14) และงานวิจัยอุตสาหกรรม (X-3, X-4, X-6) ตัวเลขผลลัพธ์ทางการเงินทั้งหมดในเครื่องคำนวณคำนวณจากสมมติฐานภาระงานที่ผู้ซื้อกรอกเองเท่านั้น ไม่ใช่ราคาขายตายตัวหรือการรับประกันผลประหยัด',
    costLine1Code: 'ต้นทุนด้านที่ 01 / ประสิทธิภาพบริบทและโควตาที่นั่ง (E-1, L-14, E-6)',
    costLine1Title: 'ค่าใช้จ่ายโทเค็นจากเครื่องมือและเพดานโควตาต่อที่นั่ง',
    costLine1Body: 'การอ่านไฟล์เต็มทำให้หน้าต่างบริบทเต็มเร็ว การลดโทเค็นตอบกลับจากเครื่องมือลง 97.5% ของ Light (L-14) ช่วยลดค่า API แบบคิดตามจริงโดยตรง ส่วนที่นั่งแบบเหมาจ่ายรายเดือน (E-6) จะบันทึกผลประหยัดเงินสดส่วนนี้เป็น $0 แต่จะได้เพดานโควตาทำงานเพิ่มขึ้นประมาณ 3-5 เท่าก่อนติดลิมิต',
    costLine2Code: 'ต้นทุนด้านที่ 02 / เวลาของวิศวกรอาวุโสในการตรวจ PR (E-1, X-3, X-4)',
    costLine2Title: 'ชั่วโมงวิศวกรอาวุโสที่สูญเสียไปกับการตรวจโค้ดที่แก้เกินขอบเขต',
    costLine2Body: 'เวลารอตรวจ PR ในอุตสาหกรรมพุ่งขึ้น +441% (X-3) และสัดส่วนการตรวจโดยคนลดลงจาก 89% เหลือ 68% (X-4) การล็อกขอบเขตไฟล์ตามแผนและการให้โมเดลอิสระตรวจทานก่อนและหลังแก้โค้ด ช่วยลดขนาดและความซับซ้อนของ PR ก่อนถึงมือคนตรวจ',
    costLine3Code: 'ต้นทุนด้านที่ 03 / เหตุขัดข้องจากการแก้โค้ดนอกขอบเขต (E-1, X-3, X-6)',
    costLine3Title: 'งานแก้ซ้ำและความเสี่ยงระบบล่มจากการเปลี่ยนแปลงที่ไม่ได้ควบคุม',
    costLine3Body: 'เหตุขัดข้องต่อ PR เพิ่มขึ้น +242.7% เมื่อใช้ AI โดยไม่มีการควบคุม (X-3) ขณะที่ต้นทุนระบบล่มขององค์กรขนาดกลางและใหญ่กว่า 91% สูงเกิน $300,000 ต่อชั่วโมง (ITIC 2024, X-6) Light ปฏิเสธคำสั่งนอกขอบเขตแผนไปกว่า 8,600+ ครั้งก่อนรันจริงในระบบอ้างอิง (U-3)',
    costLine4Code: 'ต้นทุนด้านที่ 04 / ภาระงานปล่อยระบบและ SRE (E-1, L-08, L-19)',
    costLine4Title: 'การประสานงานปล่อยระบบ การไล่แก้ปัญหาคอนฟิกเพี้ยน และการเตรียมหลักฐานตรวจสอบ',
    costLine4Body: 'แทนที่สคริปต์ปล่อยระบบเฉพาะกิจและการรวบรวมหลักฐานด้วยมือ ด้วยขบวนปล่อยระบบตามทะเบียนบริการ การตรวจสุขภาพอัตโนมัติ และใบรับรองการรันที่เชื่อมแฮช',

    calcHeading: 'เครื่องคำนวณภาระงานและจุดคุ้มทุนสำหรับผู้ซื้อ (Interactive Estimator)',
    calcSub: 'ปรับค่าตัวแปรเพื่อจำลองทีมวิศวกรรมและทีม SRE ขององค์กรคุณ ปุ่มลูกศรบนคีย์บอร์ดสามารถใช้ปรับค่าในช่องกรอกได้ตามปกติ',
    calcPresetMid: 'โหลดตัวอย่างองค์กรขนาดกลาง 50 ที่นั่ง',
    calcPresetEnt: 'โหลดตัวอย่างองค์กรขนาดใหญ่ 250 ที่นั่ง',
    calcPresetSre: 'เพิ่มทีม SRE / ปฏิบัติการ 15 ที่นั่ง',
    calcResetBtn: 'รีเซ็ตค่าเริ่มต้น',
    calcBillingLabel: 'รูปแบบการคิดค่าใช้จ่ายที่นั่ง AI Agent (E-6)',
    calcBillingFlat: 'เหมาจ่ายรายที่นั่ง (ประหยัดค่าโทเค็นเงินสด = $0 แต่ได้เพดานโควตาเพิ่ม)',
    calcBillingMetered: 'คิดตามปริมาณ API จริง (ประหยัดค่าโทเค็นส่วนที่เครื่องมือส่งกลับโดยตรง)',
    calcSeatsLabel: 'จำนวนที่นั่งวิศวกรที่ใช้ AI Agent',
    calcHourlyLabel: 'ต้นทุนวิศวกรต่อชั่วโมงแบบรวมสวัสดิการ (USD)',
    calcReviewHrsLabel: 'ชั่วโมงตรวจ PR และแก้งาน AI ต่อคนต่อสัปดาห์',
    calcReviewRedLabel: 'สัดส่วนเวลาตรวจและแก้งานที่คาดว่าจะลดได้ (%)',
    calcMeteredSpendLabel: 'ค่า API ขาเข้าแบบคิดตามจริงต่อที่นั่งต่อเดือน (USD)',
    calcTokenShareLabel: 'สัดส่วนโทเค็นขาเข้าที่มาจากผลลัพธ์เครื่องมือ (%)',
    calcIncidentsLabel: 'จำนวนเหตุขัดข้องจากการแก้โค้ดต่อปี',
    calcIncidentCostLabel: 'ต้นทุนเฉลี่ยหรืองานแก้ซ้ำต่อเหตุขัดข้อง (USD)',
    calcIncidentRedLabel: 'สัดส่วนเหตุขัดข้องที่คาดว่าจะลดได้จากเกตควบคุม (%)',
    calcReleaseHrsLabel: 'ชั่วโมงประสานงานปล่อยระบบและเตรียมหลักฐานของทีมต่อสัปดาห์',
    calcReleaseRedLabel: 'สัดส่วนภาระงานปล่อยระบบและเตรียมหลักฐานที่ลดได้ (%)',
    calcSubCostLabel: 'งบประมาณระบบกำกับดูแลเป้าหมายต่อที่นั่งต่อเดือน (USD)',
    calcSreSeatsLabel: 'จำนวนที่นั่งทีม Platform / SRE (ระบุเพิ่มได้)',
    calcSreHourlyLabel: 'ต้นทุนวิศวกร SRE ต่อชั่วโมง (USD)',
    calcTriageHrsLabel: 'ชั่วโมงคัดกรองแจ้งเตือนและปัญหาคอนฟิกต่อ SRE ต่อสัปดาห์',
    calcTriageRedLabel: 'สัดส่วนเวลาคัดกรองปัญหา SRE ที่ลดได้ (%)',

    calcOutBreakEvenLabel: 'เวลาที่ต้องประหยัดให้ได้เพื่อคุ้มทุน / ที่นั่ง / เดือน',
    calcOutBreakEvenUnit: 'นาที / เดือน',
    calcOutBreakEvenDesc: 'จากต้นทุนต่อชั่วโมงและงบประมาณต่อที่นั่งที่คุณระบุ เพียง Light ช่วยประหยัดเวลาวิศวกรได้เท่าจำนวนนาทีนี้ต่อเดือน ระบบก็จะคุ้มค่าตัวทันที',
    calcOutGrossMonthlyLabel: 'มูลค่าภาระงานที่ประหยัดได้รวมต่อเดือน (ก่อนหักงบ)',
    calcOutNetAnnualLabel: 'ผลลัพธ์สุทธิต่อปีโดยประมาณ (หลังหักงบประมาณ)',
    calcOutMultipleLabel: 'อัตราส่วนมูลค่าที่ได้รับต่องบประมาณ',
    calcOutHoursSeatLabel: 'ชั่วโมงวิศวกรที่ได้กลับคืน / ที่นั่ง / เดือน',
    calcOutLine1Label: 'ด้านที่ 1: ผลประหยัดค่าโทเค็นจากเครื่องมือแบบคิดตามจริง (E-6)',
    calcOutLine2Label: 'ด้านที่ 2: มูลค่าเวลาตรวจ PR และแก้งานวิศวกรอาวุโสที่ได้คืน',
    calcOutLine3Label: 'ด้านที่ 3: ต้นทุนเหตุขัดข้องจากการแก้โค้ดนอกขอบเขตที่หลีกเลี่ยงได้',
    calcOutLine4Label: 'ด้านที่ 4: มูลค่าเวลาขบวนปล่อยระบบและการคัดกรองงาน SRE',
    calcFlatRateNote: 'โหมดเหมาจ่ายรายที่นั่งทำงานอยู่ (E-6): ผลประหยัดเงินสดด้านที่ 1 ถูกตั้งเป็น $0 เพราะจ่ายค่าที่นั่งคงที่รายเดือน แต่การลดโทเค็นตอบกลับ 97.5% จะช่วยรักษาเพดานโควตาและป้องกันการถูกล็อกกลางงานแทน',
    calcMeteredNote: 'โหมดคิดตามปริมาณ API จริงทำงานอยู่ (E-6): ด้านที่ 1 คำนวณการลดโทเค็น 97.5% (L-14) เฉพาะกับสัดส่วนโทเค็นขาเข้าที่มาจากผลลัพธ์ของเครื่องมือเท่านั้น',
    calcErrorOutOfRange: 'ข้อมูลนำเข้าไม่ถูกต้อง: จำนวนภาระงานและต้นทุนทั้งหมดต้องเป็นตัวเลขที่ไม่ติดลบ และค่าเปอร์เซ็นต์ต้องอยู่ระหว่าง 0% ถึง 100% กรุณาปรับค่าในช่องที่แจ้งเตือนเพื่อคำนวณต่อ',
    calcStatusReady: '[พร้อมคำนวณ · อิงตามสมมติฐานของผู้ซื้อ]',
    calcStatusSaved: '[อัปเดตสถานการณ์จำลองแล้ว]',

    ch5Code: 'บทที่ 05 / หลักฐานวัดผล การเปรียบเทียบตลาด และแผนผังควบคุมสำหรับ CISO',
    ch5Title: 'ข้อมูลวัดผลจากระบบอ้างอิง การเปรียบเทียบตลาด 6 หมวดหมู่ และการจับคู่กรอบกำกับดูแล CISO',
    ch5Summary: 'ทุกข้อกล่าวอ้างด้านความสามารถยึดโยงกับกลไกที่ตรวจสอบได้ในสแต็กของ Light ข้อมูลวัดผลจากระบบอ้างอิงตั้งแต่มีนาคม 2026 หรือเอกสารสาธารณะที่ระบุแหล่งที่มาชัดเจน',
    telemetryNote: 'กฎการระบุแหล่งที่มา (B-10, B-11): ตัวเลขด้านล่างมาจากระบบอ้างอิงที่ใช้งานจริงของ Light เองตั้งแต่เดือนมีนาคม 2026 ครอบคลุม 5 ตระกูล Harness ไม่ใช่ข้อมูลจากลูกค้าภายนอก คำว่า "แผนงานที่ปิดแล้ว" รวมแผนที่ถูกยกเลิกด้วย และ "คำสั่งที่ถูกปฏิเสธ" คือการปฏิเสธตามนโยบายเมื่ออยู่นอกขอบเขตแผนก่อนรันจริง ไม่ใช่การบล็อกการโจมตีทางไซเบอร์',

    compHeading: 'การเปรียบเทียบตลาด 6 หมวดหมู่ (ข้อมูล ณ ตุลาคม 2026)',
    compSub: 'กรองตามสถานะความสามารถเพื่อเปรียบเทียบ Light กับ Hook เฉพาะค่าย, เกตเวย์ LLM, บอทตรวจ PR และเฟรมเวิร์กเขียนแอป Agent',
    compFilterAll: 'ทุกหมวดหมู่ (6)',
    compFilterDoc: 'มี Hook พื้นฐานในเอกสาร (Claude Code)',
    compFilterGap: 'หมวดที่ยังขาดเกตก่อนรันจริง',
    compResetFilter: 'รีเซ็ตตัวกรองเพื่อแสดงครบทั้ง 6 หมวดหมู่',
    compEmptyState: 'ไม่พบหมวดหมู่ตลาดที่ตรงกับตัวกรอง กดรีเซ็ตตัวกรองเพื่อดูครบทั้ง 6 หมวดหมู่',
    compColCategory: 'หมวดหมู่ตลาดและเครื่องมือตัวแทน',
    compColPreExec: 'เกตสกัดกั้นคำสั่งก่อนรันจริง',
    compColManifest: 'การผูกขอบเขตไฟล์ตามแผนอนุมัติ',
    compColPeer: 'การตรวจทานและโต้แย้งข้ามตระกูลโมเดล',
    compColReceipt: 'ใบรับรองผลการรันและขบวนปล่อยระบบ',
    compRow1Cat: 'ระนาบควบคุมแบบประกาศของ Light (ครอบคลุม 6 ตระกูล Harness)',
    compRow1Pre: '[มีในเอกสาร] เครื่องจักรสถานะเซสชัน + เกตที่นั่ง PreToolUse / MCP (L-01, L-02)',
    compRow1Man: '[มีในเอกสาร] อนุมัติรายการไฟล์และคำสั่งก่อนอนุญาตให้เขียนไฟล์ (L-03, L-04)',
    compRow1Peer: '[มีในเอกสาร] โมเดลอิสระตรวจโต้แย้งร่างแผนและตรวจโค้ดก่อนปิดงาน (L-05, L-06)',
    compRow1Rec: '[มีในเอกสาร] ใบรับรองเทสต์ตรวจไบต์ซอร์ส + ผู้ควบคุมขบวนปล่อยระบบ (L-07, L-08)',
    compRow2Cat: 'CLI Hook เฉพาะค่าย (Anthropic Claude Code Hooks, docs.anthropic.com, ต.ค. 2026, M-1)',
    compRow2Pre: '[มีในเอกสาร] PreToolUse / PostToolUse / PermissionRequest อนุญาตหรือปฏิเสธรายคำสั่ง',
    compRow2Man: '[บางส่วน] มีกลไก Hook ให้ใช้ แต่องค์กรต้องสร้างระบบเก็บสถานะแผนและขั้นตอนอนุมัติเอง',
    compRow2Peer: '[ยังไม่ปรากฏ] เป็น CLI ค่ายเดียว ไม่มีระบบจัดการส่งตรวจข้ามตระกูลโมเดลในตัว',
    compRow2Rec: '[ยังไม่ปรากฏ] ไม่มีใบรับรองแฮชซอร์สโค้ดหรือระบบจัดคิวปล่อยหลายบริการในตัว',
    compRow3Cat: 'ผู้ช่วยเขียนโค้ดใน IDE (Cursor, GitHub Copilot, Windsurf, เอกสารผู้ผลิต ต.ค. 2026, M-2, M-3)',
    compRow3Pre: '[บางส่วน] ตั้งค่าสิทธิ์ในเครื่องและไฟล์คำแนะนำ (.cursorrules / copilot-instructions)',
    compRow3Man: '[ยังไม่ปรากฏ] เป็นคำแนะนำในพรอมต์ ไม่มีเกตฝั่งเซิร์ฟเวอร์บังคับอนุมัติรายการไฟล์ล่วงหน้า',
    compRow3Peer: '[ยังไม่ปรากฏ] สร้างโค้ดในเซสชันเดียวโดยไม่มีเกตส่งให้โมเดลอิสระโต้แย้งก่อนเขียน',
    compRow3Rec: '[ยังไม่ปรากฏ] พึ่งพาระบบ CI ปลายทางหลังจากส่งโค้ดขึ้นสาขาแล้ว',
    compRow4Cat: 'เกตเวย์และตัวกรอง LLM API (LiteLLM, Portkey, Lakera, เอกสารผู้ผลิต ต.ค. 2026, M-6)',
    compRow4Pre: '[บางส่วน] คุมงบโทเค็น กรองข้อมูลส่วนบุคคล และตรวจพรอมต์บนคำขอ HTTP',
    compRow4Man: '[ยังไม่ปรากฏ] ไม่รับรู้สถานะ git working tree ขั้นตอนแผน หรือรายการไฟล์ที่อนุญาตให้แก้',
    compRow4Peer: '[ยังไม่ปรากฏ] ทำหน้าที่สลับเส้นทางโมเดล แต่ไม่ได้บริหารกระบวนการตรวจทานแผนและโค้ด',
    compRow4Rec: '[ยังไม่ปรากฏ] บันทึกเฉพาะโทเค็นขาเข้าและขาออก ไม่ได้ตรวจผลลัพธ์คำสั่งและไบต์ซอร์สโค้ด',
    compRow5Cat: 'บอทตรวจ Pull Request (CodeRabbit, Qodo Merge, Copilot PR Review, ต.ค. 2026, M-5)',
    compRow5Pre: '[ยังไม่ปรากฏ] ทำงานหลังคอมมิตหรือเปิด PR ไปแล้ว ไม่ได้สกัดกั้นก่อนเกิดการแก้ไฟล์',
    compRow5Man: '[ยังไม่ปรากฏ] แสดงความเห็นบน diff หลังสร้างเสร็จ ไม่สามารถบล็อกคำสั่งเชลล์หรือการแก้ไฟล์ในเครื่อง',
    compRow5Peer: '[บางส่วน] ให้ความเห็นอัตโนมัติบน PR แต่ไม่มีการโต้แย้งแผนก่อนเริ่มเขียนโค้ด',
    compRow5Rec: '[ยังไม่ปรากฏ] ไม่ได้ควบคุมใบรับรองการรันเทสต์ในเครื่องหรือลำดับการปล่อยระบบจริง',
    compRow6Cat: 'เฟรมเวิร์กสร้างแอป Agent (LangGraph, CrewAI, AutoGen, เอกสารผู้ผลิต ต.ค. 2026, M-7)',
    compRow6Pre: '[บางส่วน] มีจุดพักรออนุมัติในกราฟสำหรับแอปที่องค์กรเขียนขึ้นเอง',
    compRow6Man: '[ยังไม่ปรากฏ] เป็นชุดพัฒนาซอฟต์แวร์ (SDK) ไม่ได้ใช้ควบคุม CLI เขียนโค้ดสำเร็จรูปของนักพัฒนา',
    compRow6Peer: '[บางส่วน] สร้างกราฟหลายโมเดลเองได้หากทีมวิศวกรรมออกแบบและดูแลรักษาเอง',
    compRow6Rec: '[ยังไม่ปรากฏ] ไม่มีระบบกำกับดูแล CLI สำเร็จรูป ดัชนีโค้ด หรือผู้ควบคุมขบวนปล่อยในตัว',
    compOverflowNote: 'แสดงครบทั้ง 6 หมวดหมู่ตลาดตามเอกสาร 05-competitive-comparison.md (ข้อมูล ณ ตุลาคม 2026) ป้ายสถานะใช้คำนิยามตามทะเบียนหลักฐาน: [มีในเอกสาร], [บางส่วน], [ยังไม่ปรากฏ]',

    cisoHeading: 'แผนผังจับคู่ความสามารถของระบบเข้ากับกรอบควบคุมของ CISO และกฎระเบียบ (C-1 ถึง C-11, R-1 ถึง R-4)',
    cisoDisclaimer: 'หมายเหตุขอบเขต: ตารางนี้จับคู่ความสามารถทางเทคนิคของ Light เข้ากับมาตรการควบคุมความปลอดภัยและข้อกำหนดทางกฎหมาย (EU AI Act, NIST AI RMF, ISO/IEC 42001, SOC 2 / DORA / SR 11-7) เพื่อใช้ประกอบการประเมินทางสถาปัตยกรรมเท่านั้น ไม่ใช่ใบรับรองการผ่านเกณฑ์ทางกฎหมาย',
    cisoColId: 'รหัสควบคุมและความเสี่ยง',
    cisoColReq: 'ความต้องการของ CISO / ข้อกำหนดกำกับดูแล',
    cisoColMech: 'กลไกการบังคับใช้ใน Light',
    cisoColFramework: 'กรอบมาตรฐานที่สอดคล้อง',
    cisoRow1Id: 'C-1 / ขอบเขตการกระทำที่ไม่ถูกจำกัด',
    cisoRow1Req: 'แยกความสามารถในการกระทำของ Agent ออกจากขอบเขตสิทธิ์ที่ได้รับอนุมัติ (Gartner A-3)',
    cisoRow1Mech: 'บังคับใช้รายการไฟล์ targets[], คำสั่ง requests[] และไฟล์สร้างใหม่ creates[] ตามขั้นตอนแผน (L-03, L-04)',
    cisoRow1Fw: 'NIST AI RMF Govern 1.2 / Map 3.5 (R-2)',
    cisoRow2Id: 'C-2 / การแก้ไขระบบจริงโดยไม่ผ่านการอนุมัติ',
    cisoRow2Req: 'ต้องมีมนุษย์ตรวจสอบและอนุมัติก่อนการเปลี่ยนแปลงที่มีผลกระทบสูง',
    cisoRow2Mech: 'เกต boot_locked/grounded บล็อกการเขียนไฟล์ทั้งหมดจนกว่าผู้ดูแลจะกด Go หรือยืนยันด้วย WebAuthn (L-02, L-10, L-22)',
    cisoRow2Fw: 'EU AI Act มาตรา 14 การกำกับดูแลโดยมนุษย์ (R-1)',
    cisoRow3Id: 'C-3 / บันทึกการทำงานที่ถูกแก้ไขย้อนหลังได้',
    cisoRow3Req: 'มีหลักฐานการตรวจสอบทุกคำสั่งและผลลัพธ์ที่ไม่สามารถปฏิเสธความรับผิดได้',
    cisoRow3Mech: 'สมุดบัญชีแฮชลูกโซ่ SHA-256 พร้อมใบรับรองผลการรันที่ตรวจความเท่ากันของไบต์ซอร์สโค้ด (L-07, L-17)',
    cisoRow3Fw: 'EU AI Act มาตรา 12 การเก็บบันทึก / SOC 2 CC7.2 (R-1, R-4)',
    cisoRow4Id: 'C-4 / จุดบอดและอาการหลอนของโมเดลเดี่ยว',
    cisoRow4Req: 'มีการตรวจสอบความถูกต้องของการออกแบบและโค้ดโดยอิสระก่อนปล่อยใช้งาน',
    cisoRow4Mech: 'ส่งตรวจข้ามตระกูลโมเดล (โต้แย้งร่างแผนและตรวจรับโค้ดเทียบคำสัญญา) บนโมเดลอิสระ (L-05, L-06)',
    cisoRow4Fw: 'SR 11-7 การตรวจสอบความเสี่ยงโมเดล / ISO 42001 A.6.2 (R-3, R-4)',
    cisoRow5Id: 'C-5 / การปล่อยระบบทับซ้อนไร้การจัดคิว',
    cisoRow5Req: 'ป้องกันหลายเซสชันของ Agent แย่งกันปล่อยระบบหรือข้ามขั้นตอนควบคุมการเปลี่ยนแปลง',
    cisoRow5Mech: 'จัดคิวผ่านผู้ควบคุมขบวนปล่อย + ทะเบียนบริการที่กำหนดไว้ + เกตตรวจสุขภาพหลังปล่อย (L-08, L-19)',
    cisoRow5Fw: 'DORA มาตรา 9 การจัดการการเปลี่ยนแปลง ICT / SOC 2 CC8.1 (R-4)',
    cisoRow6Id: 'C-6 / อาการวนลูปของ Agent และต้นทุนบานปลาย',
    cisoRow6Req: 'จำกัดรัศมีผลกระทบเมื่อเซสชันทำงานค้างหรือวนลูปซ้ำ',
    cisoRow6Mech: 'จำกัดงบประมาณการแก้ไฟล์ต่อแผน ตัวตัดวงจรคำสั่งซ้ำ และเพิกถอนสิทธิ์อัตโนมัติเมื่อขอบเขตเพี้ยน (L-11, L-12, L-20)',
    cisoRow6Fw: 'NIST AI RMF Manage 2.4 / ISO 42001 A.8 (R-2, R-3)',

    personaHeading: 'ตารางคุณค่าสำหรับผู้บริหารและทีมวิศวกรรม (5 บทบาทหลัก)',
    personaFilterAll: 'ทุกบทบาท (5)',
    personaFilterExec: 'ผู้บริหาร (CTO / CISO / CFO)',
    personaFilterEng: 'สายวิศวกรรม (Platform / Developer)',
    persona1Role: 'CTO / VP Engineering',
    persona1Focus: 'ขยายผลการใช้ AI สู่ทีมวิศวกร 50-500 คนโดยไม่เกิดคอขวดตรวจ PR',
    persona1Gain: 'เปลี่ยนโค้ดจาก Agent ที่กระจัดกระจายให้เป็นงานที่ถูกจำกัดขอบเขตตามแผนและผ่านการตรวจทานข้ามโมเดลแล้ว ช่วยให้วิศวกรอาวุโสตรวจเสร็จในระดับนาทีแทนที่จะเป็นชั่วโมง',
    persona2Role: 'CISO / หัวหน้าฝ่ายความปลอดภัย',
    persona2Focus: 'การบังคับใช้นโยบายก่อนรันจริงและหลักฐานตรวจสอบที่แก้ไขย้อนหลังไม่ได้',
    persona2Gain: 'เปลี่ยนกฎแนะนำในไฟล์ข้อความให้เป็นเกตบังคับก่อนรันจริง รองรับ RBAC/WebAuthn และใบรับรอง SHA-256 ที่เชื่อมโยงกับ EU AI Act มาตรา 12/14 และ NIST AI RMF',
    persona3Role: 'CFO / หัวหน้าฝ่าย FinOps',
    persona3Focus: 'โครงสร้างต้นทุน AI ที่คาดการณ์ได้และจุดคุ้มทุนที่วัดผลได้ชัดเจน',
    persona3Gain: 'ลดปริมาณโทเค็นที่เครื่องมือส่งกลับลง 97.5% (L-14) และคืนชั่วโมงวิศวกรอาวุโสจากการตรวจโค้ดและแก้เหตุขัดข้อง ทำให้ระบบคืนทุนได้ภายในเวลาไม่กี่นาทีที่ประหยัดได้ต่อที่นั่ง',
    persona4Role: 'หัวหน้าทีม Platform / SRE',
    persona4Focus: 'ยุติการรันคำสั่ง SSH/Docker โดยพลการและการปล่อยระบบชนกัน',
    persona4Gain: 'บังคับให้ทุกการปล่อยระบบวิ่งผ่านทะเบียนบริการแบบประกาศและขบวนปล่อยที่เรียงคิวชัดเจน พร้อมตรวจสุขภาพระบบอัตโนมัติ',
    persona5Role: 'วิศวกรอาวุโส / นักพัฒนา (Staff & Senior Dev)',
    persona5Focus: 'ค้นหาโครงสร้างโค้ดความเร็วสูงและไม่ต้องไล่แก้ปัญหาเดิมซ้ำ',
    persona5Gain: 'ค้นหาสัญลักษณ์และผู้เรียกใช้ในระดับเสี้ยววินาทีด้วย tree-sitter (light_smart_index) พร้อมดึงข้อจำกัดและแนวทางที่เคยล้มเหลวมาแจ้งเตือนอัตโนมัติ',

    ch6Code: 'บทที่ 06 / แผนเริ่มใช้งานจริงใน 30 วัน (SHADOW-TO-ENFORCE)',
    ch6Title: 'เริ่มใช้งาน Light ใน 30 วันโดยไม่กระทบสปรินต์งานที่กำลังเดินอยู่',
    ch6Summary: 'เริ่มต้นด้วยโหมดสังเกตการณ์แบบอ่านอย่างเดียวในทีมนำร่อง วัดค่าพื้นฐานของโทเค็นและเวลาตรวจ PR จากนั้นจึงเปิดเกตแผนงานและขบวนปล่อยระบบทีละขั้น',
    week1Code: 'สัปดาห์ที่ 01 / โหมดสังเกตการณ์และเก็บค่าฐาน',
    week1Title: 'เชื่อมต่อ Harness และวัดค่าพื้นฐาน',
    week1Body: 'เชื่อมต่อที่นั่ง Claude Code, Codex หรือ Antigravity เดิมเข้ากับสะพาน MCP ของ Light เปิดใช้ดัชนีโค้ด tree-sitter (L-13) เพื่อวัดปริมาณโทเค็นที่ลดลงและเวลาตรวจ PR ตั้งต้น',
    week2Code: 'สัปดาห์ที่ 02 / เปิดเกตแผนงานและขอบเขตไฟล์',
    week2Title: 'บังคับใช้แผนงานผูกขอบเขตและการอนุมัติก่อนเขียนไฟล์',
    week2Body: 'เปิดใช้งานการล็อกเซสชันเริ่มต้นและการวางแผนผูกขอบเขตไฟล์ (L-02, L-03) สำหรับงานขนาดกลางและใหญ่ การแก้ไฟล์นอกแผนและคำสั่งเชลล์อันตรายจะถูกปฏิเสธก่อนรันจริง',
    week3Code: 'สัปดาห์ที่ 03 / การตรวจทานข้ามโมเดลและขบวนปล่อยระบบ',
    week3Title: 'เชื่อมต่อโมเดลคู่เทียบและทะเบียนบริการปล่อยระบบ',
    week3Body: 'ตั้งค่าโมเดลอิสระตระกูลที่สองสำหรับตรวจโต้แย้งร่างแผนและตรวจรับโค้ดก่อนปิดงาน (L-05, L-06) พร้อมลงทะเบียนบริการในผู้ควบคุมขบวนปล่อย (L-08)',
    week4Code: 'สัปดาห์ที่ 04 / สรุปผลตรวจสอบและความคุ้มทุนต่อผู้บริหาร',
    week4Title: 'เปรียบเทียบความเร็ว คำสั่งที่ถูกสกัดกั้น และผลประหยัดต้นทุน 4 ด้าน',
    week4Body: 'ส่งออกใบรับรองผลการรันแบบเชื่อมแฮช รายงานคำสั่งที่ถูกปฏิเสธก่อนรัน และผลประหยัดจริงทั้ง 4 ด้าน (E-1) เพื่อสรุปต่อ CTO, CISO และ CFO',

    ctaBoxTitle: 'พร้อมประเมินระบบ Light กับทีมวิศวกรรมขององค์กรคุณหรือยัง?',
    ctaBoxBody: 'นัดหมายเพื่อเจาะลึกสถาปัตยกรรม ดูข้อมูลวัดผลจากระบบอ้างอิงจริง หรือกำหนดขอบเขตการทำ Shadow-to-Enforce Pilot 30 วันร่วมกับ Factor IO',
    ctaPrimary: 'นัดหมายรับฟังการบรรยายสถาปัตยกรรมสำหรับผู้บริหาร',
    ctaSecondary: 'ดูแคตตาล็อกบริการทั้งหมดของ Factor IO',
    ctaEmailLabel: 'ติดต่อทีมวิศวกรรมโดยตรง:',
    footerLegal: 'บริษัท แฟคเคอร์ ไอ โอ จำกัด (Factor IO Co., Ltd.) · เลขทะเบียนนิติบุคคล / เลขประจำตัวผู้เสียภาษี 0105562205512 · กรุงเทพมหานคร',
  },
};

export const DEFAULT_WORKLOAD = {
  billingMode: 'flat-rate',
  seats: 50,
  hourlyRate: 100,
  reviewHoursPerWeek: 4,
  reviewReductionPct: 35,
  meteredTokenSpendPerSeatMonth: 180,
  tokenReturnSharePct: 55,
  incidentsPerYear: 12,
  incidentCost: 15000,
  incidentReductionPct: 35,
  releaseHoursPerWeek: 12,
  releaseReductionPct: 50,
  subscriptionCostPerSeatMonth: 50,
  sreSeats: 0,
  sreHourlyRate: 110,
  triageHoursPerWeek: 6,
  triageReductionPct: 40,
  sreSubscriptionPerSeatMonth: 150,
};

export const WORKLOAD_PRESETS = {
  mid: { ...DEFAULT_WORKLOAD },
  enterprise: {
    ...DEFAULT_WORKLOAD,
    seats: 250,
    hourlyRate: 115,
    reviewHoursPerWeek: 4.5,
    reviewReductionPct: 35,
    incidentsPerYear: 28,
    incidentCost: 25000,
    incidentReductionPct: 35,
    releaseHoursPerWeek: 36,
    releaseReductionPct: 50,
    subscriptionCostPerSeatMonth: 50,
    sreSeats: 15,
    sreHourlyRate: 125,
    triageHoursPerWeek: 6,
    triageReductionPct: 40,
    sreSubscriptionPerSeatMonth: 150,
  },
  srePod: {
    ...DEFAULT_WORKLOAD,
    sreSeats: 15,
    sreHourlyRate: 115,
    triageHoursPerWeek: 6,
    triageReductionPct: 40,
    sreSubscriptionPerSeatMonth: 150,
  },
};

export function calculateEconomics(input = {}) {
  const merged = { ...DEFAULT_WORKLOAD, ...(input && typeof input === 'object' ? input : {}) };
  const billingMode = merged.billingMode === 'metered' ? 'metered' : 'flat-rate';
  const numericKeys = [
    'seats',
    'hourlyRate',
    'reviewHoursPerWeek',
    'reviewReductionPct',
    'meteredTokenSpendPerSeatMonth',
    'tokenReturnSharePct',
    'incidentsPerYear',
    'incidentCost',
    'incidentReductionPct',
    'releaseHoursPerWeek',
    'releaseReductionPct',
    'subscriptionCostPerSeatMonth',
    'sreSeats',
    'sreHourlyRate',
    'triageHoursPerWeek',
    'triageReductionPct',
    'sreSubscriptionPerSeatMonth',
  ];
  const pctKeys = new Set([
    'reviewReductionPct',
    'tokenReturnSharePct',
    'incidentReductionPct',
    'releaseReductionPct',
    'triageReductionPct',
  ]);

  const invalidFields = [];
  const nums = {};
  for (const key of numericKeys) {
    const raw = merged[key];
    const val = typeof raw === 'number' ? raw : Number(raw);
    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(val) || val < 0) {
      invalidFields.push(key);
      continue;
    }
    if (pctKeys.has(key) && val > 100) {
      invalidFields.push(key);
      continue;
    }
    nums[key] = val;
  }

  if (invalidFields.length > 0) {
    return {
      valid: false,
      errorCode: 'OUT_OF_RANGE',
      invalidFields,
      billingMode,
      line1ContextMonthly: 0,
      line2ReviewMonthly: 0,
      line3IncidentMonthly: 0,
      line4ReleaseMonthly: 0,
      grossMonthlyValue: 0,
      grossAnnualValue: 0,
      subscriptionMonthlyCost: 0,
      netMonthlyValue: 0,
      netAnnualValue: 0,
      breakEvenMinutesPerSeatMonth: null,
      paybackMultiple: null,
      hoursSavedPerSeatMonth: 0,
    };
  }

  const weeksPerMonth = 4.33;
  const toolReturnReductionFactor = 0.975;

  // E-6: On flat-rate seats, cash token savings are $0 (gain is seat quota headroom).
  const line1ContextMonthly = billingMode === 'metered'
    ? Math.round(nums.seats * nums.meteredTokenSpendPerSeatMonth * (nums.tokenReturnSharePct / 100) * toolReturnReductionFactor)
    : 0;

  const line2ReviewMonthly = Math.round(
    nums.seats * nums.reviewHoursPerWeek * weeksPerMonth * (nums.reviewReductionPct / 100) * nums.hourlyRate
  );

  const line3IncidentMonthly = Math.round(
    (nums.incidentsPerYear / 12) * nums.incidentCost * (nums.incidentReductionPct / 100)
  );

  const engReleaseMonthly = nums.releaseHoursPerWeek * weeksPerMonth * (nums.releaseReductionPct / 100) * nums.hourlyRate;
  const sreTriageMonthly = nums.sreSeats * nums.triageHoursPerWeek * weeksPerMonth * (nums.triageReductionPct / 100) * nums.sreHourlyRate;
  const line4ReleaseMonthly = Math.round(engReleaseMonthly + sreTriageMonthly);

  const grossMonthlyValue = line1ContextMonthly + line2ReviewMonthly + line3IncidentMonthly + line4ReleaseMonthly;
  const grossAnnualValue = grossMonthlyValue * 12;

  const subscriptionMonthlyCost = Math.round(
    (nums.seats * nums.subscriptionCostPerSeatMonth) + (nums.sreSeats * nums.sreSubscriptionPerSeatMonth)
  );
  const netMonthlyValue = grossMonthlyValue - subscriptionMonthlyCost;
  const netAnnualValue = netMonthlyValue * 12;

  const breakEvenMinutesPerSeatMonth = nums.hourlyRate > 0
    ? Math.round(((nums.subscriptionCostPerSeatMonth / nums.hourlyRate) * 60) * 10) / 10
    : null;

  const paybackMultiple = subscriptionMonthlyCost > 0
    ? Math.round((grossMonthlyValue / subscriptionMonthlyCost) * 10) / 10
    : null;

  const reviewHoursSavedPerSeatMonth = nums.reviewHoursPerWeek * weeksPerMonth * (nums.reviewReductionPct / 100);
  const releaseHoursSavedPerSeatMonth = nums.seats > 0
    ? (nums.releaseHoursPerWeek * weeksPerMonth * (nums.releaseReductionPct / 100)) / nums.seats
    : 0;
  const hoursSavedPerSeatMonth = nums.seats > 0
    ? Math.round((reviewHoursSavedPerSeatMonth + releaseHoursSavedPerSeatMonth) * 10) / 10
    : 0;

  return {
    valid: true,
    errorCode: null,
    invalidFields: [],
    billingMode,
    inputs: nums,
    line1ContextMonthly,
    line2ReviewMonthly,
    line3IncidentMonthly,
    line4ReleaseMonthly,
    grossMonthlyValue,
    grossAnnualValue,
    subscriptionMonthlyCost,
    netMonthlyValue,
    netAnnualValue,
    breakEvenMinutesPerSeatMonth,
    paybackMultiple,
    hoursSavedPerSeatMonth,
  };
}

export function bindPresentation(root, env = {}) {
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const doc = root && root.ownerDocument ? root.ownerDocument : (win && win.document ? win.document : null);
  const totalChapters = 6;
  const state = {
    lang: 'en',
    mode: 'reading',
    activeChapter: 0,
    compFilter: 'all',
    personaFilter: 'all',
    workload: { ...DEFAULT_WORKLOAD },
    lastCalculation: calculateEconomics(DEFAULT_WORKLOAD),
  };

  const formatUsd = val => {
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(Math.round(val));
    return sign + '$' + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const qAll = sel => (root && typeof root.querySelectorAll === 'function' ? Array.from(root.querySelectorAll(sel)) : []);
  const qOne = sel => (root && typeof root.querySelector === 'function' ? root.querySelector(sel) : null);

  function renderEconomicsView(statusKey = 'calcStatusReady') {
    const dict = lightContent[state.lang] || lightContent.en;
    const res = calculateEconomics(state.workload);
    state.lastCalculation = res;

    const errBanner = qOne('[data-econ-error]');
    const statusBadge = qOne('[data-econ-status]');
    if (errBanner) {
      errBanner.hidden = res.valid;
      errBanner.textContent = res.valid ? '' : dict.calcErrorOutOfRange;
    }
    if (statusBadge) {
      statusBadge.textContent = res.valid ? (dict[statusKey] || dict.calcStatusReady) : '[ERROR · CHECK INPUTS]';
      statusBadge.setAttribute('data-state', res.valid ? 'ready' : 'error');
    }

    for (const inputEl of qAll('[data-econ-field]')) {
      const field = inputEl.getAttribute('data-econ-field');
      const isBad = res.invalidFields.includes(field);
      inputEl.setAttribute('aria-invalid', isBad ? 'true' : 'false');
    }

    for (const btn of qAll('[data-billing-mode]')) {
      const m = btn.getAttribute('data-billing-mode');
      const active = m === state.workload.billingMode;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList) btn.classList.toggle('is-active', active);
    }

    const modeNote = qOne('[data-econ-mode-note]');
    if (modeNote) {
      modeNote.textContent = state.workload.billingMode === 'metered' ? dict.calcMeteredNote : dict.calcFlatRateNote;
    }

    if (!res.valid) return res;

    const setOut = (sel, text) => {
      const el = qOne(sel);
      if (el) el.textContent = text;
    };

    setOut('[data-econ-out="breakEven"]', res.breakEvenMinutesPerSeatMonth === null ? 'N/A' : `${res.breakEvenMinutesPerSeatMonth} ${dict.calcOutBreakEvenUnit}`);
    setOut('[data-econ-out="grossMonthly"]', formatUsd(res.grossMonthlyValue));
    setOut('[data-econ-out="netAnnual"]', formatUsd(res.netAnnualValue));
    setOut('[data-econ-out="multiple"]', res.paybackMultiple === null ? 'N/A' : `${res.paybackMultiple}x`);
    setOut('[data-econ-out="hoursSeat"]', `${res.hoursSavedPerSeatMonth} hrs`);
    setOut('[data-econ-out="line1"]', formatUsd(res.line1ContextMonthly));
    setOut('[data-econ-out="line2"]', formatUsd(res.line2ReviewMonthly));
    setOut('[data-econ-out="line3"]', formatUsd(res.line3IncidentMonthly));
    setOut('[data-econ-out="line4"]', formatUsd(res.line4ReleaseMonthly));
    return res;
  }

  function syncWorkloadInputs() {
    for (const inputEl of qAll('[data-econ-field]')) {
      const field = inputEl.getAttribute('data-econ-field');
      if (field && Object.prototype.hasOwnProperty.call(state.workload, field)) {
        inputEl.value = String(state.workload[field]);
      }
    }
  }

  function setLang(nextLang) {
    state.lang = nextLang === 'th' ? 'th' : 'en';
    const dict = lightContent[state.lang];
    if (root && typeof root.setAttribute === 'function') {
      root.setAttribute('lang', state.lang);
      root.setAttribute('data-lang', state.lang);
    }
    if (doc && doc.title !== undefined) {
      doc.title = dict.metaTitle;
    }
    for (const el of qAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n');
      if (key && dict[key] !== undefined) {
        el.textContent = dict[key];
      }
    }
    for (const btn of qAll('[data-lang-btn]')) {
      const active = btn.getAttribute('data-lang-btn') === state.lang;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList) btn.classList.toggle('is-active', active);
    }
    for (const linkEl of qAll('[data-locale-route]')) {
      const route = linkEl.getAttribute('data-locale-route');
      if (route === 'home') linkEl.setAttribute('href', `/${state.lang}/`);
      else if (route === 'contact') linkEl.setAttribute('href', `/${state.lang}/contact/`);
      else if (route === 'offerings') linkEl.setAttribute('href', `/offerings.html?lang=${state.lang}`);
      else if (route === 'lightops') linkEl.setAttribute('href', `/lightops-ai.html?lang=${state.lang}`);
    }
    updateChapterIndicator();
    renderEconomicsView();
    if (win && win.history && typeof win.history.replaceState === 'function' && win.location) {
      try {
        const url = new URL(win.location.href);
        url.searchParams.set('lang', state.lang);
        win.history.replaceState({}, '', url.toString());
      } catch {}
    }
    return state.lang;
  }

  function updateChapterIndicator() {
    const dict = lightContent[state.lang] || lightContent.en;
    const ind = qOne('[data-chapter-indicator]');
    if (ind) {
      ind.textContent = `${dict.chapterIndicatorPrefix} ${state.activeChapter + 1} / ${totalChapters}`;
    }
    const chapters = qAll('.presentation-chapter');
    chapters.forEach((ch, idx) => {
      const active = idx === state.activeChapter;
      if (ch.classList) ch.classList.toggle('is-active-chapter', active);
      ch.setAttribute('data-active', active ? 'true' : 'false');
    });
    for (const navBtn of qAll('[data-chapter-nav]')) {
      const idx = Number(navBtn.getAttribute('data-chapter-nav'));
      const active = idx === state.activeChapter;
      navBtn.setAttribute('aria-current', active ? 'step' : 'false');
      if (navBtn.classList) navBtn.classList.toggle('is-active', active);
    }
    const prevBtn = qOne('[data-chapter-step="prev"]');
    const nextBtn = qOne('[data-chapter-step="next"]');
    if (prevBtn) prevBtn.disabled = state.activeChapter <= 0;
    if (nextBtn) nextBtn.disabled = state.activeChapter >= totalChapters - 1;
  }

  function setMode(nextMode) {
    state.mode = nextMode === 'presentation' ? 'presentation' : 'reading';
    if (root && typeof root.setAttribute === 'function') {
      root.setAttribute('data-presentation-mode', state.mode);
    }
    for (const btn of qAll('[data-mode-btn]')) {
      const active = btn.getAttribute('data-mode-btn') === state.mode;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList) btn.classList.toggle('is-active', active);
    }
    updateChapterIndicator();
    return state.mode;
  }

  function setChapter(index) {
    const parsed = Number(index);
    if (!Number.isFinite(parsed)) return state.activeChapter;
    state.activeChapter = Math.max(0, Math.min(totalChapters - 1, Math.trunc(parsed)));
    if (root && typeof root.setAttribute === 'function') {
      root.setAttribute('data-active-chapter', String(state.activeChapter));
    }
    updateChapterIndicator();
    return state.activeChapter;
  }

  function setCompFilter(filterVal) {
    state.compFilter = filterVal || 'all';
    for (const btn of qAll('[data-comp-filter]')) {
      const active = btn.getAttribute('data-comp-filter') === state.compFilter;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList) btn.classList.toggle('is-active', active);
    }
    let visibleCount = 0;
    for (const row of qAll('[data-comp-row]')) {
      const tags = (row.getAttribute('data-comp-row') || '').split(/\s+/);
      const show = state.compFilter === 'all' || tags.includes(state.compFilter);
      row.hidden = !show;
      if (show) visibleCount += 1;
    }
    const emptyEl = qOne('[data-comp-empty]');
    if (emptyEl) emptyEl.hidden = visibleCount > 0;
    return visibleCount;
  }

  function setPersonaFilter(filterVal) {
    state.personaFilter = filterVal || 'all';
    for (const btn of qAll('[data-persona-filter]')) {
      const active = btn.getAttribute('data-persona-filter') === state.personaFilter;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (btn.classList) btn.classList.toggle('is-active', active);
    }
    for (const card of qAll('[data-persona-group]')) {
      const grp = card.getAttribute('data-persona-group');
      const show = state.personaFilter === 'all' || grp === state.personaFilter;
      card.hidden = !show;
    }
  }

  function isInteractiveTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A';
  }

  function onKeyDown(event) {
    if (!event) return false;
    if (isInteractiveTarget(event.target)) return false;
    if (event.key === 'Escape' && state.mode === 'presentation') {
      setMode('reading');
      return true;
    }
    if (state.mode !== 'presentation') return false;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      setChapter(state.activeChapter + 1);
      return true;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      setChapter(state.activeChapter - 1);
      return true;
    }
    return false;
  }

  function updateWorkload(patch, statusKey = 'calcStatusSaved') {
    state.workload = { ...state.workload, ...patch };
    syncWorkloadInputs();
    return renderEconomicsView(statusKey);
  }

  function applyPreset(presetName) {
    const preset = WORKLOAD_PRESETS[presetName] || DEFAULT_WORKLOAD;
    state.workload = { ...preset };
    syncWorkloadInputs();
    return renderEconomicsView('calcStatusSaved');
  }

  // Bind DOM listeners if root is a live DOM node
  for (const btn of qAll('[data-lang-btn]')) {
    btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang-btn')));
  }
  for (const btn of qAll('[data-mode-btn]')) {
    btn.addEventListener('click', () => setMode(btn.getAttribute('data-mode-btn')));
  }
  for (const btn of qAll('[data-chapter-nav]')) {
    btn.addEventListener('click', e => {
      const idx = Number(btn.getAttribute('data-chapter-nav'));
      setChapter(idx);
      if (state.mode === 'presentation' && e && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    });
  }
  const prevBtn = qOne('[data-chapter-step="prev"]');
  if (prevBtn) prevBtn.addEventListener('click', () => setChapter(state.activeChapter - 1));
  const nextBtn = qOne('[data-chapter-step="next"]');
  if (nextBtn) nextBtn.addEventListener('click', () => setChapter(state.activeChapter + 1));

  const fsBtn = qOne('[data-fullscreen-btn]');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (doc && doc.documentElement && typeof doc.documentElement.requestFullscreen === 'function') {
        Promise.resolve(doc.documentElement.requestFullscreen()).catch(() => {});
      }
    });
  }

  for (const btn of qAll('[data-billing-mode]')) {
    btn.addEventListener('click', () => updateWorkload({ billingMode: btn.getAttribute('data-billing-mode') }));
  }
  for (const btn of qAll('[data-econ-preset]')) {
    btn.addEventListener('click', () => applyPreset(btn.getAttribute('data-econ-preset')));
  }
  for (const inputEl of qAll('[data-econ-field]')) {
    inputEl.addEventListener('input', () => {
      const field = inputEl.getAttribute('data-econ-field');
      state.workload[field] = inputEl.value === '' ? '' : Number(inputEl.value);
      renderEconomicsView('calcStatusSaved');
    });
  }
  for (const btn of qAll('[data-comp-filter]')) {
    btn.addEventListener('click', () => setCompFilter(btn.getAttribute('data-comp-filter')));
  }
  for (const btn of qAll('[data-comp-reset]')) {
    btn.addEventListener('click', () => setCompFilter('all'));
  }
  for (const btn of qAll('[data-persona-filter]')) {
    btn.addEventListener('click', () => setPersonaFilter(btn.getAttribute('data-persona-filter')));
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('keydown', onKeyDown);
  }

  // Initialize from URL query if present
  let initialLang = 'en';
  if (win && win.location && typeof win.location.search === 'string') {
    try {
      const params = new URLSearchParams(win.location.search);
      if (params.get('lang') === 'th') initialLang = 'th';
      if (params.get('mode') === 'presentation') state.mode = 'presentation';
    } catch {}
  }
  syncWorkloadInputs();
  setMode(state.mode);
  setChapter(0);
  setLang(initialLang);

  return {
    state,
    setLang,
    setMode,
    setChapter,
    setCompFilter,
    setPersonaFilter,
    updateWorkload,
    applyPreset,
    onKeyDown,
  };
}

function renderPresentationStyles() {
  return `/* light-design · macrostructure: Split Monitor + nested Topology + nested Ledger · density: balanced · depth: borders-only · gates: 54/54 · critique: H5 D5 S5 O5 R4 P5 · data: marketing/10182024 claim register (U-1..U-3 reference deployment, L-01..L-22, E-1/E-6 buyer-input estimator) */
:root {
  --bg: #f6f4ef;
  --bg-elevated: #ffffff;
  --bg-subtle: #eeeae2;
  --bg-muted: #e5e0d5;
  --fg: #121519;
  --fg-secondary: #2d3748;
  --fg-muted: #4a5568;
  --accent: #1e40af;
  --accent-subtle: #dbeafe;
  --accent-border: #93c5fd;
  --border: #d6d1c4;
  --border-strong: #6b7280;
  --danger-fg: #991b1b;
  --danger-bg: #fee2e2;
  --danger-border: #f87171;
  --radius-sm: 4px;
  --radius-md: 8px;
  --font-display: 'Instrument Serif', Georgia, 'IBM Plex Sans Thai', serif;
  --font-sans: 'Plus Jakarta Sans', 'IBM Plex Sans Thai', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-display: 36px;
  --fs-h2: 24px;
  --fs-h3: 18px;
  --fs-body: 14px;
  --fs-meta: 12px;
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  background-color: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

html[lang="th"] body {
  line-height: 1.72;
}

.presentation-skip-link {
  position: absolute;
  top: -120px;
  left: 16px;
  z-index: 100;
  padding: 12px 16px;
  min-height: 44px;
  background-color: var(--bg-elevated);
  color: var(--fg);
  border: 2px solid var(--accent);
  font-size: var(--fs-body);
  font-weight: 600;
  text-decoration: none;
}

.presentation-skip-link:focus-visible {
  top: 12px;
}

a, button, input {
  font-family: inherit;
  font-size: var(--fs-body);
  color: inherit;
}

a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  transition: none;
}

.presentation-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background-color: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}

.presentation-topbar-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 8px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.presentation-brand-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.presentation-brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  text-decoration: none;
  font-weight: 700;
  font-size: var(--fs-body);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-color: var(--bg-elevated);
}

.presentation-brand-sub {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  color: var(--fg-secondary);
}

.presentation-cross-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.presentation-cross-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 12px;
  text-decoration: none;
  font-size: var(--fs-body);
  color: var(--fg-secondary);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.presentation-cross-link:hover {
  background-color: var(--bg-elevated);
  border-color: var(--border);
  color: var(--fg);
}

.presentation-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.presentation-seg-group {
  display: inline-flex;
  align-items: center;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px;
  gap: 4px;
}

.presentation-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-color: var(--bg-elevated);
  color: var(--fg);
  font-size: var(--fs-body);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: transform 120ms ease, opacity 120ms ease;
}

.presentation-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.presentation-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.presentation-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.presentation-btn.is-active,
.presentation-btn[aria-pressed="true"],
.presentation-btn-primary {
  background-color: var(--accent);
  border-color: var(--accent);
  color: var(--bg-elevated);
}

.presentation-btn-primary:hover:not(:disabled) {
  background-color: var(--fg);
  border-color: var(--fg);
  color: var(--bg-elevated);
}

.presentation-rail {
  background-color: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}

.presentation-rail-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 8px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.presentation-rail-list {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;
}

.presentation-rail-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 600;
  color: var(--fg-secondary);
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  cursor: pointer;
}

.presentation-rail-link:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.presentation-rail-link.is-active,
.presentation-rail-link[aria-current="step"] {
  background-color: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
}

.presentation-walk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.presentation-indicator {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 600;
  color: var(--fg-secondary);
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-color: var(--bg-elevated);
  font-variant-numeric: tabular-nums;
}

.presentation-main {
  max-width: 1360px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

.presentation-hero {
  padding: 24px 0 32px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}

.presentation-eyebrow {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--accent);
  margin: 0 0 12px;
}

.presentation-h1 {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  font-weight: 400;
  line-height: 1.18;
  margin: 0 0 16px;
  color: var(--fg);
  max-width: 960px;
}

.presentation-lead {
  font-size: var(--fs-body);
  color: var(--fg-secondary);
  max-width: 900px;
  margin: 0 0 20px;
}

.presentation-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 24px;
}

.presentation-stat-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
  gap: 16px;
  margin-bottom: 20px;
}

.presentation-stat-item {
  padding-right: 12px;
  border-right: 1px solid var(--border);
}

.presentation-stat-item:last-child {
  border-right: none;
}

.presentation-stat-val {
  font-family: var(--font-mono);
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
  margin: 0 0 4px;
}

.presentation-stat-lbl {
  font-size: var(--fs-meta);
  color: var(--fg-secondary);
  margin: 0;
}

.presentation-boundary-strip {
  background-color: var(--bg-subtle);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
}

.presentation-boundary-title {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  color: var(--fg);
  margin: 0 0 4px;
}

.presentation-boundary-body {
  font-size: var(--fs-meta);
  color: var(--fg-secondary);
  margin: 0;
}

.presentation-chapter {
  padding: 32px 0;
  border-bottom: 1px solid var(--border);
}

html[data-presentation-mode="presentation"] .presentation-hero {
  display: none;
}

html[data-presentation-mode="presentation"] .presentation-chapter {
  display: none;
}

html[data-presentation-mode="presentation"] .presentation-chapter.is-active-chapter {
  display: block;
}

.presentation-chapter-head {
  margin-bottom: 24px;
}

.presentation-h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: 400;
  line-height: 1.25;
  color: var(--fg);
  margin: 0 0 8px;
}

.presentation-h3 {
  font-size: var(--fs-h3);
  font-weight: 700;
  line-height: 1.35;
  color: var(--fg);
  margin: 0 0 8px;
}

.presentation-summary {
  font-size: var(--fs-body);
  color: var(--fg-secondary);
  max-width: 880px;
  margin: 0;
}

/* Split Monitor macrostructure */
.split-monitor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.split-monitor-pane {
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.split-monitor-pane-governed {
  border-color: var(--accent);
}

.split-pane-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background-color: var(--bg-subtle);
  color: var(--fg-secondary);
  margin-bottom: 8px;
}

.split-monitor-pane-governed .split-pane-badge {
  background-color: var(--accent-subtle);
  color: var(--accent);
}

.split-pane-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.split-pane-row {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.split-pane-metric {
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  font-weight: 700;
  color: var(--fg);
  margin: 0 0 4px;
}

.split-pane-body {
  font-size: var(--fs-body);
  color: var(--fg-secondary);
  margin: 0;
}

/* Dual-Track Topology */
.topology-tracks {
  display: grid;
  gap: 20px;
  margin-bottom: 24px;
}

.topology-track-box {
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.topology-node-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.topology-node-row-5 {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.topology-node {
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.topology-node-code {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 4px;
}

.topology-node-title {
  font-size: var(--fs-body);
  font-weight: 700;
  color: var(--fg);
  margin: 0 0 4px;
}

.topology-node-desc {
  font-size: var(--fs-meta);
  color: var(--fg-secondary);
  margin: 0;
}

/* Plain Unwrapped 6-Layer Architecture List (S4 plain surface) */
.layer-stack-plain {
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.layer-row {
  display: grid;
  grid-template-columns: 120px 320px 1fr;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  align-items: baseline;
}

.layer-code {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  color: var(--accent);
}

.layer-title {
  font-size: var(--fs-body);
  font-weight: 700;
  color: var(--fg);
  margin: 0;
}

.layer-body {
  font-size: var(--fs-body);
  color: var(--fg-secondary);
  margin: 0;
}

/* Ledger Tables (N1, N2, N4, N5, T5, T6) */
.ledger-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-color: var(--bg-elevated);
  margin-top: 12px;
}

.ledger-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.ledger-table th,
.ledger-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: var(--fs-body);
  line-height: 1.35;
  vertical-align: top;
}

.ledger-table th {
  background-color: var(--bg-subtle);
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  color: var(--fg);
}

.ledger-table td.num-col,
.ledger-table th.num-col {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.ledger-code-cell {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 600;
  color: var(--fg);
}

.ledger-caption-note {
  font-size: var(--fs-meta);
  color: var(--fg-muted);
  margin: 8px 0 0;
}

/* Velocity Grid (varied internal compositions for S3) */
.velocity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.velocity-panel {
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.velocity-tag {
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 8px;
}

.velocity-metric-bar {
  margin: 12px 0;
  padding: 12px;
  background-color: var(--bg-subtle);
  border-left: 4px solid var(--accent);
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Economics & Calculator */
.econ-cost-lines {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0 24px;
}

.econ-cost-item {
  padding: 16px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.econ-workbench {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 24px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 24px;
}

.econ-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.econ-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.econ-field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.econ-label {
  font-size: var(--fs-meta);
  font-weight: 600;
  color: var(--fg-secondary);
}

.econ-input {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background-color: var(--bg);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: var(--fs-body);
  font-variant-numeric: tabular-nums;
}

.econ-input[aria-invalid="true"] {
  border-color: var(--danger-border);
  background-color: var(--danger-bg);
  color: var(--danger-fg);
}

.econ-error-banner {
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--danger-border);
  background-color: var(--danger-bg);
  color: var(--danger-fg);
  border-radius: var(--radius-sm);
  font-size: var(--fs-body);
  font-weight: 600;
}

.econ-results-pane {
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.econ-status-pill {
  display: inline-block;
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 700;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background-color: var(--accent-subtle);
  color: var(--accent);
}

.econ-status-pill[data-state="error"] {
  background-color: var(--danger-bg);
  color: var(--danger-fg);
}

.econ-breakeven-box {
  padding: 16px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
}

.econ-breakeven-val {
  font-family: var(--font-mono);
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  margin: 4px 0;
}

.econ-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.econ-summary-cell {
  padding: 12px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.econ-summary-val {
  font-family: var(--font-mono);
  font-size: var(--fs-h3);
  font-weight: 700;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
  margin: 4px 0 0;
}

/* Persona & Pilot */
.persona-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.persona-item {
  padding: 16px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.pilot-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0 28px;
}

.pilot-step {
  padding: 16px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-top: 4px solid var(--accent);
  border-radius: var(--radius-sm);
}

.pilot-cta-banner {
  padding: 24px;
  background-color: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.presentation-footer {
  max-width: 1360px;
  margin: 0 auto;
  padding: 24px;
  border-top: 1px solid var(--border);
  font-size: var(--fs-meta);
  color: var(--fg-secondary);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 1120px) {
  .presentation-stat-strip,
  .topology-node-row,
  .topology-node-row-5,
  .pilot-timeline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .econ-workbench,
  .persona-grid {
    grid-template-columns: 1fr;
  }
  .layer-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}

@media (max-width: 720px) {
  :root {
    --fs-display: 32px;
    --fs-h2: 22px;
  }
  .presentation-topbar-inner,
  .presentation-rail-inner,
  .presentation-main {
    padding-left: 16px;
    padding-right: 16px;
  }
  .presentation-stat-strip,
  .split-monitor-grid,
  .topology-node-row,
  .topology-node-row-5,
  .velocity-grid,
  .econ-cost-lines,
  .econ-form-grid,
  .econ-summary-grid,
  .pilot-timeline {
    grid-template-columns: 1fr;
  }
  .presentation-stat-item {
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;
}


