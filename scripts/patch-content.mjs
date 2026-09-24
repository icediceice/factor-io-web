import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertParity } from './build-site.mjs';

const enPath = resolve('content/en/site.json');
const thPath = resolve('content/th/site.json');

const en = JSON.parse(await readFile(enPath, 'utf8'));
const th = JSON.parse(await readFile(thPath, 'utf8'));

// 1. UI Updates
en.ui.ctaTitle = "Discuss your infrastructure with the principal architect.";
en.ui.ctaBody = "Tell us what you want to achieve and what hardware or platform you currently run. We scope your technical requirements and provide an itemized quotation within 48 hours.";
en.ui.ctaLink = "Request a technical quotation";

th.ui.ctaTitle = "ปรึกษารายละเอียดโครงสร้างพื้นฐานกับวิศวกรผู้ออกแบบระบบโดยตรง";
th.ui.ctaBody = "บอกเป้าหมายที่คุณต้องการและระบบเซิร์ฟเวอร์หรือฮาร์ดแวร์ที่คุณมีอยู่ เราจะประเมินขอบเขตทางเทคนิคและจัดทำใบเสนอราคาให้ภายใน 48 ชั่วโมง";
th.ui.ctaLink = "ขอใบเสนอราคาทางเทคนิค";

// 2. Home Page EN
en.pages.home.headline = "The complete private AI bundle, from bare metal to local inference.";
en.pages.home.lede = "We don't sell third-party cloud API wrappers. Factor IO engineers the complete on-premise bundle: bare-metal Kubernetes, authoritative knowledge systems, and private local AI running entirely within your enterprise boundary—delivered directly by a principal architect.";

en.pages.home.sections[0].kicker = "01 / The Bundle";
en.pages.home.sections[0].title = "The full bundle is the deliverable, not an isolated model.";
en.pages.home.sections[0].body = "Enterprise AI cannot survive in production without the platform underneath it and data authority around it. Selling a model or technique in isolation invites project failure. Factor IO delivers the whole architecture as an integrated bundle: bare-metal GPU clusters, knowledge authority mapping, private local model serving, and mechanical execution controls.";

en.pages.home.sections[1].kicker = "02 / Operational Reality";
en.pages.home.sections[1].title = "Engineered for local security, air-gapped systems and compliance.";
en.pages.home.sections[1].body = "When sensitive corporate data cannot leave your network or be billed on unpredictable API tokens, local on-premise AI is the only viable architecture. We address the hard operational questions before installation begins:";
en.pages.home.sections[1].items[0].title = "Where does the model run?";
en.pages.home.sections[1].items[0].body = "Strictly on your private servers or local Kubernetes clusters—using optimized local runtimes (vLLM, Triton, Ollama) with zero outbound data leakage.";
en.pages.home.sections[1].items[1].title = "Which document is authoritative?";
en.pages.home.sections[1].items[1].body = "Source authority and document lifecycle are settled before indexing, preventing hallucinated answers from obsolete company policies.";
en.pages.home.sections[1].items[2].title = "Who is permitted to see what?";
en.pages.home.sections[1].items[2].body = "Retrieval filters enforce existing active directory and RBAC permissions mechanically at query time, not by prompting the model.";
en.pages.home.sections[1].items[3].title = "What happens when hardware fails?";
en.pages.home.sections[1].items[3].body = "High availability, failover domains, and automated recovery are engineered into the Kubernetes cluster from Day 1.";

en.pages.home.sections[2].kicker = "03 / The Four Pillars";
en.pages.home.sections[2].title = "The platform first, the data foundation, then sovereign AI.";
en.pages.home.sections[2].body = "Every layer reinforces the others. You can engage us for the complete turnkey rollout or a specific phase aligned with your roadmap.";
en.pages.home.sections[2].items[0].title = "Kubernetes & GPU Platform";
en.pages.home.sections[2].items[0].body = "The platform your applications need, including Kubernetes and GPU infrastructure. It is designed to carry whatever the business runs on it rather than one workload in particular. Capacity, recovery, upgrades and day-to-day ownership are part of the design.";
en.pages.home.sections[2].items[1].title = "Private Local AI Implementation";
en.pages.home.sections[2].items[1].body = "On-premise inference engines, model quantization, local embeddings, and GPU capacity optimization with predictable, zero-token cost and total data sovereignty.";
en.pages.home.sections[2].items[2].title = "Knowledge and Authority Mapping";
en.pages.home.sections[2].items[2].body = "Make your organisation's information useful to AI: which sources to trust, who can access them, and how to keep them current before algorithmic indexing.";
en.pages.home.sections[2].items[3].title = "AI Governance and Controls";
en.pages.home.sections[2].items[3].body = "Decide what AI may do on its own and when a person needs to approve the next step. We design controls around those decisions, including access, review and deterministic refusal.";

