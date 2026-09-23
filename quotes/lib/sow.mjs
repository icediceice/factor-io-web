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
