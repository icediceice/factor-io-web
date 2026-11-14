/* EP4 The Cryptographic Leash: why ungoverned AI with admin keys is dangerous, per-installation
   Ed25519 keys + fresh challenge + 8-digit pairing + use-time Vault/CyberArk secrets (G04-G06, D08),
   signed AI session bound to its approved plan through the Plan Gate (G03, G11, G14), mid-work edit
   re-closing the gate (G02), co-visible scope on every zero-divergence beat, database-recorded
   approvals (G01, G07-G09), and frozen digest Check/Go (O03, G13).
   Ed25519 keys are per-installation machine identity; AI sessions are signed and plan-bound. Zero em/en dashes. */
(function () {
var G = 940;

LS.ep({ no: 4, title: ['The Cryptographic Leash', 'สายจูงคริปโตกราฟี'],
  blurb: ['How Light Ops guarantees our incident AI never runs an unapproved command on your servers.', 'วิธีที่ Light Ops ล็อกให้ AI ที่ดูแลเหตุการณ์รันได้เฉพาะคำสั่งที่คุณอนุมัติบนเซิร์ฟเวอร์ของคุณ'],
  shots: [
  /* 4.1 Illustrative cartoon: handing raw admin keys to an ungoverned AI agent */
  { bg: 'office-night', bgo: .34, shade: 'full',
    caps: [{ pos: 'top', b: 0, out: 5, w: 1120, tone: 'r', k: ['The Industry Trap', 'กับดักที่หลายองค์กรกำลังเผชิญ'],
             h: ['Handing an AI agent admin keys and hoping its prompt behaves.', 'การยื่นกุญแจแอดมินให้ AI แล้วได้แต่หวังว่ามันจะไม่ทำนอกสั่ง'] },
           { pos: 'top', b: 5, w: 1220, tone: 'r', k: ['Why Prompts Are Not Security', 'ทำไมคำสั่งข้อความจึงไม่ใช่รั้วความปลอดภัย'],
             h: ['Whoever holds raw admin keys holds your production servers.', 'ใครถือกุญแจแอดมินโดยตรง คนนั้นมีอำนาจเหนือเซิร์ฟเวอร์จริงของคุณทันที'] }],
    svg: LS.ground(G) + LS.rack({ x: 1240, y: 548 }) + LS.rack({ x: 1500, y: 548 }) +
      '<rect data-b="4" x="1228" y="536" width="504" height="416" rx="14" fill="#ff5d7a" fill-opacity=".22"/>' +
      LS.icg({ n: 'doc', x: 760, y: 600, s: 90, tone: 'r', b: 3 }) +
      LS.A({ id: 'b', role: 'boss', x: 300, y: G, s: 1.25, pose: 'present', act: '1:loop(talk) 2:loop(none) 5:pose(shrug,.5)' }) +
      LS.A({ id: 'g', role: 'agent', x: 560, y: G, s: 1.25, face: -1, act: '2:walk(1120,1.8) 3:cls(role-rogue) 3+0.2:pose(reach,.4)' }),
    labs: [{ b: 3, c: 1, x: 760, y: 488, tone: 'r', text: ['Poisoned instruction hidden in log or web text', 'คำสั่งแฝงวางยาซ่อนอยู่ในข้อความล็อกหรือหน้าเว็บ'] },
           { b: 4, d: .3, c: 1, x: 1480, y: 882, tone: 'r', text: ['Executed without human approval', 'รันทำลายข้อมูลทันทีโดยไม่มีคนอนุมัติ'] }],
    says: [{ b: 1, out: 2, x: 130, y: 468, w: 540, text: ['Take root SSH access and clean up disk space.', 'เอากุญแจ root ไปเคลียร์พื้นที่ดิสก์ให้หน่อย'] },
           { b: 4, out: 5, x: 1110, y: 416, w: 660, tone: 'r', text: ['Done. Wiping backup snapshots too.', 'เรียบร้อย ลบไฟล์สำรองข้อมูลทิ้งให้ด้วยเลย'] }],
    t: [2.4, 2.4, 2.2, 2.4, 2.6, 2.8] },

  /* 4.2 Infographic Diagram: Machine Identity & Use-Time Vault Secrets (G04-G06, D08) */
  { tpl: 'diagram', bg: 'vault-gate', bgo: .46, shade: 'full',
    kick: ['Layer 1 · Machine Identity & Secret Hygiene', 'ด่านที่ 1 · ยืนยันตัวตนเครื่องและแยกเก็บความลับ'],
    title: ['Every enrolled machine proves who it is before talking', 'ทุกเครื่องต้องพิสูจน์ตัวตนด้วยลายเซ็นดิจิทัลก่อนเชื่อมต่อเสมอ'],
    nodes: [
      { id: 'edge', x: 390, y: 540, w: 450, h: 250, icon: 'id', tone: 'c', b: 1,
        k: ['Enrolled Edge', 'เครื่องที่ลงทะเบียน'],
        h: ['Own signed key + 8-digit pairing', 'กุญแจประจำเครื่อง + รหัสจับคู่ 8 หลัก'],
        p: ['Each installation holds its own cryptographic key, approved once by your operator with an 8-digit code.', 'แต่ละจุดติดตั้งถือกุญแจดิจิทัลเฉพาะตัว โดยผู้ดูแลของคุณกดยืนยันจับคู่ครั้งแรกด้วยรหัส 8 หลัก'] },
      { id: 'chal', x: 960, y: 540, w: 450, h: 250, icon: 'key', tone: 'a', b: 2,
        k: ['Every Connection', 'ทุกครั้งที่เชื่อมต่อ'],
        h: ['Fresh one-time challenge', 'ตรวจโจทย์ท้าทายใช้ครั้งเดียว'],
        p: ['The Light\u00A0Ops server issues a fresh challenge on every session; replayed credentials fail.', 'เซิร์ฟเวอร์ออกโจทย์สุ่มใหม่ทุกครั้งที่เชื่อมต่อ ป้องกันการดักซ้ำหรือสวมรอยสิทธิ์'] },
      { id: 'vault', x: 1530, y: 540, w: 450, h: 250, icon: 'lock', tone: 'g', b: 3,
        k: ['Vault & CyberArk', 'เชื่อมต่อคลังความลับ'],
        h: ['Secrets resolved at use-time', 'ดึงรหัสผ่านเฉพาะวินาทีที่ใช้งาน'],
        p: ['HashiCorp Vault and CyberArk adapters fetch customer secrets over HTTPS at execution without writing them to disk.', 'ดึงรหัสผ่านจาก Vault หรือ CyberArk ผ่าน HTTPS เฉพาะตอนรันจริง โดยไม่บันทึกรหัสลงดิสก์และไม่ส่งให้โมเดลเห็น'] }
    ],
    edges: [
      { from: 'edge', to: 'chal', tone: 'a', b: 2, flow: 1, labelY: 374, label: ['Signed proof', 'ลายเซ็นยืนยัน'] },
      { from: 'chal', to: 'vault', tone: 'g', b: 3, flow: 1, labelY: 374, label: ['Zero disk secrets', 'ไม่เก็บรหัสลงดิสก์'] }
    ],
    banner: { b: 3, tone: 'g', icon: 'shieldCheck', k: ['No Shared Master Key', 'ไม่มีกุญแจผีค้างในระบบ'],
      text: ['AI prompts never see your raw SSH passwords or vault secrets.', 'โมเดล AI จะไม่มีวันมองเห็นรหัสผ่าน SSH หรือค่าความลับจริงขององค์กรคุณ'] } },

  /* 4.3 Stickman Plan Gate + Google Flow loop (G03, G11, G14) */
  { bg: 'flow-leash-gate', flow: 'ai-leash-gate', bgo: .66, shade: 'top',
    caps: [{ pos: 'top', b: 0, w: 1380, k: ['Layer 2 · The Enforced Plan Gate', 'ด่านที่ 2 · ประตูตรวจแผนงานบังคับสิทธิ์'],
      h: ['Each AI session is signed, bound to its plan, and acts only through the gate.', 'ทุกเซสชันของ AI ถูกลงลายเซ็น ผูกติดกับแผนงาน และต้องผ่านด่านตรวจเสมอ'],
      p: ['On your servers, our incident AI runs only commands that match the approved plan.', 'บนเซิร์ฟเวอร์ของคุณ AI ที่ดูแลเหตุการณ์ของเรารันได้เฉพาะคำสั่งที่ตรงกับแผนที่อนุมัติแล้วเท่านั้น'] }],
    svg: LS.ground(G) + LS.rack({ x: 1520, y: 548 }) +
      LS.plan({ x: 1210, y: 620, w: 150, h: 190, lines: 3 }) +
      LS.gate({ x: 860, y: 640, w: 300, h: 300, at: '2:open', out: 3 }) + LS.gate({ x: 860, y: 640, w: 300, h: 300, b: 3 }) +
      LS.A({ id: 'a', role: 'lightagent', x: 200, y: G, s: 1.2, hold: 'scroll', act: '1:walk(760,1.6) 2:walk(1440,2)' }) +
      LS.A({ id: 'x', role: 'rogue', x: 120, y: G, s: 1.2, b: 3, act: '3:walk(760,1.8) 3+1.9:pose(reach,.4) 4:pose(sad,.5)' }),
    labs: [{ b: 1, d: 1.5, out: 2, c: 1, x: 620, y: 556, tone: 'g', text: ['Signed & matches approved plan', 'ลงลายเซ็นและตรงตามแผนที่อนุมัติ'] },
           { b: 3, d: 1.8, c: 1, x: 600, y: 556, tone: 'r', text: ['Unapproved command attempt', 'พยายามสั่งรันนอกเหนือแผน'] },
           { b: 4, c: 1, x: 1010, y: 496, tone: 'r', text: ['Blocked by server gate before execution', 'ถูกเซิร์ฟเวอร์บล็อกทันทีก่อนถึงเครื่องปลายทาง'] }],
    t: [3.2, 2.2, 2.4, 2.6, 2.8] },

  /* 4.4 Mid-work plan amendment closes the gate again (G02) */
  { bg: 'vault-gate', bgo: .34, shade: 'full',
    caps: [{ pos: 'top', b: 0, w: 1360, tone: 'a', k: ['Layer 3 · Revision Lock', 'ด่านที่ 3 · ล็อกตามรุ่นเอกสารแผนงาน'],
      h: ['Change one line of the plan mid-work, and the gate locks shut again.', 'หากแก้ไขแผนแม้แต่บรรทัดเดียวระหว่างทำงาน ประตูด่านตรวจจะล็อกปิดทันที'],
      p: ['The revised plan pauses until a human reviews the change and gives a fresh Go.', 'แผนที่แก้ไขใหม่จะต้องหยุดรอให้คนตรวจทานและกดอนุมัติ Go รอบใหม่ก่อนเสมอ'] }],
    svg: LS.ground(G) + LS.rack({ x: 1520, y: 548 }) +
      LS.plan({ x: 380, y: 560, w: 200, h: 260, lines: 3, checks: 3 }) +
      '<rect class="fx-pop" data-b="2" x="444" y="786" width="100" height="14" rx="7" fill="#ffb547"/>' +
      LS.icg({ n: 'pen', x: 580, y: 760, s: 60, tone: 'a', b: 2 }) +
      LS.gate({ x: 860, y: 640, w: 300, h: 300, open: 1, out: 2 }) + LS.gate({ x: 860, y: 640, w: 300, h: 300, b: 2, at: '4:open' }) +
      LS.A({ id: 'a', role: 'lightagent', x: 680, y: G, s: 1.2, hold: 'scroll', pose: 'hold', act: '1:loop(nod) 2:loop(none) 2:pose(think,.4) 3:walk(800,.6) 3+0.7:pose(stop,.4) 4+0.4:walk(1440,2)' }) +
      LS.A({ id: 'h', role: 'engineer', x: 200, y: G, s: 1.2, hold: 'phone', pose: 'hold', act: '4:pose(pointup,.4) 4+1:pose(hold,.4)' }),
    labs: [{ b: 1, out: 2, c: 1, x: 480, y: 478, tone: 'g', text: ['Approved revision v1', 'แผนรุ่นอนุมัติเดิม'] },
           { b: 2, out: 4, c: 1, x: 480, y: 478, tone: 'a', text: ['New step added -> v2', 'เพิ่มขั้นตอนใหม่เข้าแผน'] },
           { b: 3, d: .6, out: 4, c: 1, x: 1010, y: 516, tone: 'r', text: ['Gate locked: awaits fresh Go', 'ด่านล็อก: ต้องรอคนกด Go ใหม่'] },
           { b: 4, d: .3, c: 1, x: 1010, y: 516, tone: 'g', text: ['Fresh Go recorded: work resumes', 'อนุมัติ Go ใหม่แล้ว: เดินงานต่อได้'] }],
    says: [{ b: 4, x: 60, y: 418, w: 320, tone: 'c', text: ['Verified. Go.', 'ตรวจแล้ว ถูกต้อง กด Go'] }],
    note: ['An operator can explicitly choose to let a plan carry a bounded edit without a new Go.', 'ผู้ดูแลระบบสามารถเลือกอนุญาตเฉพาะกรณีให้แผนรับการปรับแก้ย่อยโดยไม่ต้องกด Go ใหม่ได้'],
    t: [3.2, 2, 2.4, 2.4, 3] },

  /* 4.5 Hero Stat: 0 unapproved commands, co-visible inline scope on EVERY beat */
  { tpl: 'stat', mid: 1, tone: 'g', word: '0', bg: 'flow-leash-gate', bgo: .4, shade: 'full',
    kick: ['On Your Servers · Our Incident AI', 'บนเซิร์ฟเวอร์ของคุณ · AI ที่ดูแลเหตุการณ์ของเรา'],
    label: ['commands outside the approved plan run on your servers from our incident AI.', 'คำสั่งนอกแผนที่อนุมัติจาก AI ที่ดูแลเหตุการณ์ของเรา ที่รันบนเซิร์ฟเวอร์ของคุณได้'],
    scope: ['Enforced scope: our incident AI acting on your servers through the Light\u00A0Ops plan gate', 'ขอบเขตบังคับใช้: AI ที่ดูแลเหตุการณ์ของเราเมื่อสั่งการบนเซิร์ฟเวอร์ของคุณผ่านด่านตรวจแผนงาน'],
    lines: [['Even a poisoned prompt cannot make our incident AI run a command outside the approved plan on your servers.', 'ต่อให้เจอข้อความวางยาแอบแฝง ก็สั่งให้ AI ที่ดูแลเหตุการณ์ของเรารันคำสั่งนอกแผนที่อนุมัติบนเซิร์ฟเวอร์ของคุณไม่ได้']] },

  /* 4.6 Governance architecture proof cards (G01, G07, G08, G09, G14) */
  { tpl: 'cards', bg: 'server-room', bgo: .34, shade: 'full', cols: 4, top: 280, together: 1,
    kick: ['Audit-Grade Governance', 'หลักฐานการกำกับดูแลที่ตรวจสอบย้อนหลังได้'],
    title: ['Enforced by server code and database rules, not model politeness', 'บังคับใช้ด้วยโค้ดเซิร์ฟเวอร์และฐานข้อมูล ไม่ใช่แค่สั่งสอนโมเดล'],
    cards: [
      { icon: 'gear', tone: 'c', h: ['Server gate decides', 'เซิร์ฟเวอร์เป็นผู้ตัดสิน'],
        p: ['Admission checks run in the control server, outside the AI model’s reach.', 'การตรวจอนุญาตคำสั่งทำงานบนเซิร์ฟเวอร์ควบคุม โมเดลแก้ไขกติกาเองไม่ได้'] },
      { icon: 'stamp', tone: 'g', h: ['Database-written record', 'ฐานข้อมูลบันทึกการอนุมัติ'],
        p: ['Every Go, principal, and revision is stamped directly by the database.', 'ทุกการกด Go ชื่อผู้อนุมัติ และรุ่นของแผนถูกบันทึกโดยตรงในฐานข้อมูล'] },
      { icon: 'chain', tone: 'c', h: ['Hash-chained console input', 'คำสั่งลงลายเซ็นร้อยโซ่ hash'],
        p: ['Signed operator envelopes link into a tamper-evident hash chain.', 'คำสั่งจากหน้าคอนโซลลงลายเซ็นดิจิทัลและร้อยต่อเป็นลูกโซ่ ป้องกันการปลอมแปลง'] },
      { icon: 'people', tone: 'a', h: ['Kubernetes-style RBAC', 'แบ่งสิทธิ์ละเอียดแบบ Kubernetes'],
        p: ['Separate roles govern who can view, propose, approve, or execute.', 'แยกบทบาทผู้ดู ผู้เสนอแผน ผู้อนุมัติ และเซสชัน AI ออกจากกันชัดเจน'] }
    ] },

  /* 4.7 Product proof: Frozen Run Capsule Check & Go (O03, G13) */
  { tpl: 'shot', img: 'run-capsule', side: 'left', w: 720, tw: 860, top: 150, imgTop: 150,
    caption: ['Run Capsule · Frozen Digest Awaiting Go', 'แคปซูลงานรัน · ล็อกค่า Digest รอการกด Go'],
    kick: ['Human-in-the-Loop Execution', 'คุณเห็นทุกบรรทัดก่อนรันจริง'],
    title: ['Check freezes the exact run. Your Go unlocks only that digest.', 'ขั้น Check แช่แข็งชุดคำสั่งไว้ การกด Go จะปลดล็อกเฉพาะชุดนั้นเป๊ะ ๆ'],
    points: [
      ['Inspect every target host and per-task diff before any change starts.', 'ตรวจดูรายชื่อเครื่องปลายทางและรายละเอียดการเปลี่ยนแปลงทีละงานก่อนเริ่มรันจริง'],
      ['If a single byte changes after Check, the frozen digest invalidates automatically.', 'หากมีการเปลี่ยนแปลงแม้แต่ไบต์เดียวหลังขั้น Check ระบบจะยกเลิกสิทธิ์ชุดนั้นทันที']
    ],
    dots: [{ x: 30, y: 23, b: 1 }, { x: 58, y: 64, b: 2 }] }
  ] });
})();
