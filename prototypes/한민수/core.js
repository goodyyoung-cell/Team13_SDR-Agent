(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.Core = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  var CLASSES = {
    INTEREST: '관심 있음',
    LATER: '나중에',
    NO: '거절',
    WRONG: '담당자 아님',
    AUTO: '자동 응답',
    UNSUB: '수신 거부',
    MIXED: '신호가 섞임',
    UNKNOWN: '분류 불가'
  }

  var STATUS = {
    NOT_YET: '발송 전',
    WAIT: '진행 중(답장 없음)',
    END: '무응답 종료',
    HANDOFF: 'SDR 인계',
    CLOSED: '종료(거절)',
    STOP: '발송 중단(수신 거부)',
    WRONG: '담당자 문의 자동 발송',
    WRONG_DUE: '담당자 문의 예정',
    RECONTACT: '재연락 예약(자동)',
    RESENT: '재발송 완료',
    RESEND_DUE: '재발송 예정',
    HUMAN: '사람 확인'
  }

  var NO_REPLY = '(답장 없음)'
  var WEEK = ['일', '월', '화', '수', '목', '금', '토']

  var DEFAULTS = {
    startDate: '',
    holidays: [],
    followupDays: [4, 10],
    endAfterDays: 7,
    recontactDays: 60,
    autoReplyResendDays: 7,
    wrongContactDelayDays: 1,
    product: '영업 대응 자동화 서비스',
    valueLine: '들어온 리드를 정리하고 첫 연락을 준비하는 시간을 줄이도록 돕습니다',
    sender: 'SDR 담당자'
  }

  var OPT_OUT = '※ 더 이상 메일을 원하지 않으시면 "수신 거부"라고 회신해 주세요.'

  // UNSUB and AUTO are checked first. The other four are counted: one hit is a class, none or many go to a person.
  var RULES = {
    UNSUB: /수신\s?거부|수신\s?거절|보내지\s?마|연락하지\s?마|그만\s?보내|unsubscribe|remove me|do not (contact|email)|stop (emailing|sending)/i,
    AUTO: /자동\s?회신|자동\s?응답|부재\s?중|휴가\s?중|출장\s?중|out of office|auto-?reply|automatic reply/i,
    WRONG: /담당자(가|는)?\s?아[닙니]|담당(이|은)?\s?아[닙니]|다른\s?담당자/,
    NO: /관심(이|은)?\s?(없|않)|필요\s?(없|하지\s?않)|도입\s?(계획|의사)(이|가)?\s?없|not interested/i,
    LATER: /나중에|다음\s?(분기|달|해)|내년|하반기|상반기|지금은\s?(어렵|힘들)|추후|later|next (quarter|year)/i,
    INTEREST: /관심(이|은)?\s?(있|많)|데모|미팅|자세히|소개\s?자료|견적|가격|일정|interested|demo|pricing/i
  }

  // "나중에" 중에서 날짜나 방식을 콕 집은 요청. 막연한 "다음 분기"와 구분한다.
  var SPECIFIC_WHEN = /\d{1,2}\s?월|\d{1,2}\s?일|\d{4}\s?년|(첫|둘|셋|넷|마지막)째\s?주|월요일|화요일|수요일|목요일|금요일|오전|오후|전화\s?(주|해)|통화|이메일\s?(말고|대신)|메일\s?말고/

  function parseCSV(text) {
    var rows = []
    var row = []
    var cell = ''
    var q = false
    text = String(text || '').replace(/^\uFEFF/, '')
    for (var i = 0; i < text.length; i++) {
      var c = text[i]
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
        else if (c === '"') q = false
        else cell += c
      } else if (c === '"') q = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(cell); cell = ''
        if (row.length > 1 || row[0] !== '') rows.push(row)
        row = []
      } else cell += c
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row) }
    if (!rows.length) return []
    var head = rows[0].map(function (h) { return h.trim() })
    return rows.slice(1).map(function (r) {
      var o = {}
      head.forEach(function (h, i) { o[h] = (r[i] || '').trim() })
      return o
    })
  }

  function toCSV(rows, columns) {
    function esc(v) {
      v = v == null ? '' : String(v)
      return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
    }
    return '\uFEFF' + [columns.join(',')].concat(rows.map(function (r) {
      return columns.map(function (c) { return esc(r[c]) }).join(',')
    })).join('\r\n')
  }

  // ---- calendar: day N is N days after startDate. A send that lands on Sat/Sun moves to the next Monday. ----
  function dateAt(start, offset) {
    var d = new Date(start + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + offset)
    return d
  }
  function bizShift(start, offset, holidays) {
    if (!start) return offset
    var hol = holidays || []
    var o = offset
    for (var i = 0; i < 30; i++) {
      var d = dateAt(start, o)
      var dow = d.getUTCDay()
      if (dow === 0 || dow === 6 || hol.indexOf(d.toISOString().slice(0, 10)) >= 0) o++
      else break
    }
    return o
  }
  function dateLabel(start, offset) {
    if (!start) return ''
    var d = dateAt(start, offset)
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + WEEK[d.getUTCDay()] + ')'
  }

  // Rules only. A reply that is empty, mixed or unreadable is never guessed.
  function classifyReply(text) {
    var t = String(text || '')
    if (RULES.UNSUB.test(t)) return { cls: CLASSES.UNSUB }
    if (RULES.AUTO.test(t)) return { cls: CLASSES.AUTO }
    var hit = ['WRONG', 'NO', 'LATER', 'INTEREST'].filter(function (k) { return RULES[k].test(t) })
    if (hit.length === 0) return { cls: CLASSES.UNKNOWN }
    if (hit.length > 1) return { cls: CLASSES.MIXED, matched: hit.map(function (k) { return CLASSES[k] }) }
    return { cls: CLASSES[hit[0]] }
  }

  // Only here so there is something to send. The point of this tool is what happens after the send.
  function buildMail(kind, lead, ctx) {
    var c = Object.assign({}, DEFAULTS, ctx || {})
    var name = lead.lead_name + '님'
    var co = lead.company || ''
    var lines = []
    var subject
    if (kind === '첫 메일') {
      subject = co + ' ' + name + '께 드리는 제안'
      lines.push('안녕하세요, ' + name + '.')
      lines.push(lead.title && co ? co + '의 ' + lead.title + '으로 계신 분께 연락드립니다.' : (co ? co + ' 담당자분께 연락드립니다.' : ''))
      if (lead.recent_news) lines.push('최근 "' + lead.recent_news + '" 소식을 보았습니다.')
      if (lead.industry) lines.push(lead.industry + ' 분야에서 일하시는 분들께 ' + c.product + '를 소개드리고 있습니다.')
      else lines.push(c.product + '를 소개드리고 있습니다.')
      lines.push(c.product + '는 ' + c.valueLine + '.')
      lines.push('15분 정도 통화 가능하실 때 알려주시면 일정을 맞추겠습니다.')
    } else if (kind === '후속 1') {
      subject = '다시 연락드립니다: ' + co
      lines.push(name + ', 며칠 전에 드린 메일을 다시 한 번 드립니다.')
      lines.push(c.product + '는 ' + c.valueLine + '.')
      lines.push('관심이 있으시면 회신 한 줄이면 충분합니다.')
    } else if (kind === '후속 2') {
      subject = '마지막 안내: ' + co
      lines.push(name + ', 마지막으로 한 번만 더 연락드립니다.')
      lines.push('필요하지 않으시면 회신하지 않으셔도 되고, 더 이상 연락드리지 않겠습니다.')
    } else if (kind === '담당자 문의') {
      subject = '담당자를 알려주시면 감사하겠습니다: ' + co
      lines.push('안내 감사합니다, ' + name + '.')
      lines.push('이 건을 맡으실 분의 성함과 연락처를 알려주실 수 있을까요?')
    } else {
      subject = '복귀하신 뒤 확인 부탁드립니다: ' + co
      lines.push(name + ', 자동 회신 잘 받았습니다.')
      lines.push('복귀하신 뒤 보실 수 있도록 다시 보냅니다. ' + c.product + '는 ' + c.valueLine + '.')
    }
    lines.push('감사합니다.')
    lines.push(c.sender)
    lines.push(OPT_OUT)
    return { subject: subject, body: lines.filter(Boolean).join('\n') }
  }

  // Only "관심 있음" gets a draft, because only that one needs a person. Everything else is automatic or not sent.
  function buildReplyDraft(cls, lead, ctx) {
    var c = Object.assign({}, DEFAULTS, ctx || {})
    var name = lead.lead_name + '님'
    var end = ['감사합니다.', c.sender, OPT_OUT]
    if (cls === CLASSES.INTEREST) {
      return { subject: 'Re: ' + lead.company + ' 제안', needsHuman: true,
        body: ['회신 감사합니다, ' + name + '.', '자세히 소개드리겠습니다.', '가능한 일정 후보: [SDR이 직접 입력]', '편하신 시간을 알려주세요.'].concat(end).join('\n') }
    }
    return null
  }

  function byDay(a, b) { return a.day - b.day }

  // lead + that lead's replies + simulated day -> what was sent, how the reply was read, what is next.
  function plan(lead, replies, day, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {})
    var sd = o.startDate
    var lab = function (off) { return sd ? ' · ' + dateLabel(sd, off) : '' }
    var tag = function (off) { return sd ? dateLabel(sd, off) : '' }

    var f0 = bizShift(sd, 0, o.holidays)
    if (day < f0) {
      return { mails: [], reply: null, replyClass: NO_REPLY, status: STATUS.NOT_YET, draft: null,
        next: '첫 메일 ' + f0 + '일째' + lab(f0) + ' 발송 예정' }
    }

    var rs = (replies || []).map(function (r) { return { day: Number(r.day), body: r.body } })
      .filter(function (r) { return r.day <= day }).sort(byDay)
      .map(function (r) { return Object.assign({}, r, { cls: classifyReply(r.body).cls }) })

    var mails = [{ day: f0, kind: '첫 메일', date: tag(f0) }]
    var sends = o.followupDays.map(function (d) { return bizShift(sd, f0 + d, o.holidays) })
    sends.forEach(function (s, i) {
      var answered = rs.some(function (r) { return r.day <= s })
      if (s <= day && !answered) mails.push({ day: s, kind: '후속 ' + (i + 1), date: tag(s) })
    })

    var unsub = rs.filter(function (r) { return r.cls === CLASSES.UNSUB })[0]
    var last = rs.length ? rs[rs.length - 1] : null
    var resendDay = null
    if (!unsub && last && last.cls === CLASSES.AUTO) {
      resendDay = bizShift(sd, last.day + o.autoReplyResendDays, o.holidays)
      if (resendDay <= day) mails.push({ day: resendDay, kind: '재발송(부재 후)', date: tag(resendDay) })
    }

    var status, next, draft = null, cls = last ? last.cls : NO_REPLY
    if (unsub) { cls = CLASSES.UNSUB; status = STATUS.STOP; next = '더 이상 보내지 않는다. 수신 거부로 기록' }
    else if (!last) {
      var endDay = sends[sends.length - 1] + o.endAfterDays
      if (day >= endDay) { status = STATUS.END; next = '더 보내지 않고 종료' }
      else {
        status = STATUS.WAIT
        var idx = -1
        for (var i = 0; i < sends.length; i++) { if (sends[i] > day) { idx = i; break } }
        next = idx >= 0 ? '후속 ' + (idx + 1) + ' 예정(' + sends[idx] + '일째' + lab(sends[idx]) + ')' : '종료 판단(' + endDay + '일째)'
      }
    } else if (last.cls === CLASSES.INTEREST) { status = STATUS.HANDOFF; next = 'SDR이 바로 이어받는다 (초안은 사람이 일정을 채워 발송)'; draft = buildReplyDraft(last.cls, lead, o) }
    else if (last.cls === CLASSES.NO) { status = STATUS.CLOSED; next = '더 보내지 않고 종료' }
    else if (last.cls === CLASSES.WRONG) {
      var wd = bizShift(sd, last.day + o.wrongContactDelayDays, o.holidays)
      if (wd <= day) {
        mails.push({ day: wd, kind: '담당자 문의', date: tag(wd) })
        status = STATUS.WRONG
        next = '맞는 담당자를 묻는 메일을 보냈다. 답이 오기 전에는 사람이 손대지 않는다'
      } else {
        status = STATUS.WRONG_DUE
        next = wd + '일째' + lab(wd) + '에 맞는 담당자를 묻는 메일 자동 발송'
      }
    }
    else if (last.cls === CLASSES.LATER) {
      if (SPECIFIC_WHEN.test(last.body || '')) {
        status = STATUS.HUMAN; next = '날짜나 방식을 콕 집은 요청이라 자동 재연락을 하지 않고 사람이 확인한다'
      } else {
        var rc = bizShift(sd, last.day + o.recontactDays, o.holidays)
        status = STATUS.RECONTACT; next = rc + '일째' + lab(rc) + '에 자동으로 다시 연락. 사람은 손대지 않는다'
      }
    }
    else if (last.cls === CLASSES.AUTO) {
      if (resendDay <= day) { status = STATUS.RESENT; next = '재발송 후 답장 대기' }
      else { status = STATUS.RESEND_DUE; next = resendDay + '일째' + lab(resendDay) + '에 재발송' }
    } else { status = STATUS.HUMAN; next = '자동으로 하지 않고 사람이 읽고 정한다' }

    return { mails: mails, reply: last, replyClass: cls, status: status, next: next, draft: draft }
  }

  var OUTPUT_COLUMNS = ['lead_name', 'lead_email', 'company', 'reply_day', 'reply_class', 'status', 'next_action', 'mails_sent', 'draft_subject', 'draft_body', 'needs_human']

  return {
    CLASSES: CLASSES, STATUS: STATUS, NO_REPLY: NO_REPLY, DEFAULTS: DEFAULTS, OPT_OUT: OPT_OUT,
    OUTPUT_COLUMNS: OUTPUT_COLUMNS,
    parseCSV: parseCSV, toCSV: toCSV,
    classifyReply: classifyReply, buildMail: buildMail, buildReplyDraft: buildReplyDraft, plan: plan,
    bizShift: bizShift, dateLabel: dateLabel
  }
})
