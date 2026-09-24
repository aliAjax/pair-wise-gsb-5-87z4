import {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Download,
  FileCode2,
  Info,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  baseConclusion,
  Dep,
  EffectiveVerdict,
  evaluate,
  Exemption,
  licenseColors,
  licenseOptions,
  ScenarioId,
  scenarios,
  todayStr,
  verdictText,
} from './licensePolicy';

const initial: Dep[] = [
  {id: 1, name: 'react', version: '18.3.1', license: 'MIT', source: 'npm'},
  {id: 2, name: 'lodash', version: '4.17.21', license: 'MIT', source: 'npm'},
  {id: 3, name: 'chart.js', version: '4.4.4', license: 'MIT', source: 'npm'},
  {id: 4, name: 'highlight.js', version: '11.10.0', license: 'BSD-3-Clause', source: 'npm'},
  {id: 5, name: 'legacy-parser', version: '2.1.0', license: 'GPL-3.0', source: '手动'},
  {id: 6, name: 'network-svc', version: '0.9.3', license: 'AGPL-3.0', source: 'npm'},
];

function load<T>(key: string, fallback: T, migrate?: (raw: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      // 兼容旧版本：依赖曾和写死的 status 存在同一个 key 里
      if (migrate) {
        const legacy = localStorage.getItem('license-lens');
        if (legacy) return migrate(JSON.parse(legacy));
      }
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const filterOptions: {value: EffectiveVerdict | 'all'; label: string}[] = [
  {value: 'all', label: '全部结论'},
  {value: 'ok', label: '安全'},
  {value: 'warn', label: '复核'},
  {value: 'blocked', label: '阻塞'},
  {value: 'exempt', label: '人工放行'},
];

export default function App() {
  const [deps, setDeps] = useState<Dep[]>(() =>
    load<Dep[]>('license-lens-deps', initial, (raw) =>
      Array.isArray(raw)
        ? (raw as Array<Dep & {status?: string}>).map(({id, name, version, license, source}) => ({
            id,
            name,
            version,
            license,
            source,
          }))
        : initial,
    ),
  );
  const [exemptions, setExemptions] = useState<Exemption[]>(() =>
    load<Exemption[]>('license-lens-exemptions', []),
  );
  const [scenario, setScenario] = useState<ScenarioId>(() =>
    load<ScenarioId>('license-lens-scenario', 'internal'),
  );

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EffectiveVerdict | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showExempt, setShowExempt] = useState(false);

  useEffect(() => localStorage.setItem('license-lens-deps', JSON.stringify(deps)), [deps]);
  useEffect(() => localStorage.setItem('license-lens-exemptions', JSON.stringify(exemptions)), [exemptions]);
  useEffect(() => localStorage.setItem('license-lens-scenario', JSON.stringify(scenario)), [scenario]);

  // 所有结论都在当前场景下实时计算
  const rows = useMemo(
    () => deps.map((d) => ({dep: d, ev: evaluate(d, scenario, exemptions)})),
    [deps, scenario, exemptions],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      ok: rows.filter((r) => r.ev.effective === 'ok').length,
      warn: rows.filter((r) => r.ev.effective === 'warn').length,
      blocked: rows.filter((r) => r.ev.effective === 'blocked').length,
      exempt: rows.filter((r) => r.ev.effective === 'exempt').length,
    }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === 'all' || r.ev.effective === filter) &&
          `${r.dep.name}${r.dep.license}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, filter, query],
  );

  const current = rows.find((r) => r.dep.id === selected) ?? null;

  const addDep = (name: string, version: string, license: string) => {
    const id = Date.now();
    setDeps((ds) => [...ds, {id, name: name.trim(), version: version.trim() || '1.0.0', license, source: '手动'}]);
    setSelected(id);
    setShowAdd(false);
  };

  const grantExemption = (owner: string, reason: string, expiresAt: string) => {
    if (!current) return;
    setExemptions((list) => [
      ...list.filter((e) => !(e.depId === current.dep.id && e.scenario === scenario)),
      {
        id: `${Date.now()}`,
        depId: current.dep.id,
        scenario,
        owner: owner.trim(),
        reason: reason.trim(),
        expiresAt,
        createdAt: todayStr(),
      },
    ]);
    setShowExempt(false);
  };

  const revokeExemption = () => {
    if (!current) return;
    setExemptions((list) => list.filter((e) => !(e.depId === current.dep.id && e.scenario === scenario)));
  };

  const exportMd = () => {
    const scenarioName = scenarios.find((s) => s.id === scenario)!.name;
    const passRate = stats.total ? Math.round(((stats.ok + stats.exempt) / stats.total) * 100) : 0;
    const lines: string[] = [
      '# License Lens 许可证报告',
      '',
      `- 交付场景：**${scenarioName}**`,
      `- 生成日期：${todayStr()}`,
      `- 发版判定：${stats.blocked ? `**存在 ${stats.blocked} 项阻塞，暂不可发版**` : '**全部通过，可发版**'}`,
      `- 通过率：${passRate}%（安全 ${stats.ok}，人工放行 ${stats.exempt}，复核 ${stats.warn}，阻塞 ${stats.blocked}）`,
      '',
      '| 依赖 | 版本 | 许可证 | 场景结论 | 说明 |',
      '|---|---|---|---|---|',
      ...rows.map((r) => {
        const extra =
          r.ev.effective === 'exempt' && r.ev.exemption
            ? `人工放行：${r.ev.exemption.owner} / ${r.ev.exemption.reason} / 到期 ${r.ev.exemption.expiresAt}`
            : r.ev.note;
        return `| ${r.dep.name} | ${r.dep.version} | ${r.dep.license} | ${verdictText[r.ev.effective]} | ${extra.replace(/\|/g, '/')} |`;
      }),
    ];
    const active = exemptions.filter((e) => e.scenario === scenario && e.expiresAt >= todayStr());
    if (active.length) {
      lines.push('', '## 人工放行记录', '');
      for (const e of active) {
        const dep = deps.find((d) => d.id === e.depId);
        lines.push(
          `- **${dep?.name ?? e.depId}**（${dep?.license ?? '-'}）— 负责人：${e.owner}；原因：${e.reason}；到期日：${e.expiresAt}`,
        );
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/markdown'}));
    a.download = `license-report-${scenario}-${todayStr()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const scenarioDef = scenarios.find((s) => s.id === scenario)!;

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <b>License Lens</b>
            <small>dependency clarity</small>
          </div>
        </div>
        <div className="nav-title">WORKSPACE</div>
        <button className="nav active">
          <Layers3 size={16} />
          依赖总览
        </button>
        <button className="nav">
          <FileCode2 size={16} />
          许可证清单 <span>{stats.total}</span>
        </button>
        <button className="nav">
          <Ban size={16} />
          待处理阻塞 <span className="red">{stats.blocked}</span>
        </button>
        <div className="aside-bottom">
          <div className="mini-card">
            <Sparkles size={16} />
            <div>
              <b>结论按场景计算</b>
              <small>切换场景后，全部结论自动重算</small>
            </div>
          </div>
          <div className="user">
            <div className="avatar">ZL</div>
            <span>Zen Li</span>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">
              WORKSPACE / <b>PROJECT SCAN</b>
            </div>
            <h1>许可证兼容性分析</h1>
            <p>按交付场景检查依赖许可，放心发布你的项目。</p>
          </div>
          <div className="head-actions">
            <button className="outline" onClick={exportMd}>
              <Download size={15} />
              导出报告
            </button>
            <button className="primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} />
              添加依赖
            </button>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="tag">PROJECT · AURORA-WEB</span>
            <h2>发布前，按交付场景再确认一次。</h2>
            <p>
              当前场景 <b>{scenarioDef.name}</b>（{scenarioDef.desc}），共 <b>{stats.total} 个依赖</b>，
              {stats.blocked > 0 ? (
                <>
                  {' '}
                  <b className="warning">{stats.blocked} 项阻塞</b>
                  {stats.exempt > 0 && `，${stats.exempt} 项已人工放行`}
                </>
              ) : (
                ' 没有阻塞项'
              )}
              。
            </p>
          </div>
          <div className="scenario-switch" role="tablist" aria-label="交付场景">
            {scenarios.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === scenario}
                className={s.id === scenario ? 'active' : ''}
                onClick={() => setScenario(s.id)}
                title={s.desc}
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>

        <section className={'release-banner ' + (stats.blocked ? 'blocked' : 'ok')}>
          {stats.blocked ? <Ban size={17} /> : <Check size={17} />}
          <div>
            <b>
              {scenarioDef.name} · {stats.blocked ? `不可发版：${stats.blocked} 项依赖阻塞发布` : '可以发版：当前场景无阻塞项'}
            </b>
            <small>
              {stats.blocked
                ? '必须替换依赖，或由负责人人工放行并记录原因与到期日。'
                : stats.exempt
                  ? `其中 ${stats.exempt} 项为人工放行，到期后将自动恢复阻塞，请留意复核。`
                  : '全部依赖均符合当前交付场景的许可要求。'}
            </small>
          </div>
        </section>

        <section className="summary">
          <div>
            <span>全部依赖</span>
            <b>{stats.total}</b>
            <small>当前场景：{scenarioDef.name}</small>
          </div>
          <div>
            <span>安全</span>
            <b className="teal">{stats.ok}</b>
            <small>可直接使用</small>
          </div>
          <div>
            <span>需要复核</span>
            <b className="orange">{stats.warn}</b>
            <small>履行声明等义务</small>
          </div>
          <div>
            <span>阻塞 / 已放行</span>
            <b className="red">
              {stats.blocked}
              <em> / {stats.exempt}</em>
            </b>
            <small>放行到期自动恢复阻塞</small>
          </div>
        </section>

        <section className="workspace">
          <div className="table-pane">
            <div className="pane-head">
              <div>
                <h2>依赖清单</h2>
                <p>结论随交付场景实时计算</p>
              </div>
              <div className="tools">
                <div className="search">
                  <Search size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖" />
                </div>
                <select value={filter} onChange={(e) => setFilter(e.target.value as EffectiveVerdict | 'all')}>
                  {filterOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="table">
              <div className="tr th">
                <span>依赖名称</span>
                <span>版本</span>
                <span>许可证</span>
                <span>场景结论</span>
              </div>
              {filtered.map(({dep, ev}) => (
                <button
                  className={dep.id === selected ? 'tr selected' : 'tr'}
                  key={dep.id}
                  onClick={() => setSelected(dep.id)}
                >
                  <span className="dep-name">
                    <span className="pkg-dot" /> {dep.name}
                  </span>
                  <span className="muted">{dep.version}</span>
                  <span>
                    <i
                      className="license"
                      style={{
                        color: licenseColors[dep.license] || '#888',
                        background: (licenseColors[dep.license] || '#888') + '18',
                      }}
                    >
                      {dep.license}
                    </i>
                  </span>
                  <span className={'status ' + ev.effective}>
                    {ev.effective === 'ok' ? (
                      <Check size={13} />
                    ) : ev.effective === 'blocked' ? (
                      <Ban size={13} />
                    ) : (
                      <AlertTriangle size={13} />
                    )}{' '}
                    {verdictText[ev.effective]}
                    {ev.effective === 'exempt' && ev.exemption && (
                      <small className="exempt-until">至 {ev.exemption.expiresAt}</small>
                    )}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && <div className="empty">当前筛选下没有依赖</div>}
            </div>
          </div>

          {current && (
            <div className="detail">
              <div className="detail-head">
                <div
                  className="detail-icon"
                  style={{
                    background: (licenseColors[current.dep.license] || '#888') + '1c',
                    color: licenseColors[current.dep.license] || '#888',
                  }}
                >
                  <FileCode2 size={20} />
                </div>
                <div>
                  <span>SELECTED DEPENDENCY</span>
                  <h2>{current.dep.name}</h2>
                </div>
                <button className="close" onClick={() => setSelected(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="detail-grid">
                <div>
                  <label>版本</label>
                  <b>{current.dep.version}</b>
                </div>
                <div>
                  <label>来源</label>
                  <b>{current.dep.source}</b>
                </div>
                <div>
                  <label>许可证</label>
                  <b>{current.dep.license}</b>
                </div>
              </div>

              <div className={'finding ' + current.ev.effective}>
                <div className="finding-icon">
                  {current.ev.effective === 'ok' ? (
                    <Check size={16} />
                  ) : current.ev.effective === 'blocked' ? (
                    <Ban size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                </div>
                <div>
                  <b>
                    {scenarioDef.name}：{verdictText[current.ev.effective]}
                  </b>
                  <p>{current.ev.note}。扫描结果基于 package 元数据，请在发布前查看完整许可证文本。</p>
                </div>
              </div>

              {current.ev.verdict === 'blocked' &&
                (current.ev.exemption ? (
                  <div className="exemption-card active">
                    <div className="ex-head">
                      <ShieldCheck size={15} />
                      <b>已人工放行</b>
                      <button className="link danger" onClick={revokeExemption}>
                        撤销放行
                      </button>
                    </div>
                    <div className="ex-rows">
                      <div>
                        <User size={12} /> 负责人：<b>{current.ev.exemption.owner}</b>
                      </div>
                      <div>原因：{current.ev.exemption.reason}</div>
                      <div>
                        到期日：<b>{current.ev.exemption.expiresAt}</b>（次日自动恢复阻塞）
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={'exemption-card' + (current.ev.hasExpiredExemption ? ' expired' : '')}>
                    <div className="ex-head">
                      <Ban size={15} />
                      <b>{current.ev.hasExpiredExemption ? '人工放行已到期' : '该依赖阻塞当前场景发布'}</b>
                    </div>
                    <p>
                      {current.ev.hasExpiredExemption
                        ? '到期后已自动恢复阻塞。若仍须继续使用，请由负责人重新放行。'
                        : '如确认必须继续使用，可由负责人人工放行；须填写原因并设置到期日，到期自动恢复阻塞。'}
                    </p>
                    <button className="primary full" onClick={() => setShowExempt(true)}>
                      {current.ev.hasExpiredExemption ? '重新放行' : '人工放行'}
                    </button>
                  </div>
                ))}

              <div className="full-license">
                <div>
                  <Info size={15} />
                  <span>许可证摘要</span>
                </div>
                <p>
                  {current.dep.license} 允许在满足其条款的前提下使用和分发代码，具体义务随交付场景变化。详细义务请参考项目仓库中的
                  LICENSE 文件。
                </p>
                <button>
                  查看原文 <ChevronDown size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {showAdd && (
        <AddModal
          scenario={scenario}
          onClose={() => setShowAdd(false)}
          onSubmit={addDep}
        />
      )}
      {showExempt && current && (
        <ExemptModal depName={current.dep.name} onClose={() => setShowExempt(false)} onSubmit={grantExemption} />
      )}
    </div>
  );
}

function AddModal({
  scenario,
  onClose,
  onSubmit,
}: {
  scenario: ScenarioId;
  onClose: () => void;
  onSubmit: (name: string, version: string, license: string) => void;
}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [license, setLicense] = useState('MIT');
  const scenarioName = scenarios.find((s) => s.id === scenario)!.name;
  const preview = baseConclusion(license, scenario);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>添加依赖</h2>
          <button onClick={onClose}>×</button>
        </div>
        <label>
          依赖名称
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 date-fns" />
        </label>
        <label>
          版本
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 1.0.0" />
        </label>
        <label>
          许可证
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            {licenseOptions.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <div className={'add-preview ' + preview.verdict}>
          {scenarioName}场景结论：<b>{verdictText[preview.verdict]}</b>
          <span>{preview.note}</span>
        </div>
        <button className="primary full" disabled={!name.trim()} onClick={() => onSubmit(name, version, license)}>
          加入扫描
        </button>
      </div>
    </div>
  );
}

function ExemptModal({
  depName,
  onClose,
  onSubmit,
}: {
  depName: string;
  onClose: () => void;
  onSubmit: (owner: string, reason: string, expiresAt: string) => void;
}) {
  const in30 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  };
  const [owner, setOwner] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState(in30());
  const today = todayStr();
  const valid = owner.trim().length > 0 && reason.trim().length > 0 && expiresAt >= today;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>人工放行 · {depName}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <label>
          负责人
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="谁批准继续使用" />
        </label>
        <label>
          放行原因
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="为什么必须继续使用、计划如何处置（替换/隔离）"
          />
        </label>
        <label>
          到期日
          <input type="date" min={today} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        {expiresAt < today && <div className="form-error">到期日不能早于今天</div>}
        <button className="primary full" disabled={!valid} onClick={() => onSubmit(owner, reason, expiresAt)}>
          确认放行
        </button>
      </div>
    </div>
  );
}