en.pages.home.sections[3].kicker = "04 / Engagement & Quotation";
en.pages.home.sections[3].title = "Transparent engagement scopes. Direct engineering quotation.";
en.pages.home.sections[3].body = "Because every enterprise environment has distinct security constraints, hardware baselines, and data policies, we don't sell generic price-tag commodities. We scope directly with you and deliver a transparent quotation within 48 hours.";
en.pages.home.sections[3].items[0].title = "For your business";
en.pages.home.sections[3].items[0].body = "Engage us for a focused architecture sprint, a private AI pilot, or full production delivery. Talk directly to the principal engineer to define technical scope and receive an itemized quotation.";
en.pages.home.sections[3].items[0].mark = "You hold the direct relationship, and we are accountable for the agreed delivery.";
en.pages.home.sections[3].items[1].title = "For technology partners";
en.pages.home.sections[3].items[1].body = "Bring principal-level solution architecture into complex client opportunities. We support vendors, distributors, and SIs across discovery, sizing, POC validation, and implementation.";
en.pages.home.sections[3].items[1].mark = "Your team holds the commercial relationship, and we take responsibility for technical delivery.";

en.pages.home.sections[4].kicker = "05 / The Architect";
en.pages.home.sections[4].title = "Work directly with the architect doing the work.";
en.pages.home.sections[4].body = "Thanat Manasakool, Founder & Principal Engineer. Nearly 20 years in enterprise infrastructure, with experience as an Ecosystem Solutions Architect for Red Hat and Nutanix, delivering architecture guidance and technical enablement to Thailand's leading SI partners. You can discuss the business requirement and the implementation with the same person.";

en.pages.home.sections[5].kicker = "06 / Phased Delivery";
en.pages.home.sections[5].title = "From discovery to turnkey quotation and handover.";
en.pages.home.sections[5].body = "Four clear stages with defined deliverables, agreed before anything gets built.";
en.pages.home.sections[5].items[0].title = "1. Requirement & Infrastructure Audit";
en.pages.home.sections[5].items[0].body = "Review your goals, existing systems and constraints. Identify what needs attention first and define the quotation scope.";
en.pages.home.sections[5].items[1].title = "2. Solution Architecture & Sizing";
en.pages.home.sections[5].items[1].body = "Agree the cluster scope, hardware sizing and acceptance criteria so you know exactly what will be delivered.";
en.pages.home.sections[5].items[2].title = "3. Build & Local AI Pilot";
en.pages.home.sections[5].items[2].body = "Implement the agreed solution. Use a focused pilot where an assumption needs testing before wider enterprise rollout.";
en.pages.home.sections[5].items[3].title = "4. Deploy & Hand Over";
en.pages.home.sections[5].items[3].body = "Prepare the operating procedures and work through them with your team. Agree any ongoing support separately.";

// 3. Home Page TH
th.pages.home.headline = "โซลูชันครบวงจรสำหรับระบบ Private AI ตั้งแต่โครงสร้าง Bare Metal จนถึง Local Inference";
th.pages.home.lede = "เราไม่ใช่ตัวแทนขาย Cloud API ทั่วไป แต่ Factor IO ออกแบบและสร้างแพลตฟอร์มแบบครบวงจร (Full Bundle) ภายในองค์กรของคุณ ทั้งระบบ Bare-Metal Kubernetes, สถาปัตยกรรมข้อมูล และระบบ Local AI ที่ทำงานบนเซิร์ฟเวอร์ของคุณอย่างปลอดภัย ส่งมอบตรงโดย Principal Engineer";

th.pages.home.sections[0].kicker = "01 / โซลูชันครบวงจร";
th.pages.home.sections[0].title = "ส่งมอบครบทั้งระบบ ไม่ใช่เพียงการต่อโมเดลเดี่ยวๆ";
th.pages.home.sections[0].body = "ระบบ AI ระดับองค์กรไม่สามารถทำงานได้จริงในระยะยาวหากขาดโครงสร้างพื้นฐานที่รองรับและการควบคุมสิทธิ์ข้อมูล การขายเฉพาะโมเดลมักนำไปสู่ความล้มเหลวของโครงการ Factor IO จึงส่งมอบสถาปัตยกรรมทั้งหมดเป็นแพ็กเกจสมบูรณ์: คลัสเตอร์ GPU บน Bare Metal, การจัดโครงสร้างความน่าเชื่อถือของเอกสาร, ระบบ Local Model Serving และกลไกการควบคุมความปลอดภัย";

