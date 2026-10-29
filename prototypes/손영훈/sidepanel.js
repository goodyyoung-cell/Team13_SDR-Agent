import { normalizeUrl, sameSite } from './lib/core.js';
import { collectSite, summarizeWithGemini, findCorpCandidates, getCompany, getDisclosures, GEMINI_MODEL } from './lib/services.js';

const $ = (id) => document.getElementById(id);
const deps = { fetchFn: (...a) => fetch(...a), domParser: new DOMParser() };
const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k],
  set: (k, v) => chrome.storage.local.set({ [k]: v })
};

// ---------- 시작 ----------

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
$('use-tab').addEventListener('click', fillFromActiveTab);
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  run().catch((err) => setStatus(`예상하지 못한 오류: ${err.message}`));
});
fillFromActiveTab();
showKeyWarning();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function fillFromActiveTab() {
  const tab = await activeTab();
  if (tab?.url && /^https?:/.test(tab.url)) $('url').value = tab.url;
}

async function getKeys() {
  const { geminiKey = '', dartKey = '' } = await chrome.storage.local.get(['geminiKey', 'dartKey']);
  return { geminiKey: geminiKey.trim(), dartKey: dartKey.trim() };
}

async function showKeyWarning() {
  const { geminiKey, dartKey } = await getKeys();
  const missing = [!geminiKey && 'Gemini', !dartKey && 'DART'].filter(Boolean);
  const box = $('key-warning');
  box.hidden = missing.length === 0;
  box.textContent = missing.length ? `${missing.join(', ')} API 키가 없습니다. 오른쪽 위 '설정'에서 입력하세요.` : '';
}

// ---------- 조사 실행 ----------

async function run() {
  resetView();
  let url;
  try {
    url = normalizeUrl($('url').value);
  } catch (e) {
    showWebError(e.message);
    return;
  }
  const name = $('name').value.trim();
  const keys = await getKeys();
  $('run').disabled = true;
  setStatus('웹사이트를 읽는 중…');

  const renderedHome = await readRenderedTab(url);
  const sitePromise = collectSite(url, { ...deps, renderedHome }).then(
    (v) => ({ ok: true, ...v }),
    (e) => ({ ok: false, error: e.message })
  );
  const dartPromise = runDart(name, keys.dartKey);

  const [site, dart] = await Promise.all([sitePromise, dartPromise]);
  renderDart(dart);

  if (!site.ok) {
    showWebError(site.error);
    finish();
    return;
  }
  if (!keys.geminiKey) {
    showWebFallback(site, 'Gemini API 키가 없어 요약하지 못했습니다. 설정에서 키를 입력하세요.');
    finish();
    return;
  }
  setStatus('AI가 정리하는 중…');
  try {
    const summary = await summarizeWithGemini({
      apiKey: keys.geminiKey,
      pages: site.pages,
      disclosures: dart.disclosures || [],
      fetchFn: deps.fetchFn
    });
    renderSummary(summary, site);
  } catch (e) {
    showWebFallback(site, `AI 요약에 실패했습니다: ${e.message}`);
  }
  finish();
}

function finish() {
  $('run').disabled = false;
  setStatus('');
}

// 현재 탭이 조사할 주소와 같은 페이지면, 화면에 그려진 글자를 함께 읽는다.
async function readRenderedTab(url) {
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url || !sameSite(tab.url, url)) return null;
    const a = new URL(tab.url);
    const b = new URL(url);
    if (a.pathname.replace(/\/+$/, '') !== b.pathname.replace(/\/+$/, '')) return null;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        text: document.body ? document.body.innerText : '',
        links: [...document.querySelectorAll('a[href]')].map((x) => ({ href: x.href, text: (x.innerText || '').trim().slice(0, 80) }))
      })
    });
    return res?.result || null;
  } catch {
    return null; // 권한이 없거나 chrome:// 페이지 등. 그냥 fetch 결과만 쓴다.
  }
}

// ---------- DART ----------

async function runDart(name, dartKey) {
  if (!name) return { state: 'skipped', message: '회사명을 입력하지 않아 DART 조회를 건너뛰었습니다.' };
  if (!dartKey) return { state: 'error', message: 'DART API 키가 없습니다. 설정에서 입력하세요. (웹사이트 결과는 그대로 보여 줍니다.)' };
  const d = { ...deps, apiKey: dartKey, storage };
  try {
    setStatus('DART에서 회사를 찾는 중… (처음 한 번은 회사 목록을 받느라 시간이 걸립니다)');
    const candidates = await findCorpCandidates(name, d);
    if (candidates.length === 0) {
      return { state: 'notfound', message: `DART 공시 대상이 아닌 회사이거나 이름이 다릅니다 ("${name}"). 법인명(예: 비바리퍼블리카)으로도 찾아보세요.` };
    }
    const chosen = candidates.length === 1 ? candidates[0] : await pickCandidate(candidates);
    if (!chosen) return { state: 'skipped', message: 'DART 후보 중 해당 회사가 없다고 선택했습니다.' };
    setStatus('DART 기업개황과 공시를 읽는 중…');
    const company = chosen.company || (await getCompany(chosen.corpCode, d));
    const disclosures = await getDisclosures(chosen.corpCode, d);
    return { state: 'ok', company, disclosures };
  } catch (e) {
    return { state: 'error', message: `DART 조회 실패: ${e.message} (웹사이트 결과는 그대로 보여 줍니다.)` };
  }
}

