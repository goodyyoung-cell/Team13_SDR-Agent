const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const C = require('../core.js')

const dir = path.join(__dirname, '..', 'data')
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
const leads = C.parseCSV(read('leads.csv'))
const replies = C.parseCSV(read('replies.csv'))
const expected = C.parseCSV(read('expected.csv'))
const START = '2026-11-04' // Wednesday
const repliesOf = (lead) => replies.filter((r) => r.lead_email === lead.lead_email)
const planAt = (name, day, opts) => {
  const lead = leads.find((l) => l.lead_name === name)
  return C.plan(lead, repliesOf(lead), day, Object.assign({ startDate: START }, opts || {}))
}
const kinds = (p) => p.mails.map((m) => m.kind)
const days = (p) => p.mails.map((m) => m.day)
const synth = (replyDay, body, day, opts) => C.plan({ lead_name: 'x', company: 'A' }, [{ day: replyDay, body }], day, Object.assign({ startDate: START }, opts || {}))

test('손으로 정한 정답과 비교 (21일째): 13명 전부 일치', () => {
  assert.equal(expected.length, 13)
  const wrong = []
  for (const e of expected) {
    const p = planAt(e.lead_name, 21)
    const got = [p.replyClass, p.status, String(p.mails.length)].join('|')
    const want = [e.expected_reply_class, e.expected_status, e.expected_mails].join('|')
    if (got !== want) wrong.push(`${e.lead_name}: 기대 ${want} / 실제 ${got}`)
  }
  assert.deepEqual(wrong, [])
})

test('주말 규칙: 수요일 시작이면 2차(4일째=일)는 5일째 월요일, 3차(10일째=토)는 12일째 월요일', () => {
  assert.deepEqual(days(planAt('노유나', 21)), [0, 5, 12])
  assert.deepEqual(planAt('노유나', 21).mails.map((m) => m.date), ['11/4(수)', '11/9(월)', '11/16(월)'])
})

test('주말이 아니면 4일·10일 그대로 (월요일 시작)', () => {
  assert.deepEqual(days(planAt('노유나', 21, { startDate: '2026-11-02' })), [0, 4, 10])
})

test('목요일 시작: 2차는 4일째(월), 3차는 10일째가 일요일이라 11일째 월요일', () => {
  assert.deepEqual(days(planAt('노유나', 21, { startDate: '2026-11-05' })), [0, 4, 11])
})

test('토요일 시작이면 첫 메일도 월요일로: 그 전에는 발송 전', () => {
  const before = planAt('노유나', 1, { startDate: '2026-11-07' })
  assert.equal(before.status, C.STATUS.NOT_YET)
  assert.equal(before.mails.length, 0)
  const sent = planAt('노유나', 2, { startDate: '2026-11-07' })
  assert.deepEqual(kinds(sent), ['첫 메일'])
  assert.equal(sent.mails[0].day, 2)
})

test('발송일이 아닌 날에는 아무것도 나가지 않는다 (일요일·토요일)', () => {
  assert.equal(planAt('노유나', 4).mails.length, 1) // Sun: 2차는 아직
  assert.equal(planAt('노유나', 5).mails.length, 2) // Mon
  assert.equal(planAt('노유나', 10).mails.length, 2) // Sat: 3차는 아직
  assert.equal(planAt('노유나', 11).mails.length, 2) // Sun
  assert.equal(planAt('노유나', 12).mails.length, 3) // Mon
})

test('종료는 마지막 후속(12일째) 7일 뒤인 19일째', () => {
  assert.equal(planAt('노유나', 18).status, C.STATUS.WAIT)
  assert.equal(planAt('노유나', 19).status, C.STATUS.END)
  assert.equal(planAt('노유나', 60).mails.length, 3, '종료 뒤에는 더 나가지 않는다')
})

test('다음 행동 문구에 날짜가 들어간다', () => {
  assert.match(planAt('노유나', 0).next, /후속 1 예정\(5일째 · 11\/9\(월\)\)/)
  assert.match(planAt('노유나', 5).next, /후속 2 예정\(12일째 · 11\/16\(월\)\)/)
})

test('0일째에는 모두 첫 메일 1통만 나간다', () => {
  for (const l of leads) assert.deepEqual(kinds(C.plan(l, repliesOf(l), 0, { startDate: START })), ['첫 메일'])
})

test('이미 답한 사람에게는 2차가 나가지 않는다 (같은 날 답장도 포함)', () => {
  assert.deepEqual(kinds(planAt('윤서준', 21)), ['첫 메일'])
  assert.deepEqual(kinds(planAt('전현우', 21)), ['첫 메일'], '5일째 답장 = 2차 발송일과 같은 날')
})

test('2차는 나간 뒤에 온 답장은 3차(후속 2)를 막는다', () => {
  const k = kinds(planAt('구민재', 21))
  assert.ok(k.includes('후속 1'))
  assert.ok(!k.includes('후속 2'))
})