th.pages.home.sections[1].kicker = "02 / ความเป็นจริงหน้างาน";
th.pages.home.sections[1].title = "ออกแบบสำหรับระบบปิด (Air-Gapped), ความปลอดภัย และข้อกำหนดองค์กร";
th.pages.home.sections[1].body = "เมื่อข้อมูลสำคัญขององค์กรไม่สามารถส่งออกภายนอกหรือรับความเสี่ยงจากค่าใช้จ่ายตามจำนวนโทเคนของคลาวด์ได้ ระบบ Local AI ภายในองค์กรคือคำตอบเดียวที่ใช้งานได้จริง เราตอบโจทย์ความท้าทายเหล่านี้ตั้งแต่ขั้นตอนการออกแบบ:";
th.pages.home.sections[1].items[0].title = "โมเดลประมวลผลอยู่ที่ไหน?";
th.pages.home.sections[1].items[0].body = "รันอยู่บนเซิร์ฟเวอร์ส่วนตัวหรือคลัสเตอร์ Kubernetes ภายในองค์กรเท่านั้น ด้วยเอนจินเฉพาะทาง (vLLM, Triton, Ollama) ข้อมูลไม่มีการรั่วไหลออกสู่อินเทอร์เน็ตภายนอก";
th.pages.home.sections[1].items[1].title = "เอกสารชุดไหนเป็นแหล่งข้อมูลอ้างอิงหลัก?";
th.pages.home.sections[1].items[1].body = "กำหนดความน่าเชื่อถือและวงจรชีวิตของเอกสารก่อนนำเข้าสู่ระบบ เพื่อป้องกันไม่ให้ AI สร้างคำตอบผิดพลาดจากนโยบายเก่าที่ยกเลิกไปแล้ว";
th.pages.home.sections[1].items[2].title = "ใครมีสิทธิ์เข้าถึงข้อมูลส่วนใด?";
th.pages.home.sections[1].items[2].body = "ระบบกรองการสืบค้นจะบังคับใช้นโยบาย Active Directory และสิทธิ์ RBAC เดิมขององค์กรในระดับการสืบค้นข้อมูลจริง ไม่ได้พึ่งพาเพียงคำสั่ง Prompt";
th.pages.home.sections[1].items[3].title = "จะเกิดอะไรขึ้นเมื่อฮาร์ดแวร์ทำงานล้มเหลว?";
th.pages.home.sections[1].items[3].body = "ระบบ High Availability, การแบ่ง Failover Domain และการกู้คืนอัตโนมัติได้รับการออกแบบไว้ในคลัสเตอร์ Kubernetes ตั้งแต่วันแรก";

th.pages.home.sections[2].kicker = "03 / 4 เสาหลักของบริการ";
th.pages.home.sections[2].title = "สร้างแพลตฟอร์มก่อน ตามด้วยโครงสร้างข้อมูล แล้วจึงรัน Local AI";
th.pages.home.sections[2].body = "แต่ละชั้นสนับสนุนซึ่งกันและกันอย่างสมบูรณ์ คุณสามารถร่วมงานกับเราทั้งโครงการแบบครบวงจร หรือเลือกเริ่มเป็นเฟสตามแผนงานของคุณ";
th.pages.home.sections[2].items[0].title = "แพลตฟอร์ม Kubernetes และโครงสร้างพื้นฐาน GPU";
th.pages.home.sections[2].items[0].body = "แพลตฟอร์มสำหรับรองรับแอปพลิเคชันและคลัสเตอร์ GPU ทั้ง Red Hat OpenShift, Nutanix NKP และ Upstream CNCF ออกแบบเพื่อให้รองรับเวิร์กโหลดได้หลากหลาย พร้อมคู่มือการดูแลระบบระยะยาว";
th.pages.home.sections[2].items[1].title = "การติดตั้งและรัน Local AI ภายในองค์กร";
th.pages.home.sections[2].items[1].body = "ติดตั้งเอนจินรันโมเดลบนฮาร์ดแวร์ขององค์กร, การทำ Quantization และ Local Embeddings เพื่อประสิทธิภาพสูงสุด คุมค่าใช้จ่ายได้คงที่ ไม่ต้องเสียค่า API รายครั้ง";
th.pages.home.sections[2].items[2].title = "การจัดโครงสร้างความรู้และแหล่งข้อมูลอ้างอิง";
th.pages.home.sections[2].items[2].body = "ทำให้ข้อมูลภายในองค์กรพร้อมใช้งานสำหรับ AI อย่างปลอดภัย กำหนดแหล่งข้อมูลที่เชื่อถือได้ สิทธิ์การเข้าถึง และการอัปเดตข้อมูลให้ทันสมัย";
th.pages.home.sections[2].items[3].title = "การควบคุมความปลอดภัยและธรรมาภิบาล AI";
th.pages.home.sections[2].items[3].body = "กำหนดขอบเขตสิ่งที่ AI ทำงานได้เอง และขั้นตอนที่ต้องได้รับการอนุมัติจากมนุษย์ก่อนเสมอ พร้อมระบบปฏิเสธคำสั่งที่ไม่ได้รับอนุญาตโดยอัตโนมัติ";

