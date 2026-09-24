import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Building2, CalendarClock, Check, ChevronDown, CircleCheck,
  Download, FileCode2, Info, Layers3, Lock, Plus, Rocket, Search, ShieldCheck,
  ShieldQuestion, Sparkles, X,
} from 'lucide-react';

/* ---------- 类型 ---------- */

type Verdict = 'pass' | 'review' | 'block';
type ScenarioId = 'internal' | 'closed' | 'opensource';
type LicenseFamily = 'permissive' | 'weak' | 'strong' | 'unknown';

type Dep = { id: number; name: string; version: string; license: string; source: string };

type Exemption = {
  depId: number;
  owner: string;
  reason: string;
  expiresAt: string; // ISO 日期 yyyy-mm-dd
};

type ScenarioExemptions = Record<number, Exemption>;

type Row = Dep & {
  verdict: Verdict;
  exempted: boolean;
  family: LicenseFamily;
  exemption?: Exemption; // 阻塞项可能存在有效或已过期的放行
};

/* ---------- 交付场景 ---------- */

const SCENARIOS: { id: ScenarioId; name: string; desc: string; icon: typeof Lock }[] = [
  { id: 'internal', name: '内部试用', desc: '仅在内网或员工范围内使用，不对外分发', icon: Building2 },
  { id: 'closed', name: '闭源交付', desc: '以专有二进制形式交付给客户，不开放源码', icon: Lock },
  { id: 'opensource', name: '开源发布', desc: '源代码随开源许可证公开发布', icon: Rocket },
];

/* ---------- 许可证策略矩阵 ---------- */

const PERMISSIVE_LICENSES = ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'ISC'];

function licenseFamily(license: string): LicenseFamily {
  if (/^(AGPL|GPL)-/i.test(license)) return 'strong';
  if (/^(LGPL|MPL|EPL|CDDL)-/i.test(license)) return 'weak';
  if (PERMISSIVE_LICENSES.includes(license)) return 'permissive';
  return 'unknown';
}

// 每个交付场景对各许可证族的基础结论
const POLICY: Record<ScenarioId, Record<LicenseFamily, Verdict>> = {
  internal: { permissive: 'pass', weak: 'pass', strong: 'pass', unknown: 'review' },
  closed: { permissive: 'pass', weak: 'review', strong: 'block', unknown: 'review' },
  opensource: { permissive: 'pass', weak: 'pass', strong: 'pass', unknown: 'review' },
};

const STRONG_LABEL: Record<string, string> = { strong: 'GPL/AGPL 强 copyleft', weak: 'LGPL/MPL 弱 copyleft' };

function findingText(license: string, family: LicenseFamily, scenario: ScenarioId, base: Verdict) {
  if (family === 'strong' && base === 'block') {
    return {
      title: '闭源交付阻塞',
      desc: `${license} 属于强 copyleft 许可证，要求衍生作品在分发时以相同许可证开放源码，与闭源交付冲突。必须替换依赖、取得商业授权，或由负责人人工放行后方可继续。`,
    };
  }
  if (family === 'strong' && scenario === 'internal') {
    return {
      title: '内部试用可放行',
      desc: `${license} 的 copyleft 义务在对外分发软件时才触发。当前仅限内部试用，不对外交付，可放行；一旦转为对外交付需重新评估。`,
    };
  }
  if (family === 'strong' && scenario === 'opensource') {
    return {
      title: '开源发布可放行',
      desc: `${license} 与开源发布相容，交付时需按 ${license} 条款向接收方提供对应源代码，并保留许可证与版权声明。`,
    };
  }
  if (family === 'weak' && base === 'review') {
    return {
      title: '需要复核集成方式',
      desc: `${license} 属于弱 copyleft 许可证，闭源交付通常需要以动态链接等隔离方式集成，并保证用户可以替换该库。发布前请法务复核集成方案与声明义务。`,
    };
  }
  if (family === 'weak') {
    return { title: '可以使用', desc: `${license} 属于弱 copyleft 许可证，当前场景下不构成分发冲突，请保留许可证与版权声明。` };
  }
  if (family === 'permissive') {
    return { title: '可以放心使用', desc: `${license} 为宽松许可证，各交付场景均可使用，再发布时保留版权与许可声明即可。` };
  }
  return { title: '许可证待确认', desc: `未能识别 “${license}” 的许可证条款，不能自动判定兼容性，请人工核对完整许可证文本后再决定。` };
}

/* ---------- 结论计算 ---------- */

const VERDICT_META: Record<Verdict, { label: string }> = {
  pass: { label: '放行' },
  review: { label: '需复核' },
  block: { label: '阻塞' },
};