test('3차까지 나간 뒤 온 답장은 사람이 본다', () => {
  const p = planAt('차은서', 21)
  assert.deepEqual(kinds(p), ['첫 메일', '후속 1', '후속 2'])
  assert.equal(p.status, C.STATUS.HUMAN)
})

test('수신 거부는 어떤 경우에도 이후 발송을 막는다', () => {
  const lead = leads.find((l) => l.lead_name === '신하윤')
  const later = repliesOf(lead).concat([{ lead_email: lead.lead_email, day: '3', body: '관심이 있습니다. 데모 부탁드립니다.' }])
  const p = C.plan(lead, later, 40, { startDate: START })
  assert.equal(p.status, C.STATUS.STOP)
  assert.equal(p.mails.length, 1)
})

test('자동 응답: 7일 뒤 재발송, 그 전에는 예정', () => {
  assert.equal(planAt('류태민', 8).status, C.STATUS.RESEND_DUE)
  assert.equal(planAt('류태민', 9).status, C.STATUS.RESENT)
  assert.equal(planAt('류태민', 9).mails[1].kind, '재발송(부재 후)')
})

test('재발송이 일요일에 걸리면 월요일로', () => {
  const p = synth(4, '자동 회신입니다. 휴가 중입니다', 30) // 4+7 = 11일째 = 일요일 → 12일째
  assert.equal(p.mails.find((m) => m.kind === '재발송(부재 후)').day, 12)
})

test('나중에: 60일 뒤 재연락 예약, 토요일이면 월요일', () => {
  assert.match(planAt('안지후', 21).next, /68일째/)
  const p = synth(6, '다음 분기에 연락 주세요', 21) // 6+60 = 66일째 = 토요일 → 68일째
  assert.match(p.next, /68일째/)
})

test('설정을 바꾸면 일정이 바뀐다 (2일·5일)', () => {
  assert.deepEqual(days(planAt('노유나', 21, { followupDays: [2, 5] })), [0, 2, 5])
})

test('날짜를 안 주면 주말 규칙 없이 일수 그대로', () => {
  const lead = leads.find((l) => l.lead_name === '노유나')
  assert.deepEqual(days(C.plan(lead, [], 21, {})), [0, 4, 10])
})

test('답장 분류 규칙', () => {
  const cls = (t) => C.classifyReply(t).cls
  assert.equal(cls('Please unsubscribe me.'), C.CLASSES.UNSUB)
  assert.equal(cls('수신거부 부탁드립니다'), C.CLASSES.UNSUB)
  assert.equal(cls('Out of office until Monday'), C.CLASSES.AUTO)
  assert.equal(cls('데모 보고 싶습니다'), C.CLASSES.INTEREST)
  assert.equal(cls('관심 없습니다'), C.CLASSES.NO)
  assert.equal(cls('내년에 다시 이야기해요'), C.CLASSES.LATER)
  assert.equal(cls('저는 담당자가 아닙니다'), C.CLASSES.WRONG)
  assert.equal(cls('네 알겠습니다'), C.CLASSES.UNKNOWN)
  assert.equal(cls(''), C.CLASSES.UNKNOWN)
  assert.equal(cls('관심 없지만 다음 분기에 연락 주세요'), C.CLASSES.MIXED)
})

test('수신 거부는 다른 말이 섞여 있어도 먼저 걸린다 (안전한 쪽으로 틀린다)', () => {
  assert.equal(C.classifyReply('데모는 좋은데 수신 거부해 주세요').cls, C.CLASSES.UNSUB)
})

test('모든 메일에 수신 거부 안내가 들어간다', () => {
  for (const k of ['첫 메일', '후속 1', '후속 2', '재발송(부재 후)']) {
    assert.ok(C.buildMail(k, leads[0]).body.includes(C.OPT_OUT), k)
  }
})

test('프로필이 비어 있어도 없는 사실을 지어내지 않는다', () => {
  const m = C.buildMail('첫 메일', leads.find((l) => l.lead_name === '송가온'))
  assert.ok(!m.body.includes('소식을 보았습니다'))
  assert.ok(!m.body.includes('분야에서 일하시는'))
  assert.ok(m.body.includes('송가온님'))
})

test('프로필이 있으면 소식과 업종이 들어간다', () => {
  const m = C.buildMail('첫 메일', leads.find((l) => l.lead_name === '윤서준'))
  assert.ok(m.body.includes('신규 API 출시'))
  assert.ok(m.body.includes('클라우드 SaaS'))
})

test('담당자 문의는 별도 메일 종류로 따로 있다', () => {
  const m = C.buildMail('담당자 문의', leads.find((l) => l.lead_name === '구민재'))
  assert.ok(m.body.includes('성함과 연락처'))
  assert.ok(m.body.includes(C.OPT_OUT))
})

test('결정 C: 담당자 아님은 답장 다음 평일에 자동 발송, 사람 몫이 아니다', () => {
  const before = planAt('구민재', 6)
  assert.equal(before.status, C.STATUS.WRONG_DUE)
  assert.equal(before.draft, null)
  const after = planAt('구민재', 7)
  assert.equal(after.status, C.STATUS.WRONG)
  assert.deepEqual(kinds(after), ['첫 메일', '후속 1', '담당자 문의'])
  assert.equal(after.draft, null)
})