th.pages.home.sections[3].kicker = "04 / รูปแบบความร่วมมือและใบเสนอราคา";
th.pages.home.sections[3].title = "ขอบเขตงานที่ชัดเจน ใบเสนอราคาตรงจากวิศวกรผู้รับผิดชอบ";
th.pages.home.sections[3].body = "เนื่องจากสภาพแวดล้อมทางไอที ความปลอดภัย และสเปกฮาร์ดแวร์ของแต่ละองค์กรมีความแตกต่างกัน เราจึงไม่ตั้งราคาตายตัวแบบสินค้าโภคภัณฑ์ แต่จะร่วมประเมินความต้องการกับคุณและส่งมอบใบเสนอราคาที่แจกแจงอย่างชัดเจนภายใน 48 ชั่วโมง";
th.pages.home.sections[3].items[0].title = "สำหรับองค์กรธุรกิจ";
th.pages.home.sections[3].items[0].body = "ร่วมงานกับเราเพื่อตรวจสอบระบบเดิม, ออกแบบสถาปัตยกรรมใหม่, ทำระบบ Local AI Pilot หรือส่งมอบทั้งระบบ คุยกับวิศวกรผู้ออกแบบโดยตรงเพื่อกำหนดขอบเขตและรับใบเสนอราคา";
th.pages.home.sections[3].items[0].mark = "คุณเป็นผู้ถือสัญญาหลัก และเรารับผิดชอบส่งมอบงานทางเทคนิคตามที่ตกลงกันไว้";
th.pages.home.sections[3].items[1].title = "สำหรับพาร์ตเนอร์เทคโนโลยี";
th.pages.home.sections[3].items[1].body = "ดึงเราเข้าร่วมในโครงการของลูกค้าที่ต้องการสถาปนิกผู้เชี่ยวชาญระดับสูง เราทำงานร่วมกับ Vendor, Distributor และ SI ตั้งแต่ขั้นตอน Discovery, การประเมินขนาด (Sizing) จนถึงการส่งมอบงาน";
th.pages.home.sections[3].items[1].mark = "ทีมของคุณดูแลความสัมพันธ์กับลูกค้า และเรารับผิดชอบงานทางเทคนิคทั้งหมดที่ตกลงกัน";

th.pages.home.sections[4].kicker = "05 / วิศวกรผู้ออกแบบ";
th.pages.home.sections[4].title = "ทำงานโดยตรงกับวิศวกรผู้ลงมือสร้างระบบ";
th.pages.home.sections[4].body = "ธนัท มนัสสกุล ผู้ก่อตั้งและ Principal Engineer ประสบการณ์เกือบ 20 ปีในวงการโครงสร้างพื้นฐานระดับองค์กร อดีต Ecosystem Solutions Architect ของ Red Hat และ Nutanix ผู้ถ่ายทอดความรู้และให้คำปรึกษาแก่ SI ชั้นนำในไทย คุณสามารถคุยทั้งโจทย์ธุรกิจและรายละเอียดทางเทคนิคกับบุคคลคนเดียวกัน";

