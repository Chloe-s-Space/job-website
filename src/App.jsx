import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, Building2, ChartColumn, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, GraduationCap, Info, MapPin, Paperclip, Search, SlidersHorizontal, SquareKanban, Ticket, X } from 'lucide-react';
import { fieldValues, hasFieldValue } from './job-fields.mjs';
import { normalizeIndustry } from './industries.mjs';
import { detectProfile, hasProfile, mergeDetected } from './recommend/profile.mjs';
import { familyStats, rankJobs } from './recommend/score.mjs';
import { loadProfile, ProfileCard, ProfileDialog, saveProfile, storedResume } from './recommend/ProfilePanel.jsx';
import LocalBoardPanel from './LocalBoardPanel.jsx';

const PAGE_SIZE = 30;
const STORAGE_KEY = 'campus-opportunities:favorites:v1';
const emptyFilters = { province: '', city: '', industry: '', family: '', cohort: '', batch: '', deadline: '' };
const DEADLINE_OPTIONS = ['7', '30', 'unknown'];
const SORT_OPTIONS = ['updated', 'deadline', 'recommend'];

// 筛选条件可以写在网址里（如 ?city=上海&family=算法），方便从数据洞察页跳转和分享
function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const filters = Object.fromEntries(Object.keys(emptyFilters).map((key) => [key, (params.get(key) || '').trim().slice(0, 60)]));
  if (!DEADLINE_OPTIONS.includes(filters.deadline)) filters.deadline = '';
  // 排序方式可以写进网址；画像只存在本地，不进网址。from=resume 表示从简历生成器跳转过来
  const sort = SORT_OPTIONS.includes(params.get('sort')) ? params.get('sort') : 'updated';
  // tab=saved 用于从数据洞察、简历生成器的“本地看板”按钮直接打开“我的收藏”
  const tab = ['all', 'soon', 'saved'].includes(params.get('tab')) ? params.get('tab') : 'all';
  return { filters, query: (params.get('q') || '').slice(0, 60), sort, tab, fromResume: params.get('from') === 'resume' };
}

const industriesOf = (job) => [...new Set(fieldValues(job.industry).map(normalizeIndustry))];
const chinaDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

function todayInChina() {
  return chinaDateFormatter.format(new Date());
}

