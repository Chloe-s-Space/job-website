import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeLocations } from './locations.mjs';
import { classifyFamily } from '../src/job-families.mjs';
import { fieldValues } from '../src/job-fields.mjs';

const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const GENERIC_ZHIYE_HOSTS = new Set(['zhiye.com', 'www.zhiye.com', 'm.zhiye.com']);
const NON_CAMPUS_RE = /实习|开放日|宣讲会|校园大使|训练营|暑期实践/;
const GENERIC_TITLE_RE = /^(校招项目|校园招聘|管培生|管理培训生|其他职位|岗位信息见企业公告|专业不限|研发岗?|技术岗?|工程师|IT技术[、,，]?工程师)$/i;
const MUNICIPALITY_OR_SAR_RE = /^(北京|天津|上海|重庆|香港|澳门)/;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_DISPLAY_TITLES = 12;
const DEFAULT_SHARDS = 14;

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Normalizes a job applyUrl into a Beisen portal hostname (`*.zhiye.com`),
 * stripping legacy mobile `.m.` prefixes and rejecting generic hosts.
 */
export function extractBeisenHost(applyUrl) {
  if (typeof applyUrl !== 'string' || !applyUrl.trim()) return null;
  let host;
  try {
    host = new URL(applyUrl.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (GENERIC_ZHIYE_HOSTS.has(host)) return null;
  if (host.endsWith('.m.zhiye.com')) {
    host = `${host.slice(0, -'.m.zhiye.com'.length)}.zhiye.com`;
  }
  if (!host.endsWith('.zhiye.com') || GENERIC_ZHIYE_HOSTS.has(host)) return null;
  return host;
}

/**
 * Maps a portal hostname deterministically to a shard in `[0, shards)`.
 */
export function shardOfHost(host, shards = DEFAULT_SHARDS) {
  const hex = createHash('sha256').update(host).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) % shards;
}

/**
 * Computes the active half-day rolling shard index in `Asia/Shanghai`.
 */
export function currentBeisenShard(now = new Date(), shards = DEFAULT_SHARDS) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayNumber = Math.floor(Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day)) / 86400000);
  const slot = Number(byType.hour) >= 12 ? 1 : 0;
  return (dayNumber * 2 + slot) % shards;
}

export function parseBeisenDate(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.startsWith('0001-01-01')) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/);
  if (match) {
    const iso = `${match[1]}T${match[2]}+08:00`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    return `${text}T00:00:00+08:00`;
  }
  return Number.isNaN(Date.parse(text)) ? null : new Date(text).toISOString();
}

export function parseBeisenDeadline(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.startsWith('0001-01-01')) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const date = match[1];
  const year = Number(date.slice(0, 4));
  if (year < 2000 || year > 2100 || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  return date;
}

export function extractCohorts(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(/202[6-9](?=届)/g) || [];
  return [...new Set(matches.map((year) => `${year}届`))].sort();
}

export function cleanAdTitle(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[（(]J\d+[)）]\s*$/i, '').trim();
}

export function isCampusAd(ad) {
  if (!ad || typeof ad !== 'object') return false;
  const title = cleanAdTitle(ad.JobAdName);
  if (!title) return false;
  const combined = `${title} ${ad.Kind || ''}`;
  return !NON_CAMPUS_RE.test(combined);
}

/**
 * Resolves Beisen area tree + job counts into normalized cities and provinces.
 */
