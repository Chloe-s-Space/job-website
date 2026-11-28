import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeLocations } from './locations.mjs';
import { classifyFamily } from '../src/job-families.mjs';
import { fieldValues } from '../src/job-fields.mjs';

const DATA_PATH = new URL('../public/jobs.json', import.meta.url);
const GENERIC_FEISHU_HOSTS = new Set(['jobs.feishu.cn', 'www.jobs.feishu.cn']);
const IGNORED_PORTAL_SEGMENTS = new Set(['api', 's']);
const NON_CAMPUS_RE = /实习|开放日|宣讲会|校园大使|训练营|暑期实践/;
const CAMPUS_HINT_RE = /202[6-9]届|校招|秋招|春招|管培/;
const CAMPUS_PORTAL_RE = /campus|school|xiaozhao/i;
const GENERIC_TITLE_RE = /^(校招项目|校园招聘|管培生|管理培训生|其他职位|岗位信息见企业公告|专业不限|研发岗?|技术岗?|工程师|IT技术[、,，]?工程师)$/i;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_DISPLAY_TITLES = 12;
const DEFAULT_SHARDS = 6;
const MIN_PUBLISH_MS = Date.parse('2020-01-01T00:00:00Z');
const MAX_PUBLISH_MS = Date.parse('2035-01-01T00:00:00Z');

function todayInChina() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Extracts normalized `{ host, portal, key }` from a Feishu Jobs applyUrl.
 */
export function extractFeishuPortal(applyUrl) {
  if (typeof applyUrl !== 'string' || !applyUrl.trim()) return null;
  let url;
  try {
    url = new URL(applyUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.jobs.feishu.cn') || GENERIC_FEISHU_HOSTS.has(host)) return null;
  const firstSegment = url.pathname.split('/').filter(Boolean)[0] || '';
  const portal = (!firstSegment || IGNORED_PORTAL_SEGMENTS.has(firstSegment.toLowerCase()))
    ? 'campus'
    : firstSegment;
  return { host, portal, key: `${host}/${portal}` };
}

/**
 * Deterministically maps a Feishu portal key to a shard in `[0, shards)`.
 */
export function shardOfKey(key, shards = DEFAULT_SHARDS) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16) % shards;
}

/**
 * Computes the active half-day rolling shard index in `Asia/Shanghai`.
 */
export function currentFeishuShard(now = new Date(), shards = DEFAULT_SHARDS) {
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

export function extractCohorts(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(/202[6-9](?=届)/g) || [];
  return [...new Set(matches.map((year) => `${year}届`))].sort();
}

export function cleanAdTitle(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[（(][A-Za-z]?\d+[)）]\s*$/i, '').trim();
}

export function parseFeishuPublishTime(raw) {
  const ms = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(ms) || ms < MIN_PUBLISH_MS || ms > MAX_PUBLISH_MS) return null;
  return new Date(ms).toISOString();
}

/**
 * Strictly filters Feishu posts so only campus recruitment (non-internship) entries pass.
 */
export function isFeishuCampusPost(post, portal = '') {
  if (!post || typeof post !== 'object') return false;
  const title = cleanAdTitle(post.title);
  if (!title || NON_CAMPUS_RE.test(title)) return false;

  const recruitType = post.recruit_type;
  const typeId = String(recruitType?.id || '');
  const typeName = String(recruitType?.name || '');
  const parentId = String(recruitType?.parent?.id || '');
  const parentName = String(recruitType?.parent?.name || '');

  if (typeId === '202' || parentId === '1') return false;
  if (/实习|社招|社会招聘/.test(typeName) || /社招|社会招聘/.test(parentName)) return false;
  if (parentId === '2' || /校招|应届/.test(`${parentName} ${typeName}`)) return true;

  const combinedText = `${title} ${post.requirement || ''}`;
  if (CAMPUS_HINT_RE.test(combinedText)) return true;
  if (!recruitType && CAMPUS_PORTAL_RE.test(portal)) return true;
  return false;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  try {
    return { payload: JSON.parse(text), response };
  } catch {
    throw new Error('Non-JSON response');
  }
}

/**
 * Fetches campus recruitment posts from a Feishu Jobs portal via its CSRF + search endpoints.
 */
