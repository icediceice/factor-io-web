/* EP1 Cyber 101 & Threat Urgency: the digital building metaphor, how one unpatched CVE halts
   operations, collapsed exploit/breakout clocks (CrowdStrike 2026), and record breach impact
   (IBM Cost of a Data Breach Report 2026). Zero em/en dashes. */
(function () {
var G = 940;
var TW = { x: 1320, cols: 5, rows: 8, door: 1, seed: 1, lit: 5 };
TW.y = G - LS.towerSize(TW)[1];
var DX = 1360;
var DOOR = '<rect class="s-box" x="' + (DX - 120) + '" y="470" width="240" height="470" rx="6"/><circle class="s-cyan" cx="' + (DX + 92) + '" cy="720" r="8"/>';

LS.ep({ no: 1, title: ['Cyber Reality 101', 'ความจริงภัยไซเบอร์ยุคใหม่'],
  blurb: ['Why one unlocked digital window can halt business in 27 seconds.', 'ทำไมช่องโหว่เพียงจุดเดียวจึงหยุดธุรกิจได้ใน 27 วินาที'],
  shots: [
  /* 1.1 Title + Flow storm loop: company = digital building */
  { tpl: 'title', bg: 'flow-cyber-storm', flow: 'cyber-storm', bgo: .78, w: 1120, top: 126,
    title: ['Your business lives inside a digital building.', 'ธุรกิจของคุณเดินเครื่องอยู่ในตึกดิจิทัล'],
    sub: ['Servers are workrooms. Network ports are doors. Software is every lock keeping revenue moving.', 'เซิร์ฟเวอร์คือห้องทำงาน พอร์ตเชื่อมต่อคือประตู และซอฟต์แวร์คือกุญแจทุกดอกที่คุ้มกันรายได้ไม่ให้สะดุด'],
    badge: ['2026 Reality: One open window can freeze operations overnight', 'ความจริงปี 2026: หน้าต่างที่เปิดค้างบานเดียว หยุดงานทั้งองค์กรได้ในชั่วข้ามคืน'],
    badgeTone: 'r', badgeIcon: 'bolt',
    svg: LS.ground(G) + LS.tower(TW) +
      LS.A({ id: 'e', role: 'engineer', x: 1980, y: G, s: 1.22, face: -1, act: '1:walk(1780) 1+1:pose(present,.5)' }),
    t: [2.6, 3.6, 3.4] },

  /* 1.2 Flaw -> CVE -> Patch stickman scene */
  { bg: 'night-city', bgo: .35, shade: 'full',
    caps: [{ pos: 'top', b: 0, out: 2, k: ['Software Flaw', 'จุดบกพร่องในซอฟต์แวร์'], h: ['Every software lock can hide a crack.', 'กุญแจซอฟต์แวร์ทุกดอกอาจมีรอยร้าวซ่อนอยู่'] },
           { pos: 'top', b: 2, out: 3, tone: 'a', k: ['Public Notice · CVE', 'ประกาศเตือนสาธารณะ · CVE'], h: ['When discovered, the world gets a CVE alert at the same moment.', 'เมื่อมีผู้ค้นพบ โลกจะเห็นประกาศเตือน CVE พร้อมกันทันที'] },
           { pos: 'top', b: 3, tone: 'g', k: ['The Patch', 'การอัปเดตแพตช์'], h: ['A patch replaces the broken lock before intruders use it.', 'แพตช์คือการเปลี่ยนแม่กุญแจชุดใหม่ให้ทันก่อนผู้บุกรุกเข้ามาใช้'] }],
    svg: LS.ground(G) + DOOR +
      LS.lock({ x: DX, y: 700, s: 1.6, fx: '', out: 3 }) +
      '<path class="crack draw" pathLength="1" data-b="1" data-out="3" d="M' + (DX - 14) + ',712 l16,22 l-14,16 l18,26"/>' +
      LS.icg({ n: 'bug', x: DX + 200, y: 640, s: 90, tone: 'r', b: 1, d: .3, out: 2 }) +
      LS.lock({ x: DX, y: 700, s: 1.6, b: 3, d: 1.8 }) +
      LS.icg({ n: 'check', x: DX, y: 540, s: 70, tone: 'g', b: 4 }) +
      '<g class="fx-pop" data-b="2" data-out="3"><path class="s-line" d="M570,730 V940 M870,730 V940"/><rect class="s-box" x="520" y="430" width="400" height="300" rx="14"/>' +
      '<text class="svgt" x="720" y="540" text-anchor="middle" style="font-size:72px;fill:#ffb547">CVE</text>' +
      '<path class="s-line" d="M580,600 H860 M580,644 H820 M580,688 H770"/></g>' +
      LS.A({ id: 'd', role: 'defender', x: 260, y: G, s: 1.25, hold: 'wrench', pose: 'think', act: '2:pose(hold,.4) 3:walk(1180,1.7) 3+1.7:pose(reach,.4) 4:pose(cheer,.5)' }) +
      LS.A({ id: 'x', role: 'attacker', x: 1720, y: G, s: 1.25, face: -1, hold: 'phone', pose: 'hold', b: 2, act: '4:pose(sad,.5)' }),
    labs: [{ b: 1, d: .4, out: 2, r: 60, y: 510, tone: 'r', text: ['Hidden vulnerability', 'ช่องโหว่ที่ซ่อนอยู่'] },
           { b: 2, d: .3, out: 3, c: 1, x: 260, y: 468, tone: 'c', text: ['Defenders read it', 'ทีมดูแลระบบเห็นประกาศ'] },
           { b: 2, d: .6, out: 3, c: 1, x: 1690, y: 468, tone: 'r', text: ['Attackers read it too', 'ผู้โจมตีก็เห็นพร้อมกัน'] },
           { b: 4, c: 1, x: DX, y: 420, tone: 'g', text: ['Lock replaced', 'เปลี่ยนกุญแจใหม่สำเร็จ'] }],
    t: [2.4, 2.2, 3, 2.6, 2.4] },

  /* 1.3 Infographic Event Timeline: The Collapse of the Patch Window */
  { tpl: 'eventTimeline', bg: 'breach-clock', bgo: .52, shade: 'full',
    kick: ['The Shrinking Clock', 'นาฬิกาที่บีบสั้นลงทุกปี'],
    title: ['Attackers now move in minutes, not months', 'วันนี้ผู้โจมตีลงมือเป็นนาที ไม่ใช่รอกันเป็นเดือน'],
    sub: ['Once exploit code is public, manual monthly patching is already too late.', 'ทันทีที่โค้ดเจาะระบบหลุดสู่สาธารณะ รอบอัปเดตแพตช์รายเดือนแบบเดิมก็ช้าเกินไปเสียแล้ว'],
    events: [
      { time: 'T + 0h', badge: ['Public Alert', 'ประกาศช่องโหว่'], icon: 'warning', tone: 'a',
        title: ['Exploit code goes public', 'โค้ดเจาะระบบถูกเผยแพร่'],
        text: ['Proof-of-concept attack code appears online for anyone to copy.', 'โค้ดตัวอย่างสำหรับเจาะช่องโหว่ถูกปล่อยขึ้นอินเทอร์เน็ต'] },
      { time: '< 24 hrs', badge: ['Weaponized', 'เริ่มบุกโจมตีจริง'], icon: 'bolt', tone: 'r',
        title: ['Active attacks begin', 'ผู้โจมตีนำโค้ดไปยิงใส่ระบบจริง'],
        text: ['Adversaries weaponize newly published exploit code within 24 hours.', 'ผู้ไม่หวังดีนำโค้ดโจมตีไปใช้เจาะระบบจริงภายใน 24 ชั่วโมง'] },
      { time: '29 min', badge: ['27s Fastest', 'เร็วสุดเพียง 27 วินาที'], icon: 'clock', tone: 'r',
        title: ['Lateral breakout across hosts', 'กระจายตัวข้ามเครื่องในเครือข่าย'],
        text: ['Average eCrime breakout fell to 29 minutes, and 27 seconds at fastest.', 'เวลาเฉลี่ยในการลุกลามข้ามเครื่องเหลือ 29 นาที และสถิติเร็วสุดเพียง 27 วินาที'] },
      { time: '247 days', badge: ['Global Mean', 'ค่าเฉลี่ยทั่วโลก'], icon: 'hourglass', tone: 'a',
        title: ['Identify and contain', 'กว่าจะตรวจพบและควบคุมได้'],
        text: ['Global average breach lifecycle still takes 247 days to find and contain.', 'องค์กรทั่วโลกยังใช้เวลาเฉลี่ยถึง 247 วันกว่าจะตรวจพบและจำกัดวงได้'] }
    ],
    banner: { b: 5, tone: 'r', icon: 'radar', k: ['Executive Takeaway', 'ประเด็นสำคัญสำหรับผู้บริหาร'],
      text: ['A 30-day manual review queue cannot beat a 29-minute automated breakout.', 'คิวตรวจเช็กด้วยมือรอบละ 30 วัน ไม่มีทางทันการบุกรุกที่กระจายตัวใน 29 นาที'] },
    note: ['Sources: CrowdStrike 2026 Global Threat Report & Threat Hunting Report; IBM Cost of a Data Breach Report 2026.', 'ที่มา: CrowdStrike 2026 Global Threat Report และ Threat Hunting Report; IBM Cost of a Data Breach Report 2026'] },

  /* 1.4 Infographic Scale Bars: Business Cost of a Breach (IBM 2026) */
  { tpl: 'comparison', variant: 'bars', bg: 'office-night', bgo: .45, shade: 'full',
    kick: ['Business Impact · 2026', 'ผลกระทบต่อธุรกิจจริง · ปี 2026'],
    title: ['When systems go down, every hour carries a price tag', 'เมื่อระบบล่มหรือข้อมูลรั่ว ทุกชั่วโมงที่ผ่านไปคือต้นทุนธุรกิจ'],
    sub: ['Measured across 602 breached organizations in the 2026 IBM study.', 'ข้อมูลสำรวจจริงจาก 602 องค์กรที่เกิดเหตุข้อมูลรั่วไหลในรายงาน IBM ปี 2026'],
    bars: [
      { icon: 'chart', tone: 'r', pct: 86, label: ['Global average cost of a data breach (record high, +12% YoY)', 'มูลค่าความเสียหายเฉลี่ยทั่วโลกต่อเหตุการณ์ (สูงสุดเป็นประวัติการณ์ เพิ่มขึ้น 12%)'],
        value: 'USD 4.99M', note: ['63% comes from disrupted operations, customer churn, detection, and escalation.', '63% ของความเสียหายเกิดจากธุรกิจหยุดชะงัก ลูกค้าสูญเสียความเชื่อมั่น และการกู้ระบบ'] },
      { icon: 'globe', tone: 'a', pct: 71, label: ['ASEAN regional average breach cost (up from USD 3.67M)', 'มูลค่าความเสียหายเฉลี่ยขององค์กรในภูมิภาคอาเซียน (เพิ่มขึ้นจาก USD 3.67M)'],
        value: 'USD 4.12M', note: ['41% of ransomware incidents now extort brand reputation alongside disruption.', '41% ของเหตุเรียกค่าไถ่ยุคนี้ขู่ทำลายชื่อเสียงแบรนด์ควบคู่กับการทำให้ระบบหยุดทำงาน'] },
      { icon: 'shieldCheck', tone: 'g', pct: 40, label: ['Average cost reduction with extensive security AI & automation', 'มูลค่าความเสียหายที่ลดลงได้ เมื่อใช้ AI และระบบอัตโนมัติช่วยดูแลความปลอดภัย'],
        value: '-USD 1.93M', note: ['Teams operating at machine speed also shortened breach lifecycles by 65 days.', 'ทีมที่ใช้ระบบอัตโนมัติยังลดเวลาค้นหาและระงับเหตุลงได้เฉลี่ยถึง 65 วัน'] }
    ],
    note: ['Source: IBM Cost of a Data Breach Report 2026 (Ponemon Institute & IBM, 602 organizations).', 'ที่มา: IBM Cost of a Data Breach Report 2026 (ศึกษาจาก 602 องค์กรทั่วโลก)'] },

  /* 1.5 Infographic Arena: The Asymmetric Game */
  { tpl: 'comparison', bg: 'night-city', bgo: .4, shade: 'full',
    kick: ['The Structural Imbalance', 'สมการที่ไม่สมดุลตั้งแต่ต้น'],
    title: ['Why manual defence burns out good teams', 'ทำไมการตั้งรับด้วยมืออย่างเดียวจึงทำให้ทีมคนเก่งล้าเกินรับไหว'],
    left: { k: ['Offence', 'ฝั่งผู้บุกรุก'], head: ['The Attacker', 'ผู้โจมตี'], icon: 'skull', tone: 'r', mark: 'warning',
      metric: '1', unit: ['unpatched gap to win', 'ช่องโหว่เดียวก็เจาะผ่าน'],
      rows: [
        ['Automated scanners probe exposed ports every night', 'ใช้บอตสแกนหาพอร์ตและช่องโหว่ได้ทุกคืนโดยไม่เหนื่อย'],
        ['Needs just one rushed change or forgotten server', 'รอเพียงการตั้งค่าพลาดครั้งเดียว หรือเซิร์ฟเวอร์เครื่องที่ถูกลืม'],
        ['Strikes at 02:00 when your engineers are asleep', 'เลือกบุกตอนตีสอง ในเวลาที่วิศวกรของคุณกำลังพักผ่อน']
      ] },
    right: { k: ['Defence', 'ฝั่งองค์กรของคุณ'], head: ['Your Infrastructure Team', 'ทีมดูแลระบบของคุณ'], icon: 'shield', tone: 'c', mark: 'check',
      metric: '100%', unit: ['of hosts, every day', 'ต้องปลอดภัยครบทุกเครื่อง'],
      rows: [
        ['Must see every server, container, port, and certificate', 'ต้องมองเห็นเซิร์ฟเวอร์ คอนเทนเนอร์ และใบรับรองครบทุกจุด'],
        ['Must verify every update without breaking production', 'ต้องอัปเดตแพตช์โดยไม่ทำให้ระบบงานหลักของบริษัทล่ม'],
        ['Needs continuous watch without handing away control', 'ต้องมีระบบเฝ้าระวังตลอด 24 ชั่วโมง โดยไม่เสียอำนาจควบคุมเอง']
      ] } },

  /* 1.6 Closing Statement */
  { tpl: 'statement', mid: 1, icon: 'shieldCheck', bg: 'port-night', bgo: .34, shade: 'full',
    kick: ['Boardroom Bottom Line', 'บทสรุปสำหรับผู้นำองค์กร'],
    text: ['Attackers need to get lucky <em class="r">once</em>. Your operations must hold <em class="c">every night</em>.', 'ผู้โจมตีขอแค่พลาดเป้าให้เจาะได้<em class="r">ครั้งเดียว</em> แต่ระบบของธุรกิจต้องมั่นคง<em class="c">ทุกคืน</em>'],
    lines: [['And in 2025 to 2026, attackers stopped working at human speed.', 'และในปี 2025 ถึง 2026 ผู้โจมตีไม่ได้ทำงานด้วยความเร็วของมนุษย์อีกต่อไป']] }
  ] });
})();