function pickCandidate(candidates) {
  return new Promise((resolve) => {
    const ul = $('dart-candidates');
    ul.replaceChildren();
    for (const c of candidates) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.append(c.corpName);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [c.stockCode ? `상장 ${c.stockCode}` : '비상장', c.homepage || '홈페이지 정보 없음'].join(' · ');
      btn.append(meta);
      btn.addEventListener('click', () => done(c));
      li.append(btn);
      ul.append(li);
    }
    $('dart-skip').onclick = () => done(null);
    $('dart-pick').hidden = false;
    setStatus('DART 후보 중 하나를 고르세요.');
    function done(v) {
      $('dart-pick').hidden = true;
      resolve(v);
    }
  });
}

function renderDart(dart) {
  const body = $('dart-body');
  body.replaceChildren();
  $('dart-section').hidden = false;
  if (dart.state !== 'ok') {
    body.append(el('p', dart.state === 'error' ? 'error' : 'warn', dart.message));
    return;
  }
  const c = dart.company;
  body.append(el('h3', null, '기업개황'));
  const dl = document.createElement('dl');
  const rows = [
    ['회사명', c.corpName],
    ['구분', c.stockCode ? `${c.corpClass} ${c.stockCode}` : c.corpClass],
    ['대표자', c.ceo],
    ['설립일', c.established],
    ['업종코드', c.industryCode],
    ['주소', c.address],
    ['홈페이지', c.homepage]
  ];
  for (const [k, v] of rows) {
    dl.append(el('dt', null, k), el('dd', null, v || '—'));
  }
  body.append(dl, sourceLink(c.source, 'DART 기업개황'));
  body.append(el('h3', null, '최근 공시 (1년, 최신 5건)'));
  if (!dart.disclosures.length) {
    body.append(el('p', 'missing', '최근 1년 공시가 없습니다.'));
    return;
  }
  const ul = document.createElement('ul');
  for (const d of dart.disclosures) {
    const li = document.createElement('li');
    const a = link(d.url, d.title);
    li.append(`${d.date} `, a);
    ul.append(li);
  }
  body.append(ul);
}

// ---------- 웹사이트 결과 ----------

function renderSummary(s, site) {
  const body = $('web-body');
  body.replaceChildren();
  $('web-section').hidden = false;
  body.append(el('h3', null, '한 줄 소개'), itemOrMissing(s.oneLiner));
  body.append(el('h3', null, '제품·서비스'));
  if (s.products.length) {
    const ul = document.createElement('ul');
    s.products.forEach((p) => ul.append(itemLi(p)));
    body.append(ul);
  } else body.append(missing());
  body.append(el('h3', null, '고객층'), itemOrMissing(s.customers));
  body.append(el('h3', null, '첫 연락 대화 소재'));
  if (s.hooks.length) {
    const ul = document.createElement('ul');
    s.hooks.forEach((h) => ul.append(itemLi(h)));
    body.append(ul);
  } else body.append(missing());
  if (s.dropped.length) {
    body.append(el('p', 'hint', `출처가 읽은 페이지와 맞지 않아 버린 항목 ${s.dropped.length}개가 있습니다.`));
  }
  body.append(pagesNote(site), el('p', 'hint', `AI 모델: ${GEMINI_MODEL}. 각 항목의 출처를 눌러 확인하세요.`));
}

function showWebError(message) {
  const body = $('web-body');
  body.replaceChildren(el('p', 'error', message));
  $('web-section').hidden = false;
}

function showWebFallback(site, message) {
  const body = $('web-body');
  body.replaceChildren(el('p', 'error', message));
  body.append(el('p', 'hint', '대신 읽어 온 원문 일부를 보여 드립니다.'));
  for (const p of site.pages) {
    body.append(el('h3', null, p.title || p.url), sourceLink(p.url, p.url));
    body.append(el('pre', 'excerpt', p.text.slice(0, 600) + (p.text.length > 600 ? '…' : '')));
  }
  $('web-section').hidden = false;
}

function pagesNote(site) {
  const div = el('div', 'pages');
  div.append('읽은 페이지: ');
  site.pages.forEach((p, i) => {
    if (i) div.append(', ');
    div.append(link(p.url, p.url));
  });
  if (site.skipped.length) div.append(` (못 읽은 페이지 ${site.skipped.length}개)`);
  return div;
}

// ---------- 작은 도우미 ----------

function itemOrMissing(item) {
  if (!item) return missing();
  const p = el('p', 'item', item.text);
  p.append(sourceLink(item.source, '출처'));
  return p;
}
function itemLi(item) {
  const li = el('li', 'item', item.text);
  li.append(sourceLink(item.source, '출처'));
  return li;
}
function missing() {
  return el('p', 'missing', '사이트에서 확인되지 않음');
}
function sourceLink(href, label) {
  const span = el('span', 'src');
  span.append('[', link(href, label), ']');
  return span;
}
function link(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function setStatus(t) {
  $('status').textContent = t;
}
function resetView() {
  ['web-section', 'dart-section', 'dart-pick'].forEach((id) => ($(id).hidden = true));
  $('web-body').replaceChildren();
  $('dart-body').replaceChildren();
}