th.pages.home.sections[5].kicker = "06 / ขั้นตอนการส่งมอบงาน";
th.pages.home.sections[5].title = "ตั้งแต่การประเมินเบื้องต้น จนถึงใบเสนอราคาและการส่งมอบระบบ";
th.pages.home.sections[5].body = "4 ขั้นตอนที่มีผลลัพธ์ชัดเจน ตกลงร่วมกันก่อนเริ่มสร้างจริง";
th.pages.home.sections[5].items[0].title = "1. วิเคราะห์ความต้องการและตรวจสอบโครงสร้างพื้นฐาน";
th.pages.home.sections[5].items[0].body = "ตรวจสอบเป้าหมาย ระบบเซิร์ฟเวอร์ และข้อจำกัดที่มีอยู่ ระบุจุดที่ต้องดำเนินการก่อน และกำหนดขอบเขตสำหรับใบเสนอราคา";
th.pages.home.sections[5].items[1].title = "2. กำหนดสถาปัตยกรรมและการจัดสรรขนาดระบบ";
th.pages.home.sections[5].items[1].body = "ตกลงขอบเขตของคลัสเตอร์ สเปก GPU โมเดลที่จะใช้งาน และเกณฑ์การตรวจรับงานเพื่อให้เห็นภาพผลลัพธ์ที่ชัดเจน";
th.pages.home.sections[5].items[2].title = "3. ติดตั้งและทดสอบระบบ Local AI Pilot";
th.pages.home.sections[5].items[2].body = "ดำเนินการติดตั้งระบบตามที่ตกลงกัน รันระบบ Pilot เพื่อทดสอบความเร็ว การตอบสนอง และการดึงข้อมูลจากเอกสาร";
th.pages.home.sections[5].items[3].title = "4. ส่งมอบระบบสู่การใช้งานจริง";
th.pages.home.sections[5].items[3].body = "จัดทำคู่มือการปฏิบัติงาน ถ่ายทอดความรู้ให้ทีมงานของคุณดูแลระบบต่อได้จริง ส่วนบริการดูแลต่อเนื่องสามารถตกลงแยกตามความต้องการ";

// 4. Services Page EN & TH
en.pages.services.headline = "The complete private AI bundle: infrastructure, knowledge, and local models.";
en.pages.services.lede = "Start with the infrastructure and the way things operate today. The platform layer is the foundation; the private local AI stack on top of it is the delivery. We scope the engagement around an architecture audit, an on-premise pilot, or a production cluster, providing a clear quotation and verified delivery.";
en.pages.services.sections[0].title = "Four services forming the complete on-premise bundle.";
en.pages.services.sections[0].body = "Each service can be a standalone engagement or a phase of the complete bundle delivery. The platform work comes first because everything else sits on it. We agree technical scope and provide an itemized quotation before implementation begins.";
en.pages.services.sections[0].items[0].title = "Kubernetes & GPU Platform";
en.pages.services.sections[0].items[0].body = "We design and deliver the container platform your workloads need, including Red Hat OpenShift, Nutanix NKP, and GPU virtualization. Built for bare-metal, air-gapped, and sovereign operations.";
en.pages.services.sections[0].items[1].title = "Private Local AI Implementation";
en.pages.services.sections[0].items[1].body = "Deploy open-weight and fine-tuned models directly inside your data center using high-throughput inference engines (vLLM, Triton). Zero cloud API dependency and zero data exfiltration.";
en.pages.services.sections[0].items[2].title = "Knowledge Systems & Authority";
en.pages.services.sections[0].items[2].body = "Make your organisation's information useful and safe for local AI: authoritative source mapping, RBAC access boundaries, document freshness, and compliant lifecycle pipelines.";
en.pages.services.sections[0].items[3].title = "Mechanical AI Governance";
en.pages.services.sections[0].items[3].body = "Decide what AI may do on its own and when a person needs to approve the next step. We design controls around those decisions, including access, review and deterministic refusal.";