test('결정 C: 담당자 문의가 토요일에 걸리면 월요일로 (답장 금요일)', () => {
  // 2026-11-02(월) 시작 → 4일째 = 금요일. 다음 날 5일째 = 토요일 → 7일째 = 월요일
  const p = synth(4, '저는 담당자가 아닙니다', 7, { startDate: '2026-11-02' })
  assert.equal(p.mails.find((m) => m.kind === '담당자 문의').day, 7)
})

test('결정 C: 나중에는 초안도 없이 자동 재연락, 사람이 손대지 않는다', () => {
  const p = planAt('안지후', 21)
  assert.equal(p.status, C.STATUS.RECONTACT)
  assert.equal(p.draft, null)
  assert.match(p.next, /자동/)
})

test('결정 C: 사람 몫은 관심 있음과 사람 확인 둘뿐이다', () => {
  const human = new Set([C.STATUS.HANDOFF, C.STATUS.HUMAN])
  const rest = leads.map((l) => planAt(l.lead_name, 21)).filter((p) => human.has(p.status))
  assert.equal(rest.length, 5) // 윤서준, 탁수아, 전현우, 차은서, 마도현
  for (const l of leads) {
    const p = planAt(l.lead_name, 21)
    if (!human.has(p.status)) assert.equal(p.draft, null, l.lead_name)
  }
})

test('답장 초안은 관심 있음에만 있고 일정은 비워 둔다', () => {
  const p = planAt('윤서준', 21)
  assert.equal(p.draft.needsHuman, true)
  assert.match(p.draft.body, /\[SDR이 직접 입력\]/)
  assert.equal(planAt('배지안', 21).draft, null)
  assert.equal(planAt('신하윤', 21).draft, null)
})

test('CSV 왕복: 쉼표·따옴표·줄바꿈이 유지된다', () => {
  const rows = [{ a: '가, 나', b: '"인용"', c: '두\n줄' }]
  assert.deepEqual(C.parseCSV(C.toCSV(rows, ['a', 'b', 'c'])), rows)
})

test('공휴일: 그날은 건너뛰고 다음 날 (월요일 시작, 4일째 금요일이 공휴일이면 토·일을 지나 월요일)', () => {
  const p = planAt('노유나', 21, { startDate: '2026-11-02', holidays: ['2026-11-06'] })
  assert.deepEqual(days(p), [0, 7, 10])
})

test('공휴일 + 주말이 겹치면 그다음 평일까지: 수요일 시작, 월요일(5일째)이 공휴일이면 화요일(6일째)', () => {
  const p = planAt('노유나', 21, { holidays: ['2026-11-09'] })
  assert.deepEqual(days(p), [0, 6, 12])
})

test('공휴일이 평일 한가운데면 바로 다음 날', () => {
  const p = planAt('노유나', 21, { startDate: '2026-11-02', holidays: ['2026-11-12'] }) // 10일째(목)
  assert.deepEqual(days(p), [0, 4, 11])
})

test('첫 메일 발송일이 공휴일이면 첫 메일도 다음 평일', () => {
  const p = planAt('노유나', 21, { startDate: '2026-11-02', holidays: ['2026-11-02'] })
  assert.equal(p.mails[0].day, 1)
})

test('공휴일을 안 넣으면 이전 규칙과 같다', () => {
  assert.deepEqual(days(planAt('노유나', 21, { holidays: [] })), [0, 5, 12])
})

test('나중에 - 막연한 시점은 자동 재연락, 날짜·방식을 콕 집으면 사람 확인', () => {
  const vague = synth(6, '다음 분기에 연락 주세요', 21)
  assert.equal(vague.status, C.STATUS.RECONTACT)
  for (const body of ['내년 3월 둘째 주에 전화 주세요', '나중에 11월 20일 이후에 연락 주세요', '화요일 오전에 통화 가능합니다 나중에 부탁드려요']) {
    const p = synth(6, body, 21)
    assert.equal(p.replyClass, C.CLASSES.LATER, body)
    assert.equal(p.status, C.STATUS.HUMAN, body)
    assert.match(p.next, /사람이 확인/, body)
    assert.equal(p.draft, null, body)
  }
})

test('나중에(날짜 지정)는 자동 재연락 일정이 잡히지 않는다', () => {
  const p = planAt('마도현', 21)
  assert.equal(p.status, C.STATUS.HUMAN)
  assert.ok(!/일째.*다시 연락/.test(p.next))
})

test('리드당 메일은 최대 4통까지 (첫 메일 + 후속 2 + 재발송 또는 담당자 문의 1)', () => {
  const max = Math.max(...leads.map((l) => planAt(l.lead_name, 70).mails.length))
  assert.ok(max <= 4)
  assert.equal(planAt('구민재', 70).mails.length, 3)
})