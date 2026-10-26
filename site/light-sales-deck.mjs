import { config } from './config.mjs';
import { calculateEconomics, DEFAULT_WORKLOAD } from './light-presentation.mjs';

export const lightSalesContent = {
  en: {
    pageTitle: 'Light Executive Sales Pitch | Why Enterprise AI Needs Governance | Factor-IO Studio',
    pageDescription:
      'An 8-slide interactive motion-graphic sales presentation explaining how ungoverned AI accelerates code bottlenecks and incidents, and how Light governs enterprise AI in 30 days.',
    skipLink: 'Skip to active slide',
    brandTag: 'LIGHT BY FACTOR-IO // EXECUTIVE SALES PITCH',
    navDossier: 'Full Technical Dossier',
    navServices: 'Services',
    navContact: 'Book Live Demo',
    langSwitchAria: 'Language switcher',
    tourPlay: 'Auto-Play Tour',
    tourPause: 'Pause Tour',
    prevSlideAria: 'Previous slide',
    nextSlideAria: 'Next slide',
    prevSlideLabel: 'Prev',
    nextSlideLabel: 'Next',
    slideCounterPrefix: 'Slide',
    slideDotsAria: 'Slide navigation dots',
    dot1Aria: 'Go to Slide 1: The Hook',
    dot2Aria: 'Go to Slide 2: The AI Acceleration Trap',
    dot3Aria: 'Go to Slide 3: How Light Works',
    dot4Aria: 'Go to Slide 4: Executive Outcomes',
    dot5Aria: 'Go to Slide 5: 30-Minute ROI Model',
    dot6Aria: 'Go to Slide 6: Why Copilot Is Not Enough',
    dot7Aria: 'Go to Slide 7: 4 Buyers in the Room',
    dot8Aria: 'Go to Slide 8: 30-Day Rollout Plan',

    s1Tag: 'SLIDE 01 // THE EXECUTIVE HOOK',
    s1Title: 'Buying AI for your team is easy. Controlling 100 AI agents in production is the hard part.',
    s1Lead:
      'AI coding tools gave every engineer a Formula 1 engine. Light adds the steering, brakes, and black-box flight recorder so your team ships faster without crashing production.',
    s1VisualTitle: 'LIVE MOTION TELEMETRY // UNGOVERNED AI VS. LIGHT CONTROL TOWER',
    s1VisualLeftBadge: 'AI Coding Tools = Raw Speed (Engine)',
    s1VisualRightBadge: 'Light = Safe Delivery (Air Traffic Control)',
    s1SvgNode1: 'Claude / Codex / Copilot / Gemini',
    s1SvgNode2: 'Light 4-Gate Control Plane',
    s1SvgNode3: 'Verified Production Release',
    s1Stat1Num: '1,000,000+',
    s1Stat1Title: 'Governed AI Tool Actions',
    s1Stat1Sub: 'Observed in Light reference deployment; not a promised customer outcome.',
    s1Stat2Num: '-97.5%',
    s1Stat2Title: 'Less Tool-Return Context Waste',
    s1Stat2Sub:
      'Cuts tool-return tokens (32,000 to 800): saves API spend on metered plans or protects seat quota on flat-rate plans ($0 direct token cash savings).',
    s1Stat3Num: '~30 mins',
    s1Stat3Title: 'Monthly Break-Even per Engineer',
    s1Stat3Sub: 'Modeled break-even at $100/hr loaded engineer cost and $49/seat/mo list price.',

    s2Tag: 'SLIDE 02 // HOW UNGOVERNED AI ACCELERATES THE PROBLEM',
    s2Title: 'Without governance, faster AI just builds your review bottleneck and incident risk 3x faster.',
    s2Lead:
      'When 50 to 500 engineers use AI assistants without a control layer, raw code volume explodes while human verification collapses.',
    s2SvgTitle: 'THE UNGOVERNED AI ACCELERATION TRAP (CAUSAL CHAIN)',
    s2SvgStep1: '1. AI Floods the Repo (3x Output)',
    s2SvgStep2: '2. Senior Engineers Drown in Diffs (+441% Wait)',
    s2SvgStep3: '3. Unchecked Changes Hit Prod (+243% Incidents)',
    s2Card1Num: 'Stage 01 // +300% Raw Code Flood',
    s2Card1Title: 'AI Writes Code With No Shared Plan',
    s2Card1Body:
      'Agents edit files across services, invent duplicate patterns, and run shell commands before anyone agrees on scope.',
    s2Card2Num: 'Stage 02 // +441% PR Review Wait',
    s2Card2Title: 'Senior Leads Become Full-Time Babysitters',
    s2Card2Body:
      'Instead of designing architecture, your best engineers spend 6+ hours a week untangling 2,000-line AI mystery diffs.',
    s2Card3Num: 'Stage 03 // >40% Canceled by 2027',
    s2Card3Title: 'Escalating Cost & Risk Kill ROI',
    s2Card3Body:
      'Gartner (June 2025) forecasts over 40% of agentic AI projects will be canceled by end of 2027 due to escalating costs, unclear value, or inadequate risk controls.',

    s3Tag: 'SLIDE 03 // HOW LIGHT SOLVES IT IN PLAIN LANGUAGE',
    s3Title: 'Light is Air Traffic Control for every AI agent in your organization.',
    s3Lead:
      'Engineers keep using Claude, Cursor, Codex, or Gemini. Light sits underneath and enforces four simple gates before any change reaches production.',
    s3ModeLabel: 'Interactive Motion Mode:',
    s3ModeGoverned: 'With Light (Governed 4-Gate Flow)',
    s3ModeChaos: 'Without Light (Unchecked AI Chaos)',
    s3ModeStatusGoverned:
      'ACTIVE: Out-of-scope edits are stopped at Gate 1; a 2nd AI model audits the plan at Gate 2 before a human clicks Go.',
    s3ModeStatusChaos:
      'UNCHECKED: AI agents bypass planning, touch unowned files, pile up in PR review, and collide during deployment.',
    s3Gate1Num: 'Gate 01 // Scope Lock',
    s3Gate1Title: 'Plan First, Touch Files Second',
    s3Gate1Body:
      'The AI must declare every file and command upfront. Anything outside that list is blocked automatically.',
    s3Gate2Num: 'Gate 02 // Rival AI Audit',
    s3Gate2Title: 'A 2nd AI Model Checks the First',
    s3Gate2Body:
      'An independent model tries to find flaws in the plan before a senior engineer is ever interrupted.',
    s3Gate3Num: 'Gate 03 // 1-Click Human Go',
    s3Gate3Title: 'Approve Intent in 30 Seconds',
    s3Gate3Body:
      'Tech leads approve a clear, compact manifest instead of reading thousands of lines of surprise code.',
    s3Gate4Num: 'Gate 04 // Black-Box Receipt',
    s3Gate4Title: 'Ordered Release & Audit Proof',
    s3Gate4Body:
      'Deploys run in a single safe queue, leaving a tamper-evident receipt linking plan, reviewer, and commit.',
    s3Boundary:
      'Enforcement boundary: Light governs every action routed through the Light MCP server and its registered deployment wrappers. Commands run outside a Light session, unparsed shell bodies, or repositories without prior indexed history are outside automatic gate coverage.',

    s4Tag: 'SLIDE 04 // WHAT NON-TECHNICAL LEADERS CONCRETELY GET',
    s4Title: 'Three business outcomes you can see on day one.',
    s4Lead:
      'You do not need to read code to see what Light delivers: faster release cadence, zero surprise scope creep, and instant audit readiness.',
    s4Card1Metric: '1,400+ Sequenced Releases',
    s4Card1Title: '1. Predictable Delivery Without Bottlenecks',
    s4Card1Body:
      'Senior engineers stop babysitting noisy diffs and get their week back. Releases queue cleanly instead of colliding on Friday afternoon.',
    s4Card1Qual:
      '1,400+ sequenced release runs recorded in Light reference deployment (observed telemetry, not a guaranteed customer baseline).',
    s4Card2Metric: '8,600+ Actions Stopped Early',
    s4Card2Title: '2. Out-of-Scope Mistakes Blocked Before They Run',
    s4Card2Body:
      'Unapproved database edits, stray shell commands, and edits to unowned files are refused at the gate before they touch your system.',
    s4Card2Qual:
      '8,600+ out-of-scope edits and commands refused pre-execution in Light reference deployment.',
    s4Card3Metric: '3,300+ Plans / 70,000+ Commits',
    s4Card3Title: '3. Instant Audit Trail for Security & Customers',
    s4Card3Body:
      'Every AI action is tied to an approved plan, an operator seat, and a hash-chained receipt you can hand directly to enterprise auditors.',
    s4Card3Qual:
      '3,300+ closed plans (including aborted plans) and 70,000+ attributed commits recorded in Light reference deployment.',

    s5Tag: 'SLIDE 05 // WHY IT PRACTICALLY PAYS FOR ITSELF',
    s5Title: 'Save 30 minutes per engineer a month and Light pays for itself.',
    s5Lead:
      'At $49/seat/month, Light costs less than half an hour of an engineer time. Adjust the three inputs below to model your team.',
    s5SeatsLabel: 'Engineering Seats Using AI',
    s5RateLabel: 'Loaded Hourly Engineer Cost (USD)',
    s5BillingLabel: 'AI Plan Billing Type',
    s5BillingFlat: 'Flat-Rate Seats ($0 direct token cash savings; protects seat quota)',
    s5BillingMetered: 'Metered API Billing (97.5% tool-return cut lowers API bill)',
    s5OutBreakEvenLabel: 'Break-Even Time Needed',
    s5OutHoursLabel: 'Engineering Hours Returned / Mo',
    s5OutNetAnnualLabel: 'Modeled Net Annual Value',
    s5OutTokenLabel: 'Direct Token Cash Savings / Mo',
    s5BarTitle: 'LIVE MONTHLY VALUE COMPARISON (USD / MONTH)',
    s5BarCostLabel: 'Light Subscription Cost',
    s5BarValueLabel: 'Modeled Engineering + Ops Value',
    s5Assumptions:
      'Model assumptions (DEFAULT_WORKLOAD): $49/seat/mo list price, 6h/wk review load with 35% reduction, 12 incidents/yr ($15k cost, 25% reduction), 4h/wk release coordination across 5 SRE seats (40% reduction). 97.5% reduction applies to tool-return tokens only (32,000 to 800); flat-rate plans yield $0 direct token cash savings.',

    s6Tag: 'SLIDE 06 // THE #1 SALES OBJECTION HANDLER',
    s6Title: '"We already bought Copilot, Claude, or Cursor. Why do we need Light?"',
    s6Lead:
      'Because coding assistants generate code, gateways filter text prompts, and PR bots comment after the mess is made. None of them govern execution.',
    s6ColLayer: 'Layer in Your Stack',
    s6ColDoes: 'What It Actually Does Well',
    s6ColGap: 'What Still Breaks Without Light',
    s6Row1Layer: 'AI Coding Assistants (Copilot, Claude, Cursor)',
    s6Row1Does: 'The Engine: helps one developer write code 3x faster inside their editor.',
    s6Row1Gap: 'Cannot stop an agent from editing the wrong service or running risky commands.',
    s6Row2Layer: 'LLM API Gateways & Firewalls',
    s6Row2Does: 'The Prompt Filter: routes API keys, tracks token spend, and scrubs PII in text.',
    s6Row2Gap: 'Completely blind to which files the agent edits, git commits, or production deploys.',
    s6Row3Layer: 'AI Pull-Request Review Bots',
    s6Row3Does: 'The Post-Mortem Commenter: leaves more comments after 2,000 lines are already written.',
    s6Row3Gap: 'Too late: wasted work is already done and adds even more reading for senior leads.',
    s6Row4Layer: 'Light Governance & Control Plane',
    s6Row4Does: 'Air Traffic Control: locks file scope first, runs a 2nd-model audit, requires Human Go, and sequences deploys.',
    s6Row4Gap: 'Works across all your existing AI tools so speed turns into safe, audited delivery.',

    s7Tag: 'SLIDE 07 // SALES CHEAT SHEET: 4 BUYERS IN THE ROOM',
    s7Title: 'Who buys Light and the one sentence that wins each leader.',
    s7Lead:
      'In every enterprise deal, four stakeholders decide. Here is what each leader fears about AI acceleration and how Light solves it.',
    s7Buyer1Role: '01 // CEO & CTO (Velocity + Control)',
    s7Buyer1Ask: 'Fear: "We paid for AI across 200 seats, why are releases slower and buggier?"',
    s7Buyer1Win:
      'Clincher: "Light turns raw AI code generation into governed throughput so senior engineers approve plans in seconds instead of babysitting diffs."',
    s7Buyer2Role: '02 // CISO & Head of Risk (Security + Audit)',
    s7Buyer2Ask: 'Fear: "How do we prove an AI agent cannot touch production configs or ship unreviewed code?"',
    s7Buyer2Win:
      'Clincher: "Every action is locked to an approved file manifest before execution and recorded in a tamper-evident, hash-chained audit ledger."',
    s7Buyer3Role: '03 // CFO & Procurement (Hard ROI)',
    s7Buyer3Ask: 'Fear: "Is this another AI tool subscription with fuzzy ROI?"',
    s7Buyer3Win:
      'Clincher: "At $49/seat/mo, Light breaks even when an engineer saves just 30 minutes a month, while cutting tool-return context waste by 97.5%."',
    s7Buyer4Role: '04 // VP Infrastructure & SRE (Stability)',
    s7Buyer4Ask: 'Fear: "Multiple AI sessions are stepping on each other and breaking Friday deploys."',
    s7Buyer4Win:
      'Clincher: "Light sequences every deploy through a single release conductor and requires receipt-verified tests before closing any plan."',

    s8Tag: 'SLIDE 08 // 30-DAY ROLLOUT & NEXT STEP',
    s8Title: 'Go live in 30 days without replacing a single AI tool.',
    s8Lead:
      'Your engineers keep their favorite assistants. We connect Light in four low-risk weekly steps and prove ROI with your own telemetry.',
    s8W1Step: 'Week 01 // Observe',
    s8W1Title: 'Connect MCP Bridge & Index Repo',
    s8W1Body: 'Zero workflow disruption. Baseline current review wait times and AI tool usage.',
    s8W2Step: 'Week 02 // Scope Lock',
    s8W2Title: 'Turn On Plan-First Manifests',
    s8W2Body: 'Agents declare target files and commands before editing; out-of-scope writes are refused.',
    s8W3Step: 'Week 03 // Audit & Queue',
    s8W3Title: 'Enable 2nd-Model Audit & Release Queue',
    s8W3Body: 'Rival model reviews medium/large plans; release conductor sequences production deploys.',
    s8W4Step: 'Week 04 // Executive Readout',
    s8W4Title: 'Measure Hours Saved & Audit Receipts',
    s8W4Body: 'Deliver executive ROI report and compliance evidence pack to CTO, CISO, and CFO.',
    s8CtaPrimary: 'Book a 30-Minute Executive Walkthrough',
    s8CtaSecondary: 'Open Full CISO & Architecture Dossier (/light.html)',
    s8Boundary:
      'Enforcement boundary: Light governs every action routed through the Light MCP server and its registered deployment wrappers. Commands run outside a Light session, unparsed shell bodies, or repositories without prior indexed history are outside automatic gate coverage.',
    s8FooterCompany:
      'Factor-IO Co., Ltd. (บริษัท แฟคเคอร์ ไอ โอ จำกัด) | Tax ID 0105562205512 | Bangkok, Thailand'
  },
  th: {
    pageTitle: 'Light สไลด์นำเสนอผู้บริหารและฝ่ายขาย | ทำไมองค์กรต้องมีระบบกำกับดูแล AI | Factor-IO Studio',
    pageDescription:
      'สไลด์นำเสนอ 8 หน้าแบบ Motion Graphic อธิบายให้เข้าใจง่ายว่าทำไมการใช้ AI โดยไร้การควบคุมจึงเร่งปัญหาคอขวดและระบบล่ม และ Light ช่วยองค์กรควบคุม AI ได้อย่างไรใน 30 วัน',
    skipLink: 'ข้ามไปยังสไลด์ปัจจุบัน',
    brandTag: 'LIGHT BY FACTOR-IO // สไลด์นำเสนอผู้บริหารและฝ่ายขาย',
    navDossier: 'เอกสารเจาะลึกทางเทคนิค',
    navServices: 'บริการของเรา',
    navContact: 'นัดชมการสาธิตสด',
    langSwitchAria: 'ปุ่มสลับภาษา',
    tourPlay: 'เล่นสไลด์อัตโนมัติ',
    tourPause: 'หยุดเล่นอัตโนมัติ',
    prevSlideAria: 'สไลด์ก่อนหน้า',
    nextSlideAria: 'สไลด์ถัดไป',
    prevSlideLabel: 'ย้อนกลับ',
    nextSlideLabel: 'ถัดไป',
    slideCounterPrefix: 'สไลด์',
    slideDotsAria: 'ปุ่มเลือกหน้าสไลด์',
    dot1Aria: 'ไปที่สไลด์ 1: ภาพรวมสำหรับผู้บริหาร',
    dot2Aria: 'ไปที่สไลด์ 2: กับดักความเร็วของ AI ที่ไร้การควบคุม',
    dot3Aria: 'ไปที่สไลด์ 3: Light ทำงานอย่างไร',
    dot4Aria: 'ไปที่สไลด์ 4: ผลลัพธ์ที่ผู้บริหารได้รับจริง',
    dot5Aria: 'ไปที่สไลด์ 5: คำนวณความคุ้มทุนใน 30 นาที',
    dot6Aria: 'ไปที่สไลด์ 6: ทำไมมี Copilot แล้วยังต้องใช้ Light',
    dot7Aria: 'ไปที่สไลด์ 7: คู่มือตอบคำถามผู้บริหาร 4 ฝ่าย',
    dot8Aria: 'ไปที่สไลด์ 8: แผนเริ่มใช้งานจริงใน 30 วัน',

    s1Tag: 'SLIDE 01 // จุดเริ่มต้นที่ผู้บริหารต้องรู้',
    s1Title: 'การซื้อ AI ให้ทีมใช้เป็นเรื่องง่าย แต่การคุม AI นับร้อยตัวไม่ให้ทำระบบพังคือเรื่องยาก',
    s1Lead:
      'เครื่องมือช่วยเขียนโค้ด AI คือเครื่องยนต์รถแข่งที่แรงขึ้น 3 เท่า ส่วน Light คือพวงมาลัย ระบบเบรก และกล่องดำบันทึกการบิน ที่ช่วยให้ทีมส่งมอบงานได้เร็วจริงโดยไม่ทำระบบล่ม',
    s1VisualTitle: 'ภาพจำลองการทำงานจริง // AI ที่ไร้การควบคุม เทียบกับ หอบังคับการบิน LIGHT',
    s1VisualLeftBadge: 'AI ช่วยเขียนโค้ด = ได้แค่ความเร็วต้นทาง (เครื่องยนต์)',
    s1VisualRightBadge: 'Light = ส่งมอบงานปลอดภัยตรวจสอบได้ (หอบังคับการบิน)',
    s1SvgNode1: 'Claude / Codex / Copilot / Gemini',
    s1SvgNode2: 'ด่านควบคุม 4 ขั้นตอนของ Light',
    s1SvgNode3: 'ขึ้นระบบจริงอย่างปลอดภัย',
    s1Stat1Num: '1,000,000+',
    s1Stat1Title: 'คำสั่ง AI ที่ผ่านการกำกับดูแลแล้ว',
    s1Stat1Sub: 'สถิติจากการใช้งานจริงในระบบอ้างอิงของ Light (ไม่ใช่ตัวเลขรับประกันผลลัพธ์ลูกค้า)',
    s1Stat2Num: '-97.5%',
    s1Stat2Title: 'ลดขยะข้อมูลที่ส่งกลับเข้าโมเดล AI',
    s1Stat2Sub:
      'ลดโทเคนผลลัพธ์จากเครื่องมือลง 97.5% (32,000 เหลือ 800 โทเคน) ช่วยลดค่า API แบบคิดตามใช้จริง หรือถนอมโควตาในแพ็กเกจเหมาจ่าย (แพ็กเกจเหมาจ่ายประหยัดเงินสดค่าโทเคนโดยตรง $0)',
    s1Stat3Num: '~30 นาที',
    s1Stat3Title: 'จุดคุ้มทุนต่อวิศวกรหนึ่งคนต่อเดือน',
    s1Stat3Sub: 'คำนวณตามโมเดลเมื่อต้นทุนวิศวกรอยู่ที่ $100/ชม. และค่าบริการ $49/ที่นั่ง/เดือน',

    s2Tag: 'SLIDE 02 // ทำไมการใช้ AI โดยไร้การควบคุมจึงเร่งให้ปัญหาบานปลายเร็วขึ้น',
    s2Title: 'ถ้าไม่มีระบบควบคุม ยิ่ง AI เขียนโค้ดเร็วเท่าไร งานก็ยิ่งค้างคอขวดและเสี่ยงระบบล่มเร็วขึ้น 3 เท่า',
    s2Lead:
      'เมื่อทีมวิศวกร 50 ถึง 500 คนใช้ AI ต่างคนต่างสั่ง ปริมาณโค้ดจะทะลักเข้าสู่ระบบทันที แต่คนตรวจทานและระบบความปลอดภัยกลับรับมือไม่ทัน',
    s2SvgTitle: 'ลูกโซ่ปัญหาเมื่อปล่อย AI ทำงานโดยไร้การควบคุม',
    s2SvgStep1: '1. AI ปั่นโค้ดทะลักเข้าคลัง (เร็วขึ้น 3 เท่า)',
    s2SvgStep2: '2. หัวหน้าทีมจมกองงานตรวจโค้ด (รอนานขึ้น +441%)',
    s2SvgStep3: '3. โค้ดหลุดไปทำระบบจริงล่ม (เหตุขัดข้องพุ่ง +243%)',
    s2Card1Num: 'ระยะที่ 01 // ปริมาณโค้ดพุ่ง +300%',
    s2Card1Title: 'AI แก้ไฟล์ข้ามระบบโดยไม่มีแผนร่วมกัน',
    s2Card1Body:
      'AI แต่ละตัวแก้ไฟล์ข้ามส่วนงาน สร้างโค้ดซ้ำซ้อน และรันคำสั่งได้ทันทีโดยยังไม่มีใครตกลงขอบเขตงานล่วงหน้า',
    s2Card2Num: 'ระยะที่ 02 // คิวตรวจงานช้าลง +441%',
    s2Card2Title: 'คนเก่งที่สุดในทีมต้องมานั่งตามเช็ดงาน AI',
    s2Card2Body:
      'แทนที่วิศวกรอาวุโสจะได้ออกแบบระบบสำคัญ กลับต้องเสียเวลามากกว่า 6 ชั่วโมงต่อสัปดาห์เพื่อนั่งแกะโค้ดปริศนาหลายพันบรรทัดจาก AI',
    s2Card3Num: 'ระยะที่ 03 // กว่า 40% ถูกสั่งพับโครงการ',
    s2Card3Title: 'ต้นทุนบานปลายและความเสี่ยงทำให้ไปต่อไม่ได้',
    s2Card3Body:
      'Gartner (มิถุนายน 2025) คาดการณ์ว่าโครงการ Agentic AI กว่า 40% จะถูกยกเลิกภายในสิ้นปี 2027 เพราะต้นทุนที่บานปลาย ความคุ้มค่าที่ไม่ชัดเจน หรือการควบคุมความเสี่ยงที่ไม่เพียงพอ',

    s3Tag: 'SLIDE 03 // LIGHT แก้ปัญหานี้อย่างไร (เข้าใจได้ใน 1 นาที)',
    s3Title: 'Light คือหอบังคับการบินที่คอยจัดระเบียบ AI ทุกตัวในบริษัทของคุณ',
    s3Lead:
      'ทีมงานยังใช้ Claude, Cursor, Codex หรือ Gemini ได้เหมือนเดิม แต่ Light จะทำงานอยู่ข้างใต้เพื่อบังคับใช้ด่านความปลอดภัย 4 ขั้นตอนก่อนที่โค้ดจะแตะระบบจริง',
    s3ModeLabel: 'สลับดูภาพเปรียบเทียบ:',
    s3ModeGoverned: 'เมื่อมี Light (ผ่านด่านควบคุม 4 ขั้นตอน)',
    s3ModeChaos: 'เมื่อไม่มี Light (AI ต่างคนต่างรันไร้ระเบียบ)',
    s3ModeStatusGoverned:
      'สถานะควบคุมปลอดภัย: บล็อกการแก้ไฟล์นอกขอบเขตตั้งแต่ด่าน 1 และให้ AI อีกตัวช่วยตรวจแผนในด่าน 2 ก่อนที่หัวหน้าทีมจะกดอนุมัติ',
    s3ModeStatusChaos:
      'สถานะไร้การควบคุม: AI ข้ามขั้นตอนการวางแผน แก้ไฟล์นอกขอบเขต งานกองทับถมที่คนตรวจ และชนกันเองตอนขึ้นระบบจริง',
    s3Gate1Num: 'ด่านที่ 01 // ล็อกขอบเขตงาน',
    s3Gate1Title: 'วางแผนก่อนเสมอ ห้ามแก้ไฟล์มั่ว',
    s3Gate1Body:
      'AI ต้องระบุรายชื่อไฟล์และคำสั่งที่จะใช้ทั้งหมดล่วงหน้า หากพยายามแตะไฟล์นอกรายการ ระบบจะบล็อกทันที',
    s3Gate2Num: 'ด่านที่ 02 // AI ตัวที่สองช่วยตรวจ',
    s3Gate2Title: 'ใช้ AI ต่างค่ายช่วยจับผิดแผนงาน',
    s3Gate2Body:
      'โมเดล AI อีกตัวที่เป็นอิสระจะทำหน้าที่ตรวจสอบหาจุดอ่อนของแผนงานให้ก่อน เพื่อไม่ให้เสียเวลาวิศวกรอาวุโส',
    s3Gate3Num: 'ด่านที่ 03 // คนอนุมัติในคลิกเดียว',
    s3Gate3Title: 'หัวหน้าทีมเห็นภาพรวมและกด Go ใน 30 วินาที',
    s3Gate3Body:
      'ผู้นำทีมตรวจเฉพาะแผนงานที่ชัดเจนและขอบเขตไฟล์ที่สรุปมาแล้ว ไม่ต้องเสียเวลาอ่านโค้ดดิบหลายพันบรรทัด',
    s3Gate4Num: 'ด่านที่ 04 // กล่องดำบันทึกหลักฐาน',
    s3Gate4Title: 'จัดคิวขึ้นระบบปลอดภัยพร้อมใบเสร็จตรวจสอบ',
    s3Gate4Body:
      'ระบบจัดคิวการนำโค้ดขึ้นเซิร์ฟเวอร์ไม่ให้ชนกัน พร้อมสร้างบันทึกหลักฐานที่ปลอมแปลงไม่ได้เชื่อมโยงแผน ผู้อนุมัติ และโค้ดเข้าด้วยกัน',
    s3Boundary:
      'ขอบเขตการบังคับใช้: Light กำกับดูแลทุกคำสั่งที่ส่งผ่านเซิร์ฟเวอร์ Light MCP และระบบดีพลอยที่ลงทะเบียนไว้ คำสั่งที่รันนอกเซสชัน Light คำสั่งเชลล์ที่ไม่ได้แยกวิเคราะห์ หรือคลังโค้ดที่ยังไม่มีประวัติในดัชนี จะอยู่นอกขอบเขตการกั้นอัตโนมัติ',

    s4Tag: 'SLIDE 04 // สิ่งที่ผู้บริหารและธุรกิจได้รับจริงตั้งแต่วันแรก',
    s4Title: 'ผลลัพธ์ทางธุรกิจ 3 ข้อที่วัดผลได้ชัดเจนโดยไม่ต้องอ่านโค้ดเป็น',
    s4Lead:
      'ไม่ว่าคุณจะเป็นผู้บริหาร ฝ่ายขาย หรือฝ่ายกำกับดูแลความเสี่ยง คุณจะเห็นผลลัพธ์ 3 ด้านนี้ได้ทันทีที่เชื่อมระบบ Light',
    s4Card1Metric: '1,400+ รอบการขึ้นระบบที่ปลอดภัย',
    s4Card1Title: '1. ส่งมอบงานตรงเวลา ไม่เกิดคอขวดตอนตรวจโค้ด',
    s4Card1Body:
      'คืนเวลาให้วิศวกรอาวุโสกลับมาทำงานสำคัญแทนการนั่งไล่แก้โค้ด AI และจัดคิวการอัปเดตระบบให้เรียงลำดับอย่างปลอดภัย',
    s4Card1Qual:
      'บันทึกการปล่อยงานตามลำดับมากกว่า 1,400 ครั้งในระบบอ้างอิงของ Light (ข้อมูลจากการใช้งานจริง ไม่ใช่ค่าขั้นต่ำที่รับประกัน)',
    s4Card2Metric: '8,600+ คำสั่งเสี่ยงที่ถูกสกัดไว้ก่อน',
    s4Card2Title: '2. สกัดการแก้ไฟล์นอกสั่งก่อนที่จะสร้างความเสียหาย',
    s4Card2Body:
      'การแก้ฐานข้อมูลโดยไม่ขออนุญาต การรันคำสั่งเสี่ยง หรือการแตะไฟล์ของทีมอื่น จะถูกปฏิเสธตั้งแต่หน้าด่านก่อนที่คำสั่งจะถูกรันจริง',
    s4Card2Qual:
      'สกัดกั้นการแก้ไฟล์และคำสั่งนอกขอบเขตมากกว่า 8,600 ครั้งก่อนรันจริงในระบบอ้างอิงของ Light',
    s4Card3Metric: '3,300+ แผนงาน / 70,000+ คอมมิต',
    s4Card3Title: '3. พร้อมรับการตรวจ Audit จากลูกค้าองค์กรและธนาคารทันที',
    s4Card3Body:
      'ทุกการกระทำของ AI มีหลักฐานผูกกับแผนงานที่อนุมัติ ผู้รับผิดชอบ และรหัสตรวจสอบย้อนกลับที่ส่งให้ผู้ตรวจสอบดูได้ทันที',
    s4Card3Qual:
      'บันทึกแผนงานที่ปิดแล้วกว่า 3,300 แผน (รวมแผนที่สั่งยกเลิก) และคอมมิตที่ระบุตัวตนกว่า 70,000 รายการในระบบอ้างอิงของ Light',

    s5Tag: 'SLIDE 05 // ทำไม LIGHT จึงคืนทุนได้แทบจะในทันที',
    s5Title: 'แค่ช่วยประหยัดเวลาวิศวกรได้เดือนละ 30 นาที Light ก็คุ้มค่าใช้จ่ายแล้ว',
    s5Lead:
      'ด้วยราคาเพียง $49 ต่อที่นั่งต่อเดือน ค่าบริการของ Light จึงถูกกว่าเวลาทำงานเพียงครึ่งชั่วโมงของวิศวกร ลองปรับตัวเลข 3 ช่องด้านล่างเพื่อดูความคุ้มค่าของทีมคุณ',
    s5SeatsLabel: 'จำนวนวิศวกรที่ใช้ AI ในทีม',
    s5RateLabel: 'ต้นทุนวิศวกรต่อชั่วโมง (USD)',
    s5BillingLabel: 'รูปแบบค่าใช้จ่าย AI ขององค์กร',
    s5BillingFlat: 'แบบเหมาจ่ายรายที่นั่ง (ประหยัดเงินสดค่าโทเคนโดยตรง $0 แต่ช่วยถนอมโควตาการใช้งาน)',
    s5BillingMetered: 'แบบจ่ายตามการใช้งาน API จริง (การลดข้อมูลผลลัพธ์ 97.5% ช่วยลดค่า API โดยตรง)',
    s5OutBreakEvenLabel: 'เวลาที่ต้องประหยัดเพื่อให้คุ้มทุน',
    s5OutHoursLabel: 'ชั่วโมงทำงานที่ทีมได้คืนต่อเดือน',
    s5OutNetAnnualLabel: 'มูลค่าสุทธิที่ประเมินได้ต่อปี',
    s5OutTokenLabel: 'เงินสดค่าโทเคนที่ประหยัดได้โดยตรง/เดือน',
    s5BarTitle: 'เปรียบเทียบต้นทุนค่าบริการ กับ มูลค่าเวลาที่ทีมได้คืนต่อเดือน (USD)',
    s5BarCostLabel: 'ค่าบริการรายเดือนของ Light',
    s5BarValueLabel: 'มูลค่าเวลาวิศวกรและเสถียรภาพระบบที่ได้คืน',
    s5Assumptions:
      'สมมติฐานในโมเดล (DEFAULT_WORKLOAD): ค่าบริการ $49/ที่นั่ง/เดือน, เวลาตรวจโค้ด 6 ชม./สัปดาห์ (ลดลง 35%), เหตุระบบขัดข้อง 12 ครั้ง/ปี (ต้นทุน $15k/ครั้ง, ลดลง 25%), งานประสานงานขึ้นระบบ 4 ชม./สัปดาห์ สำหรับ SRE 5 คน (ลดลง 40%) การลดโทเคน 97.5% เฉพาะส่วนข้อมูลผลลัพธ์จากเครื่องมือ (32,000 เหลือ 800 โทเคน) โดยแพ็กเกจเหมาจ่ายจะประหยัดเงินสดค่าโทเคนโดยตรง $0',

    s6Tag: 'SLIDE 06 // คำตอบเมื่อลูกค้าถามว่า "มี COPILOT หรือ CLAUDE อยู่แล้ว ทำไมต้องมี LIGHT?"',
    s6Title: '"บริษัทเราซื้อ Copilot, Claude หรือ Cursor ให้ทีมแล้ว ทำไมยังต้องใช้ Light อีก?"',
    s6Lead:
      'เพราะเครื่องมือเหล่านั้นทำหน้าที่คนละชั้นกัน: ผู้ช่วย AI มีไว้เร่งการเขียนโค้ด เกตเวย์มีไว้กรองข้อความ แต่ไม่มีตัวไหนควบคุมขอบเขตงานก่อนที่โค้ดจะถูกเขียนและนำขึ้นระบบจริง',
    s6ColLayer: 'ประเภทเครื่องมือในองค์กร',
    s6ColDoes: 'สิ่งที่เครื่องมือนี้ทำได้ดี',
    s6ColGap: 'ช่องโหว่ที่ยังเกิดขึ้นถ้าไม่มี Light',
    s6Row1Layer: 'ผู้ช่วยเขียนโค้ด AI (Copilot, Claude, Cursor)',
    s6Row1Does: 'เครื่องยนต์เร่งความเร็ว: ช่วยให้นักพัฒนาแต่ละคนพิมพ์โค้ดในเครื่องตัวเองได้เร็วขึ้น 3 เท่า',
    s6Row1Gap: 'ห้าม AI ไม่ให้แก้ไฟล์ผิดระบบหรือรันคำสั่งอันตรายไม่ได้เลย',
    s6Row2Layer: 'ระบบ LLM API Gateway & Firewall',
    s6Row2Does: 'ตัวกรองข้อความ: คุมคีย์ API ดูงบประมาณโทเคน และกรองข้อมูลส่วนบุคคลในข้อความสนทนา',
    s6Row2Gap: 'มองไม่เห็นว่า AI กำลังแก้ไฟล์ไหนในคลังโค้ด คอมมิตอะไร หรือกำลังสั่งดีพลอยอะไร',
    s6Row3Layer: 'บอทช่วยตรวจ Pull Request (AI PR Bots)',
    s6Row3Does: 'ผู้ตรวจหลังเกิดเหตุ: ช่วยเขียนคอมเมนต์หลังจากที่โค้ดหลายพันบรรทัดถูกเขียนเสร็จไปแล้ว',
    s6Row3Gap: 'มาทีหลังเสมอ: งานที่ผิดขอบเขตถูกทำไปแล้ว และเพิ่มข้อความให้หัวหน้าทีมต้องตามอ่านมากขึ้น',
    s6Row4Layer: 'Light ระบบกำกับดูแลและควบคุมการปฏิบัติงาน AI',
    s6Row4Does: 'หอบังคับการบิน: ล็อกขอบเขตไฟล์ก่อนเริ่มงาน ให้ AI ตัวที่สองตรวจแผน รอคนกดอนุมัติ และจัดคิวขึ้นระบบ',
    s6Row4Gap: 'ทำงานร่วมกับเครื่องมือ AI เดิมทุกตัวที่คุณมี เพื่อเปลี่ยนความเร็วให้เป็นผลงานที่ปลอดภัยและตรวจสอบได้',

    s7Tag: 'SLIDE 07 // คู่มือฝ่ายขาย: ปิดการขายผู้บริหาร 4 ฝ่ายในห้องประชุมเดียว',
    s7Title: 'ใครคือคนตัดสินใจซื้อ Light และประโยคเดียวที่ตอบโจทย์ผู้บริหารแต่ละท่าน',
    s7Lead:
      'ในการขายระดับองค์กรจะมีผู้มีอำนาจตัดสินใจ 4 กลุ่ม นี่คือสิ่งที่แต่ละท่านกังวลเมื่อนำ AI มาใช้ และคำตอบที่ชัดเจนจาก Light',
    s7Buyer1Role: '01 // CEO และ CTO (ความเร็วควบคู่การควบคุม)',
    s7Buyer1Ask: 'ความกังวล: "เราจ่ายค่า AI ให้ทีมตั้ง 200 ที่นั่ง ทำไมงานส่งมอบยังช้าและมีบั๊กหลุดบ่อยขึ้น?"',
    s7Buyer1Win:
      'ประโยคปิดการขาย: "Light เปลี่ยนปริมาณโค้ดดิบจาก AI ให้เป็นงานที่ผ่านการคัดกรอง เพื่อให้วิศวกรอาวุโสอนุมัติแผนได้ในไม่กี่วินาทีแทนการนั่งตามแก้โค้ด"',
    s7Buyer2Role: '02 // CISO และฝ่ายบริหารความเสี่ยง (ความปลอดภัยและ Audit)',
    s7Buyer2Ask: 'ความกังวล: "จะพิสูจน์ให้คณะกรรมการและลูกค้ามั่นใจได้อย่างไรว่า AI จะไม่แอบแก้ค่าระบบสำคัญ?"',
    s7Buyer2Win:
      'ประโยคปิดการขาย: "ทุกคำสั่งของ AI ถูกล็อกไว้ตามรายชื่อไฟล์ที่ได้รับอนุมัติล่วงหน้าเท่านั้น พร้อมใบเสร็จดิจิทัลที่ตรวจสอบย้อนหลังได้ทุกขั้นตอน"',
    s7Buyer3Role: '03 // CFO และฝ่ายจัดซื้อ (ความคุ้มค่าของการลงทุน)',
    s7Buyer3Ask: 'ความกังวล: "นี่จะเป็นค่าสมาชิกซอฟต์แวร์ AI อีกตัวที่วัดผลความคุ้มทุนไม่ได้หรือไม่?"',
    s7Buyer3Win:
      'ประโยคปิดการขาย: "ที่ราคา $49 ต่อที่นั่งต่อเดือน ขอแค่วิศวกรประหยัดเวลาตรวจงานได้เดือนละ 30 นาทีก็คุ้มทุนทันที พร้อมลดข้อมูลส่วนเกินของโมเดลลงถึง 97.5%"',
    s7Buyer4Role: '04 // VP Infrastructure และ SRE (เสถียรภาพระบบจริง)',
    s7Buyer4Ask: 'ความกังวล: "ตอนนี้ AI หลายตัวต่างคนต่างดีพลอยทับกันจนระบบรวนในวันศุกร์"',
    s7Buyer4Win:
      'ประโยคปิดการขาย: "Light จัดคิวการดีพลอยทั้งหมดผ่านศูนย์ควบคุมเดียว และบังคับให้มีผลทดสอบยืนยันก่อนปิดงานทุกครั้ง"',

    s8Tag: 'SLIDE 08 // แผนเริ่มใช้งานจริงใน 30 วันโดยไม่ต้องเปลี่ยนเครื่องมือเดิม',
    s8Title: 'เริ่มใช้งานจริงได้ใน 30 วัน โดยที่ทีมวิศวกรไม่ต้องเลิกใช้เครื่องมือ AI ที่ถนัด',
    s8Lead:
      'ทีมของคุณยังใช้ผู้ช่วย AI ตัวเดิมได้ทั้งหมด เราเชื่อมต่อ Light ทีละขั้นตอนใน 4 สัปดาห์โดยไม่กระทบงานประจำ พร้อมสรุปผลความคุ้มค่าให้ผู้บริหารชัดเจน',
    s8W1Step: 'สัปดาห์ที่ 01 // เชื่อมต่อและวัดผลตั้งต้น',
    s8W1Title: 'เชื่อมสะพาน MCP และทำดัชนีคลังโค้ด',
    s8W1Body: 'ไม่กระทบวิธีทำงานเดิมของทีม เก็บตัวเลขเวลารอตรวจโค้ดและการใช้ AI ปัจจุบันเป็นฐานเปรียบเทียบ',
    s8W2Step: 'สัปดาห์ที่ 02 // เปิดด่านล็อกขอบเขตงาน',
    s8W2Title: 'เริ่มใช้ระบบวางแผนก่อนแก้ไฟล์จริง',
    s8W2Body: 'AI ต้องระบุไฟล์และคำสั่งก่อนเริ่มงาน และสกัดกั้นการแก้ไฟล์นอกขอบเขตอัตโนมัติ',
    s8W3Step: 'สัปดาห์ที่ 03 // AI คู่ขนานตรวจแผนและจัดคิวขึ้นระบบ',
    s8W3Title: 'เปิดระบบ AI ตัวที่สองช่วยตรวจและคิวดีพลอย',
    s8W3Body: 'ให้โมเดลอิสระช่วยคัดกรองแผนงานขนาดกลางและใหญ่ พร้อมจัดคิวการนำโค้ดขึ้นระบบจริงไม่ให้ชนกัน',
    s8W4Step: 'สัปดาห์ที่ 04 // สรุปผลความคุ้มค่าต่อผู้บริหาร',
    s8W4Title: 'รายงานชั่วโมงทำงานที่ได้คืนและหลักฐาน Audit',
    s8W4Body: 'ส่งมอบรายงานผลตอบแทนการลงทุน (ROI) และชุดหลักฐานการกำกับดูแลให้แก่ CTO, CISO และ CFO',
    s8CtaPrimary: 'นัดเวลาพูดคุยและชมการสาธิตสำหรับผู้บริหาร (30 นาที)',
    s8CtaSecondary: 'เปิดอ่านเอกสารเจาะลึกทางเทคนิคและสถาปัตยกรรมฉบับเต็ม (/light.html)',
    s8Boundary:
      'ขอบเขตการบังคับใช้: Light กำกับดูแลทุกคำสั่งที่ส่งผ่านเซิร์ฟเวอร์ Light MCP และระบบดีพลอยที่ลงทะเบียนไว้ คำสั่งที่รันนอกเซสชัน Light คำสั่งเชลล์ที่ไม่ได้แยกวิเคราะห์ หรือคลังโค้ดที่ยังไม่มีประวัติในดัชนี จะอยู่นอกขอบเขตการกั้นอัตโนมัติ',
    s8FooterCompany:
      'บริษัท แฟคเคอร์ ไอ โอ จำกัด (Factor-IO Co., Ltd.) | เลขประจำตัวผู้เสียภาษี 0105562205512 | กรุงเทพมหานคร'
  }
};