export function resolveBeisenCities(tree, countMap) {
  if (!Array.isArray(tree) || !tree.length || !countMap || typeof countMap !== 'object') {
    return { cities: [], provinces: [] };
  }
  const byCode = new Map();
  const parentsWithActiveChild = new Set();

  for (const node of tree) {
    if (!node || node.Code == null) continue;
    const code = String(node.Code);
    byCode.set(code, node);
    if (Number(countMap[code]) > 0 && node.ParentCode) {
      parentsWithActiveChild.add(String(node.ParentCode));
    }
  }

  const rawNames = [];
  for (const node of tree) {
    if (!node || node.Code == null) continue;
    const code = String(node.Code);
    if (!(Number(countMap[code]) > 0)) continue;
    const name = String(Array.isArray(node.Name) ? node.Name[0] || '' : node.Name || '').trim();
    if (!name) continue;
    if (code === '1' || name === '全国') {
      rawNames.push('全国');
      continue;
    }
    const parentCode = node.ParentCode ? String(node.ParentCode) : '';
    if (/(区|县)$/.test(name) && parentCode && byCode.has(parentCode) && Number(countMap[parentCode]) > 0) {
      continue;
    }
    if (!parentCode && parentsWithActiveChild.has(code) && !MUNICIPALITY_OR_SAR_RE.test(name)) {
      continue;
    }
    rawNames.push(name);
  }
  return normalizeLocations(rawNames);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Non-JSON response');
  }
}

function beisenHeaders(host) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Origin: `https://${host}`,
    Referer: `https://${host}/campus/jobs`,
    'User-Agent': USER_AGENT,
  };
}

/**
 * Fetches campus recruitment ads and optional area counts from a Beisen portal.
 */
