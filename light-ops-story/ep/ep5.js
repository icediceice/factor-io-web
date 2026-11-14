/* EP5 One Night, Two Attacks: 02:47 AM SSH password-spray + successful login caught by hour-of-week
   behavioral baseline (O09, O16), auto-opened incident + phone Go + verified UP (O02, O15),
   03:10 AM KEV CVE matched via signed offline feed (V01-V03), pinned maintenance-window runbook +
   frozen Check/Go (V05, O13, O03), and full night-shift audit timeline. Zero em/en dashes. */
(function () {
var G = 940;

LS.ep({ no: 5, title: ['02:47 AM · Night Watch', '02:47 น. คืนเดียว สองการโจมตี'],
  blurb: ['Watch how Light Ops handles two real-world night attacks with your team’s Go.', 'ตามติดการทำงานกะดึกของ Light Ops เมื่อเกิดเหตุบุกรุกซ้อนสองระลอกในคืนเดียว'],
  shots: [
  /* 5.1 02:47 AM Attack 1 + Google Flow loop (night-watch-0247) */
  { bg: 'flow-night-watch', flow: 'night-watch-0247', bgo: .7, shade: 'top',
    caps: [{ pos: 'top', b: 0, w: 1320, tone: 'r', k: ['02:47 AM · Attack One', '02:47 น. · การโจมตีระลอกที่ 1'],
      h: ['An automated SSH password spray hits a production server.', 'บอตระดมสุ่มรหัสผ่าน SSH ถล่มเซิร์ฟเวอร์กลางดึก จนหลุดเข้าได้หนึ่งบัญชี'],
      p: ['Light\u00A0Ops knows this host’s normal Tuesday 02:00 rhythm, so the burst flags immediately.', 'Light\u00A0Ops รู้จังหวะปกติของเครื่องนี้ในคืนวันอังคาร จึงจับความผิดปกติได้ทันทีที่เริ่มเกิดเหตุ'] }],
    svg: LS.ground(G) + LS.rack({ x: 1380, y: 548 }) +
      LS.flow({ d: 'M440,760 C700,640 1040,640 1370,700', n: 7, dur: 1.4, tone: 'r', b: 1 }) +
      LS.icg({ n: 'bell', x: 1300, y: 600, s: 72, tone: 'a', b: 3 }) +
      LS.A({ id: 'x', role: 'attacker', x: 300, y: G, s: 1.25, hold: 'laptop', pose: 'type', act: '0:loop(type)' }) +
      LS.A({ id: 'g', role: 'guardian', x: 1990, y: G, s: 1.25, face: -1, act: '3:run(1720,.8) 3+0.8:pose(guard,.4)' }),
    labs: [{ b: 2, c: 1, x: 880, y: 560, tone: 'a', text: ['Burst of failed logins, then 1 unexpected login', 'ล็อกอินพลาดรัวติดกัน ก่อนหลุดเข้าได้ 1 ครั้ง'] },
           { b: 3, d: .5, r: 60, y: 468, tone: 'c', text: ['Hour-of-week baseline anomaly triggered', 'ผิดไปจากพฤติกรรมปกติรายสัปดาห์ของเครื่องนี้'] }],
    t: [2.8, 2, 2.2, 2.8] },

  /* 5.2 02:55 AM Incident, exact plan, on-call engineer gives Go from phone */
  { bg: 'office-night', bgo: .4, shade: 'full',
    caps: [{ pos: 'top', b: 0, w: 1260, k: ['02:55 AM · Contained on Your Go', '02:55 น. · ส่งแผนให้คนกด Go จากมือถือ'],
      h: ['Light\u00A0Ops diagnoses the root cause and drafts the exact fix.', 'ระบบเปิดเคสอัตโนมัติ วินิจฉัยต้นตอ และร่างคำสั่งระงับเหตุส่งถึงวิศวกรเวร'],
      p: ['Your on-call engineer taps Go, the bounded fix runs on your servers, and health checks confirm UP.', 'วิศวกรเวรตรวจทานแล้วกด Go คำสั่งรันตามแผนทุกตัวอักษร พร้อมตรวจยืนยันว่าระบบกลับมาปกติ'] }],
    svg: LS.ground(G) +
      '<rect class="s-box" x="250" y="870" width="480" height="40" rx="10"/><rect class="s-box" x="262" y="842" width="110" height="28" rx="10"/><path class="s-line" d="M270,910 V940 M710,910 V940"/>' +
      LS.rack({ x: 1400, y: 548, bad: 3, out: 4 }) + LS.rack({ x: 1400, y: 548, b: 4 }) +
      LS.icg({ n: 'bell', x: 560, y: 700, s: 64, tone: 'a', b: 1, out: 3 }) +
      LS.arrow({ x1: 1180, y1: 640, x2: 640, y2: 640, bend: 60, tone: 'c', b: 1 }) +
      LS.arrow({ x1: 640, y1: 770, x2: 1180, y2: 770, bend: 60, tone: 'g', b: 3 }) +
      LS.zzz({ x: 470, y: 760, b: 4, d: .8 }) +
      LS.A({ id: 'h', role: 'engineer', x: 430, y: 870, s: 1.2, seat: 1, hold: 'phone', pose: 'sit+sleep', act: '0:loop(snore) 1:loop(none) 1:pose(sit+hold,.4) 3:pose(sit+pointup,.4) 4:pose(sit+sleep,.6) 4+0.6:loop(snore)' }) +
      LS.A({ id: 'a', role: 'lightagent', x: 1290, y: G, s: 1.2, face: -1, hold: 'scroll', pose: 'hold' }),
    labs: [{ b: 1, d: .4, c: 1, x: 910, y: 516, tone: 'c', text: ['Scoped containment plan ready', 'แผนระงับเหตุพร้อมให้ตรวจทีละบรรทัด'] },
           { b: 3, d: .4, c: 1, x: 910, y: 806, tone: 'g', text: ['Operator Go approved', 'วิศวกรเวรกดอนุมัติ Go'] },
           { b: 4, r: 60, y: 468, tone: 'g', text: ['Contained · Every service probe UP', 'ระงับเหตุสำเร็จ · ทุกบริการทำงานปกติ'] }],
    t: [2.8, 2.4, 1.8, 2.2, 3] },

  /* 5.3 03:10 AM Attack 2: KEV CVE matched via signed offline bundle */
  { tpl: 'shot', img: 'cve-panel', side: 'right', w: 500, tw: 1060, top: 150, imgTop: 150,
    caption: ['Signed Offline CVE & KEV Match', 'จับคู่ช่องโหว่ KEV จากฐานข้อมูลออฟไลน์ที่มีลายเซ็น'],
    kick: ['03:10 AM · Exposure Two', '03:10 น. · ตรวจพบช่องโหว่วิกฤตชุดใหม่'],
    title: ['A newly weaponized CVE matches packages on your fleet', 'ช่องโหว่ใหม่ที่มีรายงานถูกเจาะจริง ตรงกับแพ็กเกจบนเครื่องของคุณ'],
    points: [
      ['Signed offline vulnerability feeds match installed versions without exposing host inventories to the internet.', 'เทียบรายการซอฟต์แวร์กับฐานข้อมูล CVE ที่มีลายเซ็นกำกับแบบออฟไลน์ ไม่ต้องส่งข้อมูลเครื่องออกสู่อินเทอร์เน็ต'],
      ['Light\u00A0Ops prepares a version-pinned runbook queued for your approved maintenance window.', 'เตรียม Runbook ที่ล็อกเวอร์ชันแพตช์เป้าหมายไว้ล่วงหน้า รอเข้าสู่หน้าต่างเวลาซ่อมบำรุงที่คุณกำหนด']
    ],
    dots: [{ x: 40, y: 90, b: 1 }],
    note: ['Lab host screenshot showing known-exploited vulnerability status.', 'ภาพจากเครื่องทดสอบแสดงการแจ้งเตือนช่องโหว่ที่มีการโจมตีจริง (KEV)'] },

  /* 5.4 Infographic Event Timeline: Full Night Shift Replay */
  { tpl: 'eventTimeline', bg: 'server-room', bgo: .45, shade: 'full',
    kick: ['Night-Shift Replay', 'สรุปไทม์ไลน์การทำงานตลอดคืน'],
    title: ['Machine speed for preparation, human control at execution', 'เตรียมการด้วยความเร็วเครื่องจักร อนุมัติรันจริงด้วยอำนาจของทีมคุณ'],
    events: [
      { time: '02:47', badge: ['Anomaly', 'ตรวจจับผิดปกติ'], icon: 'pulse', tone: 'r',
        title: ['SSH burst detected', 'จับการสุ่มรหัสผ่าน SSH'],
        text: ['15-second watch and weekly rhythm baseline catch the intrusion in seconds.', 'ระบบตรวจทุก 15 วินาทีเทียบพฤติกรรมรายสัปดาห์ จับสัญญาณบุกรุกได้ทันที'] },
      { time: '02:55', badge: ['Phone Go', 'กด Go จากมือถือ'], icon: 'key', tone: 'c',
        title: ['Approved containment', 'อนุมัติแผนระงับเหตุ'],
        text: ['On-call engineer approves the exact plan; our incident AI executes on your servers and verifies UP.', 'วิศวกรเวรกด Go บนมือถือ AI ที่ดูแลเหตุการณ์รันตามแผนบนเซิร์ฟเวอร์คุณและตรวจยืนยันสถานะ UP'] },
      { time: '03:30', badge: ['Pinned Patch', 'เตรียมแพตช์ล่วงหน้า'], icon: 'calendar', tone: 'a',
        title: ['Runbook staged for window', 'ล็อกแพตช์รอเวลาซ่อมบำรุง'],
        text: ['KEV package fix is frozen via Check inside your scheduled patch window, awaiting Go.', 'ล็อกเวอร์ชันแพตช์และแช่แข็งชุดงานในขั้น Check ตามตารางซ่อมบำรุง รอทีมกด Go'] },
      { time: '07:30', badge: ['Audit Ready', 'หลักฐานครบถ้วน'], icon: 'stamp', tone: 'g',
        title: ['Morning briefing & proof', 'สรุปผลเช้าพร้อมบันทึกตรวจ'],
        text: ['Every alert, diff, approver, and health probe sits in the tamper-evident record.', 'ทุกการแจ้งเตือน ส่วนต่างการแก้ไข ชื่อผู้อนุมัติ และผลตรวจสุขภาพถูกบันทึกครบทุกบรรทัด'] }
    ],
    banner: { b: 5, tone: 'g', icon: 'shieldCheck', k: ['Zero Unapproved Actions', 'ไม่มีการเปลี่ยนระบบโดยพลการ'],
      text: ['On your servers, 0 commands from our incident AI ran outside the approved plan all night.', 'ตลอดทั้งคืน บนเซิร์ฟเวอร์ของคุณ มีคำสั่งนอกแผนที่อนุมัติจาก AI ที่ดูแลเหตุการณ์ของเราหลุดรัน 0 คำสั่ง'] } },

  /* 5.5 Closing Statement */
  { tpl: 'statement', mid: 1, icon: 'moon', tone: 'g', bg: 'flow-night-watch', bgo: .38, shade: 'full',
    kick: ['07:30 AM · Calm Morning', '07:30 น. · เช้าวันทำงานที่ไม่ต้องดับไฟ'],
    text: ['Two threats handled. Full sleep preserved. <em class="g">Every step on record.</em>', 'รับมือครบสองเหตุการณ์ ทีมไม่ต้องตื่นมาไล่ดับไฟทั้งคืน <em class="g">พร้อมหลักฐานครบทุกขั้นตอน</em>'],
    lines: [['That is the difference between noisy alerts and governed operations.', 'นี่คือความต่างระหว่างเครื่องมือที่ทำได้แค่ส่งเสียงเตือน กับแพลตฟอร์มปฏิบัติการที่มีสายจูงกำกับ']] }
  ] });
})();
