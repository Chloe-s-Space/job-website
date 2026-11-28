import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateBeisenPortal,
  applyBeisenEnrichment,
  enrichJobsWithBeisen,
  extractBeisenHost,
  resolveBeisenCities,
  shardOfHost,
} from './beisen-enrich.mjs';

test('extractBeisenHost normalizes mobile .m.zhiye.com hosts and rejects generic ones', () => {
  assert.equal(extractBeisenHost('https://Holley.zhiye.com/campus/jobs'), 'holley.zhiye.com');
  assert.equal(extractBeisenHost('https://bgigc.m.zhiye.com/'), 'bgigc.zhiye.com');
  assert.equal(extractBeisenHost('https://www.zhiye.com/'), null);
  assert.equal(extractBeisenHost('https://m.zhiye.com/'), null);
  assert.equal(extractBeisenHost('https://app.mokahr.com/campus-recruitment/demo/1'), null);
  assert.equal(extractBeisenHost('not-a-url'), null);
});

test('resolveBeisenCities omits parent provinces and sub-districts when active cities exist', () => {
  const tree = [
    { Code: '1', Name: ['全国'], ParentCode: '' },
    { Code: '3300', Name: ['浙江省'], ParentCode: '' },
    { Code: '3301', Name: ['杭州市'], ParentCode: '3300' },
    { Code: '330113', Name: ['临平区'], ParentCode: '3301' },
    { Code: '3100', Name: ['上海市'], ParentCode: '' },
  ];
  const counts = { 1: 0, 3300: 9, 3301: 9, 330113: 2, 3100: 3 };
  const result = resolveBeisenCities(tree, counts);
  assert.deepEqual(result.cities, ['杭州', '上海']);
  assert.deepEqual(result.provinces, ['浙江', '上海']);
});

test('aggregateBeisenPortal filters internships, handles sentinel deadlines, and avoids storing JD text', () => {
  const aggregated = aggregateBeisenPortal('holley.zhiye.com', {
    totalCount: 4,
    ads: [
      {
        JobAdName: 'Java后端开发工程师(J10234)',
        Kind: '全职',
        PostDate: '2026-11-25T10:00:00',
        EndTime: '2026-12-30T00:00:00',
        LocNames: [],
        Duty: '负责后端服务开发',
        Require: '面向2027届本科及以上学历毕业生',
      },
      {
        JobAdName: '嵌入式软件工程师',
        Kind: '全职',
        PostDate: '2026-11-20T09:00:00',
        EndTime: '0001-01-01T00:00:00',
        LocNames: ['深圳市'],
        Require: '2027届优先',
      },
      {
        JobAdName: '寒假实习生',
        Kind: '实习',
        PostDate: '2026-11-27T09:00:00',
        EndTime: '2026-12-30T00:00:00',
        LocNames: ['北京市'],
      },
      {
        JobAdName: '已截止岗位',
        Kind: '全职',
        PostDate: '2026-10-01T09:00:00',
        EndTime: '2026-11-10T00:00:00',
        LocNames: ['南京市'],
      },
    ],
    areaTree: [
      { Code: '3300', Name: ['浙江省'], ParentCode: '' },
      { Code: '3301', Name: ['杭州市'], ParentCode: '3300' },
    ],
    areaCounts: { 3300: 2, 3301: 2 },
  }, '2026-11-28');

  assert.equal(aggregated.status, 'active');
  assert.equal(aggregated.activeCampusAdCount, 2);
  assert.equal(aggregated.title, 'Java后端开发工程师、嵌入式软件工程师');
  assert.deepEqual(aggregated.cities, ['杭州', '深圳']);
  assert.deepEqual(aggregated.provinces, ['浙江', '广东']);
  assert.equal(aggregated.cohort, '2027届');
  assert.equal(aggregated.deadline, '2026-12-30');
  assert.equal(aggregated.updatedAt, '2026-11-25T10:00:00+08:00');
  assert.equal('Duty' in aggregated, false);
  assert.equal('Require' in aggregated, false);
});

