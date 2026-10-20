// Structured, plain-text statement of work. Templates are seeded into settings,
// then edited by the operator; this module only defines their shape and defaults.
const pair = (en, th = '') => ({ en, th });
const module = (code, titleEn, titleTh, items, included = false) => ({
  code, titleEn, titleTh, included, items: items.map((s) => pair(s)),
});
const shared = [
  module('network', 'Networking and DNS', 'เครือข่ายและ DNS', ['Addressing, DNS and firewall requirements', 'CNI design and validation']),
  module('ingress', 'Ingress and load balancing', 'Ingress และ Load Balancer', ['Ingress controller and certificate setup', 'External load balancer integration']),
  module('storage', 'Persistent storage', 'ระบบจัดเก็บข้อมูล', ['CSI integration and storage classes', 'Volume snapshot validation']),
  module('identity', 'Identity and access', 'ตัวตนและสิทธิ์', ['SSO integration', 'Roles, namespaces and RBAC']),
  module('registry', 'Image registry', 'ทะเบียนอิมเมจ', ['Registry integration and image pull policy']),
  module('observability', 'Monitoring and logging', 'การติดตามและบันทึก', ['Metrics and alerting', 'Cluster log collection']),
  module('backup', 'Backup and restore', 'สำรองและกู้คืน', ['Backup policy and restore exercise']),
  module('security', 'Security hardening', 'ความปลอดภัย', ['Policy and admission controls', 'Certificate and secret handling']),
  module('gitops', 'GitOps', 'GitOps', ['GitOps controller and sample application']),
  module('upgrade', 'Upgrade planning', 'วางแผนอัปเกรด', ['Version compatibility and upgrade runbook']),
  module('ha_dr', 'High availability and disaster recovery', 'HA และ DR', ['Failure domain design', 'Recovery targets and exercise']),
  module('gpu', 'GPU enablement', 'การใช้ GPU', ['GPU drivers, device plugin and scheduling']),
  module('airgap', 'Disconnected installation', 'ติดตั้งแบบไม่เชื่อมต่อ', ['Mirror images and dependencies', 'Offline update procedure']),
  module('handover', 'Handover and training', 'ส่งมอบและฝึกอบรม', ['Operator runbook and workshop']),
  module('support', 'Post-install support', 'บริการหลังติดตั้ง', ['Support period and response terms']),
];
const kube = (code, titleEn, titleTh, install, prerequisite) => ({
  code, titleEn, titleTh,
  sow: {
    version: 1, summary: pair(`${titleEn} implementation`, `การติดตั้ง ${titleTh}`),
    modules: [module('installation', `${titleEn} installation`, `ติดตั้ง ${titleTh}`, [install, 'Control plane and worker validation'], true), ...shared],
    assumptions: [pair(prerequisite), pair('Customer provides access, approved architecture and required licenses before work starts')],
    exclusions: [pair('Application migration and ongoing operation are excluded unless selected and priced')],
  },
});
export const LEGACY_SOW_TEMPLATES_V1 = [
  {
    code: 'os-install', titleEn: 'OS installation', titleTh: 'ติดตั้งระบบปฏิบัติการ',
    sow: { version: 1, summary: pair('Operating system installation and handover', 'ติดตั้งระบบปฏิบัติการและส่งมอบ'),
      modules: [module('installation', 'OS installation', 'ติดตั้งระบบปฏิบัติการ', ['Install approved OS image', 'Apply baseline configuration and validate access'], true),
        module('hardening', 'Hardening and patching', 'ความปลอดภัยและแพตช์', ['Patch baseline and security controls']),
        module('monitoring', 'Monitoring integration', 'การติดตามระบบ', ['Connect host telemetry and alerts']),
        module('backup', 'Backup integration', 'การสำรองข้อมูล', ['Connect backup agent and test restore']),
        module('handover', 'Handover', 'การส่งมอบ', ['Document configuration and operating procedure'])],
      assumptions: [pair('Customer supplies hardware or virtual machine, license, network access and approved OS version')],
      exclusions: [pair('Application installation and data migration require separate scope and pricing')],
    },
  },
  kube('openshift', 'Red Hat OpenShift', 'OpenShift', 'Install supported OpenShift release and operators', 'Customer supplies subscriptions, supported infrastructure, DNS, load balancing and storage'),
  kube('nkp', 'Nutanix Kubernetes Platform', 'NKP', 'Install NKP management and workload clusters', 'Customer supplies supported Nutanix infrastructure; preprovisioned deployments require customer storage and load balancing'),
  kube('vanilla-kube', 'Upstream Kubernetes', 'Kubernetes', 'Install upstream Kubernetes with supported lifecycle tooling', 'Customer supplies compute, networking, DNS, load balancing and CSI-compatible storage'),
];

