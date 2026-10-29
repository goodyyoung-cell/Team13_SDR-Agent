const fields = ['geminiKey', 'dartKey'];
const msg = document.getElementById('msg');

chrome.storage.local.get(fields).then((v) => {
  for (const f of fields) {
    if (v[f]) document.getElementById(f).placeholder = `저장됨 (끝 4자리 …${v[f].slice(-4)}) — 바꾸려면 새로 입력`;
  }
});

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const update = {};
  for (const f of fields) {
    const val = document.getElementById(f).value.trim();
    if (val) update[f] = val;
  }
  if (!Object.keys(update).length) {
    msg.textContent = '새로 입력한 키가 없습니다.';
    return;
  }
  await chrome.storage.local.set(update);
  for (const f of Object.keys(update)) {
    const input = document.getElementById(f);
    input.value = '';
    input.placeholder = `저장됨 (끝 4자리 …${update[f].slice(-4)}) — 바꾸려면 새로 입력`;
  }
  msg.textContent = '저장했습니다. 사이드 패널을 닫았다 다시 열면 반영됩니다.';
});

document.getElementById('clear-cache').addEventListener('click', async () => {
  await chrome.storage.local.remove('dartCorpList');
  msg.textContent = 'DART 회사 목록을 지웠습니다. 다음 조사 때 새로 받습니다.';
});
