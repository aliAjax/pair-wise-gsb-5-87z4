// License Lens 许可证策略：处理结论按「交付场景 × 许可证族」计算，不再写死在依赖上。

export type ScenarioId = 'internal' | 'closed' | 'open';

// blocked=阻塞发布  warn=需要复核  ok=放行
export type Verdict = 'ok' | 'warn' | 'blocked';
// 叠加人工放行后的实际结论：exempt=已人工放行
export type EffectiveVerdict = Verdict | 'exempt';

export type LicenseFamily =
  | 'permissive' // MIT / BSD 等宽松许可
  | 'apache'
  | 'lgpl'
  | 'gpl'
  | 'agpl'
  | 'unknown';

export interface Dep {
  id: number;
  name: string;
  version: string;
  license: string;
  source: string;
  note?: string;
}

// 人工放行记录：只针对当前场景下被判为阻塞（blocked）的依赖
export interface Exemption {
  id: string;
  depId: number;
  scenario: ScenarioId;
  owner: string; // 负责人
  reason: string; // 放行原因
  expiresAt: string; // 到期日 yyyy-mm-dd，到期后自动恢复阻塞
  createdAt: string;
}

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  desc: string;
}

export const scenarios: ScenarioDef[] = [
  {id: 'internal', name: '内部试用', desc: '仅内部环境使用，不对外分发'},
  {id: 'closed', name: '闭源交付', desc: '随闭源产品对外分发'},
  {id: 'open', name: '开源发布', desc: '以开源形式公开发布'},
];

// 判断许可证族（注意顺序：AGPL/LGPL 要先于 GPL 判断）
export function licenseFamily(license: string): LicenseFamily {
  const l = license.toUpperCase();
  if (l.includes('AGPL')) return 'agpl';
  if (l.includes('LGPL')) return 'lgpl';
  if (l.includes('GPL')) return 'gpl';
  if (l.includes('APACHE')) return 'apache';
  if (l.includes('MIT') || l.includes('BSD') || l.includes('ISC') || l.includes('UNLICENSE')) {
    return 'permissive';
  }
  return 'unknown';
}

type PolicyTable = Record<ScenarioId, Record<LicenseFamily, {verdict: Verdict; note: string}>>;

export const policy: PolicyTable = {
  internal: {
    // 内部试用不分发，copyleft 义务基本不触发，只需知悉
    permissive: {verdict: 'ok', note: '宽松许可，内部使用无限制'},
    apache: {verdict: 'ok', note: '宽松许可，内部使用无限制'},
    lgpl: {verdict: 'ok', note: '内部试用不对外分发，无 copyleft 义务'},
    gpl: {verdict: 'warn', note: '内部试用可使用；若转为对外分发需重新评估 copyleft 义务'},
    agpl: {verdict: 'warn', note: '内部试用可使用；对外提供网络服务时 AGPL 条款将被触发'},
    unknown: {verdict: 'warn', note: '许可证未识别，内部试用前请人工核对来源与条款'},
  },
  closed: {
    // 闭源交付：GPL / AGPL 一律先阻塞
    permissive: {verdict: 'ok', note: '宽松许可，可随闭源产品分发，保留版权声明即可'},
    apache: {verdict: 'ok', note: '可闭源分发，需保留声明、NOTICE 并注明修改'},
    lgpl: {verdict: 'warn', note: '仅动态链接可闭源分发；静态链接或修改代码需开放对应源码'},
    gpl: {verdict: 'blocked', note: 'GPL 具有强 copyleft，闭源分发会触发开源义务，阻塞发布'},
    agpl: {verdict: 'blocked', note: 'AGPL 覆盖网络交互场景，闭源交付阻塞发布'},
    unknown: {verdict: 'blocked', note: '许可证未识别，无法确认闭源分发权利，阻塞发布'},
  },
  open: {
    // 开源发布：copyleft 与开源交付相容，全部放行
    permissive: {verdict: 'ok', note: '宽松许可，开源发布无限制，保留声明即可'},
    apache: {verdict: 'ok', note: '宽松许可，开源发布无限制，附 LICENSE 与 NOTICE'},
    lgpl: {verdict: 'ok', note: '开源发布与 LGPL 相容，放行'},
    gpl: {verdict: 'ok', note: '项目开源发布，与 GPL copyleft 相容，放行'},
    agpl: {verdict: 'ok', note: '项目开源发布，与 AGPL copyleft 相容，放行'},
    unknown: {verdict: 'warn', note: '许可证未识别，公开发布前请人工确认'},
  },
};

export interface Conclusion {
  verdict: Verdict;
  note: string;
  family: LicenseFamily;
}

// 当前场景下某个依赖的原始结论（不含人工放行）
export function baseConclusion(license: string, scenario: ScenarioId): Conclusion {
  const family = licenseFamily(license);
  const rule = policy[scenario][family];
  return {...rule, family};
}

export function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 放行记录是否仍有效：场景、依赖须匹配，且未到期（到期日当天仍有效，次日恢复阻塞）
export function exemptionActive(e: Exemption, depId: number, scenario: ScenarioId, today = todayStr()): boolean {
  return e.depId === depId && e.scenario === scenario && e.expiresAt >= today;
}

export interface Evaluated extends Conclusion {
  effective: EffectiveVerdict;
  exemption: Exemption | null;
  hasExpiredExemption: boolean;
}

// 场景结论 = 策略原始结论 + 当前场景/依赖上的人工放行
export function evaluate(dep: Dep, scenario: ScenarioId, exemptions: Exemption[]): Evaluated {
  const base = baseConclusion(dep.license, scenario);
  const match = exemptions.find((e) => e.depId === dep.id && e.scenario === scenario);
  const active = match && match.expiresAt >= todayStr() ? match : null;
  return {
    ...base,
    effective: active ? 'exempt' : base.verdict,
    exemption: active,
    hasExpiredExemption: !!match && !active,
  };
}

export const verdictText: Record<EffectiveVerdict, string> = {
  ok: '安全',
  warn: '复核',
  blocked: '阻塞',
  exempt: '人工放行',
};

export const licenseColors: Record<string, string> = {
  MIT: '#35b995',
  'BSD-3-Clause': '#6d9ee8',
  'Apache-2.0': '#b18ee4',
  'GPL-2.0': '#ec8c75',
  'GPL-3.0': '#ec8c75',
  'LGPL-2.1': '#e0b35c',
  'LGPL-3.0': '#e0b35c',
  'AGPL-3.0': '#e06c75',
  Unknown: '#8a989d',
};

export const licenseOptions = [
  'MIT',
  'BSD-3-Clause',
  'Apache-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'Unknown',
];