export async function fetchFeishuPortal({ host, portal }, { maxPages = 3, pageSize = 50, timeoutMs = 10000 } = {}) {
  const baseHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Origin: `https://${host}`,
    Referer: `https://${host}/${portal}`,
    'website-path': portal,
    'User-Agent': USER_AGENT,
  };

  const { payload: csrfPayload, response: csrfRes } = await fetchJson(`https://${host}/api/v1/csrf/token`, {
    method: 'POST',
    headers: baseHeaders,
    body: '{}',
    signal: AbortSignal.timeout(timeoutMs),
  });

  const setCookies = typeof csrfRes.headers.getSetCookie === 'function'
    ? csrfRes.headers.getSetCookie()
    : [csrfRes.headers.get('set-cookie')].filter(Boolean);
  const cookieCsrf = setCookies
    .map((entry) => (entry.match(/atsx-csrf-token=([^;]+)/) || [])[1])
    .find(Boolean);
  const csrfToken = csrfPayload?.data?.token || (cookieCsrf ? decodeURIComponent(cookieCsrf) : '');
  const cookieHeader = setCookies.map((entry) => entry.split(';')[0]).filter(Boolean).join('; ');

  const posts = [];
  let totalCount = null;
  const searchHeaders = {
    ...baseHeaders,
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const { payload } = await fetchJson(`https://${host}/api/v1/search/job/posts`, {
      method: 'POST',
      headers: searchHeaders,
      body: JSON.stringify({
        keyword: '',
        limit: pageSize,
        offset: pageIndex * pageSize,
        job_category_id_list: [],
        location_code_list: [],
        subject_id_list: [],
        recruitment_id_list: [],
        portal_type: 3,
        portal_entrance: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (payload?.code !== 0) {
      throw new Error(`Feishu Code ${payload?.code}: ${payload?.msg || 'unknown error'}`);
    }
    const list = payload?.data?.job_post_list;
    if (!Array.isArray(list)) {
      throw new Error('Unexpected Feishu response payload');
    }
    if (totalCount === null && Number.isInteger(payload?.data?.count)) {
      totalCount = payload.data.count;
    }
    posts.push(...list);
    if (list.length < pageSize || (totalCount !== null && posts.length >= totalCount)) break;
  }

  return { totalCount: totalCount ?? posts.length, posts };
}

/**
 * Aggregates post-level Feishu Jobs data into company-level metadata without storing JD prose.
 */
export function aggregateFeishuPortal(key, fetched) {
  const portal = key.split('/')[1] || '';
  const rawPosts = Array.isArray(fetched?.posts) ? fetched.posts : [];
  const totalCount = Number.isInteger(fetched?.totalCount) ? fetched.totalCount : rawPosts.length;
  const activePosts = rawPosts.filter((post) => isFeishuCampusPost(post, portal));

  if (!activePosts.length) {
    return {
      key,
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

  const uniqueTitles = [...new Set(activePosts.map((post) => cleanAdTitle(post.title)).filter(Boolean))];
  const displayTitles = uniqueTitles.slice(0, MAX_DISPLAY_TITLES);
  const title = uniqueTitles.length > MAX_DISPLAY_TITLES
    ? `${displayTitles.join('、')} 等${uniqueTitles.length}个校招岗位`
    : displayTitles.join('、');

  const rawCities = [];
  const cohorts = new Set();
  let maxUpdatedAt = null;

  for (const post of activePosts) {
    if (Array.isArray(post.city_list)) {
      for (const item of post.city_list) {
        if (typeof item?.name === 'string' && item.name.trim()) rawCities.push(item.name.trim());
      }
    }
    if (typeof post.city_info?.name === 'string' && post.city_info.name.trim()) {
      rawCities.push(post.city_info.name.trim());
    }
    for (const cohort of extractCohorts(`${post.title || ''} ${post.requirement || ''}`)) {
      cohorts.add(cohort);
    }
    const updatedAt = parseFeishuPublishTime(post.publish_time);
    if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) maxUpdatedAt = updatedAt;
  }

  const { cities, provinces } = normalizeLocations(rawCities);
  return {
    key,
    status: 'active',
    totalCount,
    activeCampusAdCount: activePosts.length,
    uniqueTitleCount: uniqueTitles.length,
    title,
    cities,
    provinces,
    cohort: cohorts.size ? [...cohorts].sort().join('、') : null,
    deadline: null,
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
 * Non-destructively enriches an existing job record using live Feishu portal metadata.
 */
export function applyFeishuEnrichment(job, live) {
  if (!job || live?.status !== 'active') {
    return { job, changed: false, fields: { title: false, cities: false, cohort: false, updatedAt: false } };
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
  const changed = titleChanged || citiesChanged || cohortChanged || updatedAtChanged || familyChanged;

  if (!changed) {
    return { job, changed: false, fields: { title: false, cities: false, cohort: false, updatedAt: false } };
  }

  return {
    job: {
      ...job,
      title: nextTitle,
      cities: nextCities,
      provinces: nextProvinces,
      cohort: nextCohort,
      updatedAt: nextUpdatedAt,
      family: nextFamily,
    },
    changed: true,
    fields: {
      title: titleChanged,
      cities: citiesChanged,
      cohort: cohortChanged,
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
 * Runs a sharded rolling enrichment pass over Feishu Jobs portals in `jobs`.
 */
export async function enrichJobsWithFeishu(jobs, {
  today = todayInChina(),
  shards = DEFAULT_SHARDS,
  shard = currentFeishuShard(new Date(), shards),
  limit = Infinity,
  concurrency = 4,
  timeoutMs = 10000,
  budgetMs = 45000,
  jitterMs = 150,
  fetchPortal = fetchFeishuPortal,
  log = console.log,
} = {}) {
  const portalMap = new Map();
  for (const job of jobs || []) {
    const info = extractFeishuPortal(job?.applyUrl);
    if (info && !portalMap.has(info.key)) portalMap.set(info.key, info);
  }
  const allKeys = [...portalMap.keys()].sort();
  const shardKeys = shard === null
    ? allKeys
    : allKeys.filter((key) => shardOfKey(key, shards) === shard);
  const targetKeys = Number.isFinite(limit) ? shardKeys.slice(0, limit) : shardKeys;

  const liveByKey = new Map();
  let activePortals = 0;
  let closedPortals = 0;
  let errorPortals = 0;
  let skippedPortals = 0;

  if (targetKeys.length > 0) {
    const fetchedResults = await runPoolWithBudget(targetKeys, concurrency, budgetMs, jitterMs, async (key) => {
      try {
        const fetched = await fetchPortal(portalMap.get(key), { timeoutMs });
        const aggregated = aggregateFeishuPortal(key, fetched, today);
        return { key, aggregated, error: null };
      } catch (error) {
        return { key, aggregated: null, error: error.message };
      }
    });

    for (const item of fetchedResults) {
      if (!item) {
        skippedPortals += 1;
        continue;
      }
      if (item.error) {
        errorPortals += 1;
        continue;
      }
      liveByKey.set(item.key, item.aggregated);
      if (item.aggregated.status === 'active') activePortals += 1;
      else closedPortals += 1;
    }
  }

  let enrichedRecords = 0;
  const fieldCounts = { title: 0, cities: 0, cohort: 0, updatedAt: 0 };
  const sampleEnriched = [];

  const enrichedJobs = (jobs || []).map((job) => {
    const info = extractFeishuPortal(job?.applyUrl);
    if (!info) return job;
    const live = liveByKey.get(info.key);
    if (!live || live.status !== 'active') return job;
    const result = applyFeishuEnrichment(job, live);
    if (result.changed) {
      enrichedRecords += 1;
      for (const key of Object.keys(fieldCounts)) {
        if (result.fields[key]) fieldCounts[key] += 1;
      }
      if (sampleEnriched.length < 10) {
        sampleEnriched.push({
          id: job.id,
          company: job.company,
          portalKey: info.key,
          before: { title: job.title, cities: job.cities, cohort: job.cohort, updatedAt: job.updatedAt },
          after: { title: result.job.title, cities: result.job.cities, cohort: result.job.cohort, updatedAt: result.job.updatedAt },
        });
      }
    }
    return result.job;
  });

  const stats = {
    totalPortals: allKeys.length,
    shard,
    shards,
    probedPortals: targetKeys.length - skippedPortals,
    activePortals,
    closedPortals,
    errorPortals,
    skippedPortals,
    enrichedRecords,
    fieldCounts,
    sampleEnriched,
  };

  const shardLabel = shard === null ? '全量' : `${shard + 1}/${shards}`;
  log(
    `飞书招聘官方增强（分片 ${shardLabel}）：探测 ${stats.probedPortals} 家（在招 ${activePortals}，0 校招 ${closedPortals}，异常 ${errorPortals}，超时跳过 ${skippedPortals}），增强 ${enrichedRecords} 条记录（标题 ${fieldCounts.title}、城市 ${fieldCounts.cities}、届别 ${fieldCounts.cohort}、更新时间 ${fieldCounts.updatedAt}）`,
  );

  return { jobs: enrichedJobs, stats };
}

function parseCliArgs(argv) {
  const options = { dryRun: true, shards: DEFAULT_SHARDS, shard: undefined, limit: Infinity, concurrency: 4, timeoutMs: 10000, budgetMs: 45000, out: null };
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
    else if (arg.startsWith('--budget=')) options.budgetMs = Number.parseInt(arg.slice(9), 10) || 45000;
    else if (arg.startsWith('--out=')) options.out = arg.slice(6);
  }
  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const dataset = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const { jobs, stats } = await enrichJobsWithFeishu(dataset.jobs, {
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
      console.log(`• ${item.company} (${item.portalKey})`);
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