export async function fetchBeisenCompany(host, { maxPages = 3, timeoutMs = 10000 } = {}) {
  const headers = beisenHeaders(host);
  const ads = [];
  let totalCount = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = await fetchJson(`https://${host}/api/Jobad/GetJobAdPageList`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        PageIndex: pageIndex,
        PageSize: 50,
        Category: ['2'],
        KeyWords: '',
        SpecialType: 0,
        PortalId: '',
        DisplayFields: ['Category', 'Kind', 'PostDate'],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (payload?.Code !== undefined && payload.Code !== 200) {
      throw new Error(`Beisen Code ${payload.Code}: ${payload.Message || 'unknown error'}`);
    }
    if (!payload || !Array.isArray(payload.Data)) {
      throw new Error('Unexpected Beisen response payload');
    }
    if (totalCount === null && Number.isInteger(payload.Count)) {
      totalCount = payload.Count;
    }
    ads.push(...payload.Data);
    if (payload.Data.length < 50) break;
  }

  let areaTree = [];
  let areaCounts = {};
  if (ads.length > 0) {
    try {
      const treePayload = await fetchJson(`https://${host}/api/Jobad/SearchAreasTreeConditions?categoryId=2`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      areaTree = Array.isArray(treePayload?.Data) ? treePayload.Data : [];
      if (areaTree.length > 0) {
        const codes = areaTree.map((item) => item.Code).filter((code) => code != null);
        if (codes.length > 0) {
          const countPayload = await fetchJson(`https://${host}/api/Jobad/GetJobCount`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              Condition: [{ Type: 'workLocation', Values: codes }],
              Category: 'campus',
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (countPayload?.Data && typeof countPayload.Data === 'object') {
            areaCounts = countPayload.Data;
          }
        }
      }
    } catch {
      // City lookup is supplementary; never fail the host on tree/count errors.
    }
  }

  return { totalCount: totalCount ?? ads.length, ads, areaTree, areaCounts };
}

/**
 * Aggregates job-level Beisen ads into company-level metadata without storing JD prose.
 */
export function aggregateBeisenPortal(host, fetched, today = todayInChina()) {
  const rawAds = Array.isArray(fetched?.ads) ? fetched.ads : [];
  const totalCount = Number.isInteger(fetched?.totalCount) ? fetched.totalCount : rawAds.length;
  const activeAds = [];

  for (const ad of rawAds) {
    if (!isCampusAd(ad)) continue;
    const deadline = parseBeisenDeadline(ad.EndTime);
    if (deadline && deadline < today) continue;
    activeAds.push({ ad, deadline, cleanTitle: cleanAdTitle(ad.JobAdName) });
  }

  if (!activeAds.length) {
    return {
      host,
      status: 'closed_or_empty',
      totalCount,
      activeCampusAdCount: 0,
      uniqueTitleCount: 0,
      title: null,
      cities: [],
      provinces: [],
      cohort: null,
      deadline: null,
      updatedAt: null,
    };
  }

  const uniqueTitles = [...new Set(activeAds.map((entry) => entry.cleanTitle).filter(Boolean))];
  const displayTitles = uniqueTitles.slice(0, MAX_DISPLAY_TITLES);
  const title = uniqueTitles.length > MAX_DISPLAY_TITLES
    ? `${displayTitles.join('、')} 等${uniqueTitles.length}个校招岗位`
    : displayTitles.join('、');

  const rawCities = [...resolveBeisenCities(fetched?.areaTree, fetched?.areaCounts).cities];
  const cohorts = new Set();
  let maxDeadline = null;
  let maxUpdatedAt = null;

  for (const { ad, deadline } of activeAds) {
    if (Array.isArray(ad.LocNames)) {
      for (const loc of ad.LocNames) {
        if (typeof loc === 'string' && loc.trim()) rawCities.push(loc.trim());
      }
    }
    for (const cohort of extractCohorts(`${ad.JobAdName || ''} ${ad.Require || ''}`)) {
      cohorts.add(cohort);
    }
    if (deadline && (!maxDeadline || deadline > maxDeadline)) maxDeadline = deadline;
    const updatedAt = parseBeisenDate(ad.PostDate);
    if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) maxUpdatedAt = updatedAt;
  }

  const { cities, provinces } = normalizeLocations(rawCities);
  return {
    host,
    status: 'active',
    totalCount,
    activeCampusAdCount: activeAds.length,
    uniqueTitleCount: uniqueTitles.length,
    title,
    cities,
    provinces,
    cohort: cohorts.size ? [...cohorts].sort().join('、') : null,
    deadline: maxDeadline,
    updatedAt: maxUpdatedAt,
  };
}

function shouldEnrichTitle(job, live) {
  if (!live.title) return false;
  if (job.manualUpdatedAt && live.title.length <= (job.title || '').length) return false;
  if (GENERIC_TITLE_RE.test((job.title || '').trim())) return true;
  return live.uniqueTitleCount >= 2
    && fieldValues(job.title).length <= 2
    && live.title.length > (job.title || '').length;
}

/**
 * Non-destructively enriches an existing job record using live Beisen portal metadata.
 */
export function applyBeisenEnrichment(job, live) {
  if (!job || live?.status !== 'active') {
    return { job, changed: false, fields: { title: false, cities: false, cohort: false, deadline: false, updatedAt: false } };
  }

  let nextTitle = job.title;
  const titleChanged = shouldEnrichTitle(job, live) && live.title !== job.title;
  if (titleChanged) nextTitle = live.title;

  let nextCities = job.cities || [];
  let nextProvinces = job.provinces || [];
  let citiesChanged = false;
  if (Array.isArray(live.cities) && live.cities.length > 0) {
    const existingSet = new Set(nextCities);
    if (live.cities.some((city) => !existingSet.has(city))) {
      const mergedLocs = normalizeLocations([...nextCities, ...live.cities]);
      if (JSON.stringify(mergedLocs.cities) !== JSON.stringify(nextCities)
        || JSON.stringify(mergedLocs.provinces) !== JSON.stringify(nextProvinces)) {
        nextCities = mergedLocs.cities;
        nextProvinces = mergedLocs.provinces;
        citiesChanged = true;
      }
    }
  }

  let nextCohort = job.cohort ?? null;
  let cohortChanged = false;
  if (live.cohort) {
    const existingCohorts = fieldValues(job.cohort);
    const liveCohorts = fieldValues(live.cohort);
    const existingSet = new Set(existingCohorts);
    if (liveCohorts.some((item) => !existingSet.has(item))) {
      nextCohort = [...new Set([...existingCohorts, ...liveCohorts])].join('、') || null;
      cohortChanged = nextCohort !== (job.cohort ?? null);
    }
  }

  let nextDeadline = job.deadline ?? null;
  let deadlineChanged = false;
  if (!nextDeadline && live.deadline) {
    nextDeadline = live.deadline;
    deadlineChanged = true;
  }

  let nextUpdatedAt = job.updatedAt ?? null;
  let updatedAtChanged = false;
  if (live.updatedAt) {
    const liveMs = Date.parse(live.updatedAt);
    const prevMs = nextUpdatedAt ? Date.parse(nextUpdatedAt) : Number.NEGATIVE_INFINITY;
    if (!Number.isNaN(liveMs) && (Number.isNaN(prevMs) || liveMs > prevMs)) {
      nextUpdatedAt = live.updatedAt;
      updatedAtChanged = true;
    }
  }

  const nextFamily = (titleChanged || job.family === undefined) ? classifyFamily(nextTitle) : job.family;
  const familyChanged = nextFamily !== job.family;
  const changed = titleChanged || citiesChanged || cohortChanged || deadlineChanged || updatedAtChanged || familyChanged;

  if (!changed) {
    return { job, changed: false, fields: { title: false, cities: false, cohort: false, deadline: false, updatedAt: false } };
  }

  return {
    job: {
      ...job,
      title: nextTitle,
      cities: nextCities,
      provinces: nextProvinces,
      cohort: nextCohort,
      deadline: nextDeadline,
      updatedAt: nextUpdatedAt,
      family: nextFamily,
    },
    changed: true,
    fields: {
      title: titleChanged,
      cities: citiesChanged,
      cohort: cohortChanged,
      deadline: deadlineChanged,
      updatedAt: updatedAtChanged,
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPoolWithBudget(items, concurrency, budgetMs, jitterMs, fn) {
  const results = new Array(items.length);
  const deadlineMs = Date.now() + budgetMs;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      if (Date.now() >= deadlineMs) break;
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
      if (cursor < items.length && jitterMs > 0 && Date.now() < deadlineMs) {
        await sleep(jitterMs);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Runs a sharded rolling enrichment pass over Beisen portals in `jobs`.
 */
export async function enrichJobsWithBeisen(jobs, {
  today = todayInChina(),
  shards = DEFAULT_SHARDS,
  shard = currentBeisenShard(new Date(), shards),
  limit = Infinity,
  concurrency = 4,
  timeoutMs = 10000,
  budgetMs = 90000,
  jitterMs = 150,
  fetchCompany = fetchBeisenCompany,
  log = console.log,
} = {}) {
  const hostSet = new Set();
  for (const job of jobs || []) {
    const host = extractBeisenHost(job?.applyUrl);
    if (host) hostSet.add(host);
  }
  const allHosts = [...hostSet].sort();
  const shardHosts = shard === null
    ? allHosts
    : allHosts.filter((host) => shardOfHost(host, shards) === shard);
  const targetHosts = Number.isFinite(limit) ? shardHosts.slice(0, limit) : shardHosts;

  const liveByHost = new Map();
  let activeHosts = 0;
  let closedHosts = 0;
  let errorHosts = 0;
  let skippedHosts = 0;

  if (targetHosts.length > 0) {
    const fetchedResults = await runPoolWithBudget(targetHosts, concurrency, budgetMs, jitterMs, async (host) => {
      try {
        const fetched = await fetchCompany(host, { timeoutMs });
        const aggregated = aggregateBeisenPortal(host, fetched, today);
        return { host, aggregated, error: null };
      } catch (error) {
        return { host, aggregated: null, error: error.message };
      }
    });

    for (const item of fetchedResults) {
      if (!item) {
        skippedHosts += 1;
        continue;
      }
      if (item.error) {
        errorHosts += 1;
        continue;
      }
      liveByHost.set(item.host, item.aggregated);
      if (item.aggregated.status === 'active') activeHosts += 1;
      else closedHosts += 1;
    }
  }

  let enrichedRecords = 0;
  const fieldCounts = { title: 0, cities: 0, cohort: 0, deadline: 0, updatedAt: 0 };
  const sampleEnriched = [];

  const enrichedJobs = (jobs || []).map((job) => {
    const host = extractBeisenHost(job?.applyUrl);
    if (!host) return job;
    const live = liveByHost.get(host);
    if (!live || live.status !== 'active') return job;
    const result = applyBeisenEnrichment(job, live);
    if (result.changed) {
      enrichedRecords += 1;
      for (const key of Object.keys(fieldCounts)) {
        if (result.fields[key]) fieldCounts[key] += 1;
      }
      if (sampleEnriched.length < 10) {
        sampleEnriched.push({
          id: job.id,
          company: job.company,
          host,
          before: { title: job.title, cities: job.cities, cohort: job.cohort, deadline: job.deadline, updatedAt: job.updatedAt },
          after: { title: result.job.title, cities: result.job.cities, cohort: result.job.cohort, deadline: result.job.deadline, updatedAt: result.job.updatedAt },
        });
      }
    }
    return result.job;
  });

  const stats = {
    totalHosts: allHosts.length,
    shard,
    shards,
    probedHosts: targetHosts.length - skippedHosts,
    activeHosts,
    closedHosts,
    errorHosts,
    skippedHosts,
    enrichedRecords,
    fieldCounts,
    sampleEnriched,
  };

  const shardLabel = shard === null ? '全量' : `${shard + 1}/${shards}`;
  log(
    `北森官方增强（分片 ${shardLabel}）：探测 ${stats.probedHosts} 家（在招 ${activeHosts}，0 校招 ${closedHosts}，异常 ${errorHosts}，超时跳过 ${skippedHosts}），增强 ${enrichedRecords} 条记录（标题 ${fieldCounts.title}、城市 ${fieldCounts.cities}、届别 ${fieldCounts.cohort}、截止 ${fieldCounts.deadline}、更新时间 ${fieldCounts.updatedAt}）`,
  );

  return { jobs: enrichedJobs, stats };
}

function parseCliArgs(argv) {
  const options = { dryRun: true, shards: DEFAULT_SHARDS, shard: undefined, limit: Infinity, concurrency: 4, timeoutMs: 10000, budgetMs: 90000, out: null };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--write') options.dryRun = false;
    else if (arg === '--all') options.shard = null;
    else if (arg.startsWith('--shard=')) {
      const [part, total] = arg.slice(8).split('/').map((v) => Number.parseInt(v, 10));
      if (Number.isInteger(part) && part >= 0) options.shard = part;
      if (Number.isInteger(total) && total > 0) options.shards = total;
    } else if (arg.startsWith('--limit=')) options.limit = Number.parseInt(arg.slice(8), 10) || Infinity;
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number.parseInt(arg.slice(14), 10) || 4;
    else if (arg.startsWith('--timeout=')) options.timeoutMs = Number.parseInt(arg.slice(10), 10) || 10000;
    else if (arg.startsWith('--budget=')) options.budgetMs = Number.parseInt(arg.slice(9), 10) || 90000;
    else if (arg.startsWith('--out=')) options.out = arg.slice(6);
  }
  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const { jobs, stats } = await enrichJobsWithBeisen(dataset.jobs, {
    today: todayInChina(),
    shards: options.shards,
    shard: options.shard,
    limit: options.limit,
    concurrency: options.concurrency,
    timeoutMs: options.timeoutMs,
    budgetMs: options.budgetMs,
  });

  if (stats.sampleEnriched.length > 0) {
    console.log('\n--- 增强样例 ---');
    for (const item of stats.sampleEnriched.slice(0, 5)) {
      console.log(`• ${item.company} (${item.host})`);
      console.log(`  标题: ${item.before.title} -> ${item.after.title}`);
      console.log(`  城市: [${(item.before.cities || []).join('、')}] -> [${(item.after.cities || []).join('、')}] | 更新: ${(item.before.updatedAt || '无').slice(0, 10)} -> ${(item.after.updatedAt || '无').slice(0, 10)}`);
    }
  }

  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  }

  if (!options.dryRun && stats.enrichedRecords > 0) {
    const nextDataset = { ...dataset, generatedAt: new Date().toISOString(), jobs };
    await writeFile(DATA_PATH, `${JSON.stringify(nextDataset, null, 2)}\n`, 'utf8');
    console.log(`已写回 ${DATA_PATH.pathname}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
