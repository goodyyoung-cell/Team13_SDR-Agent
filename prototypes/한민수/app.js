(function () {
  var C = window.Core
  var state = { leads: null, replies: [], results: [], filter: 'all' }
  var $ = function (id) { return document.getElementById(id) }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }

  function readFile(input, key) {
    var f = input.files && input.files[0]
    if (!f) return
    var r = new FileReader()
    r.onload = function () {
      state[key] = C.parseCSV(r.result)
      $(key + '-info').textContent = f.name + ' · ' + state[key].length + '행'
      refresh()
    }
    r.readAsText(f, 'utf-8')
  }

  function loadSamples() {
    var F = window.FIXTURES
    if (!F) return
    state.leads = C.parseCSV(F.leads)
    state.replies = C.parseCSV(F.replies)
    $('leads-info').textContent = '샘플 리드 ' + state.leads.length + '명 (가상)'
    $('replies-info').textContent = '샘플 답장 ' + state.replies.length + '건 (가상)'
    refresh()
  }

  function settings() {
    var num = function (id, d) { var v = parseInt($(id).value, 10); return isFinite(v) && v >= 0 ? v : d }
    var days = $('s-follow').value.split(',').map(function (s) { return parseInt(s.trim(), 10) }).filter(function (n) { return isFinite(n) && n > 0 })
    days.sort(function (a, b) { return a - b })
    return {
      startDate: $('s-start').value || '',
      holidays: $('s-holidays').value.split(',').map(function (s) { return s.trim() }).filter(function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) }),
      followupDays: days.length ? days : C.DEFAULTS.followupDays,
      endAfterDays: num('s-end', 7),
      recontactDays: num('s-recontact', 60),
      autoReplyResendDays: num('s-auto', 7),
      product: $('s-product').value.trim() || C.DEFAULTS.product,
      valueLine: $('s-value').value.trim() || C.DEFAULTS.valueLine,
      sender: $('s-sender').value.trim() || C.DEFAULTS.sender
    }
  }

  function badge(status) {
    var S = C.STATUS
    var cls = {}
    cls[S.NOT_YET] = 'b-wait'; cls[S.WAIT] = 'b-wait'; cls[S.END] = 'b-stop'; cls[S.HANDOFF] = 'b-go'; cls[S.CLOSED] = 'b-stop'; cls[S.STOP] = 'b-stop'
    cls[S.WRONG] = 'b-draft'; cls[S.RECONTACT] = 'b-draft'; cls[S.RESENT] = 'b-draft'; cls[S.RESEND_DUE] = 'b-draft'; cls[S.HUMAN] = 'b-human'
    return cls[status] || ''
  }

  function when(m) { return m.day + '일' + (m.date ? ' ' + m.date : '') }

  function refresh() {
    if (!state.leads || !state.leads.length) return
    var day = parseInt($('day').value, 10)
    var o = settings()
    $('day-label').textContent = day
    $('date-label').textContent = o.startDate ? '· ' + C.dateLabel(o.startDate, day) : ''
    state.results = state.leads.map(function (lead) {
      var mine = state.replies.filter(function (r) { return r.lead_email === lead.lead_email })
      var p = C.plan(lead, mine, day, o)
      return { lead: lead, plan: p, mailsText: p.mails.map(function (m) { return m.kind + '(' + when(m) + ')' }).join(' | '), opts: o }
    })
    render()
    $('download').disabled = false
  }

  function render() {
    var counts = {}
    state.results.forEach(function (r) { counts[r.plan.status] = (counts[r.plan.status] || 0) + 1 })
    var statuses = Object.keys(C.STATUS).map(function (k) { return C.STATUS[k] }).filter(function (s) { return counts[s] })
    $('filters').innerHTML = ['all'].concat(statuses).map(function (s) {
      var label = s === 'all' ? '전체 ' + state.results.length : s + ' ' + counts[s]
      return '<button class="chip ' + (state.filter === s ? 'on' : '') + '" data-f="' + esc(s) + '">' + esc(label) + '</button>'
    }).join('')
    var rows = state.results.filter(function (r) { return state.filter === 'all' || r.plan.status === state.filter })
    $('rows').innerHTML = rows.map(function (r) {
      var l = r.lead, p = r.plan
      var chips = p.mails.map(function (m) { return '<span class="mail">' + esc(m.kind) + ' · ' + esc(when(m)) + '</span>' }).join('')
      var mailBodies = p.mails.map(function (m) {
        var mail = C.buildMail(m.kind, l, r.opts)
        return '<b>' + esc(m.kind) + ' (' + esc(when(m)) + ')</b>\n제목: ' + esc(mail.subject) + '\n' + esc(mail.body)
      }).join('\n\n— — —\n\n')
      var mailsCell = p.mails.length
        ? chips + '<details><summary>메일 본문 보기</summary><pre>' + mailBodies + '</pre></details>'
        : '<span class="sub">아직 보내지 않음</span>'
      var replyCell = p.reply
        ? '<b>' + esc(p.replyClass) + '</b> <span class="sub">' + p.reply.day + '일째</span><div class="sub">' + esc(p.reply.body) + '</div>'
        : '<span class="sub">' + esc(C.NO_REPLY) + '</span>'
      var draft = p.draft ? '<details><summary>답장 초안 (사람이 확인 후 발송)</summary><pre>제목: ' + esc(p.draft.subject) + '\n' + esc(p.draft.body) + '</pre></details>' : ''
      return '<tr><td><b>' + esc(l.lead_name) + '</b><div class="sub">' + esc(l.company) + ' · ' + esc(l.title) + '</div></td>' +
        '<td>' + mailsCell + '</td>' +
        '<td>' + replyCell + '</td>' +
        '<td><span class="badge ' + badge(p.status) + '">' + esc(p.status) + '</span><div class="sub">' + esc(p.next) + '</div>' + draft + '</td></tr>'
    }).join('')
    $('result').hidden = false
  }

  function download() {
    var rows = state.results.map(function (r) {
      var l = r.lead, p = r.plan
      return {
        lead_name: l.lead_name, lead_email: l.lead_email, company: l.company,
        reply_day: p.reply ? p.reply.day : '', reply_class: p.replyClass, status: p.status, next_action: p.next,
        mails_sent: r.mailsText,
        draft_subject: p.draft ? p.draft.subject : '', draft_body: p.draft ? p.draft.body : '',
        needs_human: p.draft && p.draft.needsHuman ? 'yes' : ''
      }
    })
    var blob = new Blob([C.toCSV(rows, C.OUTPUT_COLUMNS)], { type: 'text/csv;charset=utf-8' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mail-followup-day' + $('day').value + '.csv'
    a.click()
  }

  $('f-leads').addEventListener('change', function (e) { readFile(e.target, 'leads') })
  $('f-replies').addEventListener('change', function (e) { readFile(e.target, 'replies') })
  $('sample').addEventListener('click', loadSamples)
  $('download').addEventListener('click', download)
  $('day').addEventListener('input', refresh)
  $('prev').addEventListener('click', function () { $('day').value = Math.max(0, parseInt($('day').value, 10) - 1); refresh() })
  $('next').addEventListener('click', function () { $('day').value = Math.min(70, parseInt($('day').value, 10) + 1); refresh() })
  ;['s-product', 's-value', 's-sender', 's-start', 's-holidays', 's-follow', 's-end', 's-recontact', 's-auto'].forEach(function (id) { $(id).addEventListener('change', refresh) })
  $('filters').addEventListener('click', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f')
    if (f) { state.filter = f; render() }
  })
})()