th.pages.services.headline = "โซลูชัน Private AI ครบวงจร: โครงสร้างพื้นฐาน, ฐานความรู้ และการติดตั้งโมเดลภายในองค์กร";
th.pages.services.lede = "เริ่มต้นจากโครงสร้างพื้นฐานและวิธีการทำงานในปัจจุบัน แพลตฟอร์มคือฐานรากสำคัญ และระบบ Local AI ที่อยู่ด้านบนคือผลลัพธ์ที่จับต้องได้ เรากำหนดขอบเขตงานได้ตั้งแต่การตรวจสอบสถาปัตยกรรม, การทำระบบทดสอบ Pilot บนระบบของท่าน จนถึงคลัสเตอร์สำหรับการใช้งานจริง พร้อมใบเสนอราคาที่โปร่งใส";
th.pages.services.sections[0].title = "4 บริการหลักที่รวมกันเป็นโซลูชันภายในองค์กรที่สมบูรณ์";
th.pages.services.sections[0].body = "แต่ละบริการสามารถแยกเป็นงานเฉพาะจุด หรือเป็นเฟสต่อเนื่องของโครงการส่งมอบระบบแบบครบวงจร งานแพลตฟอร์มต้องมาก่อนเพราะเป็นฐานของทุกสิ่ง เราตกลงขอบเขตและจัดทำใบเสนอราคาก่อนเริ่มลงมือปฏิบัติจริง";
th.pages.services.sections[0].items[0].title = "แพลตฟอร์ม Kubernetes และฮาร์ดแวร์ GPU";
th.pages.services.sections[0].items[0].body = "เราออกแบบและส่งมอบแพลตฟอร์มคอนเทนเนอร์ที่จำเป็น ทั้ง Red Hat OpenShift, Nutanix NKP และการทำ GPU Virtualization รองรับการติดตั้งแบบ Bare-Metal และระบบปิดโดยสมบูรณ์";
th.pages.services.sections[0].items[1].title = "การติดตั้งและรัน Local AI ภายในองค์กร";
th.pages.services.sections[0].items[1].body = "ติดตั้งโมเดลและเอนจินประมวลผลความเร็วสูง (vLLM, Triton) ภายในศูนย์ข้อมูลขององค์กร ไม่ต้องพึ่งพา Cloud API ภายนอก ข้อมูลไม่รั่วไหลออกนอกองค์กร";
th.pages.services.sections[0].items[2].title = "ระบบจัดการความรู้และแหล่งข้อมูลอ้างอิง";
th.pages.services.sections[0].items[2].body = "ทำให้ข้อมูลขององค์กรมีความปลอดภัยและพร้อมสำหรับ Local AI จัดโครงสร้างแหล่งข้อมูลอ้างอิง, ควบคุมสิทธิ์การเข้าถึงตามบทบาท (RBAC) และการอัปเดตข้อมูลให้สดใหม่อยู่เสมอ";
th.pages.services.sections[0].items[3].title = "การควบคุมความปลอดภัยและธรรมาภิบาล AI";
th.pages.services.sections[0].items[3].body = "กำหนดขอบเขตสิ่งที่ AI ทำงานได้โดยอัตโนมัติ และจุดที่ต้องให้มนุษย์อนุมัติ ออกแบบระบบควบคุมให้ปฏิเสธคำสั่งที่ไม่ถูกต้องอย่างเด็ดขาด พร้อมบันทึกประวัติการตรวจสอบ";

// 5. Contact Page EN & TH
en.pages.contact.lede = "Tell us what you want to achieve and what you already have. You do not need to choose a model or a platform before we talk. We will scope your requirements and provide an itemized quotation.";
en.pages.contact.sections[0].body = "Bring the business problem, the data you have and the constraints you are under. We can work through the local AI models, platform and integration decisions together, and deliver a scoped technical quotation. If you have a customer opportunity that needs an architect, say so and we will pick up the partner route.";

th.pages.contact.lede = "บอกเป้าหมายที่คุณต้องการและระบบที่คุณมีอยู่ คุณไม่จำเป็นต้องเลือกโมเดลหรือแพลตฟอร์มล่วงหน้าก่อนคุยกับเรา เราจะร่วมประเมินขอบเขตและจัดทำใบเสนอราคาให้คุณ";
th.pages.contact.sections[0].body = "เพียงนำโจทย์ธุรกิจ ข้อมูลที่คุณมี และข้อจำกัดที่องค์กรต้องปฏิบัติตามมาคุยกับเรา เราจะร่วมกันพิจารณาทางเลือกของโมเดล Local AI, แพลตฟอร์ม และแนวทางการเชื่อมต่อระบบ พร้อมออกใบเสนอราคาทางเทคนิคที่ชัดเจน หากท่านมีโอกาสทางธุรกิจกับลูกค้าที่ต้องการสถาปนิกผู้เชี่ยวชาญ แจ้งให้เราทราบเพื่อเลือกแนวทางความร่วมมือแบบพาร์ตเนอร์ได้ทันที";

// Parity Check
assertParity(en, th);

await writeFile(enPath, JSON.stringify(en, null, 2) + '\n', 'utf8');
await writeFile(thPath, JSON.stringify(th, null, 2) + '\n', 'utf8');
console.log('Successfully updated content and verified EN/TH parity!');
