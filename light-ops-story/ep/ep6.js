/* EP6 Why Light Ops: fragmented tool sprawl + shadow/ungoverned AI vs one agentless, on-premises
   governed platform (O08, O10-O14, D01-D06, D08, D09, G09, R13). Light Ops Box noted as under
   development. No competitor is named. Zero em/en dashes. */
(function () {
var G = 940;
var ICONS = [['chart', 620, 600], ['bell', 760, 500], ['search', 960, 470], ['terminal', 1160, 500], ['bug', 1300, 600], ['doc', 560, 770], ['cube', 1360, 770]];

LS.ep({ no: 6, title: ['Why Light Ops', 'ทำไมต้อง Light Ops'],
  blurb: ['Replace disconnected tools and risky AI scripts with one governed on-prem platform.', 'เปลี่ยนเครื่องมือที่กระจัดกระจายและ AI ไร้สายจูง ให้เป็นแพลตฟอร์มเดียวที่คุมได้จริง'],
  shots: [
  /* 6.1 Stickman tool sprawl + shadow AI gap */
  { bg: 'sprawl-vs-one', bgo: .44, shade: 'full',
    caps: [{ pos: 'top', b: 0, w: 1280, tone: 'a', k: ['The Fragmentation Trap', 'ปัญหาเครื่องมือแยกส่วนในองค์กร'],
      h: ['Five disconnected consoles, and attackers live in the gaps.', 'มีเครื่องมือเต็มไปหมดแต่ไม่เชื่อมกัน ช่องว่างตรงกลางจึงกลายเป็นที่ซ่อนของผู้โจมตี'],
      p: ['Monitoring alerts in one tab, CVE spreadsheets in another, and ad-hoc AI scripts with no audit trail.', 'ระบบมอนิเตอร์อยู่ที่หนึ่ง ตารางช่องโหว่อยู่อีกที่ แถมยังมีสคริปต์ AI เฉพาะกิจที่ไม่มีบันทึกตรวจสอบ'] }],
    svg: LS.ground(G) + ICONS.map(function (c, i) { return LS.icg({ n: c[0], x: c[1], y: c[2], s: 90, tone: c[0] === 'bug' ? 'r' : 'w', b: 1, d: i * .1 }); }).join('') +
      LS.A({ id: 'h', role: 'engineer', x: 960, y: G, s: 1.3, act: '1:loop(panic)' }) +
      LS.A({ id: 'x', role: 'attacker', x: 1990, y: G, s: 1.2, face: -1, b: 2, act: '2:sneak(1720,1.4) 2+1.4:pose(peek,.4)' }),
    labs: [{ b: 2, d: .9, c: 1, x: 960, y: 884, tone: 'r', text: ['43% of breached organizations had shadow-AI incidents (IBM 2026)', '43% ขององค์กรที่เกิดเหตุรั่วไหล มีการใช้ AI นอกระบบกำกับดูแล (IBM 2026)'] }],
    t: [2.8, 2.2, 3.4] },

  /* 6.2 Infographic Arena: Usual Stack vs Light Ops */
  { tpl: 'comparison', bg: 'sprawl-vs-one', bgo: .38, shade: 'full',
    kick: ['Architectural Comparison', 'เปรียบเทียบสถาปัตยกรรมแบบหมัดต่อหมัด'],
    title: ['A patchwork of tools vs one governed platform', 'ระบบแยกส่วนแบบเดิม เทียบกับแพลตฟอร์มเดียวที่มีสายจูงกำกับ'],
    left: { k: ['Status Quo', 'รูปแบบที่พบทั่วไป'], head: ['Siloed Tools + Raw AI', 'เครื่องมือแยกส่วน + AI ไร้ด่านกั้น'], icon: 'layers', tone: 'r', mark: 'x',
      metric: '5+', unit: ['disconnected consoles', 'หน้าจอที่ไม่คุยกัน'],
      rows: [
        ['Separate products to watch, scan, ticket, and patch', 'แยกเครื่องมือมอนิเตอร์ สแกนช่องโหว่ เปิดเคส และอัปเดตแพตช์'],
        ['AI agents given admin keys without a server plan gate', 'ปล่อยให้เอเจนต์ AI ถือกุญแจแอดมินโดยไม่มีด่านตรวจแผนงาน'],
        ['Logs and prompts shipped out to external cloud AI', 'ส่งล็อกและข้อมูลภายในออกไปประมวลผลบนคลาวด์ AI ภายนอก'],
        ['Agents to install and maintain on every Linux server', 'ต้องคอยติดตั้งและอัปเดตโปรแกรมเอเจนต์บนเซิร์ฟเวอร์ทุกเครื่อง']
      ] },
    right: { k: ['Governed Ops', 'แนวทางของ Light Ops'], head: ['Light\u00A0Ops Platform', 'แพลตฟอร์ม Light\u00A0Ops'], icon: 'shieldCheck', tone: 'c', mark: 'check',
      metric: '1', unit: ['governed control loop', 'วงจรเดียวครบจบในบ้านคุณ'],
      rows: [
        ['See, watch (15s), test, fix on Go, and prove in one place', 'สำรวจ เฝ้าระวังทุก 15 วินาที ทดสอบ แก้ไขเมื่อกด Go และเก็บหลักฐานครบ'],
        ['Signed AI session bound to an approved plan at the gate', 'เซสชัน AI ลงลายเซ็น ผูกติดกับแผนที่อนุมัติผ่านประตูด่านตรวจ'],
        ['Refractor cyber model runs locally on your own GPU', 'โมเดลไซเบอร์ Refractor รันบน GPU ขององค์กรคุณเองแบบออฟไลน์'],
        ['Connects to Linux hosts over SSH with zero agent install', 'เชื่อมต่อเซิร์ฟเวอร์ Linux ผ่าน SSH มาตรฐาน ไม่ต้องลงเอเจนต์']
      ] } },

  /* 6.3 Product proof: Live operational & security monitoring */
  { tpl: 'shot', img: 'monitors', side: 'right', w: 940, tw: 640, top: 148, imgTop: 158,
    caption: ['Unified Service, Log & Capacity Monitors', 'หน้าจอมอนิเตอร์บริการ ล็อก และความจุในที่เดียว'],
    kick: ['Day-2 Operations Built In', 'ดูแลงานปฏิบัติการรายวันครบวงจร'],
    title: ['Everything the night shift needs before an outage happens', 'ครบทุกเครื่องมือที่ทีมกะดึกต้องใช้ ก่อนที่ปัญหาจะบานปลายเป็นระบบล่ม'],
    points: [
      ['Log monitoring lanes, application performance findings, and P10/P50/P90 capacity forecasts.', 'ตรวจจับความผิดปกติจากล็อก วิเคราะห์คอขวดประสิทธิภาพ และพยากรณ์ความจุล่วงหน้า'],
      ['Version-pinned runbooks, Ansible playbooks, workflows, and standing maintenance windows.', 'รองรับทั้ง Runbook มาตรฐาน Ansible เวิร์กโฟลว์อัตโนมัติ และตารางเวลาซ่อมบำรุงที่ล็อกไว้ชัดเจน']
    ],
    dots: [{ x: 32, y: 34, b: 1 }, { x: 68, y: 58, b: 2 }] },

  /* 6.4 Enterprise Integration & Deployment Pillars (D01-D06, D08, D09, G09) */
  { tpl: 'cards', bg: 'server-room', bgo: .34, shade: 'full', cols: 4, top: 280, bottom: 205, together: 1,
    kick: ['Enterprise Fit', 'พร้อมเชื่อมต่อเข้ากับโครงสร้างองค์กร'],
    title: ['Fits your security stack and runs on your own hardware', 'เชื่อมกับระบบรักษาความปลอดภัยเดิมได้ทันที และรันบนเครื่องของคุณเอง'],
    cards: [
      { icon: 'key', tone: 'c', h: ['Vault & CyberArk', 'Vault และ CyberArk'],
        p: ['Resolves credentials over HTTPS at use-time without storing customer secret values on disk.', 'ดึงรหัสผ่านผ่าน HTTPS เฉพาะตอนใช้งานจริง โดยไม่เขียนรหัสลับของลูกค้าลงดิสก์'] },
      { icon: 'chart', tone: 'c', h: ['OCSF SIEM Export', 'ส่งออกข้อมูลสู่ SIEM'],
        p: ['Opt-in OCSF 1.9.0 security and compliance event streaming over OTLP/HTTP.', 'ส่งออกเหตุการณ์ความปลอดภัยและผลตรวจตามมาตรฐาน OCSF 1.9.0 เข้าสู่ SIEM ที่คุณเลือก'] },
      { icon: 'people', tone: 'a', h: ['Enterprise OIDC & RBAC', 'SSO และสิทธิ์ระดับองค์กร'],
        p: ['Connects Entra, Okta, Keycloak, or Google OIDC with Kubernetes-style role bindings.', 'รองรับการล็อกอินองค์กรผ่าน OIDC หลากหลายผู้ให้บริการ พร้อมแบ่งสิทธิ์แบบ Kubernetes'] },
      { icon: 'server', tone: 'g', h: ['Single-Tenant On-Prem', 'ติดตั้งในศูนย์ข้อมูลของคุณ'],
        p: ['Ships as Docker Compose, KVM qcow2, VMware OVA, or Nutanix AHV (turnkey Light\u00A0Ops Box in development).', 'รองรับ Docker Compose, KVM, VMware OVA และ Nutanix AHV (ชุดฮาร์ดแวร์สำเร็จรูป Light\u00A0Ops Box อยู่ระหว่างพัฒนา)'] }
    ],
    banner: { b: 2, tone: 'c', icon: 'lock', k: ['Remote AI Only by Choice', 'ควบคุมการเชื่อมต่อภายนอกได้ 100%'],
      text: ['External cloud AI stays off unless your operator explicitly enables it with your own API key.', 'การเชื่อมต่อ AI ภายนอกถูกปิดไว้เป็นค่าเริ่มต้น และจะเปิดได้ก็ต่อเมื่อผู้ดูแลของคุณสั่งเปิดด้วยคีย์ขององค์กรคุณเองเท่านั้น'] } },

  /* 6.5 Closing Wedge Statement (co-visible scope on zero-divergence line) */
  { tpl: 'statement', mid: 1, icon: 'shieldCheck', bg: 'flow-leash-gate', bgo: .38, shade: 'full',
    kick: ['The Light Ops Wedge', 'หัวใจที่ทำให้ Light Ops แตกต่าง'],
    text: ['Anyone can bolt AI onto operations. <em class="c">We built operations around a leash.</em>', 'ใครก็นำ AI มาแปะทับงานดูแลระบบได้ <em class="c">แต่เราสร้างระบบปฏิบัติการขึ้นมารอบสายจูงตั้งแต่ต้น</em>'],
    lines: [['On your servers, our incident AI follows your approved plan byte for byte, with 0 commands outside it.', 'บนเซิร์ฟเวอร์ของคุณ AI ที่ดูแลเหตุการณ์ของเราทำตามแผนที่คุณอนุมัติทุกไบต์ โดยไม่มีคำสั่งนอกแผนแม้แต่คำสั่งเดียว']] }
  ] });
})();