function daysUntil(date, today = todayInChina()) {
  if (!date) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function readFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueOptions(jobs, key) {
  return [...new Set(jobs.flatMap((job) => key === 'city' ? job.cities || [] : key === 'province' ? job.provinces || [] : key === 'industry' ? industriesOf(job) : fieldValues(job[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function statusOf(job) {
  if (job.verification === 'demo') return { label: '演示记录', tone: 'demo' };
  if (daysUntil(job.deadline) !== null && daysUntil(job.deadline) < 0) return { label: '已过截止日', tone: 'expired' };
  if (!safeUrl(job.applyUrl)) return { label: '缺少网申链接', tone: 'caution' };
  return { label: '招聘状态待核验', tone: 'caution' };
}

// 中文数字：十以内写汉字，读起来像人说话；更大的数用阿拉伯数字
const CN_NUMBERS = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
const spoken = (value) => (value >= 0 && value <= 10 ? CN_NUMBERS[value] : String(value));

// 日期栏：截止日期 + 一句缓和的话。这周截止的卡片日期栏换成黄铜浅底，不用红色报警
function deadlineInfo(job) {
  if (!job.deadline) return { date: '—', note: '截止日期没公布，我们还在留意', tone: 'unknown' };
  const days = daysUntil(job.deadline);
  const [, month, day] = job.deadline.split('-');
  const date = `${Number(month)}·${Number(day)}`;
  if (days < 0) return { date, note: '已经过了截止日', tone: 'expired' };
  if (days === 0) return { date, note: '今天截止', soft: '今天还来得及', tone: 'soon' };
  if (days <= 7) return { date, note: `还有${spoken(days)}天`, soft: '这周就截止了', tone: 'soon' };
  return { date, note: `还有${spoken(days)}天`, tone: 'later' };
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 一条岗位是一张索引卡：左边是内容，右边隔一条虚线是日期栏。收藏 = 把卡片从抽屉里抽出来，夹上一枚回形针
function JobCard({ job, favorite, onFavorite, reasons, index }) {
  const cardRef = useRef(null);
  const status = statusOf(job);
  const apply = safeUrl(job.applyUrl);
  const announcement = safeUrl(job.announcementUrl);
  const source = safeUrl(job.sourceUrl);
  const deadline = deadlineInfo(job);
  const updated = job.updatedAt ? `${job.updatedAt.slice(0, 10)} 更新` : job.manualUpdatedAt ? `${job.manualUpdatedAt.slice(0, 10)} 手动更新` : '更新时间未提供';
  // 抽出来再放回：直接在卡片上播放，不切换 CSS 类，免得卡片的入场动画被重新触发
  const toggle = () => {
    if (!favorite && !reducedMotion()) {
      cardRef.current?.animate([
        { transform: 'none', boxShadow: 'var(--shadow-card)' },
        { transform: 'translateX(10px)', boxShadow: 'var(--shadow-float)', offset: 0.38 },
        { transform: 'none', boxShadow: 'var(--shadow-card)' },
      ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    onFavorite(job.id);
  };
  return (
    <div ref={cardRef} className={`ticket tone-${deadline.tone}${favorite ? ' is-saved' : ''}`} style={{ '--i': Math.min(index, 12) }}>
    <Paperclip className="card-clip" size={24} aria-hidden="true" />
    <article className="index-card">
      <div className="card-main">
        <p className="card-company">{job.company}</p>
        <h3 className="card-title">{job.title}</h3>
        {job.program && job.program !== job.title && <p className="card-program">{job.program}</p>}
        <ul className="card-badges" aria-label="岗位信息">
          <li className="badge badge-city"><MapPin size={13} aria-hidden="true" />{job.cities?.length ? job.cities.join('、') : '城市未提供'}</li>
          <li className="badge badge-cohort"><GraduationCap size={14} aria-hidden="true" />{job.cohort || '届别未提供'}</li>
          <li className="badge badge-batch"><Ticket size={13} aria-hidden="true" />{job.batch || '批次未提供'}</li>
          <li className="badge badge-industry"><Building2 size={13} aria-hidden="true" />{job.industry || '行业未提供'}</li>
        </ul>
        {reasons?.length > 0 && <ul className="card-reasons" aria-label="推荐原因">{reasons.map((reason) => <li key={`${reason.type}-${reason.label}`} className={`reason-${reason.type}`}><Check size={13} aria-hidden="true" />{reason.label}</li>)}</ul>}
        <div className="card-foot">
          <p className="provenance">{status.tone !== 'caution' && <span className={`status status-${status.tone}`}>{status.label}</span>}<span>来源：{job.source || '未提供'}</span><span className="num">{updated}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer">来源记录<ExternalLink size={11} aria-hidden="true" /></a>}</p>
          <div className="card-actions">{announcement && <a href={announcement} target="_blank" rel="noopener noreferrer" className="text-link">原始公告</a>}{apply ? <a href={apply} target="_blank" rel="noopener noreferrer" className="button-primary">去网申<ArrowUpRight size={15} aria-hidden="true" /></a> : <span className="apply-disabled">暂无网申地址</span>}</div>
        </div>
      </div>
      <div className="card-date">
        <div className="date-block">
          <span className="date-label">截止</span>
          <strong className="date-value num">{deadline.date}</strong>
          <span className="date-note note">{deadline.note}</span>
          {deadline.soft && <span className="date-soft note">{deadline.soft}</span>}
        </div>
        <button type="button" className="save-button" onClick={toggle} aria-pressed={favorite} aria-label={favorite ? `取消收藏 ${job.title}` : `收藏 ${job.title}`}>
          <Bookmark size={14} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />{favorite ? '已收藏' : '收藏'}
        </button>
      </div>
    </article>
    </div>
  );
}

// 三个标签页：一条细线上的三个词，选中的那个下面有一段黄铜下划线滑过去
function SegmentedTabs({ tabs, value, onChange }) {
  const ref = useRef(null);
  const [mark, setMark] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const active = ref.current?.querySelector('[aria-selected="true"]');
      if (active) setMark({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, tabs]);
  return <div className="tabs" role="tablist" aria-label="岗位列表" ref={ref}>
    {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)}>{item.label}{item.count !== undefined && <span className="tab-count num">{item.count}</span>}</button>)}
    {mark && <span className="tabs-mark" aria-hidden="true" style={{ transform: `translateX(${mark.x}px)`, width: mark.w }} />}
  </div>;
}

// 首屏插画一角的复古邮戳：“2026–2027 秋招列车”，纯 SVG，墨色带一点压印不均
function TrainStamp() {
  return <svg className="train-stamp" viewBox="0 0 180 180" aria-hidden="true" focusable="false">
    <defs>
      <filter id="stamp-ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" result="rough" />
        <feComponentTransfer in="noise" result="speckle"><feFuncA type="discrete" tableValues="1 1 1 0.35 1 1 0.5 1" /></feComponentTransfer>
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
      <path id="stamp-ring" d="M 90 90 m -60 0 a 60 60 0 1 1 120 0 a 60 60 0 1 1 -120 0" />
    </defs>
    <g className="stamp-ink" filter="url(#stamp-ink)" transform="rotate(-12 90 90)">
      <circle cx="90" cy="90" r="80" className="ring-outer" />
      <circle cx="90" cy="90" r="71" className="ring-inner" />
      <text className="stamp-ring-text"><textPath href="#stamp-ring" startOffset="2%">秋招列车 · 校园始发 · 慢慢找 · 总会到站 ·</textPath></text>
      <circle cx="90" cy="90" r="45" className="ring-core" />
      <text x="90" y="75" className="stamp-year" textAnchor="middle">2026–2027</text>
      <text x="90" y="104" className="stamp-title" textAnchor="middle">秋招列车</text>
      <path d="M 62 114 H 118" className="ring-inner" />
      <text x="90" y="127" className="stamp-small" textAnchor="middle">AUTUMN EXPRESS</text>
    </g>
  </svg>;
}

function CardSkeleton() {
  return <div className="card-list" aria-busy="true">
    <p className="loading-line note">正在把卡片拿出来</p>
    {[0, 1, 2, 3].map((item) => <div key={item} className="index-card card-skeleton" aria-hidden="true"><div className="card-main"><span /><span /><span /></div><div className="card-date" /></div>)}
  </div>;
}

// 筛选项是抽屉面上的标签框：选了值以后框子换成黄铜浅底
function SelectFilter({ label, value, options, onChange }) {
  return <label className={`drawer-label${value ? ' is-set' : ''}`}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部{label}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

// 整理时间：今天 / 昨天 / 某月某日 + 几点
function refreshedText(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const today = todayInChina();
  const yesterday = chinaDateFormatter.format(new Date(Date.parse(`${today}T12:00:00+08:00`) - 86400000));
  const day = date === today ? '今天' : date === yesterday ? '昨天' : `${Number(parts.month)} 月 ${Number(parts.day)} 日`;
  return `${day} ${Number(parts.hour)} 点整理过一遍`;
}

export default function App() {
  const today = todayInChina();
  const [dataset, setDataset] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [initialUrl] = useState(readUrlState);
  const [query, setQuery] = useState(initialUrl.query);
  const [filters, setFilters] = useState(initialUrl.filters);
  const [tab, setTab] = useState(initialUrl.tab);
  const [sort, setSort] = useState(initialUrl.sort);
  const [profile, setProfile] = useState(loadProfile);
  const [profileDialog, setProfileDialog] = useState(null);
  const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState(readFavorites);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}jobs.json`, { cache: 'no-cache' })
      .then((response) => { if (!response.ok) throw new Error('data unavailable'); return response.json(); })
      .then((data) => { if (!Array.isArray(data.jobs)) throw new Error('invalid data'); setDataset(data); })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); } catch { /* Browsers may block local storage. */ } }, [favorites]);
  useEffect(() => { setPage(1); }, [query, filters, tab, sort, profile]);
  useEffect(() => { saveProfile(profile); }, [profile]);

  const jobs = useMemo(() => (dataset?.jobs || []).filter((job) => !job.deadline || job.deadline >= today), [dataset, today]);
  useEffect(() => {
    const ids = new Set(jobs.map((job) => job.id));
    if (dataset) setFavorites((current) => current.filter((id) => ids.has(id)));
  }, [dataset, jobs]);
  const options = useMemo(() => ({
    province: uniqueOptions(jobs, 'province'),
    city: filters.province
      ? [...new Set(jobs.flatMap((job) => (job.locations || []).filter((location) => location.province === filters.province).map((location) => location.city)))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
      : uniqueOptions(jobs, 'city'),
    industry: uniqueOptions(jobs, 'industry'), family: uniqueOptions(jobs, 'family'), cohort: uniqueOptions(jobs, 'cohort'), batch: uniqueOptions(jobs, 'batch'),
  }), [jobs, filters.province]);
  const cityNames = useMemo(() => uniqueOptions(jobs, 'city').filter((city) => !['全国', '海外'].includes(city)), [jobs]);
  const stats = useMemo(() => familyStats(jobs), [jobs]);
  // 画像来自简历时，每次打开都按最新简历刷新没被手动改过的字段；从简历生成器跳转过来时也一样
  useEffect(() => {
    if (!dataset) return;
    const resume = storedResume();
    if (resume && (initialUrl.fromResume || profile?.source === 'resume')) {
      setProfile((current) => mergeDetected(current, detectProfile(resume, cityNames), { source: 'resume' }));
    } else if (initialUrl.fromResume) {
      setProfileDialog({ intro: { warn: true, text: '简历生成器里还没有你自己的简历（示例内容不会用于推荐）。可以上传 PDF 或手动设置画像。' } });
    }
    // 只在数据加载完成时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);
  // 网址里带来的值不在当前数据里时清掉，避免下拉框显示空白却仍在筛选
  useEffect(() => {
    if (!dataset) return;
    setFilters((current) => {
      const next = { ...current };
      for (const key of ['province', 'city', 'industry', 'family', 'cohort', 'batch']) if (next[key] && !options[key].includes(next[key])) next[key] = '';
      return Object.keys(next).some((key) => next[key] !== current[key]) ? next : current;
    });
  }, [dataset, options]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (sort !== 'updated') params.set('sort', sort);
    const search = params.toString();
    if (search !== window.location.search.slice(1)) window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  }, [filters, query, sort]);
  const matched = useMemo(() => jobs.filter((job) => {
    if (tab === 'saved' && !favorites.includes(job.id)) return false;
    const days = daysUntil(job.deadline, today);
    if (tab === 'soon' && (days === null || days < 0 || days > 7)) return false;
    if (query.trim() && ![job.company, job.title, job.program, job.industry, job.family, job.batch, ...(job.cities || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filters.province && filters.city && !job.locations?.some((location) => location.province === filters.province && location.city === filters.city)) return false;
    if (filters.province && !filters.city && !job.provinces?.includes(filters.province)) return false;
    if (filters.city && !filters.province && !job.cities?.includes(filters.city)) return false;
    if (filters.industry && !industriesOf(job).includes(filters.industry)) return false;
    if (!hasFieldValue(job.family, filters.family)) return false;
    if (!hasFieldValue(job.cohort, filters.cohort)) return false;
    if (!hasFieldValue(job.batch, filters.batch)) return false;
    if (filters.deadline === '7' && (days === null || days < 0 || days > 7)) return false;
    if (filters.deadline === '30' && (days === null || days < 0 || days > 30)) return false;
    if (filters.deadline === 'unknown' && days !== null) return false;
    return true;
  }).sort((a, b) => sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : (b.updatedAt || b.manualUpdatedAt || '').localeCompare(a.updatedAt || a.manualUpdatedAt || '')), [jobs, favorites, tab, query, filters, sort, today]);
  // “为你推荐”在现有筛选结果上打分排序，同分保持最近更新的顺序；届别不符的岗位被排除
  const recommending = sort === 'recommend' && hasProfile(profile);
  const ranked = useMemo(() => (recommending ? rankJobs(matched, profile, { stats, today }) : null), [recommending, matched, profile, stats, today]);
  const filtered = ranked ? ranked.map((item) => item.job) : matched;
  const reasonsById = useMemo(() => new Map((ranked || []).map((item) => [item.job.id, item.reasons])), [ranked]);
  const chooseSort = (value) => { setSort(value); if (value === 'recommend' && !hasProfile(profile)) setProfileDialog({}); };
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value, ...(name === 'province' ? { city: '' } : {}) }));
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const clearFilters = () => { setFilters(emptyFilters); setQuery(''); };
  const soonCount = useMemo(() => jobs.filter((job) => { const days = daysUntil(job.deadline, today); return days !== null && days >= 0 && days <= 7; }).length, [jobs, today]);
  const refreshed = refreshedText(dataset?.generatedAt);
  // 最近一天更新过信息的岗位数（以数据整理时间为准往前推 24 小时）
  const freshCount = useMemo(() => {
    if (!dataset?.generatedAt) return 0;
    const since = Date.parse(dataset.generatedAt) - 86400000;
    return jobs.filter((job) => job.updatedAt && Date.parse(job.updatedAt) >= since).length;
  }, [dataset, jobs]);
  const turnPage = (step) => { setPage((current) => current + step); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  // 列表的 key：翻页、换标签或筛选时重新挂载，卡片按顺序贴上来
  const listKey = `${tab}|${page}|${sort}|${query}|${Object.values(filters).join(',')}`;
  const tabs = [{ id: 'all', label: '全部岗位' }, { id: 'soon', label: '这周截止' }, { id: 'saved', label: '我的收藏', count: favorites.length }];
  const base = import.meta.env.BASE_URL;

  // 顶栏的“本地看板”：已在首页时不刷新页面，直接切到“我的收藏”并滚到下载说明
  const openBoardGuide = (event) => {
    if (window.location.pathname !== base) return;
    event.preventDefault();
    setTab('saved');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#local-board-guide`);
    window.setTimeout(() => {
      const guide = document.getElementById('local-board-guide');
      if (!guide) return;
      guide.open = true;
      guide.closest('.local-board-panel')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, 60);
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href={base} aria-label="秋招信库首页"><span className="brand-seal" aria-hidden="true">秋</span><span className="brand-name">秋招信库</span></a>
        <span className="edition num">2026 / 2027 届</span>
        <nav className="topbar-nav" aria-label="站内工具">
          <a href={`${base}insights/`}><ChartColumn size={16} aria-hidden="true" /><span>数据洞察</span></a>
          <a href={`${base}resume/`}><FileText size={16} aria-hidden="true" /><span>简历生成器</span></a>
          <a href={`${base}?tab=saved#local-board-guide`} onClick={openBoardGuide}><SquareKanban size={16} aria-hidden="true" /><span>本地看板</span></a>
        </nav>
      </div>
    </header>
    <div className="workspace">
      <section className="opener" aria-labelledby="page-title">
        <div className="opener-text">
          <h1 id="page-title">慢慢找，总有一份适合你</h1>
          <p className="standfirst">{dataset ? <>这一季收录了 <span className="num">{jobs.length.toLocaleString('zh-CN')}</span> 个{dataset.mode === 'demo' ? '演示' : ''}岗位，其中 <mark className="highlight"><span className="num">{soonCount.toLocaleString('zh-CN')}</span> 个这周截止</mark>。不用一次看完，先从你在意的城市开始。</> : '正在把卡片拿出来。'}</p>
          {refreshed && <p className="opener-note note">{refreshed}{freshCount > 0 && <>，最近一天有 <span className="num">{freshCount}</span> 个岗位更新了信息</>}。</p>}
          <label className="search-box"><Search size={18} aria-hidden="true" /><span className="sr-only">搜索公司、岗位或城市</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜公司、岗位或城市" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={15} /></button>}</label>
        </div>
        <figure className="opener-art" aria-hidden="true">
          {/* 秋日站台手绘插画（用户用 Gemini 生成，已把底色校正为纯白）。multiply 让插画底色和网页底色融为一体，不留接缝 */}
          <img src={`${base}hero-station.jpg`} alt="" width="1200" height="896" decoding="async" fetchPriority="high" />
          <TrainStamp />
        </figure>
      </section>
      {dataset?.mode === 'demo' && <div className="demo-notice"><Info size={16} aria-hidden="true" />当前展示的是演示数据，用来体验搜索、筛选和收藏；这些公司与岗位都不代表真实招聘。</div>}
      <div className="folio">
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
        <div className="folio-meta">
          <span className="num">{filtered.length.toLocaleString('zh-CN')} 个</span>
          {visible.length > 1 && <span className="guide-words" title="本页第一家和最后一家公司">{visible[0].company}<span aria-hidden="true">—</span>{visible[visible.length - 1].company}</span>}
          <span className="num folio-page">第 {page} / {totalPages} 页</span>
          <label className="sort-control"><span>排序</span><select value={sort} onChange={(event) => chooseSort(event.target.value)}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="recommend">为你推荐</option></select></label>
          <button type="button" className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}><SlidersHorizontal size={15} aria-hidden="true" />筛选{activeCount > 0 ? <span className="num">{activeCount}</span> : null}</button>
        </div>
      </div>
      <div className="content-grid">
        <aside className={`filter-panel${mobileFiltersOpen ? ' open' : ''}`} aria-label="筛选条件">
          <div className="filter-header"><div><SlidersHorizontal size={15} aria-hidden="true" /><strong>筛选</strong>{activeCount > 0 && <span className="filter-badge num">{activeCount}</span>}</div><button type="button" className="mobile-close" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选"><X size={20} /></button></div>
          <div className="filter-body">
            <ProfileCard profile={profile} active={recommending} onEdit={() => setProfileDialog({})} onRecommend={() => { setSort('recommend'); setMobileFiltersOpen(false); }} />
            <SelectFilter label="省份" value={filters.province} options={options.province} onChange={(value) => updateFilter('province', value)} />
            <SelectFilter label="城市" value={filters.city} options={options.city} onChange={(value) => updateFilter('city', value)} />
            <SelectFilter label="行业" value={filters.industry} options={options.industry} onChange={(value) => updateFilter('industry', value)} />
            <SelectFilter label="岗位族" value={filters.family} options={options.family} onChange={(value) => updateFilter('family', value)} />
            <SelectFilter label="届别" value={filters.cohort} options={options.cohort} onChange={(value) => updateFilter('cohort', value)} />
            <SelectFilter label="批次" value={filters.batch} options={options.batch} onChange={(value) => updateFilter('batch', value)} />
            <fieldset className="deadline-filter"><legend>截止日期</legend><div>{[['', '不限'], ['7', '7 天内'], ['30', '30 天内'], ['unknown', '没公布']].map(([value, label]) => <label key={label}><input type="radio" name="deadline" checked={filters.deadline === value} onChange={() => updateFilter('deadline', value)} /><span>{label}</span></label>)}</div></fieldset>
            <button type="button" className="reset-button" onClick={clearFilters} disabled={!activeCount && !query}>清空筛选条件</button>
          </div>
          <p className="filter-bottom">招聘信息可能会变，投递前看一眼原始公告。</p>
        </aside>
        <main className="results">
          <h2 className="sr-only">{tab === 'saved' ? '我的收藏' : tab === 'soon' ? '这周截止' : '全部岗位'}</h2>
          {tab === 'saved' && dataset && <LocalBoardPanel jobs={jobs.filter((job) => favorites.includes(job.id))} />}
          {sort === 'recommend' && !recommending && <div className="recommend-notice"><span>“为你推荐”需要先知道你的方向、城市和届别。设置之前，先按最近更新排着。</span><button type="button" className="button-secondary" onClick={() => setProfileDialog({})}>设置画像</button></div>}
          {recommending && <p className="recommend-caption">岗位没有职位描述，推荐只比较方向、城市、届别和行业；打了勾的是对得上的地方。{profile.cohort && `不面向 ${profile.cohort} 的岗位先收起来了。`}</p>}
          {loadError ? <div className="empty-state"><h3>卡片暂时没拿出来</h3><p className="note">可能是网络慢了一点，刷新一下试试？</p><p className="empty-detail">岗位数据没有加载成功。如果一直这样，可能是网站正在更新。</p><button type="button" className="button-secondary" onClick={() => window.location.reload()}>重新加载</button></div>
            : !dataset ? <CardSkeleton />
            : visible.length ? <><div className="card-list" key={listKey}>{visible.map((job, index) => <JobCard key={job.id} index={index} job={job} favorite={favorites.includes(job.id)} onFavorite={toggleFavorite} reasons={reasonsById.get(job.id)} />)}</div><div className="pagination"><span className="num">第 {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} 个，共 {filtered.length.toLocaleString('zh-CN')} 个</span><div><button type="button" disabled={page <= 1} onClick={() => turnPage(-1)} aria-label="上一页"><ChevronLeft size={18} /></button><strong className="num">{page} / {totalPages}</strong><button type="button" disabled={page >= totalPages} onClick={() => turnPage(1)} aria-label="下一页"><ChevronRight size={18} /></button></div></div></>
            : tab === 'saved' && favorites.length === 0
              ? <div className="empty-state"><h3>这里还空着</h3><p className="note">看到想留意的，点一下卡片右边的“收藏”就会放进来。</p><p className="empty-detail">收下的岗位可以同步到你电脑上的本地看板，慢慢整理投递进度。</p></div>
              : <div className="empty-state"><h3>这个条件下暂时没有</h3><p className="note">换个城市，或者少选一个条件看看？</p><button type="button" className="button-secondary" onClick={clearFilters}>清空筛选条件</button></div>}
        </main>
      </div>
      <footer className="footer"><span>秋招信库 · 校招信息索引 · <a href="https://github.com/Chloe-s-Space/job-website" target="_blank" rel="noopener noreferrer">源码（AGPL-3.0）</a></span><span>收藏只保存在你的浏览器里，不会上传</span></footer>
    </div>
      {mobileFiltersOpen && <button type="button" className="filter-backdrop" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选面板" />}
      {profileDialog && <ProfileDialog profile={profile} onChange={setProfile} onClose={() => { setProfileDialog(null); setMobileFiltersOpen(false); }} cityNames={cityNames} industryOptions={options.industry} cohortOptions={options.cohort.filter((cohort) => /^\d{4}届$/.test(cohort))} intro={profileDialog.intro} />}
    </div>;
}