test('applyBeisenEnrichment enriches missing/generic fields without touching ID, source, or manual titles', () => {
  const baseJob = {
    id: 'offer-ext_1',
    company: '示例公司',
    title: '管培生',
    cities: ['杭州'],
    provinces: ['浙江'],
    cohort: null,
    deadline: null,
    updatedAt: '2026-11-01T00:00:00+08:00',
    source: 'offer先生',
    family: '管培生',
    applyUrl: 'https://demo.zhiye.com/campus/jobs',
  };
  const live = {
    status: 'active',
    uniqueTitleCount: 3,
    title: 'Java后端开发工程师、产品经理、管培生',
    cities: ['杭州', '上海'],
    provinces: ['浙江', '上海'],
    cohort: '2027届',
    deadline: '2026-12-25',
    updatedAt: '2026-11-26T09:00:00+08:00',
  };
  const enriched = applyBeisenEnrichment(baseJob, live);
  assert.equal(enriched.changed, true);
  assert.equal(enriched.job.id, 'offer-ext_1');
  assert.equal(enriched.job.source, 'offer先生');
  assert.equal(enriched.job.title, live.title);
  assert.deepEqual(enriched.job.cities, ['杭州', '上海']);
  assert.equal(enriched.job.cohort, '2027届');
  assert.equal(enriched.job.deadline, '2026-12-25');
  assert.equal(enriched.job.updatedAt, '2026-11-26T09:00:00+08:00');
  assert.match(enriched.job.family, /后端开发/);

  // Re-applying identical live data reports no changes
  assert.equal(applyBeisenEnrichment(enriched.job, live).changed, false);

  // Manual enrichment protects longer title and earlier deadline/updatedAt aren't regressed
  const manualJob = {
    ...baseJob,
    id: 'manual-1',
    title: '研发中心2027届校招（含算法、后端、产品及供应链管培生等十余个方向）',
    manualUpdatedAt: '2026-11-20T00:00:00Z',
    deadline: '2027-01-15',
    updatedAt: '2026-11-28T00:00:00+08:00',
  };
  const manualResult = applyBeisenEnrichment(manualJob, live);
  assert.equal(manualResult.job.title, manualJob.title);
  assert.equal(manualResult.job.deadline, '2027-01-15');
  assert.equal(manualResult.job.updatedAt, '2026-11-28T00:00:00+08:00');
  assert.deepEqual(manualResult.job.cities, ['杭州', '上海']);
});

test('enrichJobsWithBeisen respects sharding, tolerates errors, and keeps closed/empty records', async () => {
  const hostA = 'alpha.zhiye.com';
  const hostB = 'beta.zhiye.com';
  const targetShard = shardOfHost(hostA, 14);
  const jobs = [
    { id: 'j1', company: 'Alpha', title: '管培生', cities: [], provinces: [], cohort: null, deadline: null, updatedAt: '2026-11-01T00:00:00Z', applyUrl: `https://${hostA}/` },
    { id: 'j2', company: 'Beta', title: '管培生', cities: [], provinces: [], cohort: null, deadline: null, updatedAt: '2026-11-01T00:00:00Z', applyUrl: `https://${hostB}/` },
  ];
  const called = [];
  const { jobs: out, stats } = await enrichJobsWithBeisen(jobs, {
    today: '2026-11-28',
    shards: 14,
    shard: targetShard,
    jitterMs: 0,
    log: () => {},
    fetchCompany: async (host) => {
      called.push(host);
      if (host === hostB) throw new Error('HTTP 500');
      return {
        totalCount: 1,
        ads: [{ JobAdName: '算法工程师', Kind: '全职', PostDate: '2026-11-27T10:00:00', EndTime: '0001-01-01T00:00:00', LocNames: ['北京'] }],
        areaTree: [],
        areaCounts: {},
      };
    },
  });

  assert.equal(called.includes(hostA), true);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, '算法工程师');
  assert.deepEqual(out[0].cities, ['北京']);
  assert.equal(out[1].title, '管培生');
  assert.ok(stats.activeHosts >= 1);
});
