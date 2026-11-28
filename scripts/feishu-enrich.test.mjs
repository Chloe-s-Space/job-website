import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateFeishuPortal,
  applyFeishuEnrichment,
  enrichJobsWithFeishu,
  extractFeishuPortal,
  isFeishuCampusPost,
  shardOfKey,
} from './feishu-enrich.mjs';

test('extractFeishuPortal extracts host/portal and ignores generic or non-Feishu hosts', () => {
  assert.deepEqual(
    extractFeishuPortal('https://lanhevip.jobs.feishu.cn/605335/position/list?spread=93WV2KY'),
    { host: 'lanhevip.jobs.feishu.cn', portal: '605335', key: 'lanhevip.jobs.feishu.cn/605335' },
  );
  assert.deepEqual(
    extractFeishuPortal('https://r712him1th.jobs.feishu.cn/huixicampus/position/list'),
    { host: 'r712him1th.jobs.feishu.cn', portal: 'huixicampus', key: 'r712him1th.jobs.feishu.cn/huixicampus' },
  );
  assert.deepEqual(
    extractFeishuPortal('https://demo.jobs.feishu.cn/'),
    { host: 'demo.jobs.feishu.cn', portal: 'campus', key: 'demo.jobs.feishu.cn/campus' },
  );
  assert.equal(extractFeishuPortal('https://jobs.feishu.cn/campus'), null);
  assert.equal(extractFeishuPortal('https://demo.zhiye.com/campus'), null);
});

test('isFeishuCampusPost and aggregateFeishuPortal keep campus jobs, reject interns/social, and drop JD prose', () => {
  const campusPost = {
    title: 'Java后端开发工程师(A123)',
    recruit_type: { id: '201', name: '正式', parent: { id: '2', name: '校招' } },
    city_list: [{ name: '深圳市' }, { name: '上海市' }],
    publish_time: 1788785060982,
    description: '长段岗位描述不应进库',
    requirement: '2027届本科及以上学历毕业生',
  };
  const internPost = {
    title: '研发工程师',
    recruit_type: { id: '202', name: '实习', parent: { id: '2', name: '校招' } },
    city_list: [{ name: '北京' }],
    publish_time: 1788785060982,
  };
  const socialPost = {
    title: '资深架构师',
    recruit_type: { id: '101', name: '全职', parent: { id: '1', name: '社招' } },
    city_list: [{ name: '北京' }],
    publish_time: 1788785060982,
  };
  assert.equal(isFeishuCampusPost(campusPost, 'careers'), true);
  assert.equal(isFeishuCampusPost(internPost, 'campus'), false);
  assert.equal(isFeishuCampusPost(socialPost, 'careers'), false);
  assert.equal(isFeishuCampusPost({ title: '普通岗位' }, 'careers'), false);
  assert.equal(isFeishuCampusPost({ title: '普通岗位' }, 'campus'), true);

  const aggregated = aggregateFeishuPortal('demo.jobs.feishu.cn/careers', {
    totalCount: 3,
    posts: [campusPost, internPost, socialPost],
  });
  assert.equal(aggregated.status, 'active');
  assert.equal(aggregated.activeCampusAdCount, 1);
  assert.equal(aggregated.title, 'Java后端开发工程师');
  assert.deepEqual(aggregated.cities, ['深圳', '上海']);
  assert.deepEqual(aggregated.provinces, ['广东', '上海']);
  assert.equal(aggregated.cohort, '2027届');
  assert.equal(aggregated.updatedAt, new Date(1788785060982).toISOString());
  assert.equal('description' in aggregated, false);
  assert.equal('requirement' in aggregated, false);
});

test('applyFeishuEnrichment enriches generic fields cleanly and preserves ID, source, and manual titles', () => {
  const baseJob = {
    id: 'offer-ext_f1',
    company: '示例科技',
    title: '校招项目',
    cities: ['深圳'],
    provinces: ['广东'],
    cohort: null,
    updatedAt: '2026-08-01T00:00:00Z',
    source: 'offer先生',
    family: '其他',
    applyUrl: 'https://demo.jobs.feishu.cn/campus',
  };
  const live = {
    status: 'active',
    uniqueTitleCount: 2,
    title: '后端开发工程师、算法工程师',
    cities: ['深圳', '上海'],
    provinces: ['广东', '上海'],
    cohort: '2027届',
    updatedAt: '2026-09-08T12:44:20.982Z',
  };
  const enriched = applyFeishuEnrichment(baseJob, live);
  assert.equal(enriched.changed, true);
  assert.equal(enriched.job.id, 'offer-ext_f1');
  assert.equal(enriched.job.source, 'offer先生');
  assert.equal(enriched.job.title, live.title);
  assert.deepEqual(enriched.job.cities, ['深圳', '上海']);
  assert.equal(enriched.job.cohort, '2027届');
  assert.equal(enriched.job.updatedAt, live.updatedAt);
  assert.match(enriched.job.family, /后端开发/);
  assert.equal(applyFeishuEnrichment(enriched.job, live).changed, false);

  const manualJob = {
    ...baseJob,
    id: 'manual-f1',
    title: '人工整理校招全方向（含后端、客户端、产品、设计及运营岗位）',
    manualUpdatedAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  };
  const manualResult = applyFeishuEnrichment(manualJob, live);
  assert.equal(manualResult.job.title, manualJob.title);
  assert.equal(manualResult.job.updatedAt, '2026-11-25T00:00:00Z');
  assert.deepEqual(manualResult.job.cities, ['深圳', '上海']);
});

test('enrichJobsWithFeishu respects deterministic sharding, tolerates errors, and keeps closed/empty records', async () => {
  const keyA = 'alpha.jobs.feishu.cn/campus';
  const keyB = 'beta.jobs.feishu.cn/campus';
  const targetShard = shardOfKey(keyA, 6);
  const jobs = [
    { id: 'f1', company: 'Alpha', title: '管培生', cities: [], provinces: [], cohort: null, updatedAt: '2026-08-01T00:00:00Z', applyUrl: `https://${keyA}` },
    { id: 'f2', company: 'Beta', title: '管培生', cities: [], provinces: [], cohort: null, updatedAt: '2026-08-01T00:00:00Z', applyUrl: `https://${keyB}` },
  ];
  const called = [];
  const { jobs: out, stats } = await enrichJobsWithFeishu(jobs, {
    today: '2026-11-28',
    shards: 6,
    shard: targetShard,
    jitterMs: 0,
    log: () => {},
    fetchPortal: async ({ host, portal }) => {
      called.push(`${host}/${portal}`);
      if (host === 'beta.jobs.feishu.cn') throw new Error('HTTP 500');
      return {
        totalCount: 1,
        posts: [{
          title: '算法工程师',
          recruit_type: { id: '201', name: '正式', parent: { id: '2', name: '校招' } },
          city_list: [{ name: '上海' }],
          publish_time: 1788785060982,
        }],
      };
    },
  });

  assert.equal(called.includes(keyA), true);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, '算法工程师');
  assert.deepEqual(out[0].cities, ['上海']);
  assert.equal(out[1].title, '管培生');
  assert.ok(stats.activePortals >= 1);
});
