import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { collectSite, summarizeWithGemini, getDisclosures, findCorpCandidates } from '../lib/services.js';

const domParser = new DOMParser();
const long = (s) => `${s} `.repeat(60);

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new TypeError('Failed to fetch');
    const r = typeof routes[key] === 'function' ? routes[key](url, opts) : routes[key];
    return {
      ok: (r.status || 200) < 400,
      status: r.status || 200,
      url: r.url || url,
      headers: { get: () => r.type ?? 'text/html; charset=utf-8' },
      text: async () => r.body,
      json: async () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body),
      arrayBuffer: async () => r.body
    };
  };
  fn.calls = calls;
  return fn;
}

test('collectSite: 홈 + 소개·제품 페이지 2개를 읽는다', async () => {
  const fetchFn = fakeFetch({
    'https://acme.com/about': { body: `<html><body>${long('회사 소개 본문')}</body></html>` },
    'https://acme.com/products': { body: `<html><body>${long('제품 본문')}</body></html>` },
    'https://acme.com/': {
      body: `<html><head><title>Acme</title></head><body>${long('홈 본문')}
        <a href="/about">About</a><a href="/products">Products</a><a href="/login">Login</a></body></html>`
    }
  });
  const r = await collectSite('https://acme.com/', { fetchFn, domParser });
  assert.deepEqual(r.pages.map((p) => p.url).sort(), ['https://acme.com/', 'https://acme.com/about', 'https://acme.com/products']);
  assert.equal(r.pages[0].url, 'https://acme.com/');
  assert.ok(!fetchFn.calls.some((c) => c.url.includes('login')));
});

test('collectSite: 사이트를 읽지 못하면 이유와 함께 실패 (지어내지 않음)', async () => {
  await assert.rejects(() => collectSite('https://no-such-site.invalid/', { fetchFn: fakeFetch({}), domParser }), /사이트를 읽지 못했습니다: 연결할 수 없습니다/);
  const notFound = fakeFetch({ 'https://acme.com/': { status: 404, body: 'nope' } });
  await assert.rejects(() => collectSite('https://acme.com/', { fetchFn: notFound, domParser }), /HTTP 404/);
  const empty = fakeFetch({ 'https://spa.com/': { body: '<html><body><div id="root"></div></body></html>' } });
  await assert.rejects(() => collectSite('https://spa.com/', { fetchFn: empty, domParser }), /글이 거의 없습니다/);
});

test('collectSite: 자바스크립트 사이트는 탭에 그려진 글자로 보완', async () => {
  const fetchFn = fakeFetch({ 'https://spa.com/': { body: '<html><head><title>SPA</title></head><body><div id="root"></div></body></html>' } });
  const renderedHome = { title: 'SPA', text: long('화면에 그려진 본문'), links: [] };
  const r = await collectSite('https://spa.com/', { fetchFn, domParser, renderedHome });
  assert.match(r.pages[0].text, /화면에 그려진 본문/);
});

test('collectSite: 추가 페이지 실패는 건너뛰고 기록', async () => {
  const fetchFn = fakeFetch({
    'https://acme.com/about': { status: 500, body: '' },
    'https://acme.com/': { body: `<html><body>${long('홈페이지 본문')}<a href="/about">About</a></body></html>` }
  });
  const r = await collectSite('https://acme.com/', { fetchFn, domParser });
  assert.equal(r.pages.length, 1);
  assert.equal(r.skipped.length, 1);
});

