// 브라우저와 Node 테스트에서 함께 쓰는 순수 함수들.
// 네트워크나 chrome.* API를 쓰지 않는다.

export const MAX_EXTRA_PAGES = 2;
export const MAX_CHARS_PER_PAGE = 4000;
export const MIN_USEFUL_CHARS = 200;
export const DISCLOSURE_COUNT = 5;

// ---------- 주소 ----------

export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('웹사이트 주소를 입력하세요.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error('http 또는 https 주소만 조사할 수 있습니다.');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`주소 형식이 올바르지 않습니다: ${raw}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('http 또는 https 주소만 조사할 수 있습니다.');
  if (!url.hostname.includes('.')) throw new Error(`주소 형식이 올바르지 않습니다: ${raw}`);
  url.hash = '';
  return url.toString();
}

function siteKey(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function sameSite(a, b) {
  try {
    return siteKey(new URL(a).hostname) === siteKey(new URL(b).hostname);
  } catch {
    return false;
  }
}

// ---------- 소개·제품 페이지 고르기 ----------

const LINK_KEYWORDS = [
  'about', 'company', 'corp', 'who-we-are', 'product', 'products', 'solution', 'solutions',
  'service', 'services', 'platform', 'feature', 'features', 'customer', 'customers', 'why',
  '소개', '회사', '기업', '제품', '서비스', '솔루션', '플랫폼', '기능', '고객'
];
const LINK_EXCLUDE = [
  'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'privacy', 'terms', 'policy',
  'cookie', 'career', 'careers', 'job', 'jobs', 'recruit', 'blog', 'news', 'press', 'support',
  'help', 'faq', 'contact', 'cart', 'download', 'logout', '채용', '로그인', '회원가입', '개인정보', '약관'
];
const FILE_EXT = /\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp|ico|xml|json)$/i;

export function pickCandidateLinks(baseUrl, links, max = MAX_EXTRA_PAGES) {
  const base = new URL(baseUrl);
  const scored = [];
  const seen = new Set([stripTrailing(base)]);
  for (const link of links || []) {
    let u;
    try {
      u = new URL(link.href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (!sameSite(u.toString(), base.toString())) continue;
    u.hash = '';
    const key = stripTrailing(u);
    if (seen.has(key)) continue;
    const hay = `${decodeSafe(u.pathname)} ${link.text || ''}`.toLowerCase();
    if (FILE_EXT.test(u.pathname)) continue;
    if (LINK_EXCLUDE.some((w) => hay.includes(w))) continue;
    const hits = LINK_KEYWORDS.filter((w) => hay.includes(w)).length;
    if (hits === 0) continue;
    seen.add(key);
    // 키워드가 많이 맞을수록, 경로가 짧을수록 앞으로
    const depth = u.pathname.split('/').filter(Boolean).length;
    scored.push({ url: u.toString(), score: hits * 10 - depth });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.url);
}

function stripTrailing(u) {
  return `${siteKey(u.hostname)}${u.pathname.replace(/\/+$/, '')}${u.search}`;
}
function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------- HTML에서 글자 뽑기 ----------

// domParser: 브라우저의 DOMParser 또는 테스트용 구현
export function extractFromHtml(html, url, domParser) {
  const doc = domParser.parseFromString(html, 'text/html');
  const title = (doc.querySelector('title')?.textContent || '').trim();
  const metaDesc =
    doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    '';
  const links = [...doc.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href'),
    text: (a.textContent || '').trim().slice(0, 80)
  }));
  doc.querySelectorAll('script, style, noscript, svg, iframe, template').forEach((el) => el.remove());
  const bodyText = cleanText(doc.body ? doc.body.textContent : '');
  const text = cleanText([metaDesc, bodyText].filter(Boolean).join('\n'));
  return { url, title, text: text.slice(0, MAX_CHARS_PER_PAGE), links };
}

export function cleanText(s) {
  return String(s || '')
    .replace(/ /g, ' ')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------- DART 회사명 검색 ----------

export function normalizeCompanyName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|corporation|corp\.?|co\.,?\s*ltd\.?|inc\.?|ltd\.?|limited/g, '')
    .replace(/[\s.,·\-_()]/g, '');
}

