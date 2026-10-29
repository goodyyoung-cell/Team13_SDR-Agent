// 네트워크를 쓰는 함수들. fetch와 저장소를 인자로 받아 테스트에서 바꿔 끼울 수 있다.
import {
  extractFromHtml, pickCandidateLinks, MIN_USEFUL_CHARS, MAX_CHARS_PER_PAGE, cleanText,
  unzipFirstFile, parseCorpCodeXml, rankCorpMatches, dartStatusMessage, dartDateRange,
  dartFilingUrl, formatDartDate, DISCLOSURE_COUNT, buildPrompt, SUMMARY_SCHEMA,
  parseGeminiResponse, validateSummary
} from './core.js';

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(fetchFn, url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetchFn(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`응답이 없습니다 (${timeout / 1000}초 초과).`);
    throw new Error(`연결할 수 없습니다 (${e.message}).`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 웹사이트 ----------

export async function fetchPage(url, { fetchFn, domParser }) {
  const res = await fetchWithTimeout(fetchFn, url, { credentials: 'omit', redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} 응답`);
  const type = res.headers.get('content-type') || '';
  if (type && !/html|xml/i.test(type)) throw new Error(`웹 페이지가 아닙니다 (${type}).`);
  const html = await res.text();
  return extractFromHtml(html, res.url || url, domParser);
}

// 홈 + 소개·제품 페이지 최대 2개. 홈을 못 읽으면 예외.
// renderedHome: 현재 탭이 같은 주소면 사이드패널이 읽어 둔 화면 글자 (자바스크립트로 그리는 사이트 대비)
export async function collectSite(homeUrl, { fetchFn, domParser, renderedHome = null }) {
  let home;
  try {
    home = await fetchPage(homeUrl, { fetchFn, domParser });
  } catch (e) {
    if (!renderedHome) throw new Error(`사이트를 읽지 못했습니다: ${e.message}`);
    home = { url: homeUrl, title: renderedHome.title, text: '', links: renderedHome.links };
  }
  if (renderedHome && renderedHome.text.length > home.text.length) {
    home = {
      ...home,
      title: home.title || renderedHome.title,
      text: cleanText(renderedHome.text).slice(0, MAX_CHARS_PER_PAGE),
      links: home.links.length ? home.links : renderedHome.links
    };
  }
  if (home.text.length < MIN_USEFUL_CHARS) {
    throw new Error(
      `사이트를 읽지 못했습니다: 읽을 수 있는 글이 거의 없습니다 (${home.text.length}자). ` +
        '자바스크립트로 그려지는 사이트라면, 그 사이트를 Chrome 탭에서 연 상태로 다시 조사하세요.'
    );
  }
  const extraUrls = pickCandidateLinks(home.url, home.links);
  const extras = [];
  const skipped = [];
  for (const u of extraUrls) {
    try {
      const p = await fetchPage(u, { fetchFn, domParser });
      if (p.text.length >= MIN_USEFUL_CHARS) extras.push(p);
      else skipped.push({ url: u, reason: '글이 거의 없음' });
    } catch (e) {
      skipped.push({ url: u, reason: e.message });
    }
  }
  return { pages: [home, ...extras].map(({ url, title, text }) => ({ url, title, text })), skipped };
}

// ---------- Gemini ----------

export const GEMINI_MODEL = 'gemini-3.8-flash';

export async function summarizeWithGemini({ apiKey, pages, disclosures, fetchFn }) {
  if (!apiKey) throw new Error('Gemini API 키가 없습니다. 설정에서 입력하세요.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(pages, disclosures) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_SCHEMA
    }
  };
  const res = await fetchWithTimeout(
    fetchFn,
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) },
    60000
  );
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Gemini 응답을 읽을 수 없습니다 (HTTP ${res.status}).`);
  }
  if (!res.ok && !json?.error) throw new Error(`Gemini 오류 (HTTP ${res.status}).`);
  const raw = parseGeminiResponse(json);
  return validateSummary(raw, pages.map((p) => p.url), disclosures.map((d) => d.url));
}

// ---------- DART ----------

const DART = 'https://opendart.fss.or.kr/api';
const CORP_CACHE_KEY = 'dartCorpList';
const CORP_CACHE_DAYS = 30;

// storage: { get(key) → Promise<value>, set(key, value) → Promise }
export async function loadCorpList({ apiKey, fetchFn, storage, now = Date.now() }) {
  const cached = await storage.get(CORP_CACHE_KEY);
  if (cached && Array.isArray(cached.items) && now - cached.savedAt < CORP_CACHE_DAYS * 864e5) return cached.items;
  const res = await fetchWithTimeout(fetchFn, `${DART}/corpCode.xml?crtfc_key=${encodeURIComponent(apiKey)}`, {}, 60000);
  if (!res.ok) throw new Error(`DART 회사 목록 요청 실패 (HTTP ${res.status}).`);
  const xml = await unzipFirstFile(await res.arrayBuffer());
  const items = parseCorpCodeXml(xml);
  if (!items.length) throw new Error('DART 회사 목록이 비어 있습니다.');
  await storage.set(CORP_CACHE_KEY, { savedAt: now, items });
  return items;
}

async function dartJson(path, params, { apiKey, fetchFn }) {
  const qs = new URLSearchParams({ crtfc_key: apiKey, ...params });
  const res = await fetchWithTimeout(fetchFn, `${DART}/${path}?${qs}`);
  if (!res.ok) throw new Error(`DART 요청 실패 (HTTP ${res.status}).`);
  const json = await res.json();
  return json;
}

export async function getCompany(corpCode, deps) {
  const j = await dartJson('company.json', { corp_code: corpCode }, deps);
  if (j.status !== '000') throw new Error(dartStatusMessage(j.status, j.message));
  return {
    corpName: j.corp_name,
    stockCode: j.stock_code || '',
    ceo: j.ceo_nm || '',
    established: formatDartDate(j.est_dt),
    industryCode: j.induty_code || '',
    address: j.adres || '',
    homepage: j.hm_url || '',
    corpClass: { Y: '유가증권', K: '코스닥', N: '코넥스', E: '기타' }[j.corp_cls] || j.corp_cls || '',
    source: `https://dart.fss.or.kr/dsab007/main.do?autoSearch=Y&textCrpNm=${encodeURIComponent(j.corp_name || '')}`
  };
}

export async function getDisclosures(corpCode, deps, today = new Date()) {
  const { bgn, end } = dartDateRange(today);
  const j = await dartJson('list.json', { corp_code: corpCode, bgn_de: bgn, end_de: end, page_count: String(DISCLOSURE_COUNT), sort: 'date', sort_mth: 'desc' }, deps);
  if (j.status === '013') return [];
  if (j.status !== '000') throw new Error(dartStatusMessage(j.status, j.message));
  return (j.list || []).slice(0, DISCLOSURE_COUNT).map((d) => ({
    date: formatDartDate(d.rcept_dt),
    title: (d.report_nm || '').trim(),
    filer: d.flr_nm || '',
    url: dartFilingUrl(d.rcept_no)
  }));
}

// 회사명으로 후보를 찾고, 상위 후보의 DART 등록 홈페이지를 붙인다.
export async function findCorpCandidates(name, deps) {
  const list = await loadCorpList(deps);
  const matches = rankCorpMatches(list, name, 5);
  const withHome = [];
  for (const m of matches) {
    let company = null;
    try {
      company = await getCompany(m.corpCode, deps);
    } catch {
      /* 후보 표시용이라 실패해도 넘어간다. 고른 뒤 다시 조회한다. */
    }
    withHome.push({ ...m, homepage: company?.homepage || '', company });
  }
  return withHome;
}