function exemptionActive(ex: Exemption | undefined, today: string): ex is Exemption {
  return !!ex && ex.expiresAt >= today;
}

function resolveRow(dep: Dep, scenario: ScenarioId, exemptions: ScenarioExemptions, today: string): Row {
  const family = licenseFamily(dep.license);
  const base = POLICY[scenario][family];
  const exemption = exemptions[dep.id];
  if (base === 'block' && exemptionActive(exemption, today)) {
    return { ...dep, family, verdict: 'pass', exempted: true, exemption };
  }
  return { ...dep, family, verdict: base, exempted: false, exemption: base === 'block' ? exemption : undefined };
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

/* ---------- 初始数据与持久化 ---------- */

const initialDeps: Dep[] = [
  { id: 1, name: 'react', version: '18.3.1', license: 'MIT', source: 'npm' },
  { id: 2, name: 'lodash', version: '4.17.21', license: 'MIT', source: 'npm' },
  { id: 3, name: 'chart.js', version: '4.4.4', license: 'MIT', source: 'npm' },
  { id: 4, name: 'highlight.js', version: '11.10.0', license: 'BSD-3-Clause', source: 'npm' },
  { id: 5, name: 'legacy-parser', version: '2.1.0', license: 'GPL-3.0', source: '手动' },
  { id: 6, name: 'pdf-toolkit', version: '1.4.2', license: 'AGPL-3.0', source: '手动' },
  { id: 7, name: 'media-codec', version: '0.9.7', license: 'LGPL-3.0', source: 'npm' },
];

const STORAGE_KEY = 'license-lens-v2';

type Store = {
  deps: Dep[];
  scenario: ScenarioId;
  exemptions: Record<ScenarioId, ScenarioExemptions>;
};

const emptyExemptions = (): Record<ScenarioId, ScenarioExemptions> => ({ internal: {}, closed: {}, opensource: {} });

function loadStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (raw && Array.isArray(raw.deps)) {
      return {
        deps: raw.deps,
        scenario: SCENARIOS.some((s) => s.id === raw.scenario) ? raw.scenario : 'internal',
        exemptions: { ...emptyExemptions(), ...(raw.exemptions || {}) },
      };
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return { deps: initialDeps, scenario: 'internal', exemptions: emptyExemptions() };
}

const LICENSE_OPTIONS = [
  'MIT', 'BSD-3-Clause', 'Apache-2.0', 'ISC',
  'LGPL-3.0', 'MPL-2.0',
  'GPL-2.0', 'GPL-3.0', 'AGPL-3.0',
  '未知/其他',
];

const colors: Record<string, string> = {
  MIT: '#35b995', 'BSD-3-Clause': '#6d9ee8', 'Apache-2.0': '#b18ee4',
  'GPL-3.0': '#ec8c75', 'AGPL-3.0': '#e06b58', 'LGPL-3.0': '#d9a44e',
};

/* ---------- 应用 ---------- */

export default function App() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [store, setStore] = useState<Store>(loadStore);
  const { deps, scenario, exemptions } = store;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Verdict>('all');
  const [selected, setSelected] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [license, setLicense] = useState('MIT');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const scenarioName = SCENARIOS.find((s) => s.id === scenario)!.name;

  // 当前场景下每个依赖的结论，新增依赖、统计、筛选、导出统一读取这里
  const rows = useMemo<Row[]>(
    () => deps.map((d) => resolveRow(d, scenario, exemptions[scenario] || {}, today)),
    [deps, scenario, exemptions, today],
  );

  const stats = useMemo(() => {
    const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
    return { total: rows.length, pass: count('pass'), review: count('review'), block: count('block'), exempted: rows.filter((r) => r.exempted).length };
  }, [rows]);

  const blockedCount = stats.block;
  const releaseState = blockedCount > 0 ? '不可发布' : stats.review > 0 ? '待复核' : '可以发布';
  const score = stats.total ? Math.round((stats.pass / stats.total) * 100) : 100;

  const filtered = useMemo(
    () =>
      rows.filter(
        (d) =>
          (filter === 'all' || d.verdict === filter) &&
          `${d.name}${d.license}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, filter, query],
  );

  const current = rows.find((d) => d.id === selected);

  /* ---------- 操作 ---------- */

  const add = () => {
    if (!name.trim()) return;
    const id = Date.now();
    setStore((s) => ({ ...s, deps: [...s.deps, { id, name: name.trim(), version: '1.0.0', license, source: '手动' }] }));
    setSelected(id);
    setName('');
    setLicense('MIT');
    setShowAdd(false);
  };

  const grantExemption = (depId: number, owner: string, reason: string, expiresAt: string) => {
    if (!owner.trim() || !reason.trim() || !expiresAt || expiresAt < today) return;
    setStore((s) => ({
      ...s,
      exemptions: {
        ...s.exemptions,
        [scenario]: {
          ...s.exemptions[scenario],
          [depId]: { depId, owner: owner.trim(), reason: reason.trim(), expiresAt },
        },
      },
    }));
  };

  const revokeExemption = (depId: number) => {
    setStore((s) => {
      const next = { ...s.exemptions[scenario] };
      delete next[depId];
      return { ...s, exemptions: { ...s.exemptions, [scenario]: next } };
    });
  };

  const exportMd = () => {
    const esc = (v: string) => v.replace(/\|/g, '\\|');
    const noteOf = (r: Row) => {
      if (r.exempted && r.exemption) {
        return `人工放行：${r.exemption.owner}，到期 ${r.exemption.expiresAt}（${r.exemption.reason}）`;
      }
      if (r.family === 'strong' && r.exemption && !r.exempted) {
        return `放行已于 ${r.exemption.expiresAt} 到期，恢复阻塞`;
      }
      return findingText(r.license, r.family, scenario, r.verdict).title;
    };
    const activeExemptions = rows.filter((r) => r.exempted).map((r) => r.exemption!);
    const text =
      `# License Lens 许可证报告\n\n` +
      `- 交付场景：${scenarioName}\n` +
      `- 生成日期：${today}\n` +
      `- 依赖总数：${stats.total}｜放行：${stats.pass}（含人工放行 ${stats.exempted}）｜需复核：${stats.review}｜阻塞：${stats.block}\n\n` +
      `## 依赖结论\n\n` +
      `| 依赖 | 版本 | 许可证 | 结论 | 说明 |\n|---|---|---|---|---|\n` +
      rows
        .map((r) => `| ${esc(r.name)} | ${esc(r.version)} | ${esc(r.license)} | ${r.exempted ? '放行（人工）' : VERDICT_META[r.verdict].label} | ${esc(noteOf(r))} |`)
        .join('\n') +
      (activeExemptions.length
        ? `\n\n## 人工放行记录\n\n` +
          activeExemptions
            .map((ex) => {
              const dep = deps.find((d) => d.id === ex.depId);
              return `- **${dep?.name ?? ex.depId}**（${dep?.license ?? ''}）：负责人 ${ex.owner}｜原因：${ex.reason}｜到期日 ${ex.expiresAt}`;
            })
            .join('\n')
        : '') +
      `\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = `license-report-${scenario}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- 渲染 ---------- */

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={18} /></div>
          <div><b>License Lens</b><small>dependency clarity</small></div>
        </div>
        <div className="nav-title">WORKSPACE</div>
        <button className="nav active"><Layers3 size={16} />依赖总览</button>
        <button className="nav"><FileCode2 size={16} />许可证清单 <span>{stats.total}</span></button>
        <button className="nav"><AlertTriangle size={16} />待处理风险 <span className="red">{blockedCount}</span></button>
        <div className="aside-bottom">
          <div className="mini-card">
            <Sparkles size={16} />
            <div><b>扫描已更新</b><small>完成 {stats.total} 个依赖的许可证分析</small></div>
          </div>
          <div className="user">
            <div className="avatar">ZL</div><span>Zen Li</span><ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">WORKSPACE / <b>PROJECT SCAN</b></div>
            <h1>许可证兼容性分析</h1>
            <p>按交付场景重新计算每个依赖的结论，放心发布你的项目。</p>
          </div>
          <div className="head-actions">
            <button className="outline" onClick={exportMd}><Download size={15} />导出报告</button>
            <button className="primary" onClick={() => setShowAdd(true)}><Plus size={16} />添加依赖</button>
          </div>
        </header>

        {/* 交付场景切换：所有结论、统计与导出都随此场景重算 */}
        <section className="scenario-bar">
          <div>
            <b>交付场景</b>
            <div className="scenario-hint">{SCENARIOS.find((s) => s.id === scenario)!.desc}</div>
          </div>
          <div className="scenario-switch">
            {SCENARIOS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  className={scenario === s.id ? 'active' : ''}
                  title={s.desc}
                  onClick={() => { setStore((prev) => ({ ...prev, scenario: s.id })); setFilter('all'); }}
                >
                  <Icon size={14} /> {s.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="hero">
          <div>
            <span className="tag">PROJECT · AURORA-WEB · {scenarioName}</span>
            <h2>发布前，再确认一次。</h2>
            <p>
              {scenarioName}场景下共扫描 <b>{stats.total} 个依赖</b>：
              <b className="danger">{stats.block} 项阻塞</b>、
              <b className="warning">{stats.review} 项需复核</b>
              {stats.exempted > 0 && <>（含 <b className="exempt-text">{stats.exempted} 项人工放行</b>）</>}。
            </p>
          </div>
          <div className="scan-score">
            <div className={`score-ring ${blockedCount > 0 ? 'block' : stats.review > 0 ? 'review' : ''}`}>
              <strong>{score}<small>%</small></strong>
            </div>
            <div>
              <span>兼容评分</span>
              <b>{releaseState}</b>
              <small>结论按当前场景实时计算</small>
            </div>
          </div>
        </section>

        <section className="summary">
          <div><span>全部依赖</span><b>{stats.total}</b><small>结论随场景切换重算</small></div>
          <div><span>可放行</span><b className="teal">{stats.pass}</b><small>{stats.exempted > 0 ? `含 ${stats.exempted} 项人工放行` : '可进入发布流程'}</small></div>
          <div><span>需复核</span><b className="orange">{stats.review}</b><small>发布前需法务确认</small></div>
          <div><span>阻塞</span><b className="red">{stats.block}</b><small>必须处理或人工放行</small></div>
        </section>

        <section className="workspace">
          <div className="table-pane">
            <div className="pane-head">
              <div>
                <h2>依赖清单</h2>
                <p>结论按「{scenarioName}」场景计算</p>
              </div>
              <div className="tools">
                <div className="search">
                  <Search size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖" />
                </div>
                <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | Verdict)}>
                  <option value="all">全部结论</option>
                  <option value="pass">放行</option>
                  <option value="review">需复核</option>
                  <option value="block">阻塞</option>
                </select>
              </div>
            </div>
            <div className="table">
              <div className="tr th"><span>依赖名称</span><span>版本</span><span>许可证</span><span>结论</span></div>
              {filtered.map((d) => (
                <button className={d.id === selected ? 'tr selected' : 'tr'} key={d.id} onClick={() => setSelected(d.id)}>
                  <span className="dep-name"><span className="pkg-dot" /> {d.name}</span>
                  <span className="muted">{d.version}</span>
                  <span><i className="license" style={{ color: colors[d.license] || '#888', background: (colors[d.license] || '#888') + '18' }}>{d.license}</i></span>
                  <VerdictBadge row={d} today={today} />
                </button>
              ))}
              {filtered.length === 0 && <div className="empty">没有匹配的依赖</div>}
            </div>
          </div>

          {current && (
            <DetailPane
              row={current}
              scenario={scenario}
              scenarioName={scenarioName}
              today={today}
              onClose={() => setSelected(0)}
              onGrant={grantExemption}
              onRevoke={revokeExemption}
            />
          )}
        </section>
      </main>

      {showAdd && (
        <div className="backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>添加依赖</h2>
              <button onClick={() => setShowAdd(false)}>×</button>
            </div>
            <label>依赖名称
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 date-fns" />
            </label>
            <label>许可证
              <select value={license} onChange={(e) => setLicense(e.target.value)}>
                {LICENSE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <p className="modal-hint">新依赖的结论会按当前「{scenarioName}」场景自动计算，无需手工指定状态。</p>
            <button className="primary full" onClick={add}>加入扫描</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 结论徽标 ---------- */

function VerdictBadge({ row, today }: { row: Row; today: string }) {
  if (row.exempted) {
    const left = daysBetween(today, row.exemption!.expiresAt);
    return (
      <span className="status exempt" title={`人工放行：${row.exemption!.owner}，到期 ${row.exemption!.expiresAt}`}>
        <CircleCheck size={13} /> 人工放行
        <i className="exempt-days">{left === 0 ? '今日到期' : `剩 ${left} 天`}</i>
      </span>
    );
  }
  if (row.verdict === 'pass') return <span className="status pass"><Check size={13} /> 放行</span>;
  if (row.verdict === 'review') return <span className="status review"><ShieldQuestion size={13} /> 需复核</span>;
  const expired = !!row.exemption;
  return <span className="status block"><Ban size={13} /> {expired ? '放行已过期' : '阻塞'}</span>;
}

/* ---------- 详情面板 ---------- */

function DetailPane({
  row, scenario, scenarioName, today, onClose, onGrant, onRevoke,
}: {
  row: Row;
  scenario: ScenarioId;
  scenarioName: string;
  today: string;
  onClose: () => void;
  onGrant: (depId: number, owner: string, reason: string, expiresAt: string) => void;
  onRevoke: (depId: number) => void;
}) {
  const expired = row.verdict === 'block' && !!row.exemption;
  const finding = findingText(row.license, row.family, scenario, POLICY[scenario][row.family]);

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-icon" style={{ background: (colors[row.license] || '#888') + '1c', color: colors[row.license] || '#888' }}>
          <FileCode2 size={20} />
        </div>
        <div>
          <span>SELECTED DEPENDENCY · {scenarioName}</span>
          <h2>{row.name}</h2>
        </div>
        <button className="close" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="detail-grid">
        <div><label>版本</label><b>{row.version}</b></div>
        <div><label>来源</label><b>{row.source}</b></div>
        <div><label>许可证</label><b>{row.license}</b></div>
      </div>

      <div className={`finding ${row.exempted ? 'exempt' : row.verdict}`}>
        <div className="finding-icon">
          {row.exempted ? <CircleCheck size={16} /> : row.verdict === 'pass' ? <Check size={16} /> : row.verdict === 'review' ? <ShieldQuestion size={16} /> : <Ban size={16} />}
        </div>
        <div>
          <b>{row.exempted ? `人工放行中（基础结论：阻塞）` : finding.title}</b>
          <p>{finding.desc}</p>
          {row.family !== 'unknown' && <p className="family-tag">许可证族：{STRONG_LABEL[row.family] || (row.family === 'permissive' ? '宽松许可证' : '其他')} · 结论随交付场景变化</p>}
        </div>
      </div>

      {row.verdict === 'block' && !row.exempted && (
        <ExemptionForm depId={row.id} today={today} expired={expired} exemption={row.exemption} onGrant={onGrant} />
      )}
      {row.exempted && row.exemption && (
        <ExemptionCard exemption={row.exemption} today={today} onRevoke={() => onRevoke(row.id)} />
      )}

      <div className="full-license">
        <div><Info size={15} /><span>许可证摘要</span></div>
        <p>{row.license} 允许在满足其条款的前提下使用和分发代码，当前结论基于「{scenarioName}」场景的策略矩阵。详细义务请参考项目仓库中的 LICENSE 文件。</p>
        <button>查看原文 <ChevronDown size={14} /></button>
      </div>
    </div>
  );
}

/* ---------- 人工放行 ---------- */

function ExemptionForm({
  depId, today, expired, exemption, onGrant,
}: {
  depId: number;
  today: string;
  expired: boolean;
  exemption?: Exemption;
  onGrant: (depId: number, owner: string, reason: string, expiresAt: string) => void;
}) {
  const [owner, setOwner] = useState(expired ? exemption?.owner ?? '' : '');
  const [reason, setReason] = useState(expired ? exemption?.reason ?? '' : '');
  const [expiresAt, setExpiresAt] = useState('');

  const valid = owner.trim() && reason.trim() && expiresAt >= today;

  return (
    <div className="exemption">
      <div className="exemption-head">
        <CalendarClock size={15} />
        <b>{expired ? '放行已到期，恢复阻塞' : '必须继续使用？可人工放行'}</b>
      </div>
      {expired && (
        <div className="expired-strip">
          上次放行已于 {exemption!.expiresAt} 到期（负责人：{exemption!.owner}），该依赖已恢复阻塞，可重新登记放行。
        </div>
      )}
      <label>负责人
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="谁批准继续使用" />
      </label>
      <label>放行原因
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="为什么必须继续使用、替代计划是什么" />
      </label>
      <label>到期日
        <input type="date" min={today} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      <button className="primary full" disabled={!valid} onClick={() => onGrant(depId, owner, reason, expiresAt)}>
        登记人工放行
      </button>
      {!valid && <p className="exemption-hint">负责人、原因和到期日均填写后才能放行；到期后自动恢复阻塞。</p>}
    </div>
  );
}

function ExemptionCard({ exemption, today, onRevoke }: { exemption: Exemption; today: string; onRevoke: () => void }) {
  const left = daysBetween(today, exemption.expiresAt);
  return (
    <div className="exemption active">
      <div className="exemption-head">
        <CircleCheck size={15} />
        <b>人工放行中</b>
        <span className={`exempt-badge ${left <= 7 ? 'soon' : ''}`}>{left === 0 ? '今日到期' : `还剩 ${left} 天`}</span>
      </div>
      <div className="exemption-grid">
        <div><label>负责人</label><b>{exemption.owner}</b></div>
        <div><label>到期日</label><b>{exemption.expiresAt}</b></div>
      </div>
      <div className="exemption-reason"><label>放行原因</label><p>{exemption.reason}</p></div>
      <button className="outline full" onClick={onRevoke}><X size={14} />撤销放行，恢复阻塞</button>
    </div>
  );
}