// list: [[corp_code, corp_name, stock_code], ...]
export function rankCorpMatches(list, query, max = 8) {
  const q = normalizeCompanyName(query);
  if (!q) return [];
  const out = [];
  for (const [code, name, stock] of list) {
    const n = normalizeCompanyName(name);
    if (!n) continue;
    let rank;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (n.includes(q)) rank = 2;
    else continue;
    out.push({ corpCode: code, corpName: name, stockCode: stock || '', rank, lenDiff: Math.abs(n.length - q.length) });
  }
  out.sort((a, b) => a.rank - b.rank || (b.stockCode ? 1 : 0) - (a.stockCode ? 1 : 0) || a.lenDiff - b.lenDiff);
  return out.slice(0, max);
}

// corpCode.xml 문자열 → [[code, name, stock]]
export function parseCorpCodeXml(xml) {
  const out = [];
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const code = tag(block, 'corp_code');
    const name = tag(block, 'corp_name');
    if (!code || !name) continue;
    out.push([code, decodeXml(name), tag(block, 'stock_code')]);
  }
  return out;
}
function tag(block, t) {
  const m = block.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1].trim() : '';
}
function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// ZIP 안의 첫 번째 파일을 꺼낸다 (DART corpCode.xml용). DecompressionStream 사용.
export async function unzipFirstFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x04034b50) {
    // ZIP이 아니면 DART가 오류를 JSON/XML로 돌려준 경우다.
    const text = new TextDecoder().decode(bytes.slice(0, 500));
    throw new Error(`DART 회사 목록을 받지 못했습니다: ${dartErrorFromText(text)}`);
  }
  // 중앙 디렉터리 끝(EOCD) 찾기
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('DART 회사 목록 파일(ZIP)을 읽을 수 없습니다.');
  const cdOffset = view.getUint32(eocd + 16, true);
  if (view.getUint32(cdOffset, true) !== 0x02014b50) throw new Error('DART 회사 목록 파일(ZIP) 구조가 올바르지 않습니다.');
  const method = view.getUint16(cdOffset + 10, true);
  const compSize = view.getUint32(cdOffset + 20, true);
  const localOffset = view.getUint32(cdOffset + 42, true);
  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = bytes.slice(start, start + compSize);
  if (method === 0) return new TextDecoder('utf-8').decode(data);
  if (method !== 8) throw new Error(`지원하지 않는 압축 방식입니다 (${method}).`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

function dartErrorFromText(text) {
  const m = text.match(/"message"\s*:\s*"([^"]+)"/) || text.match(/<message>([^<]+)<\/message>/);
  return m ? m[1] : text.slice(0, 120);
}

// DART status 코드 → 사람이 읽을 메시지
export function dartStatusMessage(status, message) {
  const known = {
    '010': '등록되지 않은 DART 키입니다. 설정에서 키를 확인하세요.',
    '011': '사용할 수 없는 DART 키입니다.',
    '012': '접근할 수 없는 IP입니다.',
    '013': '조회된 데이터가 없습니다.',
    '020': 'DART 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요.',
    '100': 'DART 요청 값이 올바르지 않습니다.',
    '800': 'DART 시스템 점검 중입니다.',
    '900': 'DART에서 알 수 없는 오류가 났습니다.',
    '901': 'DART 키가 만료되었습니다.'
  };
  return known[status] || `DART 오류 (${status}): ${message || ''}`.trim();
}

// 최근 1년 공시 조회용 날짜 (YYYYMMDD)
export function dartDateRange(today = new Date()) {
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  return { bgn: fmt(from), end: fmt(today) };
}