test('summarizeWithGemini: 키는 헤더로만 보내고 URL에 넣지 않으며, 결과를 검증한다', async () => {
  const pages = [{ url: 'https://acme.com/', title: 'Acme', text: '본문' }];
  const out = {
    one_liner: { text: '결제 회사', source: 'https://acme.com/' },
    products: [{ text: '지어낸 것', source: 'https://elsewhere.com' }],
    customers: { text: '중소기업', source: 'https://acme.com/' },
    hooks: [{ text: '소재1', source: 'https://acme.com/' }, { text: '소재2', source: 'https://acme.com/' }]
  };
  const fetchFn = fakeFetch({
    'https://generativelanguage.googleapis.com/': { body: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] } }
  });
  const s = await summarizeWithGemini({ apiKey: 'TESTKEY', pages, disclosures: [], fetchFn });
  assert.equal(s.oneLiner.text, '결제 회사');
  assert.equal(s.products.length, 0);
  assert.equal(s.hooks.length, 2);
  const call = fetchFn.calls[0];
  assert.ok(!call.url.includes('TESTKEY'));
  assert.equal(call.opts.headers['x-goog-api-key'], 'TESTKEY');
  assert.match(call.url, /gemini-3\.8-flash:generateContent$/);
  assert.equal(JSON.parse(call.opts.body).generationConfig.temperature, undefined); // Gemini 3.x는 temperature를 받지 않음
});

test('summarizeWithGemini: 키 없음 / API 오류는 메시지로 실패', async () => {
  await assert.rejects(() => summarizeWithGemini({ apiKey: '', pages: [], disclosures: [], fetchFn: fakeFetch({}) }), /키가 없습니다/);
  const bad = fakeFetch({ 'https://generativelanguage.googleapis.com/': { status: 400, body: { error: { message: 'API key not valid' } } } });
  await assert.rejects(() => summarizeWithGemini({ apiKey: 'x', pages: [{ url: 'https://a.com/', text: 't' }], disclosures: [], fetchFn: bad }), /API key not valid/);
});

test('DART: 후보 찾기(캐시 사용), 공시 5건, 공시 없음', async () => {
  const store = new Map([['dartCorpList', { savedAt: Date.now(), items: [['00000001', '(주)에이크미', '123456'], ['00000002', '에이크미랩스', '']] }]]);
  const storage = { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v) };
  const company = (code) => ({ status: '000', corp_name: code === '00000001' ? '(주)에이크미' : '에이크미랩스', hm_url: code === '00000001' ? 'www.acme.co.kr' : '', stock_code: '', corp_cls: 'K', est_dt: '20100105' });
  const fetchFn = fakeFetch({
    'https://opendart.fss.or.kr/api/company.json': (url) => ({ body: company(new URL(url).searchParams.get('corp_code')) }),
    'https://opendart.fss.or.kr/api/list.json': (url) => ({
      body: new URL(url).searchParams.get('corp_code') === '00000001'
        ? { status: '000', list: Array.from({ length: 7 }, (_, i) => ({ rcept_dt: '20261001', report_nm: `공시${i}`, rcept_no: `2026100100000${i}` })) }
        : { status: '013', message: '조회된 데이타가 없습니다.' }
    })
  });
  const deps = { apiKey: 'K', fetchFn, storage };
  const c = await findCorpCandidates('에이크미', deps);
  assert.equal(c[0].corpCode, '00000001');
  assert.equal(c[0].homepage, 'www.acme.co.kr');
  assert.ok(!fetchFn.calls.some((x) => x.url.includes('corpCode.xml'))); // 캐시 사용
  const d = await getDisclosures('00000001', deps, new Date(2026, 9, 29));
  assert.equal(d.length, 5);
  assert.equal(d[0].date, '2026-10-01');
  assert.match(d[0].url, /rcpNo=20261001000000$/);
  assert.deepEqual(await getDisclosures('00000002', deps), []);
  assert.deepEqual(await findCorpCandidates('없는회사', deps), []);
});

test('DART: 잘못된 키 오류 메시지', async () => {
  const fetchFn = fakeFetch({ 'https://opendart.fss.or.kr/api/list.json': { body: { status: '010', message: 'x' } } });
  await assert.rejects(() => getDisclosures('1', { apiKey: 'bad', fetchFn }), /등록되지 않은 DART 키/);
});