// Version two is a proposal starting point. Quantities, versions, support terms and
// site choices are deliberately absent until the operator confirms them.
const optionalKubeV2 = [
  module('network', 'Network integration', 'เครือข่าย', [
    'Record approved node, pod and service address ranges, DNS records and firewall paths in the design.',
    'Configure the selected network provider and demonstrate pod-to-pod, pod-to-service and external connectivity.']),
  module('ingress', 'Ingress and load balancing', 'Ingress และ Load Balancer', [
    'Configure the agreed ingress controller, routing entry points and certificate source.',
    'Connect the approved load-balancing method and validate access to a representative service.']),
  module('storage', 'Persistent storage', 'ระบบจัดเก็บข้อมูล', [
    'Install the supported CSI driver and define storage classes, volume policy and default class as agreed.',
    'Provision, expand or restore a representative persistent volume where the driver supports it.']),
  module('identity', 'Identity and access', 'ตัวตนและสิทธิ์', [
    'Integrate the agreed identity provider and map administrator and application roles.',
    'Validate sign-in and least-privilege access with representative user accounts.']),
  module('registry', 'Image registry', 'ทะเบียนอิมเมจ', [
    'Connect the approved image registry, credentials and trust chain.',
    'Deploy a sample image and verify image pull behavior from each required network segment.']),
  module('observability', 'Monitoring and logging', 'การติดตามและบันทึก', [
    'Connect cluster metrics, health alerts and the agreed log destination.',
    'Demonstrate one alert and trace a sample workload event into the collected logs.']),
  module('backup', 'Backup and restore', 'สำรองและกู้คืน', [
    'Confirm protected resources, destination, retention and restore ownership with the customer.',
    'Configure the selected backup integration and complete a documented test restore.']),
  module('security', 'Security controls', 'ความปลอดภัย', [
    'Apply approved admission, namespace and workload access policies.',
    'Validate a permitted workload and a denied action; document exceptions for customer review.']),
  module('gitops', 'GitOps delivery', 'GitOps', [
    'Connect the approved source repository and deployment controller to a nonproduction workload.',
    'Demonstrate a reviewed change, reconciliation and rollback path.']),
  module('upgrade', 'Upgrade planning', 'วางแผนอัปเกรด', [
    'Record supported version path, prerequisites, maintenance window and rollback decision points.',
    'Produce an upgrade runbook and review it with the operations team.']),
  module('ha_dr', 'Availability and recovery', 'HA และ DR', [
    'Document failure domains, recovery responsibilities and agreed recovery objectives.',
    'Exercise one agreed node or component failure and record the observed recovery.']),
  module('gpu', 'GPU workloads', 'การใช้ GPU', [
    'Confirm compatible GPU hardware, drivers and workload scheduling requirements.',
    'Install the selected device integration and validate a representative GPU workload.']),
  module('airgap', 'Disconnected deployment', 'ติดตั้งแบบไม่เชื่อมต่อ', [
    'List and stage required images, packages and trust material in the approved internal locations.',
    'Validate installation and a sample workload without public registry access.']),
  module('support', 'Post implementation support', 'บริการหลังติดตั้ง', [
    'Agree the support channel, coverage window, response target and handoff owner before inclusion.',
    'Record incident intake and escalation steps in the operations runbook.']),
];
const kubeV2 = (code, titleEn, titleTh, platformSteps, assumptions) => ({
  code, titleEn, titleTh,
  sow: {
    version: 1,
    summary: pair(`Design, implement and hand over a ${titleEn} platform for the customer-approved environment and workloads.`, `ออกแบบ ติดตั้ง และส่งมอบ ${titleTh}`),
    modules: [
      module('discovery', 'Preparation and design', 'เตรียมงานและออกแบบ', [
        'Hold a project kickoff to confirm stakeholders, delivery method, access, change approvals and success criteria.',
        'Review compute, network, storage, identity and security prerequisites with customer owners; record gaps and decisions.',
        'Produce a deployment design and implementation plan for customer approval before configuration begins.'], true),
      module('implementation', `${titleEn} implementation`, `ติดตั้ง ${titleTh}`, platformSteps, true),
      module('validation', 'Validation and acceptance', 'ทดสอบและรับมอบ', [
        'Run platform health, node scheduling, networking and storage checks against the approved design.',
        'Deploy and remove a representative workload; record test results, open issues and remediation owners.',
        'Walk through the acceptance checklist with customer stakeholders and capture sign-off or exceptions.'], true),
      module('handover', 'Operational handover', 'ส่งมอบการดำเนินงาน', [
        'Deliver as-built architecture, configuration inventory, access handover and standard operating procedures.',
        'Conduct an operator walkthrough covering routine health checks, common failures and escalation paths.'], true),
      ...optionalKubeV2,
    ],
    assumptions: [pair('Customer supplies approved infrastructure, network access, credentials and required platform entitlements before implementation.'), ...assumptions.map((text) => pair(text))],
    exclusions: [pair('Application migration, workload refactoring and ongoing operations require separate scope and pricing.'),
      pair('Hardware procurement and changes to systems outside the approved platform design are excluded.')],
  },
});
export const LEGACY_SOW_TEMPLATES_V2 = [
  {
    code: 'os-install', titleEn: 'OS installation', titleTh: 'ติดตั้งระบบปฏิบัติการ',
    sow: {
      version: 1,
      summary: pair('Install and hand over the customer-approved server operating system on the agreed target hosts.', 'ติดตั้งระบบปฏิบัติการและส่งมอบ'),
      modules: [
        module('discovery', 'Preparation and design', 'เตรียมงานและออกแบบ', [
          'Confirm target hosts, approved OS edition, deployment method, naming, access and change window.',
          'Review CPU, memory, disk, network, licensing and backup prerequisites; record any gaps.',
          'Agree a validation checklist and rollback owner before installation.'], true),
        module('installation', 'OS implementation', 'ติดตั้งระบบปฏิบัติการ', [
          'Install the approved image and configure hostname, time source, network interfaces and storage layout.',
          'Configure approved administrator access, package sources and baseline services.',
          'Record deviations from the design and obtain approval before applying them.'], true),
        module('validation', 'Validation and acceptance', 'ทดสอบและรับมอบ', [
          'Verify boot, network reachability, name resolution, time synchronization and administrator access.',
          'Review installation evidence and outstanding issues against the agreed checklist.'], true),
        module('handover', 'Operational handover', 'ส่งมอบการดำเนินงาน', [
          'Provide an as-built host inventory, configuration summary and recovery or rebuild notes.',
          'Walk the customer team through routine checks and the access handover.'], true),
        module('hardening', 'Security baseline', 'ความปลอดภัย', [
          'Apply the customer-approved patch and security baseline, documenting exceptions.',
          'Validate administrative access and agreed security controls after the change.']),
        module('monitoring', 'Monitoring integration', 'การติดตามระบบ', [
          'Connect the host to the selected monitoring platform and configure approved alerts.',
          'Trigger or simulate a monitored condition and record the alert path.']),
        module('backup', 'Backup integration', 'การสำรองข้อมูล', [
          'Enroll the host in the approved backup policy and verify backup completion.',
          'Perform a test restore of an agreed nonproduction file or configuration.']),
      ],
      assumptions: [pair('Customer supplies target hosts, OS entitlements, installation media, network access and change approval.')],
      exclusions: [pair('Application installation, data migration and ongoing administration require separate scope and pricing.')],
    },
  },
  kubeV2('openshift', 'Red Hat OpenShift', 'OpenShift', [
    'Verify subscriptions, installer prerequisites, DNS, certificates and the selected connected or disconnected deployment path.',
    'Prepare installation assets and deploy the control plane and worker capacity to the approved topology.',
    'Configure core operators and machine management required by the agreed design; record cluster access and version.',
    'Validate operator health, node readiness and a representative application deployment.'],
    ['Customer supplies supported infrastructure and active subscriptions; external DNS, load balancing and storage remain customer responsibilities unless included as modules.']),
  kubeV2('nkp', 'Nutanix Kubernetes Platform', 'NKP', [
    'Verify Prism access, supported images, network segments, storage and the selected connected or disconnected deployment method.',
    'Prepare deployment tooling and the approved node image in the customer environment.',
    'Provision the management cluster and connect platform management components according to the design.',
    'Provision the agreed workload clusters and node pools; document cluster templates and administrative access.',
    'Validate management-to-workload connectivity, node readiness and a representative workload.'],
    ['Customer supplies supported Nutanix capacity and platform licenses; storage, load balancing and disconnected repositories require customer approval and are scoped separately when needed.']),
  kubeV2('vanilla-kube', 'Upstream Kubernetes', 'Kubernetes', [
    'Confirm supported distribution tooling, container runtime, version policy and topology for the approved hosts.',
    'Prepare hosts and repositories, then initialize the control plane and join worker nodes.',
    'Install the agreed network provider and configure cluster access and lifecycle tooling.',
    'Validate node readiness, DNS, service routing and deployment of a representative workload.'],
    ['Customer supplies supported hosts and selects ownership for lifecycle, networking, ingress, storage and load balancing components.']),
];
const optionalAiV2 = [
  module('assessment', 'Architecture and readiness assessment', 'ประเมินความพร้อมและสถาปัตยกรรม', [
    'Audit current hardware, GPU capacity, data readiness, security constraints and target workflows before procurement or build.',
    'Deliver a current-state assessment, target architecture, hardware sizing and risk register.']),
  module('model_serving', 'Private model serving', 'ระบบรันโมเดลภายในองค์กร', [
    'Deploy and configure the agreed local inference runtime on customer GPU infrastructure.',
    'Validate model loading, concurrency, latency, access controls and request logging inside the customer network.']),
  module('model_adaptation', 'Model adaptation and evaluation', 'ปรับแต่งและประเมินผลโมเดล', [
    'Prepare customer-approved datasets, prompts or adapters and run domain adaptation for the agreed Thai and English tasks.',
    'Benchmark accuracy, refusal behavior and regressions against an agreed evaluation set before release.']),
  module('knowledge', 'Knowledge and document authority', 'ระบบจัดการความรู้และสิทธิ์เอกสาร', [
    'Define the document authority matrix, role-based access rules, ingestion pipeline and vector index over approved sources.',
    'Configure citation enforcement, document superseding and PDPA deletion or retention procedures.']),
  module('governance', 'AI governance and approval controls', 'การควบคุมและอนุมัติการทำงานของ AI', [
    'Define execution policies separating automated actions from actions requiring human approval, refusal or escalation.',
    'Implement approval gates, confidence or value thresholds, stop controls and tamper-evident audit logging.']),
  module('channels', 'Channel and intake integration', 'เชื่อมต่อช่องทางรับเรื่องและ LINE OA', [
    'Connect the agreed intake channel with intent routing, attachment handling and operator handoff.',
    'Validate bilingual Thai-English message handling and fallback to human operators.']),
  module('document_ai', 'Thai fiscal and document verification', 'ตรวจสอบเอกสารภาษีและหลักฐานการโอน', [
    'Configure extraction and verification rules for agreed Thai business documents, tax invoices and payment slips.',
    'Validate field extraction, duplicate detection and exception routing to the operator review queue.']),
  module('erp_integration', 'ERP and business system integration', 'เชื่อมต่อระบบ ERP และระบบงานภายใน', [
    'Integrate approved connectors or APIs for the customer accounting, ERP or line-of-business systems.',
    'Validate end-to-end transaction posting, reconciliation, error handling and rollback procedures.']),
  module('gpu_platform', 'GPU scheduling and platform integration', 'จัดการทรัพยากร GPU และแพลตฟอร์ม', [
    'Configure GPU drivers, device plugins, partitioning or quota isolation and workload placement on the target platform.',
    'Validate GPU utilization, scheduling policies and recovery behavior under representative load.']),
  module('observability', 'Monitoring, evaluation and cost telemetry', 'การติดตามผลและวัดประสิทธิภาพ', [
    'Connect inference health, latency, throughput, escalation rates and audit metrics to the agreed monitoring platform.',
    'Demonstrate alerting and review workflows for model drift, failed actions and operator overrides.']),
  module('airgap', 'Disconnected deployment', 'ติดตั้งแบบไม่เชื่อมต่ออินเทอร์เน็ต', [
    'Stage approved model weights, container images, packages and trust material in internal repositories.',
    'Validate inference, updates and workflow execution without public internet or external API access.']),
  module('retainer', 'Ongoing optimization and retained advisory', 'ดูแลปรับปรุงต่อเนื่องและที่ปรึกษาประจำ', [
    'Review production exceptions, operator corrections, evaluation drift and policy changes on an agreed cadence.',
    'Deliver tested prompt, model, retrieval or policy revisions and architectural guidance across multi-phase rollouts.']),
  module('support', 'Post implementation support', 'บริการหลังติดตั้ง', [
    'Agree the support channel, coverage window, response target and handoff owner before inclusion.',
    'Record incident intake, model rollback and escalation steps in the operations runbook.']),
];
export const DEFAULT_SOW_TEMPLATES = [
  ...LEGACY_SOW_TEMPLATES_V2,
  {
    code: 'enterprise-ai', titleEn: 'Enterprise AI', titleTh: 'ระบบ AI สำหรับองค์กร',
    sow: {
      version: 1,
      summary: pair('Design, implement and hand over an enterprise AI system and governed workflows for the customer-approved environment and data.', 'ออกแบบ ติดตั้ง และส่งมอบระบบ AI สำหรับองค์กร'),
      modules: [
        module('discovery', 'Preparation and design', 'เตรียมงานและออกแบบ', [
          'Hold a kickoff to confirm business objectives, target workflows, data sensitivity, approval boundaries and acceptance criteria.',
          'Review compute, GPU, network, identity, data sources and regulatory prerequisites with customer owners; record gaps and decisions.',
          'Produce an AI architecture, model and workflow design, evaluation plan and rollout sequence for customer approval.'], true),
        module('implementation', 'Enterprise AI implementation', 'ติดตั้งระบบ AI สำหรับองค์กร', [
          'Prepare the approved runtime environment, model artifacts, prompts, policies and integration endpoints.',
          'Configure the agreed AI workflows, access controls, human-review checkpoints and operational logging.',
          'Validate end-to-end execution against representative customer inputs and record configuration baselines.'], true),
        module('validation', 'Validation and acceptance', 'ทดสอบและรับมอบ', [
          'Run accuracy, safety, permission, escalation and failure-recovery checks against the agreed acceptance criteria.',
          'Walk through representative normal and exception cases with customer stakeholders; record results and remediation owners.',
          'Capture acceptance sign-off or agreed exceptions before production cutover.'], true),
        module('handover', 'Operational handover', 'ส่งมอบการดำเนินงาน', [
          'Deliver as-built architecture, model and prompt inventory, policy definitions and standard operating procedures.',
          'Conduct an operator and engineering walkthrough covering routine monitoring, exception handling, rollback and escalation paths.'], true),
        ...optionalAiV2,
      ],
      assumptions: [
        pair('Customer supplies approved infrastructure or GPU capacity, network access, credentials, sample data and domain reviewers before implementation.'),
        pair('Customer remains the data controller and approves document authority, retention rules and human-approval thresholds before production use.')],
      exclusions: [
        pair('Hardware procurement, third-party API consumption charges and unapproved data labeling or migration require separate scope and pricing.'),
        pair('Changes to external ERP schemas, upstream source systems or ongoing operations outside the selected modules are excluded.')],
    },
  },
];