export function dartFilingUrl(rceptNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(rceptNo)}`;
}

export function formatDartDate(s) {
  return /^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || '';
}

// ---------- LLM 프롬프트와 결과 검증 ----------

export const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    one_liner: { type: 'OBJECT', properties: { text: { type: 'STRING' }, source: { type: 'STRING' } }, required: ['text', 'source'] },
    products: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, source: { type: 'STRING' } }, required: ['text', 'source'] }
    },
    customers: { type: 'OBJECT', properties: { text: { type: 'STRING' }, source: { type: 'STRING' } }, required: ['text', 'source'] },
    hooks: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, source: { type: 'STRING' } }, required: ['text', 'source'] }
    }
  },
  required: ['one_liner', 'products', 'customers', 'hooks']
};

export function buildPrompt(pages, disclosures = []) {
  const pageBlocks = pages
    .map((p, i) => `### 페이지 ${i + 1}\nURL: ${p.url}\n제목: ${p.title || '(없음)'}\n본문:\n${p.text}`)
    .join('\n\n');
  const discBlock = disclosures.length
    ? disclosures.map((d) => `- ${d.date} ${d.title} (URL: ${d.url})`).join('\n')
    : '(없음)';
  return `당신은 B2B 영업팀 SDR의 조사 보조입니다. SDR은 이 회사에 처음 연락하기 직전입니다.

규칙:
1. 아래 "자료"에 적힌 내용만 근거로 씁니다. 자료에 없는 내용은 절대 추측하거나 지어내지 않습니다.
2. 모든 항목의 source에는 근거가 된 자료의 URL을 그대로 적습니다. 자료에 있는 URL만 쓸 수 있습니다.
3. 자료에서 찾을 수 없는 항목은 text와 source를 빈 문자열("")로 둡니다.
4. 한국어로 씁니다. 제품명·회사명 같은 고유명사는 원문 그대로 둡니다.
5. one_liner: 이 회사가 무엇을 하는 곳인지 한 문장.
6. products: 주요 제품·서비스 최대 4개. 각각 한 줄.
7. customers: 누구에게 파는지(고객층) 한 문장.
8. hooks: SDR이 첫 연락 메일이나 콜의 첫 문장에 쓸 수 있는 구체적인 대화 소재 정확히 2개. 자료에 있는 사실(신제품, 고객 사례, 공시 내용 등)에 기반해야 합니다.

자료 — 회사 웹사이트:
${pageBlocks}

자료 — DART 최근 공시:
${discBlock}`;
}

// LLM 결과에서 허용되지 않은 출처를 가진 항목을 버린다.
export function validateSummary(raw, pageUrls, disclosureUrls = []) {
  const pageSet = new Set(pageUrls.map(canon));
  const anySet = new Set([...pageUrls, ...disclosureUrls].map(canon));
  const dropped = [];
  const keep = (item, allowed, field) => {
    if (!item || typeof item !== 'object') return null;
    const text = String(item.text || '').trim();
    const source = String(item.source || '').trim();
    if (!text) return null;
    if (!allowed.has(canon(source))) {
      dropped.push({ field, text, source });
      return null;
    }
    return { text, source };
  };
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    oneLiner: keep(obj.one_liner, pageSet, 'one_liner'),
    products: (Array.isArray(obj.products) ? obj.products : []).map((p) => keep(p, pageSet, 'products')).filter(Boolean).slice(0, 4),
    customers: keep(obj.customers, pageSet, 'customers'),
    hooks: (Array.isArray(obj.hooks) ? obj.hooks : []).map((h) => keep(h, anySet, 'hooks')).filter(Boolean).slice(0, 2),
    dropped
  };
}

function canon(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = '';
    return `${siteKey(x.hostname)}${x.pathname.replace(/\/+$/, '')}${x.search}`;
  } catch {
    return `invalid:${u}`;
  }
}

// Gemini 응답 JSON에서 결과 텍스트를 꺼낸다.
export function parseGeminiResponse(json) {
  if (json?.error) throw new Error(`Gemini 오류: ${json.error.message || json.error.status || '알 수 없음'}`);
  const cand = json?.candidates?.[0];
  if (!cand) {
    const block = json?.promptFeedback?.blockReason;
    throw new Error(block ? `Gemini가 응답을 거부했습니다 (${block}).` : 'Gemini 응답이 비어 있습니다.');
  }
  const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error(`Gemini 응답에 내용이 없습니다 (${cand.finishReason || 'unknown'}).`);
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini 응답이 약속한 형식(JSON)이 아닙니다.');
  }
}
