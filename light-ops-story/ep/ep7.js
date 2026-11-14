/* EP7 Factor I O Co., Ltd. (บริษัท แฟคเคอร์ ไอ โอ จำกัด): principal-led engineering from design
   through delivery, vendor-neutral Kubernetes (OpenShift, NKP, upstream), Thai data sovereignty &
   PDPA sections 28/29 cross-border framing, ground-up enterprise AI, 4 standalone engagement
   stages (Assess, Design, Pilot, Run), and direct contact. Strictly inside service-offer-spec.md
   section 8 limits. Zero em/en dashes. */
(function () {
var T = LS.T, G = 940;

LS.ep({ no: 7, title: ['Factor I O Services', 'บริการจาก แฟคเคอร์ ไอ โอ'],
  blurb: ['Sovereign Kubernetes, Private AI, and Cyber Operations inside Thailand.', 'วางระบบ Kubernetes, Private AI และงานดูแลความปลอดภัยในประเทศไทย โดยสถาปนิกผู้ลงมือทำจริง'],
  shots: [
  /* 7.1 Same Principal Architect from Presales Design to Delivery */
  { bg: 'river-city', bgo: .45, shade: 'full',
    caps: [{ pos: 'top', b: 0, w: 1380, k: ['Factor I O Co., Ltd. · บริษัท แฟคเคอร์ ไอ โอ จำกัด', 'บริษัท แฟคเคอร์ ไอ โอ จำกัด · Factor I O Co., Ltd.'],
      h: ['The architect who designs it is the engineer who builds it.', 'สถาปนิกที่ออกแบบระบบให้คุณ คือวิศวกรคนเดียวกับที่ลงมือสร้างจริง'],
      p: ['Vendor-neutral architecture: an OpenShift shop gets an OpenShift design, an NKP shop gets an NKP design.', 'เป็นกลางไม่ผูกขาดผู้ขาย: องค์กรที่ใช้ OpenShift จะได้สถาปัตยกรรมที่เหมาะกับ OpenShift และองค์กรที่ใช้ NKP จะได้แบบที่เหมาะกับ NKP'] }],
    svg: LS.ground(G) + LS.plan({ x: 200, y: 560, w: 260, h: 320, lines: 5 }) + LS.rack({ x: 1460, y: 548 }) +
      LS.A({ id: 'e', role: 'engineer', x: 560, y: G, s: 1.25, face: -1, hold: 'clipboard', pose: 'present', act: '1:walk(1340,2.2) 1+2.3:face(1) 1+2.3:pose(reach,.4) 2:pose(cheer,.5)' }),
    labs: [{ c: 1, x: 330, y: 478, tone: 'c', text: ['Presales & Architecture', 'ออกแบบและพรีเซลส์'] },
           { b: 1, d: 2.3, c: 1, x: 1570, y: 468, tone: 'g', text: ['Production Delivery', 'ลงมือติดตั้งและส่งมอบจริง'] },
           { b: 2, c: 1, x: 950, y: 598, tone: 'a', text: ['Zero bait-and-switch handover', 'คนเดียวกันดูแลตั้งแต่ต้นจนจบ ไม่ส่งต่องานทิ้งกลางคัน'] }],
    t: [3.2, 3, 2.6] },

  /* 7.2 Infographic Diagram: Thailand Data Sovereignty & PDPA Sections 28 and 29 */
  { tpl: 'diagram', bg: 'thailand-grid', bgo: .46, shade: 'full',
    kick: ['Private AI & Data Residency', 'AI ส่วนตัวและอธิปไตยข้อมูลในประเทศไทย'],
    title: ['Keep operational logs and personal data inside Thailand', 'เก็บข้อมูลปฏิบัติการและข้อมูลส่วนบุคคลไว้ในศูนย์ข้อมูลในไทยของคุณเอง'],
    zones: [
      { x: 110, y: 278, w: 1070, h: 510, tone: 'g', icon: 'lock', b: 0,
        label: ['Inside Thailand · Your Data Centre', 'ภายในประเทศไทย · ศูนย์ข้อมูลของคุณ'] },
      { x: 1230, y: 278, w: 580, h: 510, tone: 'r', dashed: 1, icon: 'globe', b: 1,
        label: ['Overseas Cloud AI', 'คลาวด์ AI ในต่างประเทศ'] }
    ],
    nodes: [
      { id: 'hq', x: 375, y: 552, w: 430, h: 244, icon: 'building', tone: 'c', b: 1,
        k: ['Enterprise Sources', 'ข้อมูลสำคัญขององค์กร'],
        h: ['Records, tickets & logs', 'เอกสารภายในและล็อกระบบ'],
        p: ['Customer records, internal runbooks, source code, and server telemetry generated in Thailand.', 'ข้อมูลลูกค้า เอกสารคู่มือ ซอร์สโค้ด และข้อมูลการทำงานของเซิร์ฟเวอร์ในองค์กร'] },
      { id: 'priv', x: 905, y: 552, w: 430, h: 244, icon: 'chip', tone: 'g', b: 2,
        k: ['Private AI Platform', 'ประมวลผลบนเครื่องของคุณ'],
        h: ['Served on local GPUs', 'รันโมเดลภายในประเทศ'],
        p: ['Private LLM serving, Thai RAG, and Light\u00A0Ops Refractor process everything inside your boundary.', 'ระบบถามตอบองค์กรและโมเดลไซเบอร์ Refractor ประมวลผลบน GPU ในศูนย์ข้อมูลของคุณเอง'] },
      { id: 'ext', x: 1520, y: 552, w: 460, h: 244, icon: 'cloud', tone: 'r', b: 1,
        k: ['Cross-Border Risk', 'ความเสี่ยงการส่งข้อมูลข้ามแดน'],
        h: ['PDPA sections 28 & 29', 'พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล มาตรา 28 และ 29'],
        p: ['Sending personal data in prompts to an AI hosted abroad can constitute a cross-border data transfer.', 'การส่งข้อมูลส่วนบุคคลผ่านคำสั่งถามตอบไปยัง AI ในต่างประเทศ อาจเข้าข่ายการโอนข้อมูลข้ามประเทศตามมาตรา 28 และ 29'] }
    ],
    edges: [
      { from: 'hq', to: 'priv', tone: 'g', b: 2, flow: 1, labelY: 386, label: ['Stays on-prem', 'อยู่ภายในองค์กร'] },
      { from: 'priv', to: 'ext', tone: 'r', b: 3, blocked: 1, labelY: 386, label: ['No outbound prompts', 'ไม่ส่งข้อมูลออกนอกประเทศ'] }
    ],
    banner: { b: 3, tone: 'g', icon: 'shieldCheck', k: ['Architectural Control', 'ควบคุมเส้นทางข้อมูลได้ตั้งแต่สถาปัตยกรรม'],
      text: ['Private AI keeps prompts, embeddings, and operational telemetry inside your Thai environment.', 'Private AI ช่วยให้คำถาม เอกสารอ้างอิง และข้อมูลระบบทั้งหมดไม่รั่วไหลออกนอกขอบเขตองค์กรในไทย'] } },

  /* 7.3 Practice Pillars (Spec sections 2.1, 2.2, 2.3, 3) */
  { tpl: 'cards', bg: 'server-room', bgo: .34, shade: 'full', cols: 3, top: 280, together: 1,
    kick: ['Core Engineering Practice', 'ขอบเขตงานวิศวกรรมที่เชี่ยวชาญ'],
    title: ['Build the platform, secure the hosts, and deploy useful Private AI', 'วางรากฐานแพลตฟอร์ม ปกป้องเซิร์ฟเวอร์ และสร้าง Private AI ที่ใช้งานได้จริง'],
    cards: [
      { icon: 'cube', tone: 'c',
        h: ['Kubernetes & GPU Infrastructure', 'ระบบ Kubernetes และคลัสเตอร์ GPU'],
        p: ['OpenShift, Nutanix NKP, or upstream Kubernetes on bare metal or VMs, air-gapped or connected, with GPU scheduling and Day-2 upgrades.', 'ออกแบบและติดตั้ง OpenShift, NKP หรือ Kubernetes มาตรฐาน ทั้งแบบเชื่อมต่อและ Air-gapped พร้อมจัดการ GPU และแผนดูแลระยะยาว'] },
      { icon: 'shieldCheck', tone: 'g',
        h: ['Security Assessments & Run Ops', 'ประเมินความปลอดภัยและดูแลระบบ'],
        p: ['Authorized assessments powered by Light\u00A0Ops, 24/7 monitoring, patch windows, and server-enforced AI governance.', 'ตรวจประเมินช่องโหว่ที่ได้รับอนุญาตด้วย Light\u00A0Ops เฝ้าระวังต่อเนื่อง จัดรอบแพตช์ และวางระบบกำกับสิทธิ์ AI'] },
      { icon: 'book', tone: 'a',
        h: ['Enterprise Knowledge & Thai AI', 'ระบบความรู้องค์กรและ AI ภาษาไทย'],
        p: ['Permission-aware knowledge bases, Thai chatbots on LINE and web, document extraction, and private model sizing, serving, and fine-tuning.', 'สร้างฐานความรู้ที่เคารพสิทธิ์ผู้อ่าน แชตบอตภาษาไทยบน LINE และเว็บ ระบบสกัดข้อมูลเอกสาร ไปจนถึงการปรับจูนโมเดลส่วนตัว'] }
    ] },

  /* 7.4 Product proof: Compliance & Partner / Team Enablement */
  { tpl: 'shot', img: 'compliance-result', side: 'right', w: 940, tw: 640, top: 148, imgTop: 210,
    caption: ['Compliance Evidence & Handover Readiness', 'หลักฐานผลการตรวจสอบและความพร้อมในการส่งมอบ'],
    kick: ['Direct or Partner-Led Delivery', 'ทำงานร่วมกับทั้งองค์กรโดยตรงและพันธมิตร SI'],
    title: ['Built so your own engineers can run what gets delivered', 'สร้างระบบพร้อมถ่ายทอดความรู้ เพื่อให้ทีมของคุณเป็นเจ้าของและดูแลต่อได้จริง'],
    points: [
      ['Clear SCAP and configuration baselines, runbooks, and architecture documentation.', 'ส่งมอบพร้อมผลตรวจมาตรฐานความปลอดภัย คู่มือปฏิบัติการ Runbook และเอกสารสถาปัตยกรรมครบถ้วน'],
      ['Available directly to enterprises or as Principal Presales & Delivery Architect alongside vendors and system integrators.', 'รับงานได้ทั้งกับองค์กรโดยตรง หรือร่วมทีมในฐานะสถาปนิกพรีเซลส์และส่งมอบเคียงข้างผู้ค้าและ SI']
    ],
    dots: [{ x: 36, y: 42, b: 1 }, { x: 74, y: 42, b: 2 }] },

  /* 7.5 Infographic Event Timeline: Four Standalone Engagement Stages (Spec section 3) */
  { tpl: 'eventTimeline', bg: 'night-city', bgo: .38, shade: 'full',
    kick: ['How to Start', 'เริ่มต้นร่วมงานได้ง่ายทีละขั้น'],
    title: ['Four standalone stages, bought one step at a time', '4 ขั้นตอนชัดเจน เลือกเริ่มเฉพาะขั้นที่ต้องการได้โดยไม่ผูกมัด'],
    sub: ['Start with a focused Assess engagement to uncover the real bottleneck before committing to a build.', 'แนะนำให้เริ่มจากขั้น Assess ขนาดกะทัดรัด เพื่อชี้เป้าคอขวดและความเสี่ยงจริงจากหน้างานก่อนตัดสินใจลงทุนใหญ่'],
    events: [
      { time: '01 · Assess', badge: ['Find the Gap', 'ค้นหาจุดเสี่ยงจริง'], icon: 'search', tone: 'a',
        title: ['Architecture & security check', 'สำรวจระบบและประเมินช่องโหว่'],
        text: ['Inspect live hosts, cluster posture, or AI data paths to isolate the true gap.', 'ตรวจสภาพจริงของเซิร์ฟเวอร์ คลัสเตอร์ หรือเส้นทางข้อมูล AI เพื่อระบุปัญหาที่แท้จริง'] },
      { time: '02 · Design', badge: ['Blueprint', 'พิมพ์เขียวพร้อมสร้าง'], icon: 'plan', tone: 'c',
        title: ['Vendor-neutral specification', 'ออกแบบสถาปัตยกรรมที่เป็นกลาง'],
        text: ['Hardware sizing, network & identity boundary, and Day-2 operating design.', 'คำนวณขนาดเครื่อง ขอบเขตเครือข่ายและสิทธิ์ รวมถึงแผนดูแลรักษาระยะยาว'] },
      { time: '03 · Pilot', badge: ['Prove on Your Data', 'พิสูจน์กับข้อมูลจริง'], icon: 'rocket', tone: 'c',
        title: ['Bounded production proof', 'ทดสอบใช้งานจริงในขอบเขตที่คุมได้'],
        text: ['Validate accuracy, latency, and governance gates on your real workloads.', 'วัดผลความแม่นยำ ความเร็ว และด่านอนุมัติกับข้อมูลและงานจริงขององค์กรคุณ'] },
      { time: '04 · Run', badge: ['Operate or Hand Over', 'ดูแลต่อเนื่องหรือส่งมอบ'], icon: 'shieldCheck', tone: 'g',
        title: ['Ongoing ops or enablement', 'ดูแลระยะยาวหรืออบรมส่งมอบทีม'],
        text: ['Managed Run operations with Light\u00A0Ops, or full workshop handover to your team.', 'เลือกให้ช่วยดูแลระบบต่อเนื่องด้วย Light\u00A0Ops หรือจัดเวิร์กช็อปถ่ายทอดให้ทีมคุณดูแลเองเต็มตัว'] }
    ] },

  /* 7.6 Contact & Direct CTA (Brochure page 4 + Registered Thai Entity Name) */
  { tpl: 'statement', mid: 1, box: 'bottom:164px', icon: 'chat', bg: 'port-night', bgo: .42, shade: 'full',
    kick: ['Factor I O Co., Ltd. · บริษัท แฟคเคอร์ ไอ โอ จำกัด', 'บริษัท แฟคเคอร์ ไอ โอ จำกัด · Factor I O Co., Ltd.'],
    text: ['Speak directly with the engineer who designs and builds your system.', 'พูดคุยโดยตรงกับวิศวกรผู้ทำหน้าที่ทั้งออกแบบและลงมือสร้างระบบจริง'],
    lines: [
      ['Book a private Light\u00A0Ops walkthrough or an Assess session on your Linux and Kubernetes environment.', 'นัดหมายชมการสาธิต Light\u00A0Ops แบบส่วนตัว หรือเริ่มประเมินระบบ Linux และ Kubernetes ขององค์กรคุณ'],
      { size: 'm', text: ['Thanat Manasakool · Web <em class="c">factor-io.com</em> · Email <em class="c">admin@factor-io.com</em> · LINE <em class="c">icediceice</em>', 'ธนัท มนัสกูล · เว็บไซต์ <em class="c">factor-io.com</em> · อีเมล <em class="c">admin@factor-io.com</em> · LINE <em class="c">icediceice</em>'] }
    ],
    html: '<a class="nextbtn fx-up" data-b="3" href="#hub" style="left:50%;bottom:74px;translate:-50% 0">' + T(['All episodes', 'ดูครบทุกตอน']) + LS.ic('grid') + '</a>' }
  ] });
})();
