import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { DOMParser } from 'linkedom';
import {
  normalizeUrl, pickCandidateLinks, extractFromHtml, normalizeCompanyName, rankCorpMatches,
  parseCorpCodeXml, unzipFirstFile, validateSummary, parseGeminiResponse, dartDateRange, buildPrompt
} from '../lib/core.js';

test('normalizeUrl: 스킴을 붙이고 잘못된 주소는 거절', () => {
  assert.equal(normalizeUrl('toss.im'), 'https://toss.im/');
  assert.equal(normalizeUrl(' https://a.com/x#y '), 'https://a.com/x');
  assert.throws(() => normalizeUrl(''), /입력/);
  assert.throws(() => normalizeUrl('not a url'), /형식/);
  assert.throws(() => normalizeUrl('ftp://a.com'), /http/);
});

test('pickCandidateLinks: 같은 사이트의 소개·제품 페이지만 최대 2개', () => {
  const links = [
    { href: '/about', text: '회사 소개' },
    { href: '/products/crm', text: 'Products' },
    { href: '/login', text: '로그인' },
    { href: 'https://other.com/about', text: 'About' },
    { href: '/blog/product-launch', text: 'Blog' },
    { href: '/careers', text: '채용' },
    { href: '/brochure.pdf', text: '제품 소개서' },
    { href: '/solutions', text: '솔루션' },
    { href: '/about#team', text: 'About' }
  ];
  const picked = pickCandidateLinks('https://www.acme.com/', links);
  assert.equal(picked.length, 2);
  for (const u of picked) {
    assert.ok(u.startsWith('https://www.acme.com/'));
    assert.ok(!/login|blog|careers|pdf|other/.test(u));
  }
  assert.deepEqual(pickCandidateLinks('https://acme.com', [{ href: '/pricing', text: 'Pricing' }]), []);
});

test('extractFromHtml: script/style 제거, meta 설명 포함, 링크 수집', () => {
  const html = `<html><head><title>Acme</title><meta name="description" content="B2B 결제 솔루션">
    <style>.x{}</style></head><body><nav><a href="/about">회사 소개</a></nav>
    <script>var secret=1</script><h1>Acme Pay</h1><p>중소기업을 위한   결제</p></body></html>`;
  const r = extractFromHtml(html, 'https://acme.com/', new DOMParser());
  assert.equal(r.title, 'Acme');
  assert.match(r.text, /B2B 결제 솔루션/);
  assert.match(r.text, /중소기업을 위한 결제/);
  assert.doesNotMatch(r.text, /secret|\.x\{\}/);
  assert.deepEqual(r.links.map((l) => l.href), ['/about']);
});

test('normalizeCompanyName / rankCorpMatches: 법인 표기 무시, 정확 일치·상장사 우선', () => {
  assert.equal(normalizeCompanyName('(주)카카오'), '카카오');
  assert.equal(normalizeCompanyName('주식회사 카카오 '), '카카오');
  assert.equal(normalizeCompanyName('Acme Co., Ltd.'), 'acme');
  const list = [
    ['001', '카카오페이', '377300'],
    ['002', '(주)카카오', '035720'],
    ['003', '카카오모빌리티', ''],
    ['004', '네이버', '035420'],
    ['005', '주식회사 카카오', '']
  ];
  const r = rankCorpMatches(list, '카카오');
  assert.equal(r[0].corpCode, '002'); // 정확 일치 + 상장
  assert.equal(r[1].corpCode, '005'); // 정확 일치 + 비상장
  assert.ok(!r.some((x) => x.corpCode === '004'));
  assert.deepEqual(rankCorpMatches(list, '없는회사'), []);
  assert.deepEqual(rankCorpMatches(list, '  '), []);
});

test('parseCorpCodeXml + unzipFirstFile: DART ZIP을 풀어 회사 목록으로', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><result>
    <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><corp_eng_name>SAMSUNG</corp_eng_name><stock_code>005930</stock_code><modify_date>20250101</modify_date></list>
    <list><corp_code>00999999</corp_code><corp_name>A&amp;B 소프트</corp_name><stock_code> </stock_code><modify_date>20250101</modify_date></list>
  </result>`;
  const zip = makeZip('CORPCODE.xml', Buffer.from(xml, 'utf8'));
  const text = await unzipFirstFile(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  const items = parseCorpCodeXml(text);
  assert.deepEqual(items, [
    ['00126380', '삼성전자', '005930'],
    ['00999999', 'A&B 소프트', '']
  ]);
});

test('unzipFirstFile: ZIP 대신 오류 JSON이 오면 DART 메시지를 보여 줌', async () => {
  const buf = new TextEncoder().encode('{"status":"010","message":"등록되지 않은 키입니다."}');
  await assert.rejects(() => unzipFirstFile(buf.buffer), /등록되지 않은 키/);
});

test('validateSummary: 읽지 않은 URL을 출처로 쓴 항목은 버림', () => {
  const pages = ['https://acme.com/', 'https://acme.com/about'];
  const disc = ['https://dart.fss.or.kr/dsaf001/main.do?rcpNo=1'];
  const raw = {
    one_liner: { text: '결제 회사', source: 'https://www.acme.com' },
    products: [
      { text: 'Acme Pay', source: 'https://acme.com/about/' },
      { text: '지어낸 제품', source: 'https://wikipedia.org/acme' },
      { text: '공시 근거 제품', source: disc[0] }
    ],
    customers: { text: '', source: '' },
    hooks: [
      { text: '최근 투자 유치', source: disc[0] },
      { text: '신제품', source: 'https://acme.com/' },
      { text: '세 번째', source: 'https://acme.com/' }
    ]
  };
  const v = validateSummary(raw, pages, disc);
  assert.deepEqual(v.oneLiner, { text: '결제 회사', source: 'https://www.acme.com' });
  assert.deepEqual(v.products.map((p) => p.text), ['Acme Pay']); // 공시 링크는 제품 출처로 불가
  assert.equal(v.customers, null);
  assert.equal(v.hooks.length, 2);
  assert.equal(v.dropped.length, 2);
});

test('parseGeminiResponse: 정상/오류/형식 오류', () => {
  const ok = { candidates: [{ content: { parts: [{ text: '{"one_liner":{"text":"a","source":"b"}}' }] } }] };
  assert.equal(parseGeminiResponse(ok).one_liner.text, 'a');
  assert.throws(() => parseGeminiResponse({ error: { message: 'API key not valid' } }), /API key not valid/);
  assert.throws(() => parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), /형식/);
  assert.throws(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
});

test('dartDateRange: 최근 1년', () => {
  assert.deepEqual(dartDateRange(new Date(2026, 9, 29)), { bgn: '20251029', end: '20261029' });
});

test('buildPrompt: 자료 URL과 지어내지 말라는 규칙 포함', () => {
  const p = buildPrompt([{ url: 'https://a.com/', title: 'A', text: '본문' }], [{ date: '2026-10-01', title: '주요사항보고서', url: 'https://dart/1' }]);
  assert.match(p, /URL: https:\/\/a\.com\//);
  assert.match(p, /지어내지 않습니다/);
  assert.match(p, /주요사항보고서/);
});

// 테스트용 최소 ZIP 생성 (deflate)
function makeZip(name, data) {
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, cd, nameBuf, eocd]);
}
