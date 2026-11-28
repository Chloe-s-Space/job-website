import assert from 'node:assert/strict';
import test from 'node:test';
import { syncCampusDataset } from './update-jobs.mjs';

const TODAY = '2026-11-28';

function makeJob(overrides) {
  return {
    id: 'offer-1',
    company: '示例公司',
    title: '研发工程师',
    program: '2027届秋招',
    industry: 'IT/互联网/游戏',
    cities: ['上海'],
    provinces: ['上海'],
    cohort: '2027届',
    batch: '秋招',
    deadline: '2027-03-01',
    updatedAt: '2026-11-28T00:00:00Z',
    source: 'offer先生',
    sourceUrl: null,
    applyUrl: 'https://example.com/apply',
    announcementUrl: null,
    verification: 'unverified',
    ...overrides,
  };
}

function makePrevious(jobs) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-27T10:55:00.004Z',
    mode: 'live',
    jobs,
  };
}

test('retains existing xixicc records and merges offer updates when xixicc fetch fails', async () => {
  const previous = makePrevious([
    makeJob({ id: 'xixicc-1', company: '存量公司', source: 'xixicc2027', batch: '正式批', program: null }),
    makeJob({ id: 'offer-old', company: '旧公司' }),
  ]);
  const warnings = [];
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: true,
    permissionXixicc: true,
    offerApiKey: 'test-key',
    fetchOffer: async () => [makeJob({ id: 'offer-new', company: '新公司' })],
    fetchXixicc: async () => { throw new Error('xixicc2027 HTTP 404'); },
    warn: (message) => warnings.push(message),
    log: () => {},
  });
  assert.ok(dataset);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /xixicc2027 HTTP 404/);
  assert.deepEqual(dataset.jobs.map((job) => job.id).sort(), ['offer-new', 'offer-old', 'xixicc-1']);
});

test('replaces removed xixicc records on successful fetch while keeping manual enrichments for present ones', async () => {
  const previous = makePrevious([
    makeJob({
      id: 'xixicc-keep',
      company: '保留公司',
      title: '后端开发工程师（人工补充更长标题）',
      source: 'xixicc2027',
      batch: '正式批',
      program: null,
      manualUpdatedAt: '2026-11-20T00:00:00Z',
    }),
    makeJob({ id: 'xixicc-drop', company: '下架公司', source: 'xixicc2027', batch: '正式批', program: null }),
  ]);
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: false,
    permissionXixicc: true,
    fetchXixicc: async () => [
      makeJob({ id: 'xixicc-keep', company: '保留公司', title: '后端开发', source: 'xixicc2027', batch: '正式批', program: null }),
      makeJob({ id: 'xixicc-fresh', company: '新增公司', source: 'xixicc2027', batch: '正式批', program: null }),
    ],
    warn: () => {},
    log: () => {},
  });
  assert.ok(dataset);
  assert.deepEqual(dataset.jobs.map((job) => job.id).sort(), ['xixicc-fresh', 'xixicc-keep']);
  const kept = dataset.jobs.find((job) => job.id === 'xixicc-keep');
  assert.equal(kept.title, '后端开发工程师（人工补充更长标题）');
  assert.equal(kept.manualUpdatedAt, '2026-11-20T00:00:00Z');
});

test('retains existing offer records when offer fetch fails and xixicc succeeds', async () => {
  const previous = makePrevious([
    makeJob({ id: 'offer-1', company: '原有公司' }),
  ]);
  const warnings = [];
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: true,
    permissionXixicc: true,
    offerApiKey: 'test-key',
    fetchOffer: async () => { throw new Error('offer先生 HTTP 502'); },
    fetchXixicc: async () => [makeJob({ id: 'xixicc-1', company: '新源公司', source: 'xixicc2027', batch: '正式批', program: null })],
    warn: (message) => warnings.push(message),
    log: () => {},
  });
  assert.ok(dataset);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /offer先生 HTTP 502/);
  assert.deepEqual(dataset.jobs.map((job) => job.id).sort(), ['offer-1', 'xixicc-1']);
});

test('throws when all enabled sources fail to fetch', async () => {
  const previous = makePrevious([makeJob({ id: 'offer-1' })]);
  await assert.rejects(
    () => syncCampusDataset({
      previous,
      today: TODAY,
      permissionOffer: true,
      permissionXixicc: true,
      offerApiKey: 'test-key',
      fetchOffer: async () => { throw new Error('offer先生 HTTP 500'); },
      fetchXixicc: async () => { throw new Error('xixicc2027 HTTP 404'); },
      warn: () => {},
      log: () => {},
    }),
    /所有已启用数据源均抓取失败/,
  );
});

test('skips xixicc fetch and preserves unexpired xixicc records when permissionXixicc is false', async () => {
  const previous = makePrevious([
    makeJob({ id: 'xixicc-live', company: '未过期公司', source: 'xixicc2027', batch: '正式批', program: null, deadline: '2026-12-15' }),
    makeJob({ id: 'xixicc-expired', company: '已过期公司', source: 'xixicc2027', batch: '正式批', program: null, deadline: '2026-11-20' }),
  ]);
  let xixiccCalled = false;
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: true,
    permissionXixicc: false,
    offerApiKey: 'test-key',
    fetchOffer: async () => [makeJob({ id: 'offer-1', company: '新招公司' })],
    fetchXixicc: async () => {
      xixiccCalled = true;
      return [];
    },
    warn: () => {},
    log: () => {},
  });
  assert.equal(xixiccCalled, false);
  assert.ok(dataset);
  assert.deepEqual(dataset.jobs.map((job) => job.id).sort(), ['offer-1', 'xixicc-live']);
});

test('runs Beisen enrichment when permissionBeisen is true and validates enriched jobs', async () => {
  const previous = makePrevious([
    makeJob({ id: 'offer-1', company: '北森企业', title: '管培生', applyUrl: 'https://demo.zhiye.com/campus/jobs' }),
  ]);
  let enrichCalled = false;
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: true,
    permissionBeisen: true,
    offerApiKey: 'test-key',
    fetchOffer: async () => [],
    enrichBeisen: async (jobs) => {
      enrichCalled = true;
      return {
        jobs: jobs.map((job) => ({ ...job, title: 'Java开发、产品经理', cities: ['上海', '杭州'], provinces: ['上海', '浙江'] })),
        stats: { enrichedRecords: 1 },
      };
    },
    warn: () => {},
    log: () => {},
  });
  assert.equal(enrichCalled, true);
  assert.equal(dataset.jobs[0].title, 'Java开发、产品经理');
  assert.deepEqual(dataset.jobs[0].cities, ['上海', '杭州']);
});

test('keeps merged offer records with a warning when Beisen enrichment throws', async () => {
  const previous = makePrevious([]);
  const warnings = [];
  const dataset = await syncCampusDataset({
    previous,
    today: TODAY,
    permissionOffer: true,
    permissionBeisen: true,
    offerApiKey: 'test-key',
    fetchOffer: async () => [makeJob({ id: 'offer-new', company: '新招公司' })],
    enrichBeisen: async () => { throw new Error('Beisen timeout'); },
    warn: (message) => warnings.push(message),
    log: () => {},
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Beisen timeout/);
  assert.deepEqual(dataset.jobs.map((job) => job.id), ['offer-new']);
});