export function bindSalesDeck(root, env = {}) {
  if (!root || typeof root.querySelector !== 'function') {
    return null;
  }

  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const storage =
    env.storage ||
    (win && win.localStorage ? win.localStorage : null);
  const locationObj = env.location || (win && win.location ? win.location : { search: '' });
  const setTimer = env.setInterval || (win && typeof win.setInterval === 'function' ? win.setInterval.bind(win) : (typeof setInterval === 'function' ? setInterval : () => 0));
  const clearTimer = env.clearInterval || (win && typeof win.clearInterval === 'function' ? win.clearInterval.bind(win) : (typeof clearInterval === 'function' ? clearInterval : () => {}));

  const TOTAL_SLIDES = 8;
  const STORAGE_KEY = 'factor-io-light-lang';

  function detectInitialLang() {
    try {
      const search = String(locationObj.search || '');
      const params = new URLSearchParams(search);
      const qLang = params.get('lang');
      if (qLang === 'th' || qLang === 'en') {
        return qLang;
      }
    } catch (_err) {
      // Ignore malformed query string
    }
    try {
      if (storage && typeof storage.getItem === 'function') {
        const saved = storage.getItem(STORAGE_KEY);
        if (saved === 'th' || saved === 'en') {
          return saved;
        }
      }
    } catch (_err) {
      // Ignore storage access errors
    }
    return 'en';
  }

  function detectReducedMotion() {
    if (typeof env.reducedMotion === 'boolean') {
      return env.reducedMotion;
    }
    if (win && typeof win.matchMedia === 'function') {
      const mq = win.matchMedia('(prefers-reduced-motion: reduce)');
      return Boolean(mq && mq.matches);
    }
    return false;
  }

  const state = {
    lang: detectInitialLang(),
    activeSlide: 0,
    motionMode: 'governed',
    tourPlaying: false,
    reducedMotion: detectReducedMotion(),
    workload: {
      ...DEFAULT_WORKLOAD
    }
  };

  let tourHandle = null;

  function formatUsd(n) {
    const abs = Math.round(Math.abs(Number(n) || 0));
    const formatted = '$' + abs.toLocaleString('en-US');
    return n < 0 ? '-' + formatted : formatted;
  }

  function updateStageScale() {
    const viewportEl = root.querySelector('.pitch-viewport');
    const stageEl = root.querySelector('.pitch-stage');
    const vw = Number(win && win.innerWidth) || 1920;
    const vh = Number(win && win.innerHeight) || 1080;
    const scale = Math.min(vw / 1920, vh / 1080);
    const x = Math.round((vw - 1920 * scale) / 2);
    const y = Math.round((vh - 1080 * scale) / 2);
    if (viewportEl && viewportEl.style && typeof viewportEl.style.setProperty === 'function') {
      viewportEl.style.setProperty('--slide-scale', String(scale));
      viewportEl.style.setProperty('--stage-x', `${x}px`);
      viewportEl.style.setProperty('--stage-y', `${y}px`);
    }
    if (stageEl && stageEl.style && typeof stageEl.style.setProperty === 'function') {
      stageEl.style.setProperty('--slide-scale', String(scale));
      stageEl.style.setProperty('--stage-x', `${x}px`);
      stageEl.style.setProperty('--stage-y', `${y}px`);
    }
    return {
      scale,
      x,
      y,
      width: Math.round(1920 * scale),
      height: Math.round(1080 * scale)
    };
  }

  function stopTour() {
    if (tourHandle !== null) {
      clearTimer(tourHandle);
      tourHandle = null;
    }
    state.tourPlaying = false;
    renderTourButton();
  }

  function startTour() {
    if (state.reducedMotion) {
      stopTour();
      return false;
    }
    stopTour();
    state.tourPlaying = true;
    renderTourButton();
    tourHandle = setTimer(() => {
      if (state.reducedMotion) {
        stopTour();
        return;
      }
      goToSlide((state.activeSlide + 1) % TOTAL_SLIDES);
    }, 6500);
    return true;
  }

  function toggleTour() {
    if (state.tourPlaying) {
      stopTour();
      return false;
    }
    return startTour();
  }

  function renderTourButton() {
    const dict = lightSalesContent[state.lang] || lightSalesContent.en;
    const btn = root.querySelector('[data-action="toggle-tour"]');
    if (!btn) {
      return;
    }
    btn.textContent = state.tourPlaying ? dict.tourPause : dict.tourPlay;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-pressed', state.tourPlaying ? 'true' : 'false');
      if (state.reducedMotion) {
        btn.setAttribute('disabled', 'disabled');
      } else if (typeof btn.removeAttribute === 'function') {
        btn.removeAttribute('disabled');
      }
    }
  }

  function applyReducedMotionState() {
    const viewportEl = root.querySelector('.pitch-viewport');
    if (viewportEl && typeof viewportEl.setAttribute === 'function') {
      viewportEl.setAttribute('data-reduced-motion', state.reducedMotion ? 'true' : 'false');
    }
    if (state.reducedMotion) {
      stopTour();
    } else {
      renderTourButton();
    }
  }

  function renderSlides() {
    const slides = root.querySelectorAll('.slide');
    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      const isActive = i === state.activeSlide;
      if (slide.classList) {
        slide.classList.toggle('active', isActive);
        slide.classList.toggle('visible', isActive);
      }
      if (typeof slide.setAttribute === 'function') {
        slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        if (isActive) {
          if (typeof slide.removeAttribute === 'function') {
            slide.removeAttribute('inert');
          }
        } else {
          slide.setAttribute('inert', '');
        }
      }
      if ('inert' in slide) {
        slide.inert = !isActive;
      }
    }

    const dots = root.querySelectorAll('[data-slide-to]');
    for (let i = 0; i < dots.length; i += 1) {
      const dot = dots[i];
      const idx = Number(dot.getAttribute ? dot.getAttribute('data-slide-to') : i);
      const isCurrent = idx === state.activeSlide;
      if (dot.classList) {
        dot.classList.toggle('active', isCurrent);
      }
      if (typeof dot.setAttribute === 'function') {
        dot.setAttribute('aria-current', isCurrent ? 'step' : 'false');
      }
    }

    const dict = lightSalesContent[state.lang] || lightSalesContent.en;
    const counterEl = root.querySelector('[data-slide-counter]');
    if (counterEl) {
      const num = String(state.activeSlide + 1).padStart(2, '0');
      const tot = String(TOTAL_SLIDES).padStart(2, '0');
      counterEl.textContent = `${dict.slideCounterPrefix} ${num} / ${tot}`;
    }

    const progressEl = root.querySelector('[data-slide-progress]');
    if (progressEl && progressEl.style && typeof progressEl.style.setProperty === 'function') {
      const pct = (((state.activeSlide + 1) / TOTAL_SLIDES) * 100).toFixed(2) + '%';
      progressEl.style.setProperty('width', pct);
    }
  }

  function goToSlide(index) {
    const bounded = Math.max(0, Math.min(TOTAL_SLIDES - 1, Number(index) || 0));
    state.activeSlide = bounded;
    renderSlides();
    return state.activeSlide;
  }

  function renderMotionMode() {
    const dict = lightSalesContent[state.lang] || lightSalesContent.en;
    const stageEl = root.querySelector('[data-pipeline-stage]');
    if (stageEl && typeof stageEl.setAttribute === 'function') {
      stageEl.setAttribute('data-motion-mode', state.motionMode);
    }
    const modeButtons = root.querySelectorAll('[data-set-motion-mode]');
    for (let i = 0; i < modeButtons.length; i += 1) {
      const btn = modeButtons[i];
      const mode = btn.getAttribute ? btn.getAttribute('data-set-motion-mode') : '';
      const active = mode === state.motionMode;
      if (btn.classList) {
        btn.classList.toggle('active', active);
      }
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
    const statusEl = root.querySelector('[data-motion-status]');
    if (statusEl) {
      statusEl.textContent =
        state.motionMode === 'chaos' ? dict.s3ModeStatusChaos : dict.s3ModeStatusGoverned;
    }
  }

  function renderEconomics() {
    const econ = calculateEconomics(state.workload);
    const isTh = state.lang === 'th';

    const seatsValEl = root.querySelector('[data-calc-display="seats"]');
    if (seatsValEl) {
      seatsValEl.textContent = isTh
        ? `${econ.inputs.seats} ที่นั่ง`
        : `${econ.inputs.seats} seats`;
    }

    const rateValEl = root.querySelector('[data-calc-display="hourlyRate"]');
    if (rateValEl) {
      rateValEl.textContent = isTh
        ? `$${econ.inputs.hourlyRate} / ชม.`
        : `$${econ.inputs.hourlyRate} / hr`;
    }

    const breakEvenEl = root.querySelector('[data-calc-out="breakEvenMinutes"]');
    if (breakEvenEl) {
      if (econ.breakEvenMinutesPerSeatMonth === null) {
        breakEvenEl.textContent = isTh ? 'ไม่มี ($0/ชม.)' : 'N/A ($0/hr)';
      } else {
        const mins = Math.round(econ.breakEvenMinutesPerSeatMonth);
        breakEvenEl.textContent = isTh ? `${mins} นาที / เดือน` : `${mins} mins / mo`;
      }
    }

    const hoursEl = root.querySelector('[data-calc-out="hoursReturned"]');
    if (hoursEl) {
      const hrs = Math.round((econ.hoursSavedPerSeatMonth || 0) * ((econ.inputs && econ.inputs.seats) || 0));
      hoursEl.textContent = isTh ? `${hrs.toLocaleString('en-US')} ชม. / เดือน` : `${hrs.toLocaleString('en-US')} hrs / mo`;
    }

    const netAnnualEl = root.querySelector('[data-calc-out="netAnnual"]');
    if (netAnnualEl) {
      netAnnualEl.textContent = isTh
        ? `${formatUsd(econ.netAnnualValue)} / ปี`
        : `${formatUsd(econ.netAnnualValue)} / yr`;
    }

    const tokenEl = root.querySelector('[data-calc-out="tokenSavings"]');
    if (tokenEl) {
      if (econ.billingMode === 'flat-rate') {
        tokenEl.textContent = isTh
          ? '$0 / เดือน (ถนอมโควตาเหมาจ่าย)'
          : '$0 / mo (protects flat-rate quota)';
      } else {
        tokenEl.textContent = isTh
          ? `${formatUsd(econ.line1ContextMonthly)} / เดือน (ลดค่า API 97.5%)`
          : `${formatUsd(econ.line1ContextMonthly)} / mo (97.5% API cut)`;
      }
    }

    const costBarVal = root.querySelector('[data-calc-out="barCostValue"]');
    if (costBarVal) {
      costBarVal.textContent = `${formatUsd(econ.subscriptionMonthlyCost)} / mo`;
    }
    const grossBarVal = root.querySelector('[data-calc-out="barGrossValue"]');
    if (grossBarVal) {
      grossBarVal.textContent = `${formatUsd(econ.grossMonthlyValue)} / mo`;
    }

    const maxBar = Math.max(1, econ.subscriptionMonthlyCost, econ.grossMonthlyValue);
    const costPct = Math.max(6, Math.round((econ.subscriptionMonthlyCost / maxBar) * 100));
    const grossPct = Math.max(6, Math.round((econ.grossMonthlyValue / maxBar) * 100));

    const costFill = root.querySelector('[data-calc-bar="cost"]');
    if (costFill && costFill.style && typeof costFill.style.setProperty === 'function') {
      costFill.style.setProperty('width', `${costPct}%`);
    }
    const grossFill = root.querySelector('[data-calc-bar="value"]');
    if (grossFill && grossFill.style && typeof grossFill.style.setProperty === 'function') {
      grossFill.style.setProperty('width', `${grossPct}%`);
    }

    return econ;
  }

  function applyLanguage(lang) {
    const nextLang = lang === 'th' ? 'th' : 'en';
    state.lang = nextLang;
    const dict = lightSalesContent[nextLang];

    if (root.documentElement && typeof root.documentElement.setAttribute === 'function') {
      root.documentElement.setAttribute('lang', nextLang);
    }
    if ('title' in root && dict.pageTitle) {
      root.title = dict.pageTitle;
    }

    try {
      if (storage && typeof storage.setItem === 'function') {
        storage.setItem(STORAGE_KEY, nextLang);
      }
    } catch (_err) {
      // Ignore storage write errors
    }

    const textNodes = root.querySelectorAll('[data-i18n]');
    for (let i = 0; i < textNodes.length; i += 1) {
      const node = textNodes[i];
      const key = node.getAttribute ? node.getAttribute('data-i18n') : '';
      if (key && Object.prototype.hasOwnProperty.call(dict, key)) {
        node.textContent = dict[key];
      }
    }

    const ariaNodes = root.querySelectorAll('[data-i18n-aria]');
    for (let i = 0; i < ariaNodes.length; i += 1) {
      const node = ariaNodes[i];
      const key = node.getAttribute ? node.getAttribute('data-i18n-aria') : '';
      if (key && Object.prototype.hasOwnProperty.call(dict, key) && typeof node.setAttribute === 'function') {
        node.setAttribute('aria-label', dict[key]);
      }
    }

    const langButtons = root.querySelectorAll('[data-set-lang]');
    for (let i = 0; i < langButtons.length; i += 1) {
      const btn = langButtons[i];
      const bLang = btn.getAttribute ? btn.getAttribute('data-set-lang') : '';
      const isSelected = bLang === nextLang;
      if (btn.classList) {
        btn.classList.toggle('active', isSelected);
      }
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }
    }

    const contactLinks = root.querySelectorAll('[data-localized-contact]');
    for (let i = 0; i < contactLinks.length; i += 1) {
      const link = contactLinks[i];
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('href', nextLang === 'th' ? '/th/contact/' : '/en/contact/');
      }
    }

    const servicesLinks = root.querySelectorAll('[data-localized-services]');
    for (let i = 0; i < servicesLinks.length; i += 1) {
      const link = servicesLinks[i];
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('href', nextLang === 'th' ? '/th/services/' : '/en/services/');
      }
    }

    const dossierLinks = root.querySelectorAll('[data-localized-dossier]');
    for (let i = 0; i < dossierLinks.length; i += 1) {
      const link = dossierLinks[i];
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('href', nextLang === 'th' ? '/light.html?lang=th' : '/light.html');
      }
    }

    renderTourButton();
    renderMotionMode();
    renderSlides();
    renderEconomics();
  }

  function isInteractiveInput(target, options = {}) {
    const includeButtons = Boolean(options && options.includeButtons);
    let node = target;
    while (node && typeof node === 'object') {
      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return true;
      }
      if (node.isContentEditable) {
        return true;
      }
      if (includeButtons) {
        const role = typeof node.getAttribute === 'function'
          ? String(node.getAttribute('role') || '').toLowerCase()
          : String(node.role || '').toLowerCase();
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || role === 'button' || role === 'link') {
          return true;
        }
      }
      node = node.parentElement || node.parentNode || null;
    }
    if (target && typeof target.closest === 'function') {
      const selector = includeButtons
        ? 'button, a, summary, [role="button"], [role="link"], input, select, textarea, [contenteditable="true"]'
        : 'input, select, textarea, [contenteditable="true"]';
      if (target.closest(selector)) {
        return true;
      }
    }
    return false;
  }

  function handleKeyDown(event) {
    if (!event) {
      return;
    }
    if (isInteractiveInput(event.target, { includeButtons: false })) {
      return;
    }
    const key = event.key;
    if ((key === ' ' || key === 'Spacebar' || key === 'Enter') && isInteractiveInput(event.target, { includeButtons: true })) {
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      stopTour();
      goToSlide(state.activeSlide + 1);
    } else if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      stopTour();
      goToSlide(state.activeSlide - 1);
    } else if (key === 'Home') {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      stopTour();
      goToSlide(0);
    } else if (key === 'End') {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      stopTour();
      goToSlide(TOTAL_SLIDES - 1);
    }
  }

  let lastWheelAt = null;
  let lastWheelSign = 0;
  let wheelBurstConsumed = false;
  let wheelAccum = 0;

  function handleWheel(event) {
    if (!event) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (isInteractiveInput(event.target, { includeButtons: false })) {
      return;
    }
    const mode = Number(event.deltaMode) || 0;
    const multiplier = mode === 1 ? 16 : mode === 2 ? 100 : 1;
    const dy = (Number(event.deltaY) || 0) * multiplier;
    const dx = (Number(event.deltaX) || 0) * multiplier;
    const dominant = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (dominant === 0) {
      return;
    }
    const sign = dominant > 0 ? 1 : -1;
    const rawTs = Number(event.timeStamp);
    const now = Number.isFinite(rawTs) && rawTs >= 0
      ? rawTs
      : (typeof Date !== 'undefined' && typeof Date.now === 'function' ? Date.now() : 0);

    if (
      lastWheelAt === null ||
      now - lastWheelAt > 180 ||
      now < lastWheelAt ||
      (sign !== lastWheelSign && Math.abs(dominant) >= 24)
    ) {
      wheelBurstConsumed = false;
      wheelAccum = 0;
    }
    lastWheelAt = now;
    lastWheelSign = sign;

    if (wheelBurstConsumed) {
      return;
    }

    wheelAccum += dominant;
    if (Math.abs(wheelAccum) >= 24) {
      wheelBurstConsumed = true;
      wheelAccum = 0;
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      stopTour();
      goToSlide(state.activeSlide + (sign > 0 ? 1 : -1));
    }
  }

  let touchGesture = null;

  function handleTouchStart(event) {
    if (!event) {
      return;
    }
    const touches = event.touches || event.changedTouches || [];
    if (touches.length !== 1 || isInteractiveInput(event.target, { includeButtons: true })) {
      touchGesture = null;
      return;
    }
    const t = touches[0];
    touchGesture = {
      startX: Number(t && t.clientX) || 0,
      startY: Number(t && t.clientY) || 0,
      active: true
    };
  }

  function handleTouchMove(event) {
    if (!touchGesture || !touchGesture.active) {
      return;
    }
    if (event && event.touches && event.touches.length > 1) {
      touchGesture = null;
    }
  }

  function handleTouchCancel() {
    touchGesture = null;
  }

  function handleTouchEnd(event) {
    if (!touchGesture || !touchGesture.active) {
      touchGesture = null;
      return;
    }
    if (event && event.touches && event.touches.length > 0) {
      touchGesture = null;
      return;
    }
    const start = touchGesture;
    touchGesture = null;
    const changed = (event && (event.changedTouches || event.touches)) || [];
    if (!changed.length) {
      return;
    }
    const t = changed[0];
    const dx = (Number(t && t.clientX) || 0) - start.startX;
    const dy = (Number(t && t.clientY) || 0) - start.startY;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
      return;
    }
    const primaryDelta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    stopTour();
    goToSlide(state.activeSlide + (primaryDelta < 0 ? 1 : -1));
  }

  const prevBtn = root.querySelector('[data-action="prev-slide"]');
  if (prevBtn && typeof prevBtn.addEventListener === 'function') {
    prevBtn.addEventListener('click', () => {
      stopTour();
      goToSlide(state.activeSlide - 1);
    });
  }

  const nextBtn = root.querySelector('[data-action="next-slide"]');
  if (nextBtn && typeof nextBtn.addEventListener === 'function') {
    nextBtn.addEventListener('click', () => {
      stopTour();
      goToSlide(state.activeSlide + 1);
    });
  }

  const tourBtn = root.querySelector('[data-action="toggle-tour"]');
  if (tourBtn && typeof tourBtn.addEventListener === 'function') {
    tourBtn.addEventListener('click', () => {
      toggleTour();
    });
  }

  const dotButtons = root.querySelectorAll('[data-slide-to]');
  for (let i = 0; i < dotButtons.length; i += 1) {
    const dot = dotButtons[i];
    if (typeof dot.addEventListener === 'function') {
      dot.addEventListener('click', () => {
        stopTour();
        const targetIdx = Number(dot.getAttribute ? dot.getAttribute('data-slide-to') : i);
        goToSlide(targetIdx);
      });
    }
  }

  const langButtons = root.querySelectorAll('[data-set-lang]');
  for (let i = 0; i < langButtons.length; i += 1) {
    const btn = langButtons[i];
    if (typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', () => {
        const nextLang = btn.getAttribute ? btn.getAttribute('data-set-lang') : 'en';
        applyLanguage(nextLang);
      });
    }
  }

  const modeButtons = root.querySelectorAll('[data-set-motion-mode]');
  for (let i = 0; i < modeButtons.length; i += 1) {
    const btn = modeButtons[i];
    if (typeof btn.addEventListener === 'function') {
      btn.addEventListener('click', () => {
        stopTour();
        const nextMode = btn.getAttribute ? btn.getAttribute('data-set-motion-mode') : 'governed';
        state.motionMode = nextMode === 'chaos' ? 'chaos' : 'governed';
        renderMotionMode();
      });
    }
  }

  const seatsInput = root.querySelector('[data-calc-input="seats"]');
  if (seatsInput && typeof seatsInput.addEventListener === 'function') {
    const onSeats = () => {
      stopTour();
      state.workload.seats = Number(seatsInput.value) || DEFAULT_WORKLOAD.seats;
      renderEconomics();
    };
    seatsInput.addEventListener('input', onSeats);
    seatsInput.addEventListener('change', onSeats);
  }

  const rateInput = root.querySelector('[data-calc-input="hourlyRate"]');
  if (rateInput && typeof rateInput.addEventListener === 'function') {
    const onRate = () => {
      stopTour();
      state.workload.hourlyRate = Number(rateInput.value) || 0;
      renderEconomics();
    };
    rateInput.addEventListener('input', onRate);
    rateInput.addEventListener('change', onRate);
  }

  const billingSelect = root.querySelector('[data-calc-input="billingMode"]');
  if (billingSelect && typeof billingSelect.addEventListener === 'function') {
    const onBilling = () => {
      stopTour();
      state.workload.billingMode = billingSelect.value === 'metered' ? 'metered' : 'flat-rate';
      renderEconomics();
    };
    billingSelect.addEventListener('change', onBilling);
    billingSelect.addEventListener('input', onBilling);
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('keydown', handleKeyDown);
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', updateStageScale);
  }

  if (win && typeof win.matchMedia === 'function') {
    const mq = win.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq) {
      const onMotionChange = (ev) => {
        state.reducedMotion = Boolean(ev && ev.matches);
        applyReducedMotionState();
      };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onMotionChange);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(onMotionChange);
      }
    }
  }

  updateStageScale();
  applyReducedMotionState();
  applyLanguage(state.lang);

  return {
    getState() {
      return {
        lang: state.lang,
        activeSlide: state.activeSlide,
        motionMode: state.motionMode,
        tourPlaying: state.tourPlaying,
        reducedMotion: state.reducedMotion,
        workload: { ...state.workload }
      };
    },
    goToSlide,
    setLanguage: applyLanguage,
    setMotionMode(mode) {
      state.motionMode = mode === 'chaos' ? 'chaos' : 'governed';
      renderMotionMode();
    },
    startTour,
    stopTour,
    toggleTour,
    setReducedMotion(flag) {
      state.reducedMotion = Boolean(flag);
      applyReducedMotionState();
    },
    updateWorkload(patch = {}) {
      stopTour();
      state.workload = { ...state.workload, ...patch };
      return renderEconomics();
    },
    handleKeyDown,
    updateStageScale
  };
}

function renderSalesSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${config.origin}/#organization`,
        name: config.legalName,
        alternateName: [config.name, 'บริษัท แฟคเคอร์ ไอ โอ จำกัด'],
        url: config.origin,
        taxID: config.registration,
        email: config.email
      },
      {
        '@type': 'Person',
        '@id': `${config.origin}/#founder`,
        name: config.founder,
        jobTitle: config.role,
        worksFor: { '@id': `${config.origin}/#organization` },
        sameAs: [config.linkedin, config.github]
      },
      {
        '@type': 'WebPage',
        '@id': `${config.origin}/light-sales.html#webpage`,
        url: `${config.origin}/light-sales.html`,
        name: lightSalesContent.en.pageTitle,
        description: lightSalesContent.en.pageDescription,
        inLanguage: ['en', 'th'],
        isPartOf: { '@id': `${config.origin}/#organization` }
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${config.origin}/light-sales.html#software`,
        name: 'Light by Factor IO',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Linux, macOS, Windows',
        description: lightSalesContent.en.pageDescription,
        offers: {
          '@type': 'Offer',
          price: '49.00',
          priceCurrency: 'USD'
        },
        publisher: { '@id': `${config.origin}/#organization` }
      }
    ]
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

export function renderLightSales() {
  const t = lightSalesContent.en;
  const econ = calculateEconomics(DEFAULT_WORKLOAD);
  const serializedContent = JSON.stringify(lightSalesContent).replace(/</g, '\\u003c');
  const serializedWorkload = JSON.stringify(DEFAULT_WORKLOAD).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.pageTitle}</title>
  <meta name="description" content="${t.pageDescription}">
  <link rel="canonical" href="${config.origin}/light-sales.html">
  <link rel="alternate" hreflang="en" href="${config.origin}/light-sales.html">
  <link rel="alternate" hreflang="th" href="${config.origin}/light-sales.html?lang=th">
  <link rel="alternate" hreflang="x-default" href="${config.origin}/light-sales.html">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${config.name}">
  <meta property="og:title" content="${t.pageTitle}">
  <meta property="og:description" content="${t.pageDescription}">
  <meta property="og:url" content="${config.origin}/light-sales.html">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t.pageTitle}">
  <meta name="twitter:description" content="${t.pageDescription}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  ${renderSalesSchema()}
  <style>
    :root {
      --bg-void: #070b13;
      --bg-stage: #0b111e;
      --bg-card: #121b2d;
      --bg-card-elevated: #17233a;
      --border-subtle: rgba(148, 163, 184, 0.22);
      --border-amber: rgba(251, 191, 36, 0.48);
      --border-teal: rgba(45, 212, 191, 0.45);
      --border-coral: rgba(251, 113, 133, 0.48);
      --text-primary: #f8fafc;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      --accent-amber: #fbbf24;
      --accent-teal: #2dd4bf;
      --accent-coral: #fb7185;
      --font-display: 'Space Grotesk', 'IBM Plex Sans Thai', sans-serif;
      --font-sans: 'Plus Jakarta Sans', 'IBM Plex Sans Thai', sans-serif;
      --font-mono: 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-void);
      color: var(--text-primary);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    .skip-link {
      position: absolute;
      top: -100px;
      left: 24px;
      z-index: 200;
      background: var(--accent-amber);
      color: #070b13;
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }
    .skip-link:focus {
      top: 16px;
    }

    .pitch-viewport {
      --slide-scale: 1;
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 16% 18%, rgba(251, 191, 36, 0.08), transparent 42%),
        radial-gradient(circle at 84% 80%, rgba(45, 212, 191, 0.08), transparent 45%),
        var(--bg-void);
    }

    .pitch-stage {
      position: relative;
      width: 1920px;
      height: 1080px;
      transform: scale(var(--slide-scale, 1));
      transform-origin: center center;
      background: var(--bg-stage);
      border: 1px solid var(--border-subtle);
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.65);
      overflow: hidden;
    }

    /* Top Chrome Bar inside 1920x1080 Stage */
    .pitch-topbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 76px;
      padding: 0 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(11, 17, 30, 0.92);
      z-index: 30;
    }

    .pitch-brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .pitch-logo-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent-amber);
      box-shadow: 0 0 14px var(--accent-amber);
    }

    .pitch-brand-tag {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: var(--accent-amber);
    }

    .pitch-topnav {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .pitch-nav-link,
    .pitch-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease;
    }

    .pitch-nav-link:hover,
    .pitch-btn:hover {
      border-color: var(--accent-amber);
      background: var(--bg-card-elevated);
    }

    .pitch-btn.active {
      border-color: var(--accent-amber);
      background: #1f1a0a;
      color: var(--accent-amber);
    }

    .pitch-btn-cta {
      border-color: var(--accent-amber);
      background: var(--accent-amber);
      color: #070b13;
      font-weight: 700;
    }

    .pitch-btn-cta:hover {
      background: #fcd34d;
      color: #070b13;
    }

    .pitch-lang-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px;
      border-radius: 8px;
      background: #070b13;
      border: 1px solid var(--border-subtle);
    }

    .pitch-progress-track {
      position: absolute;
      top: 76px;
      left: 0;
      right: 0;
      height: 4px;
      background: rgba(148, 163, 184, 0.14);
      z-index: 30;
    }

    .pitch-progress-fill {
      height: 100%;
      width: 12.5%;
      background: linear-gradient(90deg, var(--accent-amber), var(--accent-teal));
      transition: width 0.3s ease;
    }

    /* Slide Canvas (1920x1080 with 80px topbar and 76px bottom controls) */
    .slide {
      position: absolute;
      inset: 0;
      width: 1920px;
      height: 1080px;
      padding: 104px 64px 96px 64px;
      font-size: 17px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 0.28s ease;
    }

    .slide.active {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
      z-index: 10;
    }

    /* Strict 4-size typographic hierarchy inside slides: 48px, 24px, 17px, 14px */
    .slide-header {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 1680px;
    }

    .slide-eyebrow {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--accent-amber);
      text-transform: uppercase;
    }

    .slide-title {
      font-family: var(--font-display);
      font-size: 48px;
      font-weight: 700;
      line-height: 1.12;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .slide-lead {
      font-size: 17px;
      font-weight: 400;
      line-height: 1.48;
      color: var(--text-secondary);
      max-width: 1500px;
    }

    /* Motion Graphic Visual Frames */
    .mg-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 22px 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .mg-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .mg-panel-label {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-teal);
      letter-spacing: 0.05em;
    }

    .mg-badge-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .mg-badge {
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card-elevated);
      color: var(--text-primary);
    }

    .mg-badge-coral {
      border-color: var(--border-coral);
      color: #fecdd3;
      background: #28121c;
    }

    .mg-badge-teal {
      border-color: var(--border-teal);
      color: #99f6e4;
      background: #0d2528;
    }

    .mg-svg-wrap {
      width: 100%;
      height: 230px;
      border-radius: 12px;
      background: #080d18;
      border: 1px solid rgba(148, 163, 184, 0.16);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mg-svg-wrap svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Animated SVG Motion Keyframes */
    @keyframes mgFlowStream {
      0% { stroke-dashoffset: 120; }
      100% { stroke-dashoffset: 0; }
    }

    @keyframes mgPulseRing {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 1; }
    }

    .mg-stream-line {
      stroke-dasharray: 12 12;
      animation: mgFlowStream 3.2s linear infinite;
    }

    .mg-stream-fast {
      stroke-dasharray: 10 14;
      animation: mgFlowStream 1.8s linear infinite;
    }

    .mg-pulse-node {
      animation: mgPulseRing 2.4s ease-in-out infinite;
    }

    /* Grid Cards */
    .cards-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }

    .cards-grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }

    .buyers-grid-2x2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 22px;
    }

    .sales-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .sales-card-amber {
      border-color: var(--border-amber);
    }

    .sales-card-teal {
      border-color: var(--border-teal);
    }

    .sales-card-coral {
      border-color: var(--border-coral);
    }

    .card-eyebrow {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-amber);
    }

    .card-eyebrow-coral {
      color: var(--accent-coral);
    }

    .card-eyebrow-teal {
      color: var(--accent-teal);
    }

    .card-metric {
      font-family: var(--font-display);
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--accent-amber);
    }

    .card-title {
      font-family: var(--font-display);
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text-primary);
    }

    .card-body {
      font-size: 17px;
      font-weight: 400;
      line-height: 1.48;
      color: var(--text-secondary);
    }

    .card-qualifier {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-muted);
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      margin-top: auto;
    }

    .boundary-strip {
      padding: 12px 20px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border-subtle);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-secondary);
    }

    /* Slide 3 Pipeline Mode Switch */
    .mode-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .mode-switch-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .mode-status-banner {
      padding: 8px 16px;
      border-radius: 8px;
      background: #0d2528;
      border: 1px solid var(--border-teal);
      font-size: 14px;
      font-weight: 600;
      color: #99f6e4;
    }

    [data-pipeline-stage][data-motion-mode="chaos"] .mode-status-banner {
      background: #28121c;
      border-color: var(--border-coral);
      color: #fecdd3;
    }

    [data-pipeline-stage][data-motion-mode="chaos"] .svg-governed-group {
      opacity: 0.22;
    }

    [data-pipeline-stage][data-motion-mode="governed"] .svg-chaos-group {
      opacity: 0.25;
    }

    /* Slide 5 Quick ROI Simulator */
    .sim-layout {
      display: grid;
      grid-template-columns: 1.05fr 1.25fr;
      gap: 24px;
      align-items: stretch;
    }

    .sim-controls-card {
      background: var(--bg-card);
      border: 1px solid var(--border-amber);
      border-radius: 14px;
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
    }

    .sim-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sim-field-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sim-label {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .sim-value-badge {
      font-family: var(--font-mono);
      font-size: 24px;
      font-weight: 700;
      color: var(--accent-amber);
    }

    .sim-range {
      width: 100%;
      height: 36px;
      font-size: 17px;
      accent-color: var(--accent-amber);
      cursor: pointer;
    }

    .sim-select {
      width: 100%;
      min-height: 44px;
      padding: 8px 14px;
      border-radius: 8px;
      background: #070b13;
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 600;
    }

    .sim-results-panel {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
    }

    .sim-kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .sim-bar-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sim-bar-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sim-bar-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .sim-bar-track {
      width: 100%;
      height: 18px;
      border-radius: 999px;
      background: #070b13;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .sim-bar-fill-cost {
      height: 100%;
      width: 12%;
      background: var(--accent-coral);
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    .sim-bar-fill-value {
      height: 100%;
      width: 88%;
      background: linear-gradient(90deg, var(--accent-amber), var(--accent-teal));
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    /* Slide 6 Objection Matrix */
    .matrix-table {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .matrix-row {
      display: grid;
      grid-template-columns: 1.05fr 1.35fr 1.35fr;
      gap: 20px;
      align-items: center;
      padding: 16px 22px;
      border-radius: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
    }

    .matrix-row-header {
      background: #070b13;
      padding: 12px 22px;
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-amber);
      text-transform: uppercase;
    }

    .matrix-row-highlight {
      background: rgba(251, 191, 36, 0.1);
      border: 2px solid var(--accent-amber);
    }

    .matrix-cell-title {
      font-family: var(--font-display);
      font-size: 24px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text-primary);
    }

    .matrix-cell-body {
      font-size: 17px;
      font-weight: 400;
      line-height: 1.45;
      color: var(--text-secondary);
    }

    .matrix-cell-gap {
      font-size: 17px;
      font-weight: 400;
      line-height: 1.45;
      color: #fecdd3;
    }

    .matrix-row-highlight .matrix-cell-gap {
      color: #99f6e4;
      font-weight: 600;
    }

    /* Slide 8 CTA Row */
    .cta-action-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 20px 26px;
      border-radius: 14px;
      background: var(--bg-card-elevated);
      border: 1px solid var(--border-amber);
    }

    .cta-buttons-group {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .cta-large-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 17px;
      font-weight: 700;
      text-decoration: none;
    }

    /* Bottom Deck Controls inside 1920x1080 Stage */
    .pitch-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 76px;
      padding: 0 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border-subtle);
      background: rgba(11, 17, 30, 0.94);
      z-index: 30;
    }

    .pitch-counter {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      min-width: 140px;
    }

    .pitch-dots {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pitch-dot {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .pitch-dot.active {
      border-color: var(--accent-amber);
      background: var(--accent-amber);
      color: #070b13;
      font-weight: 700;
    }

    .pitch-nav-arrows {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      .mg-stream-line,
      .mg-stream-fast,
      .mg-pulse-node {
        animation: none !important;
      }
    }

    .pitch-viewport[data-reduced-motion="true"] .mg-stream-line,
    .pitch-viewport[data-reduced-motion="true"] .mg-stream-fast,
    .pitch-viewport[data-reduced-motion="true"] .mg-pulse-node {
      animation: none !important;
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#slide-1" data-i18n="skipLink">${t.skipLink}</a>

  <div class="pitch-viewport" data-reduced-motion="false">
    <main class="pitch-stage" id="sales-stage" aria-live="polite">
      <!-- Top Bar -->
      <header class="pitch-topbar">
        <div class="pitch-brand">
          <span class="pitch-logo-dot" aria-hidden="true"></span>
          <a href="/en/" class="pitch-nav-link">Factor-IO Studio</a>
          <span class="pitch-brand-tag" data-i18n="brandTag">${t.brandTag}</span>
        </div>
        <nav class="pitch-topnav" aria-label="Sales deck navigation">
          <button type="button" class="pitch-btn" data-action="toggle-tour" aria-pressed="false" data-i18n="tourPlay">${t.tourPlay}</button>
          <a href="/light.html" class="pitch-nav-link" data-localized-dossier data-i18n="navDossier">${t.navDossier}</a>
          <a href="/en/services/" class="pitch-nav-link" data-localized-services data-i18n="navServices">${t.navServices}</a>
          <a href="/en/contact/" class="pitch-nav-link pitch-btn-cta" data-localized-contact data-i18n="navContact">${t.navContact}</a>
          <div class="pitch-lang-group" role="group" aria-label="${t.langSwitchAria}" data-i18n-aria="langSwitchAria">
            <button type="button" class="pitch-btn active" data-set-lang="en" aria-pressed="true">EN</button>
            <button type="button" class="pitch-btn" data-set-lang="th" aria-pressed="false">ไทย</button>
          </div>
        </nav>
      </header>

      <div class="pitch-progress-track" aria-hidden="true">
        <div class="pitch-progress-fill" data-slide-progress></div>
      </div>

      <!-- SLIDE 1: THE HOOK (MOTION GRAPHIC ENGINE VS AIR TRAFFIC CONTROL) -->
      <section class="slide active visible" id="slide-1" data-slide-index="0" aria-hidden="false">
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s1Tag">${t.s1Tag}</p>
          <h1 class="slide-title" data-i18n="s1Title">${t.s1Title}</h1>
          <p class="slide-lead" data-i18n="s1Lead">${t.s1Lead}</p>
        </div>

        <div class="mg-panel">
          <div class="mg-panel-header">
            <span class="mg-panel-label" data-i18n="s1VisualTitle">${t.s1VisualTitle}</span>
            <div class="mg-badge-row">
              <span class="mg-badge mg-badge-coral" data-i18n="s1VisualLeftBadge">${t.s1VisualLeftBadge}</span>
              <span class="mg-badge mg-badge-teal" data-i18n="s1VisualRightBadge">${t.s1VisualRightBadge}</span>
            </div>
          </div>
          <div class="mg-svg-wrap">
            <svg viewBox="0 0 1680 220" role="img" aria-label="Animated motion graphic comparing ungoverned AI streams with Light Air Traffic Control">
              <rect x="24" y="26" width="380" height="168" rx="14" fill="#111a2e" stroke="#475569" stroke-width="2" />
              <text x="214" y="88" text-anchor="middle" fill="#f8fafc" font-size="22" font-weight="700" data-i18n="s1SvgNode1">${t.s1SvgNode1}</text>
              <text x="214" y="132" text-anchor="middle" fill="#94a3b8" font-size="16" font-weight="600">50 to 500 Parallel AI Seats</text>

              <!-- Unchecked red lane deflecting at the gate -->
              <path d="M 404 72 C 510 72, 540 52, 636 52" fill="none" stroke="#fb7185" stroke-width="4" class="mg-stream-fast" />
              <circle cx="642" cy="52" r="9" fill="#fb7185" class="mg-pulse-node" />

              <!-- Governed amber/teal stream through Light -->
              <path d="M 404 118 L 640 118" fill="none" stroke="#fbbf24" stroke-width="5" class="mg-stream-line" />
              <rect x="646" y="22" width="440" height="176" rx="16" fill="#17233a" stroke="#fbbf24" stroke-width="3" />
              <text x="866" y="84" text-anchor="middle" fill="#fbbf24" font-size="24" font-weight="700" data-i18n="s1SvgNode2">${t.s1SvgNode2}</text>
              <text x="866" y="124" text-anchor="middle" fill="#f8fafc" font-size="16" font-weight="600">Scope Lock + 2nd-Model Audit + Human Go</text>
              <text x="866" y="160" text-anchor="middle" fill="#2dd4bf" font-size="15" font-weight="600">8,600+ Out-of-Scope Actions Refused</text>

              <path d="M 1086 118 L 1254 118" fill="none" stroke="#2dd4bf" stroke-width="5" class="mg-stream-line" />
              <rect x="1260" y="26" width="396" height="168" rx="14" fill="#11282b" stroke="#2dd4bf" stroke-width="2.5" />
              <text x="1458" y="92" text-anchor="middle" fill="#5eead4" font-size="22" font-weight="700" data-i18n="s1SvgNode3">${t.s1SvgNode3}</text>
              <text x="1458" y="134" text-anchor="middle" fill="#cbd5e1" font-size="16" font-weight="600">Sequenced Queue + Audit Receipt</text>
            </svg>
          </div>
        </div>

        <div class="cards-grid-3">
          <article class="sales-card sales-card-amber">
            <p class="card-metric" data-i18n="s1Stat1Num">${t.s1Stat1Num}</p>
            <h2 class="card-title" data-i18n="s1Stat1Title">${t.s1Stat1Title}</h2>
            <p class="card-qualifier" data-i18n="s1Stat1Sub">${t.s1Stat1Sub}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-metric" data-i18n="s1Stat2Num">${t.s1Stat2Num}</p>
            <h2 class="card-title" data-i18n="s1Stat2Title">${t.s1Stat2Title}</h2>
            <p class="card-qualifier" data-i18n="s1Stat2Sub">${t.s1Stat2Sub}</p>
          </article>
          <article class="sales-card sales-card-amber">
            <p class="card-metric" data-i18n="s1Stat3Num">${t.s1Stat3Num}</p>
            <h2 class="card-title" data-i18n="s1Stat3Title">${t.s1Stat3Title}</h2>
            <p class="card-qualifier" data-i18n="s1Stat3Sub">${t.s1Stat3Sub}</p>
          </article>
        </div>
      </section>

      <!-- SLIDE 2: HOW UNGOVERNED AI ACCELERATES THE PROBLEM -->
      <section class="slide" id="slide-2" data-slide-index="1" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s2Tag">${t.s2Tag}</p>
          <h2 class="slide-title" data-i18n="s2Title">${t.s2Title}</h2>
          <p class="slide-lead" data-i18n="s2Lead">${t.s2Lead}</p>
        </div>

        <div class="mg-panel">
          <div class="mg-panel-header">
            <span class="mg-panel-label" data-i18n="s2SvgTitle">${t.s2SvgTitle}</span>
          </div>
          <div class="mg-svg-wrap">
            <svg viewBox="0 0 1680 220" role="img" aria-label="Animated causal chain showing how ungoverned AI accelerates bottlenecks and production incidents">
              <rect x="28" y="30" width="460" height="160" rx="14" fill="#1e1b2e" stroke="#fbbf24" stroke-width="2" />
              <text x="258" y="92" text-anchor="middle" fill="#fbbf24" font-size="22" font-weight="700" data-i18n="s2SvgStep1">${t.s2SvgStep1}</text>
              <text x="258" y="134" text-anchor="middle" fill="#cbd5e1" font-size="16" font-weight="600">Unplanned edits across repositories</text>

              <path d="M 488 110 L 606 110" fill="none" stroke="#fb7185" stroke-width="6" class="mg-stream-fast" />

              <rect x="610" y="30" width="460" height="160" rx="14" fill="#2a1626" stroke="#fb7185" stroke-width="2.5" />
              <text x="840" y="92" text-anchor="middle" fill="#fda4af" font-size="22" font-weight="700" data-i18n="s2SvgStep2">${t.s2SvgStep2}</text>
              <text x="840" y="134" text-anchor="middle" fill="#cbd5e1" font-size="16" font-weight="600">2,000-line diffs stall human review</text>

              <path d="M 1070 110 L 1188 110" fill="none" stroke="#fb7185" stroke-width="6" class="mg-stream-fast" />

              <rect x="1192" y="30" width="460" height="160" rx="14" fill="#311321" stroke="#fb7185" stroke-width="3" />
              <text x="1422" y="92" text-anchor="middle" fill="#fb7185" font-size="22" font-weight="700" data-i18n="s2SvgStep3">${t.s2SvgStep3}</text>
              <text x="1422" y="134" text-anchor="middle" fill="#fecdd3" font-size="16" font-weight="600">&gt;40% Canceled by 2027 (Gartner, June 2025)</text>
            </svg>
          </div>
        </div>

        <div class="cards-grid-3">
          <article class="sales-card sales-card-coral">
            <p class="card-eyebrow card-eyebrow-coral" data-i18n="s2Card1Num">${t.s2Card1Num}</p>
            <h3 class="card-title" data-i18n="s2Card1Title">${t.s2Card1Title}</h3>
            <p class="card-body" data-i18n="s2Card1Body">${t.s2Card1Body}</p>
          </article>
          <article class="sales-card sales-card-coral">
            <p class="card-eyebrow card-eyebrow-coral" data-i18n="s2Card2Num">${t.s2Card2Num}</p>
            <h3 class="card-title" data-i18n="s2Card2Title">${t.s2Card2Title}</h3>
            <p class="card-body" data-i18n="s2Card2Body">${t.s2Card2Body}</p>
          </article>
          <article class="sales-card sales-card-coral">
            <p class="card-eyebrow card-eyebrow-coral" data-i18n="s2Card3Num">${t.s2Card3Num}</p>
            <h3 class="card-title" data-i18n="s2Card3Title">${t.s2Card3Title}</h3>
            <p class="card-body" data-i18n="s2Card3Body">${t.s2Card3Body}</p>
          </article>
        </div>
      </section>

      <!-- SLIDE 3: HOW LIGHT SOLVES IT (INTERACTIVE 4-GATE MOTION PIPELINE) -->
      <section class="slide" id="slide-3" data-slide-index="2" data-pipeline-stage data-motion-mode="governed" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s3Tag">${t.s3Tag}</p>
          <h2 class="slide-title" data-i18n="s3Title">${t.s3Title}</h2>
          <p class="slide-lead" data-i18n="s3Lead">${t.s3Lead}</p>
        </div>

        <div class="mg-panel">
          <div class="mode-toolbar">
            <div class="mode-switch-group">
              <span class="mg-panel-label" data-i18n="s3ModeLabel">${t.s3ModeLabel}</span>
              <button type="button" class="pitch-btn active" data-set-motion-mode="governed" aria-pressed="true" data-i18n="s3ModeGoverned">${t.s3ModeGoverned}</button>
              <button type="button" class="pitch-btn" data-set-motion-mode="chaos" aria-pressed="false" data-i18n="s3ModeChaos">${t.s3ModeChaos}</button>
            </div>
            <p class="mode-status-banner" data-motion-status data-i18n="s3ModeStatusGoverned">${t.s3ModeStatusGoverned}</p>
          </div>
          <div class="mg-svg-wrap" style="height: 175px;">
            <svg viewBox="0 0 1680 175" role="img" aria-label="Interactive 4-gate Light governance pipeline">
              <!-- Chaos bypass trajectory -->
              <g class="svg-chaos-group">
                <path d="M 60 32 C 420 12, 1180 12, 1620 32" fill="none" stroke="#fb7185" stroke-width="4" class="mg-stream-fast" />
                <text x="840" y="28" text-anchor="middle" fill="#fda4af" font-size="15" font-weight="600">UNCHECKED BYPASS: No Plan -> Unreviewed Diffs -> Release Collision</text>
              </g>
              <!-- Governed 4-gate trajectory -->
              <g class="svg-governed-group">
                <rect x="36" y="58" width="350" height="96" rx="12" fill="#152238" stroke="#fbbf24" stroke-width="2.5" />
                <text x="211" y="102" text-anchor="middle" fill="#fbbf24" font-size="20" font-weight="700">01. Scope Lock</text>
                <text x="211" y="132" text-anchor="middle" fill="#cbd5e1" font-size="15" font-weight="600">Manifest declared upfront</text>

                <path d="M 386 106 L 458 106" fill="none" stroke="#fbbf24" stroke-width="5" class="mg-stream-line" />

                <rect x="462" y="58" width="350" height="96" rx="12" fill="#152238" stroke="#fbbf24" stroke-width="2.5" />
                <text x="637" y="102" text-anchor="middle" fill="#fbbf24" font-size="20" font-weight="700">02. Rival AI Audit</text>
                <text x="637" y="132" text-anchor="middle" fill="#cbd5e1" font-size="15" font-weight="600">2nd model falsifies plan</text>

                <path d="M 812 106 L 884 106" fill="none" stroke="#2dd4bf" stroke-width="5" class="mg-stream-line" />

                <rect x="888" y="58" width="350" height="96" rx="12" fill="#152238" stroke="#2dd4bf" stroke-width="2.5" />
                <text x="1063" y="102" text-anchor="middle" fill="#5eead4" font-size="20" font-weight="700">03. Human Go</text>
                <text x="1063" y="132" text-anchor="middle" fill="#cbd5e1" font-size="15" font-weight="600">1-click operator approval</text>

                <path d="M 1238 106 L 1304 106" fill="none" stroke="#2dd4bf" stroke-width="5" class="mg-stream-line" />

                <rect x="1308" y="58" width="336" height="96" rx="12" fill="#11282b" stroke="#2dd4bf" stroke-width="2.5" />
                <text x="1476" y="102" text-anchor="middle" fill="#5eead4" font-size="20" font-weight="700">04. Safe Release</text>
                <text x="1476" y="132" text-anchor="middle" fill="#cbd5e1" font-size="15" font-weight="600">Ordered deploy + receipt</text>
              </g>
            </svg>
          </div>
        </div>

        <div class="cards-grid-4">
          <article class="sales-card sales-card-amber">
            <p class="card-eyebrow" data-i18n="s3Gate1Num">${t.s3Gate1Num}</p>
            <h3 class="card-title" data-i18n="s3Gate1Title">${t.s3Gate1Title}</h3>
            <p class="card-body" data-i18n="s3Gate1Body">${t.s3Gate1Body}</p>
          </article>
          <article class="sales-card sales-card-amber">
            <p class="card-eyebrow" data-i18n="s3Gate2Num">${t.s3Gate2Num}</p>
            <h3 class="card-title" data-i18n="s3Gate2Title">${t.s3Gate2Title}</h3>
            <p class="card-body" data-i18n="s3Gate2Body">${t.s3Gate2Body}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-eyebrow card-eyebrow-teal" data-i18n="s3Gate3Num">${t.s3Gate3Num}</p>
            <h3 class="card-title" data-i18n="s3Gate3Title">${t.s3Gate3Title}</h3>
            <p class="card-body" data-i18n="s3Gate3Body">${t.s3Gate3Body}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-eyebrow card-eyebrow-teal" data-i18n="s3Gate4Num">${t.s3Gate4Num}</p>
            <h3 class="card-title" data-i18n="s3Gate4Title">${t.s3Gate4Title}</h3>
            <p class="card-body" data-i18n="s3Gate4Body">${t.s3Gate4Body}</p>
          </article>
        </div>

        <p class="boundary-strip" data-i18n="s3Boundary">${t.s3Boundary}</p>
      </section>

      <!-- SLIDE 4: WHAT NON-TECHNICAL LEADERS CONCRETELY GET -->
      <section class="slide" id="slide-4" data-slide-index="3" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s4Tag">${t.s4Tag}</p>
          <h2 class="slide-title" data-i18n="s4Title">${t.s4Title}</h2>
          <p class="slide-lead" data-i18n="s4Lead">${t.s4Lead}</p>
        </div>

        <div class="mg-svg-wrap" style="height: 170px;">
          <svg viewBox="0 0 1680 170" role="img" aria-label="Executive outcome telemetry bars">
            <rect x="28" y="24" width="510" height="122" rx="14" fill="#132238" stroke="#2dd4bf" stroke-width="2" />
            <text x="58" y="70" fill="#5eead4" font-size="22" font-weight="700">DELIVERY CADENCE</text>
            <rect x="58" y="94" width="440" height="18" rx="9" fill="#070b13" />
            <rect x="58" y="94" width="390" height="18" rx="9" fill="#2dd4bf" />

            <rect x="585" y="24" width="510" height="122" rx="14" fill="#132238" stroke="#fbbf24" stroke-width="2" />
            <text x="615" y="70" fill="#fbbf24" font-size="22" font-weight="700">PRE-EXECUTION SCOPE CONTAINMENT</text>
            <rect x="615" y="94" width="440" height="18" rx="9" fill="#070b13" />
            <rect x="615" y="94" width="415" height="18" rx="9" fill="#fbbf24" />

            <rect x="1142" y="24" width="510" height="122" rx="14" fill="#132238" stroke="#2dd4bf" stroke-width="2" />
            <text x="1172" y="70" fill="#5eead4" font-size="22" font-weight="700">CRYPTOGRAPHIC AUDIT TRACEABILITY</text>
            <rect x="1172" y="94" width="440" height="18" rx="9" fill="#070b13" />
            <rect x="1172" y="94" width="430" height="18" rx="9" fill="#2dd4bf" />
          </svg>
        </div>

        <div class="cards-grid-3">
          <article class="sales-card sales-card-teal">
            <p class="card-metric" data-i18n="s4Card1Metric">${t.s4Card1Metric}</p>
            <h3 class="card-title" data-i18n="s4Card1Title">${t.s4Card1Title}</h3>
            <p class="card-body" data-i18n="s4Card1Body">${t.s4Card1Body}</p>
            <p class="card-qualifier" data-i18n="s4Card1Qual">${t.s4Card1Qual}</p>
          </article>
          <article class="sales-card sales-card-amber">
            <p class="card-metric" data-i18n="s4Card2Metric">${t.s4Card2Metric}</p>
            <h3 class="card-title" data-i18n="s4Card2Title">${t.s4Card2Title}</h3>
            <p class="card-body" data-i18n="s4Card2Body">${t.s4Card2Body}</p>
            <p class="card-qualifier" data-i18n="s4Card2Qual">${t.s4Card2Qual}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-metric" data-i18n="s4Card3Metric">${t.s4Card3Metric}</p>
            <h3 class="card-title" data-i18n="s4Card3Title">${t.s4Card3Title}</h3>
            <p class="card-body" data-i18n="s4Card3Body">${t.s4Card3Body}</p>
            <p class="card-qualifier" data-i18n="s4Card3Qual">${t.s4Card3Qual}</p>
          </article>
        </div>
      </section>

      <!-- SLIDE 5: WHY IT PRACTICALLY PAYS FOR ITSELF (3-CONTROL LIVE SIMULATOR) -->
      <section class="slide" id="slide-5" data-slide-index="4" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s5Tag">${t.s5Tag}</p>
          <h2 class="slide-title" data-i18n="s5Title">${t.s5Title}</h2>
          <p class="slide-lead" data-i18n="s5Lead">${t.s5Lead}</p>
        </div>

        <div class="sim-layout">
          <div class="sim-controls-card">
            <div class="sim-field">
              <div class="sim-field-top">
                <label class="sim-label" for="sales-calc-seats" data-i18n="s5SeatsLabel">${t.s5SeatsLabel}</label>
                <span class="sim-value-badge" data-calc-display="seats">${econ.inputs.seats} seats</span>
              </div>
              <input id="sales-calc-seats" class="sim-range" type="range" min="10" max="500" step="5" value="${econ.inputs.seats}" data-calc-input="seats" />
            </div>

            <div class="sim-field">
              <div class="sim-field-top">
                <label class="sim-label" for="sales-calc-rate" data-i18n="s5RateLabel">${t.s5RateLabel}</label>
                <span class="sim-value-badge" data-calc-display="hourlyRate">$${econ.inputs.hourlyRate} / hr</span>
              </div>
              <input id="sales-calc-rate" class="sim-range" type="range" min="25" max="250" step="5" value="${econ.inputs.hourlyRate}" data-calc-input="hourlyRate" />
            </div>

            <div class="sim-field">
              <label class="sim-label" for="sales-calc-billing" data-i18n="s5BillingLabel">${t.s5BillingLabel}</label>
              <select id="sales-calc-billing" class="sim-select" data-calc-input="billingMode">
                <option value="flat-rate" selected data-i18n="s5BillingFlat">${t.s5BillingFlat}</option>
                <option value="metered" data-i18n="s5BillingMetered">${t.s5BillingMetered}</option>
              </select>
            </div>
          </div>

          <div class="sim-results-panel">
            <div class="sim-kpi-grid">
              <article class="sales-card sales-card-amber">
                <p class="card-eyebrow" data-i18n="s5OutBreakEvenLabel">${t.s5OutBreakEvenLabel}</p>
                <p class="card-metric" data-calc-out="breakEvenMinutes">${Math.round(econ.breakEvenMinutesPerSeatMonth)} mins / mo</p>
              </article>
              <article class="sales-card sales-card-teal">
                <p class="card-eyebrow card-eyebrow-teal" data-i18n="s5OutHoursLabel">${t.s5OutHoursLabel}</p>
                <p class="card-metric" data-calc-out="hoursReturned">${Math.round(econ.hoursSavedPerSeatMonth * econ.inputs.seats).toLocaleString('en-US')} hrs / mo</p>
              </article>
              <article class="sales-card sales-card-teal">
                <p class="card-eyebrow card-eyebrow-teal" data-i18n="s5OutNetAnnualLabel">${t.s5OutNetAnnualLabel}</p>
                <p class="card-metric" data-calc-out="netAnnual">$${Math.round(econ.netAnnualValue).toLocaleString('en-US')} / yr</p>
              </article>
              <article class="sales-card">
                <p class="card-eyebrow" data-i18n="s5OutTokenLabel">${t.s5OutTokenLabel}</p>
                <p class="card-metric" data-calc-out="tokenSavings">$0 / mo (protects flat-rate quota)</p>
              </article>
            </div>

            <div class="sim-bar-card">
              <p class="mg-panel-label" data-i18n="s5BarTitle">${t.s5BarTitle}</p>
              <div class="sim-bar-row">
                <div class="sim-bar-meta">
                  <span data-i18n="s5BarCostLabel">${t.s5BarCostLabel}</span>
                  <span data-calc-out="barCostValue">$${Math.round(econ.subscriptionMonthlyCost).toLocaleString('en-US')} / mo</span>
                </div>
                <div class="sim-bar-track">
                  <div class="sim-bar-fill-cost" data-calc-bar="cost"></div>
                </div>
              </div>
              <div class="sim-bar-row">
                <div class="sim-bar-meta">
                  <span data-i18n="s5BarValueLabel">${t.s5BarValueLabel}</span>
                  <span data-calc-out="barGrossValue">$${Math.round(econ.grossMonthlyValue).toLocaleString('en-US')} / mo</span>
                </div>
                <div class="sim-bar-track">
                  <div class="sim-bar-fill-value" data-calc-bar="value"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="boundary-strip" data-i18n="s5Assumptions">${t.s5Assumptions}</p>
      </section>

      <!-- SLIDE 6: OBJECTION HANDLER ("WE ALREADY HAVE COPILOT / CLAUDE") -->
      <section class="slide" id="slide-6" data-slide-index="5" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s6Tag">${t.s6Tag}</p>
          <h2 class="slide-title" data-i18n="s6Title">${t.s6Title}</h2>
          <p class="slide-lead" data-i18n="s6Lead">${t.s6Lead}</p>
        </div>

        <div class="matrix-table" role="table" aria-label="Enterprise AI Stack Comparison">
          <div class="matrix-row matrix-row-header" role="row">
            <div role="columnheader" data-i18n="s6ColLayer">${t.s6ColLayer}</div>
            <div role="columnheader" data-i18n="s6ColDoes">${t.s6ColDoes}</div>
            <div role="columnheader" data-i18n="s6ColGap">${t.s6ColGap}</div>
          </div>
          <div class="matrix-row" role="row">
            <div class="matrix-cell-title" role="cell" data-i18n="s6Row1Layer">${t.s6Row1Layer}</div>
            <div class="matrix-cell-body" role="cell" data-i18n="s6Row1Does">${t.s6Row1Does}</div>
            <div class="matrix-cell-gap" role="cell" data-i18n="s6Row1Gap">${t.s6Row1Gap}</div>
          </div>
          <div class="matrix-row" role="row">
            <div class="matrix-cell-title" role="cell" data-i18n="s6Row2Layer">${t.s6Row2Layer}</div>
            <div class="matrix-cell-body" role="cell" data-i18n="s6Row2Does">${t.s6Row2Does}</div>
            <div class="matrix-cell-gap" role="cell" data-i18n="s6Row2Gap">${t.s6Row2Gap}</div>
          </div>
          <div class="matrix-row" role="row">
            <div class="matrix-cell-title" role="cell" data-i18n="s6Row3Layer">${t.s6Row3Layer}</div>
            <div class="matrix-cell-body" role="cell" data-i18n="s6Row3Does">${t.s6Row3Does}</div>
            <div class="matrix-cell-gap" role="cell" data-i18n="s6Row3Gap">${t.s6Row3Gap}</div>
          </div>
          <div class="matrix-row matrix-row-highlight" role="row">
            <div class="matrix-cell-title" role="cell" data-i18n="s6Row4Layer">${t.s6Row4Layer}</div>
            <div class="matrix-cell-body" role="cell" data-i18n="s6Row4Does">${t.s6Row4Does}</div>
            <div class="matrix-cell-gap" role="cell" data-i18n="s6Row4Gap">${t.s6Row4Gap}</div>
          </div>
        </div>
      </section>

      <!-- SLIDE 7: 4 BUYERS IN THE ROOM -->
      <section class="slide" id="slide-7" data-slide-index="6" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s7Tag">${t.s7Tag}</p>
          <h2 class="slide-title" data-i18n="s7Title">${t.s7Title}</h2>
          <p class="slide-lead" data-i18n="s7Lead">${t.s7Lead}</p>
        </div>

        <div class="buyers-grid-2x2">
          <article class="sales-card sales-card-amber">
            <h3 class="card-title" data-i18n="s7Buyer1Role">${t.s7Buyer1Role}</h3>
            <p class="card-body" data-i18n="s7Buyer1Ask">${t.s7Buyer1Ask}</p>
            <p class="card-qualifier" data-i18n="s7Buyer1Win">${t.s7Buyer1Win}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <h3 class="card-title" data-i18n="s7Buyer2Role">${t.s7Buyer2Role}</h3>
            <p class="card-body" data-i18n="s7Buyer2Ask">${t.s7Buyer2Ask}</p>
            <p class="card-qualifier" data-i18n="s7Buyer2Win">${t.s7Buyer2Win}</p>
          </article>
          <article class="sales-card sales-card-amber">
            <h3 class="card-title" data-i18n="s7Buyer3Role">${t.s7Buyer3Role}</h3>
            <p class="card-body" data-i18n="s7Buyer3Ask">${t.s7Buyer3Ask}</p>
            <p class="card-qualifier" data-i18n="s7Buyer3Win">${t.s7Buyer3Win}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <h3 class="card-title" data-i18n="s7Buyer4Role">${t.s7Buyer4Role}</h3>
            <p class="card-body" data-i18n="s7Buyer4Ask">${t.s7Buyer4Ask}</p>
            <p class="card-qualifier" data-i18n="s7Buyer4Win">${t.s7Buyer4Win}</p>
          </article>
        </div>
      </section>

      <!-- SLIDE 8: 30-DAY ROLLOUT & NEXT STEP -->
      <section class="slide" id="slide-8" data-slide-index="7" aria-hidden="true" inert>
        <div class="slide-header">
          <p class="slide-eyebrow" data-i18n="s8Tag">${t.s8Tag}</p>
          <h2 class="slide-title" data-i18n="s8Title">${t.s8Title}</h2>
          <p class="slide-lead" data-i18n="s8Lead">${t.s8Lead}</p>
        </div>

        <div class="cards-grid-4">
          <article class="sales-card sales-card-amber">
            <p class="card-eyebrow" data-i18n="s8W1Step">${t.s8W1Step}</p>
            <h3 class="card-title" data-i18n="s8W1Title">${t.s8W1Title}</h3>
            <p class="card-body" data-i18n="s8W1Body">${t.s8W1Body}</p>
          </article>
          <article class="sales-card sales-card-amber">
            <p class="card-eyebrow" data-i18n="s8W2Step">${t.s8W2Step}</p>
            <h3 class="card-title" data-i18n="s8W2Title">${t.s8W2Title}</h3>
            <p class="card-body" data-i18n="s8W2Body">${t.s8W2Body}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-eyebrow card-eyebrow-teal" data-i18n="s8W3Step">${t.s8W3Step}</p>
            <h3 class="card-title" data-i18n="s8W3Title">${t.s8W3Title}</h3>
            <p class="card-body" data-i18n="s8W3Body">${t.s8W3Body}</p>
          </article>
          <article class="sales-card sales-card-teal">
            <p class="card-eyebrow card-eyebrow-teal" data-i18n="s8W4Step">${t.s8W4Step}</p>
            <h3 class="card-title" data-i18n="s8W4Title">${t.s8W4Title}</h3>
            <p class="card-body" data-i18n="s8W4Body">${t.s8W4Body}</p>
          </article>
        </div>

        <div class="cta-action-bar">
          <div class="cta-buttons-group">
            <a href="/en/contact/" class="pitch-btn pitch-btn-cta cta-large-btn" data-localized-contact data-i18n="s8CtaPrimary">${t.s8CtaPrimary}</a>
            <a href="/light.html" class="pitch-btn cta-large-btn" data-localized-dossier data-i18n="s8CtaSecondary">${t.s8CtaSecondary}</a>
            <!--email_off--><a href="mailto:${config.email}" class="pitch-nav-link">${config.email}</a><!--/email_off-->
          </div>
          <p class="card-qualifier" style="border-top: none; padding-top: 0;" data-i18n="s8FooterCompany">${t.s8FooterCompany}</p>
        </div>

        <p class="boundary-strip" data-i18n="s8Boundary">${t.s8Boundary}</p>
      </section>

      <!-- Bottom Deck Controls -->
      <footer class="pitch-controls">
        <div class="pitch-counter" data-slide-counter>Slide 01 / 08</div>
        <div class="pitch-dots" role="group" aria-label="${t.slideDotsAria}" data-i18n-aria="slideDotsAria">
          <button type="button" class="pitch-dot active" data-slide-to="0" aria-current="step" aria-label="${t.dot1Aria}" data-i18n-aria="dot1Aria">01</button>
          <button type="button" class="pitch-dot" data-slide-to="1" aria-current="false" aria-label="${t.dot2Aria}" data-i18n-aria="dot2Aria">02</button>
          <button type="button" class="pitch-dot" data-slide-to="2" aria-current="false" aria-label="${t.dot3Aria}" data-i18n-aria="dot3Aria">03</button>
          <button type="button" class="pitch-dot" data-slide-to="3" aria-current="false" aria-label="${t.dot4Aria}" data-i18n-aria="dot4Aria">04</button>
          <button type="button" class="pitch-dot" data-slide-to="4" aria-current="false" aria-label="${t.dot5Aria}" data-i18n-aria="dot5Aria">05</button>
          <button type="button" class="pitch-dot" data-slide-to="5" aria-current="false" aria-label="${t.dot6Aria}" data-i18n-aria="dot6Aria">06</button>
          <button type="button" class="pitch-dot" data-slide-to="6" aria-current="false" aria-label="${t.dot7Aria}" data-i18n-aria="dot7Aria">07</button>
          <button type="button" class="pitch-dot" data-slide-to="7" aria-current="false" aria-label="${t.dot8Aria}" data-i18n-aria="dot8Aria">08</button>
        </div>
        <div class="pitch-nav-arrows">
          <button type="button" class="pitch-btn" data-action="prev-slide" aria-label="${t.prevSlideAria}" data-i18n-aria="prevSlideAria" data-i18n="prevSlideLabel">${t.prevSlideLabel}</button>
          <button type="button" class="pitch-btn pitch-btn-cta" data-action="next-slide" aria-label="${t.nextSlideAria}" data-i18n-aria="nextSlideAria" data-i18n="nextSlideLabel">${t.nextSlideLabel}</button>
        </div>
      </footer>
    </main>
  </div>

  <script>
    (function () {
      const DEFAULT_WORKLOAD = ${serializedWorkload};
      const lightSalesContent = ${serializedContent};
      const calculateEconomics = ${calculateEconomics.toString()};
      const bindSalesDeck = ${bindSalesDeck.toString()};
      if (typeof document !== 'undefined') {
        bindSalesDeck(document, typeof window !== 'undefined' ? { window } : {});
      }
    })();
  </script>
</body>
</html>`;
}