const plain = (v, path, max = 2000) => {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error(`${path} must be plain text up to ${max} characters`);
  return v.trim();
};
const only = (obj, keys, path) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${path} must be an object`);
  for (const key of Object.keys(obj)) if (!keys.includes(key)) throw new Error(`${path}.${key} is not supported`);
};
const validatePair = (v, path) => { only(v, ['en', 'th'], path); return { en: plain(v.en, `${path}.en`), th: plain(v.th ?? '', `${path}.th`) }; };
const pairs = (v, path) => {
  if (!Array.isArray(v) || v.length > 60) throw new Error(`${path} must contain at most 60 items`);
  return v.map((x, i) => validatePair(x, `${path}[${i}]`));
};
export function validateSow(value) {
  if (value == null) return null;
  only(value, ['version', 'summary', 'modules', 'assumptions', 'exclusions'], 'sow');
  if (value.version !== 1) throw new Error('sow.version must be 1');
  if (!Array.isArray(value.modules) || value.modules.length > 40) throw new Error('sow.modules must contain at most 40 modules');
  const codes = new Set();
  const modules = value.modules.map((m, i) => {
    const path = `sow.modules[${i}]`;
    only(m, ['code', 'titleEn', 'titleTh', 'included', 'items'], path);
    const code = plain(m.code, `${path}.code`, 64);
    if (!/^[a-z][a-z0-9_-]*$/.test(code) || codes.has(code)) throw new Error(`${path}.code must be unique and URL-safe`);
    codes.add(code);
    if (typeof m.included !== 'boolean') throw new Error(`${path}.included must be a boolean`);
    return { code, titleEn: plain(m.titleEn, `${path}.titleEn`, 200), titleTh: plain(m.titleTh ?? '', `${path}.titleTh`, 200), included: m.included, items: pairs(m.items, `${path}.items`) };
  });
  return { version: 1, summary: validatePair(value.summary, 'sow.summary'), modules,
    assumptions: pairs(value.assumptions ?? [], 'sow.assumptions'), exclusions: pairs(value.exclusions ?? [], 'sow.exclusions') };
}
export const canonicalSow = validateSow;
export function parseSow(text) {
  if (!text) return null;
  return validateSow(JSON.parse(text));
}
export function parseTemplates(text) {
  const value = JSON.parse(text || '[]');
  if (!Array.isArray(value) || value.length > 30) throw new Error('sow.templates must contain at most 30 templates');
  const codes = new Set();
  return value.map((t, i) => {
    const path = `sow.templates[${i}]`;
    only(t, ['code', 'titleEn', 'titleTh', 'sow'], path);
    const code = plain(t.code, `${path}.code`, 64);
    if (!/^[a-z][a-z0-9_-]*$/.test(code) || codes.has(code)) throw new Error(`${path}.code must be unique and URL-safe`);
    codes.add(code);
    return { code, titleEn: plain(t.titleEn, `${path}.titleEn`, 200), titleTh: plain(t.titleTh ?? '', `${path}.titleTh`, 200), sow: validateSow(t.sow) };
  });
}
export function sowFromTemplate(settings, code) {
  const t = parseTemplates(settings['sow.templates']).find((x) => x.code === code);
  if (!t) throw new Error(`unknown engagement template: ${code}`);
  return structuredClone(t.sow);
}
