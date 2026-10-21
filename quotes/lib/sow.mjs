// Structured, plain-text statement of work. Templates are seeded into settings,
// then edited by the operator; this module only defines their shape and defaults.
export const pair = (en, th = '') => ({ en, th });
export const toPair = (item) => {
  if (!item) return pair('', '');
  if (typeof item === 'string') return pair(item, '');
  if (Array.isArray(item)) return pair(item[0], item[1] ?? '');
  return pair(item.en ?? '', item.th ?? '');
};
const module = (code, titleEn, titleTh, items, included = false) => ({
  code, titleEn, titleTh, included, items: items.map((s) => pair(s)),
});
const bModule = (code, titleEn, titleTh, items, included = false) => ({
  code, titleEn, titleTh, included, items: items.map(toPair),
});

// Legacy V1 templates (frozen byte length 11846 for schema migration 6)
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

// Legacy V2 templates (frozen byte length 24377 for schema migration 9)
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

// Legacy V3 templates (frozen byte length 32177 for schema migration 10)
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
export const LEGACY_SOW_TEMPLATES_V3 = [
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

// Modern, comprehensive bilingual Kubernetes modules for active engagement templates
const modernKubeModules = [
  bModule('network', 'Network integration', 'การเชื่อมต่อระบบเครือข่าย', [
    ['Record approved node, pod, and service CIDR address ranges, DNS forwarders, and firewall paths in the design.',
     'บันทึกช่วงหมายเลข IP ของ Node, Pod และ Service, DNS Forwarder และนโยบายไฟร์วอลล์ลงในเอกสารการออกแบบ'],
    ['Configure cluster CNI networking provider, validating pod-to-pod, pod-to-service, and external internet or intranet connectivity.',
     'ติดตั้งและกำหนดค่า CNI ของคลัสเตอร์ พร้อมทดสอบการเชื่อมต่อระหว่าง Pod, Service และเครือข่ายภายใน/ภายนอก'],
    ['Validate network policies and ingress/egress filtering rules between namespaces and external service endpoints.',
     'ทดสอบนโยบายความปลอดภัยเครือข่าย (Network Policy) และการกรองทราฟฟิกเข้าออกระหว่างเนมสเปซและระบบภายนอก'],
  ]),
  bModule('ingress', 'Ingress and load balancing', 'ระบบ Ingress และกระจายโหลด', [
    ['Configure the agreed ingress controller, routing entry points, and TLS certificate source (CA or ACME).',
     'กำหนดค่า Ingress Controller จุดรับเส้นทางทราฟฟิก และแหล่งใบรับรองความปลอดภัย TLS (CA ภายในหรือ ACME)'],
    ['Connect the approved load-balancing method (MetalLB, cloud provider, or external appliance) and validate access to a representative service.',
     'เชื่อมต่อระบบ Load Balancer (เช่น MetalLB, Cloud หรือฮาร์ดแวร์ภายนอก) และทดสอบการเข้าถึงบริการตัวอย่าง'],
    ['Verify host-based and path-based HTTP/HTTPS traffic routing, SNI termination, and graceful backend failover.',
     'ทดสอบการกำหนดเส้นทาง HTTP/HTTPS ตามชื่อโฮสต์และพาธ การทำ TLS SNI และการสลับการทำงานไปยังโหนดสำรอง'],
  ]),
  bModule('storage', 'Persistent storage and CSI', 'ระบบจัดเก็บข้อมูลและ CSI', [
    ['Install the supported CSI storage driver and define StorageClasses, reclaim policies, and default volume classes as agreed.',
     'ติดตั้งไดรเวอร์ CSI สตอเรจที่รองรับ พร้อมกำหนดค่า StorageClass, นโยบาย Reclaim และคลาสสตอเรจเริ่มต้น'],
    ['Configure dynamic volume provisioning for block and shared file storage where supported by the underlying storage infrastructure.',
     'กำหนดค่าการจัดสรรพื้นที่อัตโนมัติ (Dynamic Provisioning) ทั้งแบบ Block และ Shared File ตามที่สตอเรจรองรับ'],
    ['Provision, expand, and snapshot a representative persistent volume to demonstrate data persistence and recovery.',
     'ทดสอบการสร้าง ขยายขนาด และทำ Snapshot ของ Persistent Volume เพื่อยืนยันความคงอยู่และความพร้อมกู้คืนข้อมูล'],
  ]),
  bModule('identity', 'Identity and access management', 'ระบบยืนยันตัวตนและการจัดการสิทธิ์', [
    ['Integrate the agreed identity provider (OIDC, SAML, LDAP, or Active Directory) and map user groups to administrator and developer roles.',
     'เชื่อมต่อระบบระบุตัวตน (OIDC, SAML, LDAP หรือ Active Directory) และจับคู่กลุ่มผู้ใช้เข้ากับบทบาทผู้ดูแลและผู้พัฒนา'],
    ['Define namespace boundaries, service accounts, and Role-Based Access Control (RBAC) policies enforcing least-privilege principles.',
     'กำหนดขอบเขตเนมสเปซ บัญชีบริการ (Service Account) และนโยบาย RBAC ตามหลักการกำหนดสิทธิ์เท่าที่จำเป็น (Least Privilege)'],
    ['Validate single sign-on authentication, token refresh, and permission enforcement with representative customer user accounts.',
     'ทดสอบการล็อกอินแบบ Single Sign-On การต่ออายุโทเค็น และการบังคับใช้นโยบายสิทธิ์ด้วยบัญชีผู้ใช้จริง'],
  ]),
  bModule('registry', 'Container image registry', 'ทะเบียนจัดเก็บอิมเมจคอนเทนเนอร์', [
    ['Connect the approved enterprise image registry, service credentials, certificate trust chains, and image pull secrets.',
     'เชื่อมต่อระบบ Container Registry ขององค์กร ข้อมูลประจำตัว ใบรับรองความปลอดภัย และ Image Pull Secret'],
    ['Deploy a sample image from the private registry and verify secure pull behavior from each required cluster node and network segment.',
     'ทดสอบดึงและรันอิมเมจตัวอย่างจาก Private Registry เพื่อตรวจสอบการดึงอิมเมจจากทุกเซกเมนต์เครือข่าย'],
    ['Configure pull-through caching, proxy rules, or vulnerability scanning integration where supported by the registry architecture.',
     'กำหนดค่าระบบแคช (Pull-through Cache) พร็อกซี หรือการเชื่อมต่อระบบตรวจสอบช่องโหว่อิมเมจตามสถาปัตยกรรม'],
  ]),
  bModule('observability', 'Monitoring, logging, and alerting', 'การติดตาม บันทึกประวัติ และแจ้งเตือน', [
    ['Deploy and configure cluster metrics collection (Prometheus), dashboard visualization (Grafana), and core infrastructure health alerts.',
     'ติดตั้งและกำหนดค่าระบบจัดเก็บสถิติคลัสเตอร์ (Prometheus) แดชบอร์ดแสดงผล (Grafana) และการแจ้งเตือนสถานะโครงสร้างพื้นฐาน'],
    ['Configure centralized log aggregation (e.g. Loki, FluentBit, or external SIEM) for cluster events, node logs, and container stdout/stderr.',
     'กำหนดค่าระบบรวบรวมบันทึกประวัติส่วนกลาง (เช่น Loki, FluentBit หรือ SIEM) สำหรับ Event, โฮสต์โหนด และคอนเทนเนอร์'],
    ['Simulate a critical condition to demonstrate alert firing, notification routing, and log trace correlation.',
     'จำลองสถานการณ์วิกฤตเพื่อทดสอบการแจ้งเตือน การส่งต่อไปยังช่องทางที่กำหนด และการสืบค้นบันทึกประวัติที่เกี่ยวข้อง'],
  ]),
  bModule('backup', 'Cluster backup and disaster recovery', 'การสำรองข้อมูลและกู้คืนคลัสเตอร์', [
    ['Confirm protected cluster namespaces, storage target (S3-compatible bucket), retention policies, and recovery objectives with customer owners.',
     'ยืนยันเนมสเปซที่ต้องคุ้มครอง สตอเรจเป้าหมาย (S3) นโยบายระยะเวลาจัดเก็บ และเป้าหมายการกู้คืน (RTO/RPO) ร่วมกับลูกค้า'],
    ['Install and configure Kubernetes backup tooling (e.g. Velero) for cluster manifests, secrets, and persistent volume snapshots.',
     'ติดตั้งและกำหนดค่าระบบสำรองข้อมูล Kubernetes (เช่น Velero) ครอบคลุมการตั้งค่าคลัสเตอร์ ซีเคร็ต และ Persistent Volume Snapshot'],
    ['Execute a scheduled backup and perform a documented disaster recovery restoration exercise into an isolated test namespace.',
     'ดำเนินการสำรองข้อมูลตามตาราง และทดสอบกู้คืนระบบจริงลงในเนมสเปซทดสอบตามคู่มือเพื่อพิสูจน์การกู้คืน'],
  ]),
  bModule('security', 'Security controls and admission policies', 'การควบคุมความปลอดภัยและนโยบายการรับเข้า', [
    ['Apply cluster admission control policies (Pod Security Standards, Kyverno, or OPA Gatekeeper) enforcing container security baselines.',
     'บังคับใช้นโยบายควบคุมการรับเข้าของคลัสเตอร์ (Pod Security Standards, Kyverno หรือ Gatekeeper) เพื่อความปลอดภัยของคอนเทนเนอร์'],
    ['Enforce restriction of privileged containers, root execution, host volume mounts, and insecure capabilities across workload namespaces.',
     'จำกัดการรันคอนเทนเนอร์แบบ Privileged, การรันด้วยสิทธิ์ Root, การเข้าถึง Host Volume และสิทธิ์ที่ไม่ปลอดภัยในเนมสเปซ'],
    ['Validate permitted application deployments and demonstrate automated blocking of non-compliant manifests, documenting audit exceptions.',
     'ทดสอบการรันแอปพลิเคชันที่ปฏิบัติตามนโยบาย และสาธิตการระงับเวิร์กโหลดที่ไม่ผ่านมาตรฐาน พร้อมบันทึกข้อยกเว้น'],
  ]),
  bModule('gitops', 'GitOps continuous delivery', 'การส่งมอบแอปพลิเคชันผ่าน GitOps', [
    ['Deploy and configure an enterprise GitOps controller (ArgoCD or FluxCD) with repository credentials and cluster RBAC integration.',
     'ติดตั้งและกำหนดค่า GitOps Controller (ArgoCD หรือ FluxCD) พร้อมการเชื่อมต่อสิทธิ์เข้าถึงคลังโค้ด (Git) และระบบ RBAC'],
    ['Connect an approved Git repository containing sample application manifests, configuration environments, and automated sync policies.',
     'เชื่อมต่อคลัง Git ที่ได้รับอนุมัติสำหรับจัดเก็บไฟล์คอนฟิกแอปพลิเคชันตัวอย่าง และกำหนดนโยบายการซิงค์อัตโนมัติ'],
    ['Demonstrate automated reconciliation, configuration drift detection, and an audited rollback workflow via Git commit reversion.',
     'สาธิตการซิงค์ข้อมูลอัตโนมัติ การตรวจจับความเปลี่ยนแปลงที่ผิดเพี้ยน (Drift) และขั้นตอนการย้อนกลับเวอร์ชันผ่าน Git'],
  ]),
  bModule('upgrade', 'Lifecycle management and upgrade planning', 'การบริหารวงจรชีวิตและวางแผนอัปเกรด', [
    ['Document supported Kubernetes version paths, API deprecation checkpoints, maintenance window requirements, and prerequisite checklists.',
     'จัดทำเอกสารแนวทางการอัปเกรดเวอร์ชัน Kubernetes ที่รองรับ การตรวจสอบ API ที่เลิกใช้งาน ข้อกำหนดช่วงเวลาซ่อมบำรุง และเช็กลิสต์'],
    ['Produce an operational upgrade runbook detailing control plane and worker node pool upgrade steps, health gates, and rollback decision points.',
     'จัดทำคู่มือขั้นตอนการอัปเกรดทั้ง Control Plane และ Worker Node Pool พร้อมเกณฑ์การตรวจสอบสถานะและจุดตัดสินใจย้อนกลับ'],
    ['Conduct a technical review session with customer engineering teams to walk through upgrade simulations and operational readiness.',
     'จัดการประชุมทบทวนทางเทคนิคร่วมกับทีมวิศวกรของลูกค้าเพื่อซักซ้อมขั้นตอนการอัปเกรดและความพร้อมในการดูแลระบบ'],
  ]),
  bModule('ha_dr', 'High availability and resilience', 'ความพร้อมใช้งานสูงและการรองรับภัยพิบัติ', [
    ['Document control plane quorum requirements, infrastructure failure domains, network redundancy, and recovery point/time expectations.',
     'บันทึกข้อกำหนด Quorum ของ Control Plane การแบ่ง Failure Domain บนโครงสร้างพื้นฐาน การสำรองลิงก์เครือข่าย และเป้าหมาย RPO/RTO'],
    ['Execute simulated node or zone failure tests, observing automated pod rescheduling, control plane failover, and service continuity.',
     'ทดสอบจำลองเหตุการณ์โหนดหรือโซนขัดข้อง เพื่อสังเกตการณ์ย้าย Pod อัตโนมัติ การทำงานต่อเนื่องของ Control Plane และความต่อเนื่องของบริการ'],
    ['Record observed failover timings, recovery telemetry, and recommendations for cluster resilience optimization.',
     'บันทึกระยะเวลาในการเฟลโอเวอร์ ข้อมูลประสิทธิภาพการฟื้นตัว และข้อเสนอแนะในการปรับแต่งความเสถียรของคลัสเตอร์'],
  ]),
  bModule('gpu', 'GPU acceleration and scheduling', 'การประมวลผลและการจัดสรรทรัพยากร GPU', [
    ['Confirm compatible GPU hardware, hypervisor passthrough or vGPU configurations, host drivers, and workload scheduling requirements.',
     'ยืนยันความเข้ากันได้ของฮาร์ดแวร์ GPU การตั้งค่า GPU Passthrough หรือ vGPU ไดรเวอร์บนโฮสต์ และข้อกำหนดการจัดสรรทรัพยากร'],
    ['Install and configure GPU device plugins or operators (e.g. NVIDIA GPU Operator), node feature discovery, and device monitoring.',
     'ติดตั้งและกำหนดค่า GPU Device Plugin หรือ Operator (เช่น NVIDIA GPU Operator), Node Feature Discovery และการติดตามสถานะการใช้ GPU'],
    ['Deploy and validate a representative GPU-accelerated container workload, verifying device allocation, CUDA execution, and utilization telemetry.',
     'ทดสอบรันคอนเทนเนอร์ที่ใช้การประมวลผลผ่าน GPU เพื่อยืนยันการจัดสรรอุปกรณ์ การเรียกใช้ CUDA และการรายงานสถิติการใช้งาน'],
  ]),
  bModule('airgap', 'Disconnected and air-gapped deployment', 'การติดตั้งแบบไม่เชื่อมต่ออินเทอร์เน็ต (Air-gap)', [
    ['Identify, inventory, and mirror all required container images, Helm charts, OS packages, and TLS trust bundles into customer internal registries.',
     'รวบรวมรายการและคัดลอก (Mirror) อิมเมจคอนเทนเนอร์, Helm Chart, แพ็กเกจระบบ และใบรับรองความปลอดภัย เข้าสู่คลังข้อมูลภายในของลูกค้า'],
    ['Configure cluster components, image registries, and package managers to operate strictly within isolated internal network segments.',
     'กำหนดค่าส่วนประกอบคลัสเตอร์ ระบบ Registry และแพ็กเกจเมเนเจอร์ให้ทำงานภายใต้เครือข่ายปิดที่ตัดการเชื่อมต่อภายนอกโดยสมบูรณ์'],
    ['Validate end-to-end cluster deployment and workload launch without access to the public internet or external registries.',
     'ทดสอบการติดตั้งคลัสเตอร์และการรันเวิร์กโหลดตั้งแต่ต้นจนจบโดยไม่มีการเข้าถึงอินเทอร์เน็ตสาธารณะหรือ Registry ภายนอก'],
  ]),
  bModule('support', 'Post-implementation hypercare support', 'บริการสนับสนุนหลังการติดตั้ง (Hypercare)', [
    ['Define support communication channels, coverage hours, incident response time targets, severity classifications, and escalation contacts.',
     'กำหนดช่องทางติดต่อรับบริการสนับสนุน ช่วงเวลาให้บริการ เป้าหมายระยะเวลาตอบกลับ (SLA) ระดับความรุนแรงของปัญหา และผู้รับผิดชอบตามลำดับชั้น'],
    ['Provide technical assistance for customer cluster operations, minor configuration adjustments, and troubleshooting during agreed hypercare window.',
     'ให้บริการช่วยเหลือทางเทคนิคสำหรับการดูแลคลัสเตอร์ การปรับแต่งค่าคอนฟิกย่อย และการแก้ปัญหาขัดข้องในช่วงเวลา Hypercare ที่ตกลง'],
  ]),
];

// Modern, comprehensive bilingual AI modules for active engagement templates
const modernAiModules = [
  bModule('assessment', 'Architecture and readiness assessment', 'การประเมินความพร้อมและออกแบบสถาปัตยกรรม', [
    ['Audit hardware infrastructure, GPU capacity, data readiness, network security constraints, and target business workflows.',
     'ประเมินโครงสร้างพื้นฐานฮาร์ดแวร์ กำลังประมวลผล GPU ความพร้อมของชุดข้อมูล ข้อจำกัดความปลอดภัย และกระบวนการทำงานเป้าหมาย'],
    ['Deliver a comprehensive architecture blueprint, GPU and storage sizing recommendations, and an implementation risk register.',
     'ส่งมอบพิมพ์เขียวสถาปัตยกรรมระบบ ข้อเสนอแนะขนาด GPU และสตอเรจ พร้อมทะเบียนประเมินความเสี่ยงในการดำเนินโครงการ'],
  ]),
  bModule('model_serving', 'Private on-premises model serving', 'ระบบรันโมเดล AI ภายในองค์กร (Private Inference)', [
    ['Deploy and optimize an enterprise inference serving engine (e.g. vLLM, Triton, or TGI) on customer GPU infrastructure.',
     'ติดตั้งและปรับแต่งระบบประมวลผลโมเดล (Inference Engine เช่น vLLM, Triton หรือ TGI) บนฮาร์ดแวร์ GPU ของลูกค้า'],
    ['Validate model loading, concurrency, throughput, response latency, token streaming, and API authentication controls.',
     'ทดสอบการโหลดโมเดล การรองรับการใช้งานพร้อมกัน ความเร็วในการตอบสนอง และการควบคุมความปลอดภัยผ่าน API'],
  ]),
  bModule('model_adaptation', 'Model adaptation, fine-tuning, and evaluation', 'การปรับแต่งเฉพาะทางและการประเมินผลโมเดล', [
    ['Prepare customer domain datasets, prompts, and parameter-efficient fine-tuning (PEFT/LoRA) adapters for Thai and English business tasks.',
     'จัดเตรียมชุดข้อมูลเฉพาะทางขององค์กร ออกแบบ Prompt และปรับแต่งโมเดล (Fine-tuning / LoRA) สำหรับภาษาไทยและภาษาอังกฤษ'],
    ['Benchmark model accuracy, hallucination boundaries, refusal compliance, and performance against customer evaluation rubrics.',
     'ประเมินความแม่นยำของโมเดล การควบคุมไม่ให้สร้างข้อมูลเท็จ (Hallucination) และการปฏิเสธคำขอที่ไม่เหมาะสมตามเกณฑ์ของลูกค้า'],
  ]),
  bModule('knowledge', 'Knowledge retrieval and document authority', 'ระบบสืบค้นข้อมูลองค์กรและกำหนดสิทธิ์เอกสาร (RAG)', [
    ['Implement document ingestion, chunking, and embedding pipelines connecting approved internal knowledge repositories.',
     'สร้างกระบวนการนำเข้าเอกสาร การตัดย่อยข้อมูล (Chunking) และแปลงเป็นเวกเตอร์ เชื่อมโยงกับคลังความรู้ภายในที่ได้รับอนุมัติ'],
    ['Configure vector database indexing, role-based document access filtering, citation enforcement, and data retention rules.',
     'กำหนดค่าฐานข้อมูลเวกเตอร์ (Vector DB) การกรองสิทธิ์การเข้าถึงเอกสารตามบทบาทผู้ใช้ การอ้างอิงแหล่งที่มา และการจัดการอายุข้อมูล'],
  ]),
  bModule('governance', 'AI governance and approval controls', 'การควบคุมและอนุมัติการทำงานของ AI', [
    ['Implement input/output guardrails, prompt injection defenses, sensitive data redaction (PII/PDPA), and content moderation policies.',
     'ติดตั้งระบบคัดกรองข้อความเข้าออก (Guardrails) ป้องกัน Prompt Injection ปกปิดข้อมูลส่วนบุคคล (PDPA) และตรวจจับเนื้อหาไม่เหมาะสม'],
    ['Establish human-in-the-loop review checkpoints, confidence score threshold gates, and tamper-evident audit logging for all AI interactions.',
     'กำหนดจุดตรวจสอบโดยมนุษย์ (Human-in-the-loop) เกณฑ์ระดับความมั่นใจ และการบันทึกประวัติการตัดสินใจของ AI อย่างโปร่งใสและตรวจสอบได้'],
  ]),
  bModule('channels', 'Channel integration and conversational workflows', 'การเชื่อมต่อช่องทางติดต่อและแชตบอตอัตโนมัติ', [
    ['Connect enterprise conversational interfaces (such as LINE Official Account, Microsoft Teams, or web chat) to the AI engine.',
     'เชื่อมต่อช่องทางสื่อสารขององค์กร (เช่น LINE Official Account, Microsoft Teams หรือ Web Chat) เข้ากับระบบ AI'],
    ['Implement bilingual intent classification, multi-turn conversation handling, attachment processing, and human operator escalation.',
     'พัฒนาระบบแยกแยะเจตนา (Intent) รองรับการสนทนาต่อเนื่องสองภาษา การประมวลผลไฟล์แนบ และการส่งต่องานไปยังเจ้าหน้าที่'],
  ]),
  bModule('document_ai', 'Thai fiscal document and slip verification', 'ระบบตรวจสอบเอกสารภาษี ใบเสร็จ และสลิปโอนเงิน', [
    ['Deploy intelligent document processing (OCR/Vision AI) tailored for Thai tax invoices, receipts, and bank payment slips.',
     'ติดตั้งระบบประมวลผลเอกสารอัจฉริยะ (OCR/Vision AI) ที่รองรับใบกำกับภาษี ใบเสร็จรับเงิน และสลิปการโอนเงินของธนาคารไทย'],
    ['Configure automated field extraction, financial math reconciliation, QR bank verification, and exception routing to human reviewers.',
     'ตั้งค่าการดึงข้อมูลอัตโนมัติ ตรวจสอบความถูกต้องของตัวเลข ตรวจสอบ QR Code สลิปธนาคาร และส่งเคสผิดปกติให้เจ้าหน้าที่ตรวจทาน'],
  ]),
  bModule('erp_integration', 'ERP and core business system integration', 'การเชื่อมต่อระบบ ERP และระบบปฏิบัติการหลัก', [
    ['Build secure API connectors integrating AI workflows with enterprise ERP, CRM, accounting, or database systems.',
     'สร้างตัวเชื่อมต่อ API ที่ปลอดภัย เชื่อมโยงระบบ AI เข้ากับ ERP, CRM, ระบบบัญชี หรือฐานข้อมูลขององค์กร'],
    ['Validate automated transactional postings, idempotent error handling, data validation guards, and rollback mechanisms.',
     'ทดสอบการบันทึกธุรกรรมอัตโนมัติ การจัดการข้อผิดพลาด การตรวจสอบความถูกต้องของข้อมูล และขั้นตอนการย้อนกลับธุรกรรม'],
  ]),
  bModule('gpu_platform', 'GPU platform orchestration and scheduling', 'การบริหารจัดการแพลตฟอร์มและทรัพยากร GPU', [
    ['Configure multi-instance GPU (MIG) partitioning, GPU workload queuing, resource quotas, and priority scheduling on Kubernetes.',
     'กำหนดค่าการแบ่งส่วน GPU (MIG), การจัดคิวเวิร์กโหลด, โควตาทรัพยากร และลำดับความสำคัญในการใช้งานบน Kubernetes'],
    ['Validate GPU utilization efficiency, thermal monitoring, device health failover, and dynamic workload scaling under load.',
     'ทดสอบประสิทธิภาพการใช้ GPU การติดตามอุณหภูมิ การสลับการทำงานเมื่ออุปกรณ์ขัดข้อง และการขยายระบบอัตโนมัติตามปริมาณงาน'],
  ]),
  bModule('observability', 'AI monitoring, telemetry, and cost analytics', 'การติดตามประสิทธิภาพ คุณภาพคำตอบ และต้นทุน AI', [
    ['Connect inference token usage, latency metrics, error rates, model drift signals, and cost analytics to centralized dashboards.',
     'เชื่อมต่อสถิติการใช้งาน Token, ความเร็ว (Latency), อัตราข้อผิดพลาด, สัญญาณความเสื่อมถอยของคำตอบ และต้นทุน เข้าสู่แดชบอร์ดส่วนกลาง'],
    ['Configure alerting thresholds for anomaly spikes, degraded response quality, and operator review escalations.',
     'กำหนดเกณฑ์การแจ้งเตือนเมื่อการใช้งานพุ่งสูงผิดปกติ คุณภาพคำตอบลดลง หรือมีรายการรอให้เจ้าหน้าที่ตรวจสอบตกค้าง'],
  ]),
  bModule('airgap', 'Air-gapped and disconnected AI deployment', 'การติดตั้งระบบ AI ในสภาพแวดล้อมเครือข่ายปิด (Air-gap)', [
    ['Stage approved open-weight models, dependencies, vector indexes, and container images inside an air-gapped secure environment.',
     'นำเข้าโมเดลที่ได้รับอนุมัติ ไดรเวอร์ ไลบรารี ฐานข้อมูลเวกเตอร์ และคอนเทนเนอร์เข้าสู่สภาพแวดล้อมเครือข่ายปิดอย่างปลอดภัย'],
    ['Validate complete offline inference, embedding generation, document search, and workflow execution without external network access.',
     'ทดสอบการประมวลผล การแปลงเวกเตอร์ การสืบค้นเอกสาร และการทำงานของระบบทั้งหมดโดยปราศจากการเชื่อมต่ออินเทอร์เน็ต'],
  ]),
  bModule('retainer', 'Retained advisory and ongoing optimization', 'บริการที่ปรึกษาต่อเนื่องและการปรับแต่งเชิงลึก', [
    ['Provide monthly technical review sessions, operator correction feedback analysis, and model performance auditing.',
     'จัดประชุมทบทวนทางเทคนิคประจำเดือน วิเคราะห์ผลการแก้ไขงานของเจ้าหน้าที่ และตรวจสอบประสิทธิภาพโมเดลอย่างต่อเนื่อง'],
    ['Deliver updated prompt patterns, retrieval tuning, adapter enhancements, and architectural roadmap advisory.',
     'ปรับปรุงเทคนิคการเขียน Prompt, การปรับจูนการสืบค้นข้อมูล (RAG), การอัปเดตโมเดล Adapter และให้คำปรึกษาด้านสถาปัตยกรรม'],
  ]),
  bModule('support', 'Post-implementation support and SLA', 'บริการสนับสนุนหลังการติดตั้งและข้อตกลง SLA', [
    ['Establish dedicated enterprise technical support channels, response time SLAs, model rollback runbooks, and escalation paths.',
     'กำหนดช่องทางสนับสนุนทางเทคนิคโดยเฉพาะ ข้อตกลงระดับบริการ (SLA) แผนการย้อนกลับเวอร์ชันโมเดล และขั้นตอนการส่งต่อปัญหา'],
  ]),
];

// Factory for modern bilingual Kubernetes platforms
const modernKube = (code, titleEn, titleTh, summaryEn, summaryTh, platformSteps, assumptions, extraIncluded = []) => ({
  code, titleEn, titleTh,
  sow: {
    version: 1,
    summary: pair(summaryEn, summaryTh),
    modules: [
      bModule('discovery', 'Preparation and architecture design', 'การเตรียมความพร้อมและออกแบบสถาปัตยกรรม', [
        ['Hold a project kickoff with customer stakeholders to confirm cluster architecture, sizing, network IPAM, and change management approvals.',
         'ประชุมเปิดโครงการร่วมกับผู้เกี่ยวข้องเพื่อยืนยันสถาปัตยกรรมคลัสเตอร์ ขนาดทรัพยากร แผนจัดสรร IP เครือข่าย และขั้นตอนการอนุมัติการเปลี่ยนแปลง'],
        ['Review compute, hypervisor, network, storage, identity, and firewall prerequisites with system owners; record gaps and decisions.',
         'ตรวจสอบความพร้อมของระบบประมวลผล, ไฮเปอร์ไวเซอร์, เครือข่าย, สตอเรจ, ระบบระบุตัวตน และไฟร์วอลล์ พร้อมบันทึกข้อจำกัดและการตัดสินใจ'],
        ['Produce an approved architecture design document and deployment readiness matrix before provisioning begins.',
         'จัดทำและส่งมอบเอกสารการออกแบบสถาปัตยกรรม (Design Document) และตารางความพร้อมก่อนเริ่มการติดตั้งจริง'],
      ], true),
      bModule('implementation', `${titleEn} implementation`, `การติดตั้งและตั้งค่า ${titleTh}`, platformSteps, true),
      ...extraIncluded,
      bModule('validation', 'Validation and acceptance testing', 'การทดสอบระบบและตรวจรับมอบงาน', [
        ['Run platform health, high availability, node scheduling, networking, and dynamic storage tests against the approved design.',
         'ทดสอบความพร้อมของแพลตฟอร์ม, การทำงานแบบ HA, การจัดสรร Pod, เครือข่าย และการจัดสรรสตอเรจตามการออกแบบที่ได้รับอนุมัติ'],
        ['Deploy and cycle a representative multi-tier application; record verification evidence, open issues, and remediation owners.',
         'ทดสอบติดตั้งและทดสอบการทำงานของแอปพลิเคชันตัวอย่างแบบหลายชั้น พร้อมบันทึกหลักฐานผลการทดสอบและผู้รับผิดชอบ'],
        ['Execute operational validation checklist with customer engineering team and capture formal acceptance sign-off.',
         'ดำเนินการทดสอบตามรายการตรวจรับมอบ (UAT Checklist) ร่วมกับทีมวิศวกรของลูกค้า และบันทึกการลงนามตรวจรับ'],
      ], true),
      bModule('handover', 'Operational handover and knowledge transfer', 'การส่งมอบระบบและถ่ายทอดความรู้การดำเนินงาน', [
        ['Deliver comprehensive as-built documentation, cluster configuration inventory, access handover, and operational runbook.',
         'ส่งมอบเอกสาร As-Built ฉบับสมบูรณ์ รายละเอียดการกำหนดค่าคลัสเตอร์ ข้อมูลการส่งมอบสิทธิ์ และคู่มือการปฏิบัติงาน (Runbook)'],
        ['Conduct an administrator walkthrough covering routine health checks, node scaling, common failure recovery, and escalation paths.',
         'จัดอบรมถ่ายทอดความรู้แก่ผู้ดูแลระบบ ครอบคลุมการตรวจสอบสถานะประจำวัน การขยายโหนด การกู้คืนระบบเบื้องต้น และช่องทางติดต่อ'],
      ], true),
      ...modernKubeModules,
    ],
    assumptions: assumptions.map(toPair),
    exclusions: [
      pair('Application refactoring, code migration, containerization of customer software, and managed ongoing administration require separate scope and pricing.',
           'การปรับแก้ซอร์สโค้ด การย้ายแอปพลิเคชัน การทำคอนเทนเนอร์ให้แก่ซอฟต์แวร์ของลูกค้า และบริการดูแลระบบต่อเนื่องอยู่นอกเหนือขอบเขตงาน เว้นแต่จะระบุและคิดราคาแยกต่างหาก'),
      pair('Hardware procurement, third-party software licensing, and modifications to infrastructure outside the approved platform topology are excluded.',
           'ไม่รวมการจัดซื้ออุปกรณ์ฮาร์ดแวร์ ค่าไลเซนส์ซอฟต์แวร์ของบุคคลที่สาม และการแก้ไขระบบโครงสร้างพื้นฐานที่อยู่นอกเหนือสถาปัตยกรรมที่ตกลง'),
    ],
  },
});

// Modern, active default engagement templates with rich bilingual content and NKP turnkey integration scope
export const DEFAULT_SOW_TEMPLATES = [
  {
    code: 'os-install', titleEn: 'OS installation', titleTh: 'ติดตั้งระบบปฏิบัติการ',
    sow: {
      version: 1,
      summary: pair('Install, configure, harden, and hand over the customer-approved server operating system on target hosts.',
                    'ติดตั้ง กำหนดค่าความปลอดภัย และส่งมอบระบบปฏิบัติการเซิร์ฟเวอร์ตามที่ได้รับอนุมัติบนเครื่องเป้าหมาย'),
      modules: [
        bModule('discovery', 'Preparation and design', 'การเตรียมความพร้อมและออกแบบ', [
          ['Confirm target physical or virtual hosts, approved OS edition, deployment method, hostname conventions, IP allocations, and maintenance window.',
           'ยืนยันเครื่องเป้าหมายทั้งกายภาพหรือเสมือน รุ่นระบบปฏิบัติการที่ได้รับอนุมัติ วิธีการติดตั้ง ข้อกำหนดการตั้งชื่อ การจัดสรร IP และช่วงเวลาดำเนินการ'],
          ['Review CPU, memory, storage partitioning, RAID layout, network interfaces, firmware baselines, and backup prerequisites; document open gaps.',
           'ตรวจสอบความพร้อมของ CPU, หน่วยความจำ, การแบ่งพาร์ติชันดิสก์, โครงสร้าง RAID, การเชื่อมต่อเครือข่าย, เฟิร์มแวร์ และระบบสำรองข้อมูล พร้อมบันทึกข้อจำกัด'],
          ['Establish a deployment checklist, validation test criteria, and documented rollback procedure with system owners prior to installation.',
           'จัดทำรายการตรวจสอบขั้นตอนการติดตั้ง เกณฑ์การทดสอบตรวจรับ และแผนขั้นตอนการย้อนกลับ (Rollback) ร่วมกับผู้ดูแลระบบก่อนเริ่มงาน'],
        ], true),
        bModule('installation', 'OS implementation', 'การติดตั้งและตั้งค่าระบบปฏิบัติการ', [
          ['Install approved OS image and configure system locale, time synchronization (NTP), hostname, network interfaces, and bonded or VLAN interfaces.',
           'ติดตั้งอิมเมจระบบปฏิบัติการที่ได้รับอนุมัติ กำหนดค่า Timezone, ระบบเทียบเวลา (NTP), ชื่อโฮสต์, เครือข่าย และการรวมการเชื่อมต่อ (Bonding/VLAN)'],
          ['Configure local storage layout, filesystems, volume groups (LVM), mount options, swap allocation, and redundant boot paths.',
           'กำหนดค่าโครงสร้างสตอเรจ โครงสร้างไฟล์ซิสเต็ม วอลุ่มกรุ๊ป (LVM), Mount Options, การจัดสรร Swap และพาธการบูตสำรอง'],
          ['Configure administrator access, SSH keys, sudo privilege policies, approved package repositories, and core baseline OS packages.',
           'กำหนดค่าการเข้าถึงของผู้ดูแลระบบ กุญแจ SSH สิทธิ์ sudo แหล่งดาวน์โหลดแพ็กเกจ (Repository) และแพ็กเกจมาตรฐานของระบบ'],
          ['Verify kernel parameters, sysctl optimizations, core system services, and log rotation baselines.',
           'ปรับแต่งค่าพารามิเตอร์ของเคอร์เนล (sysctl) บริการพื้นฐานของระบบ และการจัดการบันทึกประวัติ (Log rotation)'],
        ], true),
        bModule('validation', 'Validation and acceptance', 'การทดสอบระบบและตรวจรับมอบ', [
          ['Validate system boot behavior, reboot recovery, network reachability, DNS name resolution, NTP synchronization, and administrator access.',
           'ทดสอบการบูตระบบ การรีบูตคืนสภาพ การเชื่อมต่อเครือข่าย การแปลงชื่อโดเมน (DNS) การซิงค์เวลา และการเข้าถึงของผู้ดูแลระบบ'],
          ['Verify storage throughput, filesystem read/write stability, interface failover, and hardware sensor telemetry where supported.',
           'ทดสอบประสิทธิภาพสตอเรจ ความเสถียรในการอ่านเขียนไฟล์ การสลับสายสัญญาณเครือข่ายสำรอง (Failover) และเซ็นเซอร์ฮาร์ดแวร์'],
          ['Review installation results and verification evidence against agreed acceptance criteria with customer stakeholders.',
           'ตรวจสอบผลการติดตั้งและหลักฐานการทดสอบเทียบกับเกณฑ์การตรวจรับมอบร่วมกับตัวแทนของผู้ว่าจ้าง'],
        ], true),
        bModule('handover', 'Operational handover', 'การส่งมอบระบบและถ่ายทอดความรู้', [
          ['Deliver as-built documentation, host configuration sheet, IP and credential inventory, and recovery instructions.',
           'ส่งมอบเอกสาร As-Built บันทึกรายละเอียดการกำหนดค่า รายการ IP และบัญชีผู้ใช้ พร้อมคู่มือขั้นตอนการกู้คืนระบบ'],
          ['Conduct an operational walkthrough covering routine administration, service management, patch application, and support contacts.',
           'ถ่ายทอดความรู้การดำเนินงานครอบคลุมการบริหารจัดการประจำวัน การดูแลเซอร์วิส การอัปเดตแพตช์ และช่องทางติดต่อรับบริการ'],
        ], true),
        bModule('hardening', 'Security baseline and hardening', 'การเสริมความปลอดภัยและอัปเดตแพตช์', [
          ['Apply customer-approved OS security baseline (e.g. CIS benchmarks), firewall rules, and mandatory access control policies.',
           'บังคับใช้มาตรฐานความปลอดภัยระบบปฏิบัติการ (เช่น CIS Benchmark) กำหนดค่าไฟร์วอลล์ และนโยบายการควบคุมสิทธิ์การเข้าถึง'],
          ['Apply approved security patches, disable unnecessary services, and enforce password complexity and SSH hardening policies.',
           'ติดตั้งแพตช์ความปลอดภัยล่าสุด ปิดการทำงานของเซอร์วิสที่ไม่จำเป็น และบังคับใช้นโยบายความซับซ้อนของรหัสผ่านและความปลอดภัย SSH'],
        ]),
        bModule('monitoring', 'Monitoring and telemetry integration', 'การเชื่อมต่อระบบตรวจสอบและเฝ้าระวัง', [
          ['Install and configure monitoring agents, node exporters, and log forwarders to the customer central monitoring system.',
           'ติดตั้งและกำหนดค่า Agent ระบบตรวจสอบสถานะเครื่อง (Node Exporter) และตัวส่งต่อบันทึกประวัติ (Log Forwarder) ไปยังระบบส่วนกลาง'],
          ['Verify metrics collection, resource threshold alerts (CPU, memory, disk, network), and trigger a sample test alert.',
           'ตรวจสอบการจัดเก็บข้อมูลสถิติ การแจ้งเตือนเมื่อใช้ทรัพยากรเกินเกณฑ์ (CPU, Memory, Disk, Network) และทดสอบส่งสัญญาณแจ้งเตือน'],
        ]),
        bModule('backup', 'Backup integration', 'การเชื่อมต่อระบบสำรองข้อมูล', [
          ['Install approved backup agent, configure backup schedules for operating system configuration and essential data volumes.',
           'ติดตั้ง Agent สำรองข้อมูลที่ได้รับอนุมัติ กำหนดตารางการสำรองข้อมูลการตั้งค่าระบบปฏิบัติการและวอลุ่มข้อมูลสำคัญ'],
          ['Perform a test backup and complete a documented restore exercise of system configurations to verify recoverability.',
           'ดำเนินการทดสอบสำรองข้อมูลและทดสอบกู้คืนไฟล์การตั้งค่าระบบตามคู่มือเพื่อยืนยันความพร้อมในการกู้คืน'],
        ]),
      ],
      assumptions: [
        pair('Customer supplies target physical or virtual hosts, OS entitlements, installation media, network access, and change approvals before installation starts.',
             'ลูกค้าจัดเตรียมเครื่องเป้าหมายทั้งกายภาพหรือเสมือน ไลเซนส์ระบบปฏิบัติการ สื่อสำหรับติดตั้ง การเข้าถึงเครือข่าย และการอนุมัติการเปลี่ยนแปลงก่อนเริ่มงาน'),
      ],
      exclusions: [
        pair('Application installation, application configuration, data migration, and ongoing day-to-day administration require separate scope and pricing.',
             'การติดตั้งแอปพลิเคชัน การตั้งค่าแอปพลิเคชัน การย้ายข้อมูล และการดูแลระบบประจำวันอยู่นอกเหนือขอบเขตงาน เว้นแต่จะระบุและคิดราคาแยกต่างหาก'),
        pair('Hardware replacement, firmware updates beyond OS prerequisites, and procurement of third-party licenses are excluded.',
             'ไม่รวมการเปลี่ยนอุปกรณ์ฮาร์ดแวร์ การอัปเดตเฟิร์มแวร์ที่อยู่นอกเหนือข้อกำหนดของระบบปฏิบัติการ และการจัดซื้อไลเซนส์ซอฟต์แวร์อื่น'),
      ],
    },
  },
  modernKube('openshift', 'Red Hat OpenShift', 'Red Hat OpenShift',
    'Design, implement, configure, and hand over an enterprise Red Hat OpenShift Container Platform cluster for customer workloads.',
    'ออกแบบ ติดตั้ง กำหนดค่า และส่งมอบแพลตฟอร์ม Red Hat OpenShift Container Platform สำหรับเวิร์กโหลดขององค์กร',
    [
      ['Validate hardware infrastructure, DNS records, load balancing VIPs, and OpenShift pull secrets before cluster deployment.',
       'ตรวจสอบความพร้อมของโครงสร้างพื้นฐาน รายการ DNS, VIP ของ Load Balancer และ OpenShift Pull Secret ก่อนเริ่มติดตั้ง'],
      ['Deploy OpenShift bootstrap and control plane nodes to the approved physical or virtual topology.',
       'ติดตั้งโหนด OpenShift Bootstrap และ Control Plane ตามโครงสร้างสถาปัตยกรรมทั้งกายภาพหรือเสมือนที่ได้รับอนุมัติ'],
      ['Join and configure OpenShift worker and infrastructure nodes, verifying machine-config-operator status and node health.',
       'เชื่อมต่อและกำหนดค่า Worker Node และ Infra Node พร้อมตรวจสอบสถานะของ Machine Config Operator และความพร้อมของโหนด'],
      ['Configure cluster operators, internal image registry, cluster networking, and administrative credentials.',
       'กำหนดค่า Cluster Operators, Image Registry ภายใน, ระบบเครือข่ายคลัสเตอร์ และข้อมูลประจำตัวสำหรับการดูแลระบบ'],
      ['Deploy a representative sample workload to validate pod scheduling, service routing, and cluster operator stability.',
       'ทดสอบติดตั้งเวิร์กโหลดตัวอย่างเพื่อตรวจสอบการกระจาย Pod, การกำหนดเส้นทางบริการ และความเสถียรของ Operator'],
    ],
    [
      ['Customer supplies supported hardware or virtualization infrastructure, valid Red Hat OpenShift subscriptions, and designated IP allocations.',
       'ลูกค้าจัดเตรียมฮาร์ดแวร์หรือระบบเสมือนที่รองรับ ไลเซนส์ Red Hat OpenShift ที่ยังไม่หมดอายุ และรายการ IP สำหรับคลัสเตอร์'],
      ['Customer provides external DNS entries, load-balancer VIP configurations, and firewall openings between cluster nodes prior to installation.',
       'ลูกค้าจัดเตรียมรายการ DNS ภายนอก, การตั้งค่า VIP ของ Load Balancer และการเปิดพอร์ตไฟร์วอลล์ระหว่างโหนดคลัสเตอร์ก่อนเริ่มงาน'],
    ]
  ),
  modernKube('nkp', 'Nutanix Kubernetes Platform', 'Nutanix Kubernetes Platform',
    'Design, implement, integrate, and hand over a turnkey Nutanix Kubernetes Platform (NKP) environment with complete infrastructure and storage integration for customer workloads.',
    'ออกแบบ ติดตั้ง เชื่อมต่อระบบ และส่งมอบแพลตฟอร์ม Nutanix Kubernetes Platform (NKP) แบบพร้อมใช้งาน พร้อมการเชื่อมต่อระบบโครงสร้างพื้นฐานและสตอเรจอย่างสมบูรณ์',
    [
      ['Prepare deployment bootstrap tooling, CLI environment, and approved NKP OS images in Nutanix Prism Central.',
       'เตรียมเครื่องมือสำหรับการติดตั้ง (NKP CLI) และอัปโหลดอิมเมจระบบปฏิบัติการของ NKP ที่รองรับเข้าสู่ Nutanix Prism Central'],
      ['Provision the NKP Management Cluster on Nutanix AHV and configure platform management controllers and Cluster API (CAPX).',
       'ติดตั้ง NKP Management Cluster บน Nutanix AHV พร้อมกำหนดค่าคอนโทรลเลอร์สำหรับบริหารจัดการและ Cluster API Provider for Nutanix (CAPX)'],
      ['Provision the agreed NKP Workload Clusters, control plane nodes, and worker node pools across Nutanix failure domains.',
       'ติดตั้ง NKP Workload Cluster, โหนด Control Plane และ Worker Node Pool ตามการแบ่ง Failure Domain บน Nutanix'],
      ['Configure cluster autoscaling, node remediation policies, and secure administrative kubeconfig access.',
       'กำหนดค่านโยบาย Cluster Autoscaling, การกู้คืนโหนดอัตโนมัติ (Node Remediation) และการเข้าถึงผ่าน Kubeconfig อย่างปลอดภัย'],
    ],
    [
      ['Customer supplies supported Nutanix cluster capacity, Prism Central administrator access, and active NKP software licenses.',
       'ลูกค้าจัดเตรียมทรัพยากรบน Nutanix Cluster ที่รองรับ สิทธิ์ผู้ดูแลระบบบน Prism Central และไลเซนส์ NKP ที่ถูกต้อง'],
      ['Customer provides dedicated network VLANs, gateway routing, IP pools for nodes and load balancers, and external DNS/NTP services.',
       'ลูกค้าจัดเตรียมเครือข่าย VLAN, เกตเวย์, ช่วง IP สำหรับโหนดและ Load Balancer ตลอดจนบริการ DNS และ NTP'],
      ['Customer supplies S3-compatible bucket target (such as Nutanix Objects) and storage network connectivity for persistent storage and backup.',
       'ลูกค้าจัดเตรียม S3 Bucket (เช่น Nutanix Objects) และการเชื่อมต่อเครือข่ายสตอเรจสำหรับระบบจัดเก็บข้อมูลและการสำรองข้อมูล'],
    ],
    // Turnkey default NKP integration scope for partner reference
    [
      bModule('nkp_integration', 'NKP platform integration', 'การเชื่อมต่อระบบและแพลตฟอร์ม Nutanix NKP', [
        ['Configure Nutanix Prism Central integration, VM placement policies, network subnet mappings, and hardware anti-affinity rules.',
         'เชื่อมต่อ Nutanix Prism Central กำหนดนโยบายการจัดวาง VM การจับคู่ซับเน็ตเครือข่าย และกฎ Anti-affinity สำหรับโหนด'],
        ['Deploy and configure Nutanix CSI Driver, providing Nutanix Volumes block StorageClasses and Nutanix Files NFS shared StorageClasses.',
         'ติดตั้งและกำหนดค่า Nutanix CSI Driver รองรับ StorageClass ทั้ง Nutanix Volumes (Block) และ Nutanix Files (NFS/RWX)'],
        ['Configure VolumeSnapshotClass for CSI-driven snapshot creation, validation, and volume expansion capabilities.',
         'กำหนดค่า VolumeSnapshotClass เพื่อรองรับการทำ Snapshot ของ Persistent Volume และทดสอบการขยายขนาดวอลุ่ม'],
        ['Configure Ingress and Load Balancing services (e.g. MetalLB IP address pools or external load balancer routing) for application workloads.',
         'กำหนดค่าระบบ Ingress และ Load Balancer (เช่น การจัดสรร IP Pool ของ MetalLB หรือภายนอก) สำหรับกระจายทราฟฟิกเข้าสู่แอปพลิเคชัน'],
        ['Integrate NKP Dashboard with enterprise identity provider (OIDC/Keycloak with Active Directory or LDAP) and configure workspace RBAC roles.',
         'เชื่อมต่อระบบล็อกอินของ NKP Dashboard กับ Identity Provider ขององค์กร (OIDC/Keycloak เชื่อมต่อ AD/LDAP) และกำหนดสิทธิ์ RBAC ตามโปรเจกต์'],
        ['Enable NKP platform observability stack (Prometheus, Grafana, and Alertmanager) for cluster telemetry, metrics, and health alerts.',
         'เปิดใช้งานและปรับแต่งระบบ Observability มาตรฐานของ NKP (Prometheus, Grafana, Alertmanager) สำหรับติดตามสถานะและแจ้งเตือน'],
        ['Configure cluster backup integration using Velero with Nutanix Objects (S3-compatible) for scheduled cluster and persistent volume backups.',
         'เชื่อมต่อระบบสำรองข้อมูลคลัสเตอร์ด้วย Velero ร่วมกับ Nutanix Objects (S3) เพื่อสำรองการตั้งค่าและ Persistent Volume ตามรอบเวลา'],
      ], true),
    ]
  ),
  modernKube('vanilla-kube', 'Upstream Kubernetes', 'Upstream Kubernetes',
    'Design, implement, configure, and hand over a CNCF-conformant upstream Kubernetes cluster for customer workloads.',
    'ออกแบบ ติดตั้ง กำหนดค่า และส่งมอบคลัสเตอร์ Upstream Kubernetes ตามมาตรฐาน CNCF สำหรับเวิร์กโหลดของลูกค้า',
    [
      ['Confirm supported distribution tooling, container runtime, version policy, and multi-master control plane topology.',
       'ยืนยันเครื่องมือติดตั้ง Runtime ของคอนเทนเนอร์ นโยบายเวอร์ชัน และโครงสร้าง Control Plane แบบหลายโหนด'],
      ['Prepare host packages and kernel modules, then bootstrap high-availability control plane nodes with secure etcd clustering.',
       'เตรียมแพ็กเกจระบบและเคอร์เนลโมดูล จากนั้นติดตั้ง Control Plane แบบ High Availability พร้อม etcd คลัสเตอร์ที่ปลอดภัย'],
      ['Join worker nodes, configure cluster networking, and configure administrative access tools (kubectl, kubeconfig).',
       'เชื่อมต่อ Worker Node เข้าสู่คลัสเตอร์ ติดตั้งระบบเครือข่าย และกำหนดค่าเครื่องมือจัดการ (kubectl, kubeconfig)'],
      ['Validate node readiness, CoreDNS resolution, internal cluster routing, and deployment of a representative workload.',
       'ทดสอบความพร้อมของโหนด การทำงานของ CoreDNS การกำหนดเส้นทางภายในคลัสเตอร์ และการรันเวิร์กโหลดตัวอย่าง'],
    ],
    [
      ['Customer supplies supported physical or virtual machines, network access, IP allocations, and administrative SSH access.',
       'ลูกค้าจัดเตรียมเครื่องเซิร์ฟเวอร์หรือเครื่องเสมือนที่รองรับ การเข้าถึงเครือข่าย รายการ IP และสิทธิ์การเข้าถึงผ่าน SSH'],
      ['Customer provides external DNS, load balancing for control plane VIP, and compatible storage backing for persistent data.',
       'ลูกค้าจัดเตรียม DNS ภายนอก Load Balancer สำหรับ VIP ของ Control Plane และระบบสตอเรจที่รองรับสำหรับเก็บข้อมูล'],
    ]
  ),
  {
    code: 'enterprise-ai', titleEn: 'Enterprise AI', titleTh: 'ระบบ AI สำหรับองค์กร',
    sow: {
      version: 1,
      summary: pair('Design, implement, govern, and hand over an enterprise AI system and governed workflows for customer-approved environments and data.',
                    'ออกแบบ ติดตั้ง ควบคุมความปลอดภัย และส่งมอบระบบ AI สำหรับองค์กร พร้อมกระบวนการทำงานที่ได้รับการกำกับดูแลบนข้อมูลที่ได้รับอนุมัติ'),
      modules: [
        bModule('discovery', 'Preparation and design', 'การเตรียมความพร้อมและออกแบบ', [
          ['Hold a kickoff to confirm business objectives, target workflows, data sensitivity, approval boundaries, and acceptance criteria.',
           'ประชุมเปิดโครงการเพื่อยืนยันเป้าหมายทางธุรกิจ กระบวนการทำงานเป้าหมาย ระดับชั้นความลับข้อมูล ขอบเขตการอนุมัติ และเกณฑ์ตรวจรับ'],
          ['Review compute, GPU, network, identity, data sources, and regulatory prerequisites with customer owners; record gaps and decisions.',
           'ตรวจสอบความพร้อมของระบบประมวลผล, GPU, เครือข่าย, สิทธิ์การเข้าถึง, แหล่งข้อมูล และข้อกำหนดกฎหมาย พร้อมบันทึกข้อสรุป'],
          ['Produce an AI architecture, model and workflow design, evaluation plan, and rollout sequence for customer approval.',
           'จัดทำสถาปัตยกรรมระบบ AI การออกแบบโมเดลและขั้นตอนการทำงาน แผนการประเมินผล และลำดับการติดตั้งเพื่อขออนุมัติ'],
        ], true),
        bModule('implementation', 'Enterprise AI implementation', 'การติดตั้งระบบ AI สำหรับองค์กร', [
          ['Prepare the approved runtime environment, model artifacts, prompts, policies, and integration endpoints.',
           'จัดเตรียมสภาพแวดล้อมระบบ ไฟล์โมเดลที่ได้รับอนุมัติ ชุด Prompt นโยบายการทำงาน และจุดเชื่อมต่อบริการ (API)'],
          ['Configure the agreed AI workflows, access controls, human-review checkpoints, and operational logging.',
           'กำหนดค่ากระบวนการทำงาน AI การควบคุมสิทธิ์ จุดตรวจสอบโดยเจ้าหน้าที่ (Human-review) และการบันทึกประวัติการทำงาน'],
          ['Validate end-to-end execution against representative customer inputs and record configuration baselines.',
           'ทดสอบการทำงานตั้งแต่ต้นจนจบด้วยชุดข้อมูลตัวอย่างของลูกค้า และบันทึกค่าคอนฟิกมาตรฐานของระบบ'],
        ], true),
        bModule('validation', 'Validation and acceptance', 'การทดสอบระบบและตรวจรับมอบ', [
          ['Run accuracy, safety, permission, escalation, and failure-recovery checks against the agreed acceptance criteria.',
           'ทดสอบความแม่นยำ ความปลอดภัย การจำกัดสิทธิ์ การส่งต่อเคสผิดปกติ และการฟื้นตัวจากข้อผิดพลาดตามเกณฑ์ตรวจรับ'],
          ['Walk through representative normal and exception cases with customer stakeholders; record results and remediation owners.',
           'สาธิตการทำงานทั้งกรณีปกติและกรณีข้อยกเว้นร่วมกับผู้เกี่ยวข้อง พร้อมบันทึกผลการทดสอบและผู้รับผิดชอบการแก้ไข'],
          ['Capture acceptance sign-off or agreed exceptions before production cutover.',
           'บันทึกการลงนามตรวจรับมอบงานหรือข้อยกเว้นที่ตกลงร่วมกันก่อนเปิดใช้งานจริง'],
        ], true),
        bModule('handover', 'Operational handover', 'การส่งมอบระบบและถ่ายทอดความรู้', [
          ['Deliver as-built architecture, model and prompt inventory, policy definitions, and standard operating procedures.',
           'ส่งมอบเอกสาร As-Built สถาปัตยกรรม รายการโมเดลและ Prompt คำจำกัดความนโยบาย และคู่มือขั้นตอนการปฏิบัติงาน (SOP)'],
          ['Conduct an operator and engineering walkthrough covering routine monitoring, exception handling, rollback, and escalation paths.',
           'จัดอบรมแก่ทีมปฏิบัติการและวิศวกร ครอบคลุมการเฝ้าระวังประจำวัน การจัดการข้อยกเว้น การย้อนกลับเวอร์ชัน และช่องทางส่งต่อปัญหา'],
        ], true),
        ...modernAiModules,
      ],
      assumptions: [
        pair('Customer supplies approved compute or GPU infrastructure, secure network access, credentials, sample datasets, and designated subject matter experts before work starts.',
             'ลูกค้าจัดเตรียมโครงสร้างพื้นฐานฮาร์ดแวร์หรือ GPU การเข้าถึงเครือข่ายที่ปลอดภัย ข้อมูลประจำตัว ชุดข้อมูลตัวอย่าง และผู้เชี่ยวชาญร่วมดำเนินงาน'),
        pair('Customer remains the data controller responsible for data classification, privacy compliance (PDPA), and approving document authority rules.',
             'ลูกค้ายังคงเป็นผู้ควบคุมข้อมูล (Data Controller) ที่รับผิดชอบการจัดชั้นความลับ การปฏิบัติตามกฎหมาย PDPA และการอนุมัติสิทธิ์การเข้าถึงเอกสาร'),
      ],
      exclusions: [
        pair('Training base foundation models from scratch, proprietary hardware acquisition, and external third-party API token fees are excluded.',
             'ไม่รวมการเทรนโมเดลพื้นฐาน (Foundation Model) ใหม่ตั้งแต่ต้น การจัดซื้อฮาร์ดแวร์ และค่าบริการ Token ของ API ภายนอก'),
        pair('Changes to upstream legacy database schemas, line-of-business software modifications, and ongoing manual data labeling are excluded.',
             'ไม่รวมการแก้ไขโครงสร้างฐานข้อมูลเดิมขององค์กร การปรับแก้ซอฟต์แวร์ทางธุรกิจ และการติดแท็กข้อมูล (Data Labeling) ประจำวัน'),
      ],
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
