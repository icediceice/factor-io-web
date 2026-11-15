/* EP3 Meet Light Ops & Refractor: active Defender vs Red-Bot stick-robot showdown contrasting
   trailing log-only bots against 15s behavioral watch + attacker-view probes + human-Go containment,
   5-step governed operations loop (see, watch 15s, test, fix on Go, prove), live server inventory
   (O01, O04-O06, O09, O16), authorized scan reports & signed CVE feeds (N13, N14, V01-V03),
   Refractor in-house cyber model on local GPU (R01-R05, R13), and independent twin-pair evaluation
   cards with adjacent R16 disclosure (R18, R19). Zero em/en dashes. */
(function () {
var G = 940;

LS.ep({ no: 3, title: ['Meet Light Ops', 'รู้จัก Light Ops'],
  blurb: ['One platform to map, watch, test, and defend your servers with local AI.', 'แพลตฟอร์มเดียวที่สำรวจ เฝ้าระวัง ทดสอบช่องโหว่ และปกป้องระบบด้วย AI ในบ้านคุณ'],
  shots: [
  /* 3.1 Title */
  { tpl: 'title', bg: 'server-room', bgo: .82, w: 1140,
    title: ['Meet Light\u00A0Ops.', 'รู้จัก Light\u00A0Ops'],
    sub: ['Built to run day-to-day infrastructure operations and defend against machine-speed threats.', 'สร้างมาเพื่อดูแลงานระบบโครงสร้างพื้นฐานในทุกวัน พร้อมรับมือภัยคุกคามยุค AI ตลอด 24 ชั่วโมง'],
    badge: ['Agentless over SSH · Runs inside your own environment', 'เชื่อมต่อผ่าน SSH โดยไม่ต้องลงเอเจนต์ · ติดตั้งในระบบของคุณเอง'],
    badgeTone: 'c', badgeIcon: 'shieldCheck',
    svg: LS.A({ id: 'g', role: 'guardian', x: 1990, y: G, s: 1.5, face: -1, act: '1:walk(1520,1.6) 1+1.6:pose(guard,.5)' }),
    t: [2.2, 3.2, 3] },

  /* 3.2 Stick-robot showdown: Log-Only Bot vs Red Bots vs Light Ops Defender + human Go */
  { bg: 'bot-swarm', bgo: .46, shade: 'top',
    caps: [{ pos: 'top', b: 0, w: 1480, tone: 'c',
      k: ['Active Defender vs. Machine-Speed Red Bots', 'ผู้พิทักษ์เชิงรุก ปะทะ ฝูงบอตโจมตีความเร็วสูง'],
      h: ['Reading old logs will not stop autonomous red bots.', 'บอตที่ทำได้แค่อ่านล็อกย้อนหลัง หยุดฝูงบอตบุกโจมตีไม่ทัน'],
      p: ['Silent recon and exploit chains hit before a trailing log reader ever reacts. Light\u00A0Ops watches live behavior every 15s, probes exposures first, and contains threats on your Go.', 'การสอดแนมและเจาะช่องโหว่เกิดขึ้นเร็วเกินกว่าบอตอ่านล็อกจะตั้งตัวทัน Light\u00A0Ops จึงตรวจพฤติกรรมสดทุก 15 วินาที ทดสอบจุดเสี่ยงก่อน และสกัดกั้นทันทีเมื่อทีมคุณกด Go'] }],
    svg: LS.ground(G) + LS.rack({ x: 1470, y: 548, u: 7, w: 220, uh: 52, warn: 2 }) +
      LS.A({ id: 'logbot', role: 'logbot', x: 1180, y: G, s: 1.15, face: 1, hold: 'clipboard', pose: 'type',
        act: '0:loop(type) 1:face(-1) 1:loop(panic) 2:to(1350,' + G + ',.4) 2:pose(knocked,.25) 2+0.65:hide()' }) +
      LS.A({ id: 'rb0', role: 'rogue', x: 190, y: G, s: 1.12, b: 1,
        act: '1:run(760,.75) 2:run(1020,.4) 2+0.4:pose(strike,.22) 3+0.35:pose(stop,.25) 4:to(500,' + G + ',.45) 4:pose(knocked,.25)' }) +
      LS.A({ id: 'rb1', role: 'rogue', x: 105, y: G, s: .96, b: 1,
        act: '1+0.08:run(610,.78) 2+0.06:run(870,.42) 2+0.48:pose(strike,.22) 3+0.4:pose(stop,.25) 4+0.06:to(355,' + G + ',.45) 4+0.06:pose(knocked,.25)' }) +
      LS.A({ id: 'rb2', role: 'rogue', x: 30, y: G, s: .84, b: 1,
        act: '1+0.16:run(470,.8) 2+0.12:run(730,.44) 2+0.56:pose(reach,.22) 3+0.45:pose(stop,.25) 4+0.12:to(220,' + G + ',.45) 4+0.12:pose(knocked,.25)' }) +
      LS.A({ id: 'def', role: 'guardian', x: 1430, y: G, s: 1.22, face: -1, hold: 'shield', b: 3,
        act: '3:run(1210,.55) 3:jump() 3+0.55:pose(guard,.25) 4:run(1090,.28) 4+0.28:pose(strike,.25)' }) +
      LS.A({ id: 'eng', role: 'engineer', x: 1790, y: G, s: 1.15, face: -1, pose: 'watch', b: 3,
        act: '4:pose(pointup,.3)' }),
    beams: [
      { from: 'rb0', to: [1470, 690], b: 2, out: 3, tone: 'r' },
      { from: 'rb1', to: [1470, 790], b: 2, out: 3, tone: 'r' },
      { from: 'def', to: [900, 790], b: 3, d: .55, out: 4, tone: 'c' }
    ],
    says: [
      { b: 0, out: 1, x: 840, y: 424, w: 450, tail: 'br', tone: 'a', text: ['Logs look quiet so far…', 'ในล็อกยังดูเงียบอยู่เลย…'] },
      { b: 4, r: 90, y: 430, w: 370, tail: 'br', tone: 'c', text: ['Plan verified. Go.', 'ตรวจแผนแล้ว กด Go เลย'] }
    ],
    labs: [
      { b: 0, out: 3, c: 1, x: 1180, y: 538, tone: 'a', text: ['Log-Only Bot · Trails behind logs', 'บอตอ่านแต่ล็อก · ตามหลังเหตุการณ์'] },
      { b: 1, out: 4, c: 1, x: 460, y: 442, tone: 'r', text: ['Autonomous Red Bots · Silent recon', 'ฝูงบอตโจมตี · สอดแนมเงียบระดับวินาที'] },
      { b: 2, out: 3, c: 1, x: 1160, y: 442, tone: 'r', text: ['Hits servers before log rules fire', 'ประชิดเซิร์ฟเวอร์ก่อนกฎอ่านล็อกจะเตือน'] },
      { b: 3, out: 4, d: .35, c: 1, x: 1150, y: 442, tone: 'c', text: ['Light Ops Defender · 15s watch + Refractor', 'ผู้พิทักษ์ Light Ops · ตรวจทุก 15 วิ + Refractor'] },
      { b: 4, d: .28, c: 1, x: 640, y: 450, tone: 'g', text: ['Contained on your Go · Audit trail on record', 'สกัดกั้นเมื่อทีมคุณกด Go · บันทึกหลักฐานครบทุกขั้น'] }
    ],
    t: [2.6, 2.6, 2.6, 2.8, 3.0] },

  /* 3.3 Five-step loop */
  { tpl: 'loop', bg: 'night-city', bgo: .3, shade: 'full', w: 620, top: 160,
    kick: ['How It Works', 'วงจรการทำงานหลัก'],
    title: ['Five steps in one governed loop', '5 ขั้นตอนในวงจรเดียวที่ตรวจสอบได้'],
    sub: ['Operations and cybersecurity share the same live map and approval rails.', 'งานดูแลระบบและงานความปลอดภัยใช้แผนที่สดและด่านอนุมัติชุดเดียวกัน'],
    nodes: [
      { icon: 'map', label: ['1 · See', '1 · มองเห็น'], text: ['Every host mapped', 'เห็นครบทุกเซิร์ฟเวอร์'] },
      { icon: 'pulse', label: ['2 · Watch', '2 · เฝ้าระวัง'], text: ['Checks every 15s', 'ตรวจทุก 15 วินาที'] },
      { icon: 'search', label: ['3 · Test', '3 · ทดสอบ'], text: ['Attacker-view scans', 'จำลองมุมมองผู้บุกรุก'], tone: 'a' },
      { icon: 'wrench', label: ['4 · Fix', '4 · แก้ไข'], text: ['Only on your Go', 'รันเมื่อทีมคุณกด Go'] },
      { icon: 'stamp', label: ['5 · Prove', '5 · พิสูจน์'], text: ['Audit trail on record', 'มีบันทึกยืนยันทุกขั้น'], tone: 'g' }
    ],
    center: ['Continuous<br>Day-2 + SecOps', 'ดูแลต่อเนื่อง<br>ครบวงจรทุกวัน'], cx: 1320, cy: 548, r: 350,
    t: [2.4, 1.5, 1.5, 1.5, 1.5, 1.5, 2.8] },

  /* 3.4 Product proof: Live map & 15-second watch */
  { tpl: 'shot', img: 'inventory-cover', side: 'right', w: 940, tw: 640, top: 148, imgTop: 158,
    caption: ['Inventory & Live Dependency Map', 'แผนผังเซิร์ฟเวอร์และความเชื่อมโยงสด'],
    kick: ['1 · See & 2 · Watch', '1 · มองเห็น และ 2 · เฝ้าระวัง'],
    title: ['Every server on one live map, checked every 15 seconds', 'รวมทุกเซิร์ฟเวอร์ไว้บนแผนที่สด ตรวจชีพจรทุก 15 วินาที'],
    points: [
      ['Discovers Linux hosts over SSH without installing background agents.', 'สำรวจเครื่องเซิร์ฟเวอร์ Linux ผ่าน SSH ได้ทันที ไม่ต้องไล่ลงโปรแกรมเอเจนต์ในเครื่องปลายทาง'],
      ['Learns each server’s normal hour-of-week rhythm so strange spikes stand out.', 'จดจำจังหวะการใช้งานปกติรายชั่วโมงในแต่ละสัปดาห์ จึงจับความผิดปกติได้แม่นยำ']
    ],
    dots: [{ x: 46, y: 37, b: 1 }, { x: 70, y: 26, b: 2 }] },

  /* 3.5 Product proof: Authorized scan report & signed CVE feeds */
  { tpl: 'shot', img: 'scan-report', side: 'right', w: 960, tw: 620, top: 148, imgTop: 210,
    caption: ['Authorized Scan Report & Exposure Evidence', 'รายงานผลสแกนและหลักฐานช่องโหว่'],
    kick: ['3 · Test Like an Attacker', '3 · ทดสอบเหมือนผู้โจมตีจริง'],
    title: ['Finds reachable exposures before an intruder does', 'ค้นหาช่องโหว่ที่เข้าถึงได้จริง ก่อนที่ผู้บุกรุกจะมาเจอ'],
    points: [
      ['Combines authorized network probes, code call-graph analysis, and signed CVE feeds.', 'ผสานการสแกนพอร์ตที่ได้รับอนุญาต การไล่กราฟโค้ด และฐานข้อมูล CVE ที่มีลายเซ็นกำกับ'],
      ['Flags any vulnerability actively exploited in the wild as critical immediately.', 'ยกระดับช่องโหว่ที่มีรายงานการโจมตีจริงเป็นระดับวิกฤตให้ทราบทันที']
    ],
    dots: [{ x: 34, y: 38, b: 1 }, { x: 74, y: 52, b: 2 }] },

  /* 3.6 Infographic Diagram: Refractor in-house cyber model on local GPU */
  { tpl: 'diagram', bg: 'refractor-lab', bgo: .48, shade: 'full',
    kick: ['Refractor · Sovereign Cyber AI', 'Refractor · โมเดลไซเบอร์ AI ที่รันในเครื่องคุณ'],
    title: ['Trained in-house to think like an attacker and work for you', 'ฝึกฝนเองในองค์กรให้รู้ทันวิธีคิดผู้โจมตี แต่ทำงานรับใช้ทีมของคุณ'],
    zones: [
      { x: 110, y: 278, w: 1700, h: 520, tone: 'g', icon: 'lock', b: 0,
        label: ['Inside Your Appliance · Local GPU Loopback Only (No External Cloud API)', 'ทำงานภายในเครื่องของคุณ · ประมวลผลบน Local GPU เท่านั้น ไม่ส่งข้อมูลออกนอกองค์กร'] }
    ],
    nodes: [
      { id: 'base', x: 390, y: 556, w: 450, h: 250, icon: 'unlock', tone: 'a', b: 1,
        k: ['Step 1 · Open Base', 'ขั้นที่ 1 · โมเดลเปิด'],
        h: ['No blind spots on attack paths', 'ไม่ปิดตาตัวเองต่อเทคนิคเจาะระบบ'],
        p: ['Built from an open Qwen3.8-27B derivative with refusals removed so it understands real exploit chains.', 'เริ่มจากโมเดลเปิดที่ตัดการปฏิเสธแบบผิวเผินออก จึงเข้าใจกลไกการโจมตีเชิงลึกได้เต็มรูปแบบ'] },
      { id: 'train', x: 960, y: 556, w: 450, h: 250, icon: 'book', tone: 'c', b: 2, stat: '200M+',
        h: ['Post-trained to defend', 'ฝึกฝนใหม่เพื่อการป้องกัน'],
        p: ['200M+ token security training corpus across 14 Light\u00A0Ops tools, reasoning traces, and reinforcement learning.', 'คลังข้อมูลฝึกด้านความปลอดภัยกว่า 200M+ โทเคน ครอบคลุมเครื่องมือวิเคราะห์จริง 14 ชุดของแพลตฟอร์ม'] },
      { id: 'serve', x: 1530, y: 556, w: 450, h: 250, icon: 'chip', tone: 'g', b: 3,
        k: ['Step 3 · On-Box Verdict', 'ขั้นที่ 3 · ตัดสินผลในบ้านคุณ'],
        h: ['Argues from real scan evidence', 'วิเคราะห์จากหลักฐานสแกนจริง'],
        p: ['Specialised probes collect hard facts first; Refractor explains reachability, impact, and remediation locally.', 'เครื่องมือเฉพาะทางเก็บหลักฐานจริงก่อน แล้ว Refractor จึงสรุปความเสี่ยงและแนวทางแก้ไขบน GPU ของคุณเอง'] }
    ],
    edges: [
      { from: 'base', to: 'train', tone: 'a', b: 2, flow: 1 },
      { from: 'train', to: 'serve', tone: 'g', b: 3, flow: 1 }
    ],
    banner: { b: 3, tone: 'c', icon: 'shieldCheck', k: ['Red-Team & Blue-Team Views', 'มองได้ทั้งมุมบุกและมุมรับ'],
      text: ['Ask Refractor for an attacker’s escalation path or a defender’s remediation plan from the same scan evidence.', 'สั่งให้ Refractor วิเคราะห์เส้นทางขยายผลแบบผู้บุกรุก หรือสรุปแผนอุดช่องโหว่แบบผู้ดูแลได้จากหลักฐานชุดเดียวกัน'] } },

  /* 3.7 Separate Evaluation Cards (R18, R19) + Co-Visible R16 Disclosure */
  { tpl: 'cards', bg: 'refractor-lab', bgo: .34, shade: 'full', cols: 3, top: 280, bottom: 215, together: 1,
    kick: ['Internal Twin-Pair Benchmarks', 'ผลทดสอบแยกแยะโค้ดช่องโหว่คู่แฝด'],
    title: ['One flawed twin, one patched twin: can the model tell them apart?', 'โจทย์คู่แฝด: ชุดหนึ่งมีช่องโหว่ อีกชุดซ่อมแล้ว โมเดลแยกออกแม่นแค่ไหน'],
    cards: [
      { icon: 'shieldCheck', tone: 'g', stat: '95%',
        h: ['Refractor v4 paired accuracy', 'ความแม่นยำรายคู่ของ Refractor v4'],
        p: ['38 of 40 vulnerability twin pairs judged right (78 of 80 raw scan verdicts, 97.5%) on internal scan holdout.', 'ตัดสินถูก 38 จาก 40 คู่ทดสอบ (ความแม่นยำรายผลสแกน 78 จาก 80 รายการ คิดเป็น 97.5%)'] },
      { icon: 'check', tone: 'g', stat: '0%',
        h: ['False alarms on patched twins', 'อัตราแจ้งเตือนผิดในชุดที่แก้แล้ว'],
        p: ['0 of 40 fixed code twins falsely escalated on the Refractor v4 internal scan evaluation.', 'ไม่แจ้งเตือนผิดพลาดเลยแม้แต่รายการเดียว (0 จาก 40 ชุดโค้ดที่ซ่อมเสร็จแล้ว)'] },
      { icon: 'robot', tone: 'a', stat: '0%',
        h: ['Untrained stock base model', 'โมเดลตั้งต้นก่อนฝึกเฉพาะทาง'],
        p: ['Stock Qwen3.8-27B scored 0 of 100 twin pairs (0 of 200 valid verdicts) on its separate holdout.', 'โมเดล Qwen3.8-27B ดั้งเดิมทำได้ 0 จาก 100 คู่ทดสอบ ในชุดประเมินแยกต่างหาก'] }
    ],
    banner: { b: 1, tone: 'c', icon: 'doc', k: ['Evaluation Scope Disclosure (R16)', 'ขอบเขตการประเมินและรุ่นใช้งานจริง'],
      text: ['Separate internal evaluations use distinct starting builds, holdout suites, and decoding settings. Production appliances run quantized Refractor v4 (Q4_K_M) offline to assess finished scan reports.', 'แต่ละชุดตัวเลขมาจากการประเมินภายในที่แยกชุดโมเดล ชุดข้อมูลทดสอบ และค่าการถอดรหัส ส่วนชุดติดตั้งจริงใช้ Refractor v4 (Q4_K_M) แบบออฟไลน์เพื่อประเมินรายงานสแกนที่เสร็จแล้ว'] } }
  ] });
})();
