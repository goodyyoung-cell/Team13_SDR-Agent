"""중복 걸러내기 P0 — 규칙 기반 판정 (docs/specs/hakyung-dedup.md).

표준 라이브러리만 쓴다. 화면(app.py)과 분리해 두어 설치 없이 테스트할 수 있다.
행은 컬럼 이름 → 값 dict이고, 컬럼 이름은 아래 상수를 따른다.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime

NAME, COMPANY, EMAIL, PHONE, LAST_CONTACT = "이름", "회사", "이메일", "전화", "마지막 연락일"
NEW_LEAD_COLUMNS = [NAME, COMPANY, EMAIL, PHONE]
HISTORY_COLUMNS = [NAME, COMPANY, EMAIL, PHONE, LAST_CONTACT]

BLOCK, REVIEW, CAUTION, NEW = "차단", "확인 필요", "주의", "신규"
SEVERITY = {BLOCK: 3, REVIEW: 2, CAUTION: 1, NEW: 0}
RULE_TAG = "규칙 일치"

PERSONAL_EMAIL_DOMAINS = {
    "gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
    "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.co.kr",
    "icloud.com", "me.com",
}

_KOREAN_LEGAL_FORMS = re.compile(r"\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|사단법인")
_ENGLISH_LEGAL_FORMS = re.compile(
    r"\b(co\.?\s*,?\s*ltd|inc|corp|corporation|ltd|llc|limited|company)\b\.?"
)
_DATE = re.compile(r"(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})")


def _text(value) -> str:
    return "" if value is None else str(value).strip()


def normalize_email(value) -> str:
    email = _text(value).lower().replace(" ", "")
    return email if "@" in email else ""


def normalize_phone(value) -> str:
    """010-1234-5678, 01012345678, +82 10-1234-5678을 모두 01012345678로 만든다."""
    text = _text(value)
    if re.fullmatch(r"\d+\.0", text):  # 엑셀이 숫자로 저장한 번호
        text = text[:-2]
    digits = re.sub(r"\D", "", text)
    if digits.startswith("82"):
        digits = digits[2:]
        if not digits.startswith("0"):
            digits = "0" + digits
    elif digits.startswith("1") and len(digits) in (9, 10):  # 엑셀이 앞의 0을 지운 휴대폰 번호
        digits = "0" + digits
    return digits if len(digits) >= 9 else ""


def normalize_company(value) -> str:
    """(주)·주식회사·Inc.·Co., Ltd. 같은 법인 표기와 띄어쓰기·문장부호를 없앤다."""
    company = _KOREAN_LEGAL_FORMS.sub("", _text(value).lower())
    company = _ENGLISH_LEGAL_FORMS.sub("", company)
    return re.sub(r"[^0-9a-z가-힣]", "", company)


def normalize_name(value) -> str:
    return re.sub(r"\s+", "", _text(value).lower())


def company_domain(email: str) -> str:
    """회사 이메일 도메인. 개인 메일(gmail·naver 등)이면 빈 문자열."""
    domain = email.rsplit("@", 1)[-1] if email else ""
    return "" if domain in PERSONAL_EMAIL_DOMAINS else domain


def parse_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    match = _DATE.search(_text(value))
    if not match:
        return None
    try:
        return date(*(int(part) for part in match.groups()))
    except ValueError:
        return None


@dataclass
class Result:
    verdict: str
    reason: str
    overlap: str


@dataclass
class _Record:
    source: str  # "접촉 이력" 또는 "새 리스트"
    row_number: int  # 엑셀에서 보이는 행 번호 (머리글이 1행)
    raw: dict
    name: str
    company: str
    email: str
    phone: str
    domain: str
    contacted: object  # date 또는 None

    @classmethod
    def from_row(cls, source, index, row):
        email = normalize_email(row.get(EMAIL))
        return cls(
            source=source,
            row_number=index + 2,
            raw=row,
            name=normalize_name(row.get(NAME)),
            company=normalize_company(row.get(COMPANY)),
            email=email,
            phone=normalize_phone(row.get(PHONE)),
            domain=company_domain(email),
            contacted=parse_date(row.get(LAST_CONTACT)),
        )

    def describe(self) -> str:
        columns = HISTORY_COLUMNS if self.source == "접촉 이력" else NEW_LEAD_COLUMNS
        values = [_text(self.raw.get(column)) for column in columns]
        if self.contacted:
            values[-1] = self.contacted.isoformat()
        return f"{self.source} {self.row_number}행: " + " · ".join(v for v in values if v)


def _same_contact(a: _Record, b: _Record) -> str:
    """같은 이메일·전화번호가 있으면 '이메일 같음' 같은 설명, 없으면 빈 문자열."""
    same = []
    if a.email and a.email == b.email:
        same.append("이메일")
    if a.phone and a.phone == b.phone:
        same.append("전화번호")
    return "·".join(same) + " 같음" if same else ""


def _same_company(a: _Record, b: _Record) -> str:
    if a.domain and a.domain == b.domain:
        return f"도메인 {a.domain}"
    if a.company and a.company == b.company:
        return f"회사명 {_text(a.raw.get(COMPANY))}"
    return ""


def _against_history(lead: _Record, past: _Record, today: date, window_days: int):
    """(판정, 이유) 또는 None."""
    contact = _same_contact(lead, past)
    if contact:
        if past.contacted is None:
            return REVIEW, f"{contact}, 마지막 연락일 없음 — 직접 확인"
        days = (today - past.contacted).days
        when = past.contacted.isoformat()
        if days <= window_days:
            return BLOCK, f"{contact}, {when} 연락({window_days}일 이내)"
        return CAUTION, f"{contact}, {when} 연락({window_days}일 지남)"
    if lead.name and lead.name == past.name and lead.company and lead.company == past.company:
        return REVIEW, "이름·회사 같음, 이메일·전화 다름"
    company = _same_company(lead, past)
    if company and lead.name != past.name:
        return CAUTION, f"같은 회사({company})의 다른 사람"
    return None


def _within_list(lead: _Record, other: _Record):
    """새 리스트 안에서 같은 사람이 두 번 나오면 (판정, 이유). 같은 회사의 다른 사람은 보지 않는다."""
    contact = _same_contact(lead, other)
    if contact:
        return REVIEW, f"새 리스트 안 {other.row_number}행과 {contact}"
    if lead.name and lead.name == other.name and lead.company and lead.company == other.company:
        return REVIEW, f"새 리스트 안 {other.row_number}행과 이름·회사 같음"
    return None


def _index(records):
    by_key = {}
    for record in records:
        keys = [("email", record.email), ("phone", record.phone),
                ("person", (record.name, record.company) if record.name and record.company else ""),
                ("company", record.company), ("domain", record.domain)]
        for kind, value in keys:
            if value:
                by_key.setdefault((kind, value), []).append(record)
    return by_key


def _candidates(lead: _Record, index):
    seen, found = set(), []
    for key in [("email", lead.email), ("phone", lead.phone),
                ("person", (lead.name, lead.company)), ("company", lead.company), ("domain", lead.domain)]:
        for record in index.get(key, []):
            if id(record) not in seen:
                seen.add(id(record))
                found.append(record)
    return found


def judge(new_rows, history_rows, today: date, window_days: int = 90, max_overlaps: int = 3):
    """새 리드 각 행의 판정을 Result 목록으로 돌려준다. 순서는 new_rows와 같다."""
    leads = [_Record.from_row("새 리스트", i, row) for i, row in enumerate(new_rows)]
    history = [_Record.from_row("접촉 이력", i, row) for i, row in enumerate(history_rows)]
    history_index, lead_index = _index(history), _index(leads)

    results = []
    for lead in leads:
        matches = []  # (판정, 이유, 겹친 기록)
        for past in _candidates(lead, history_index):
            found = _against_history(lead, past, today, window_days)
            if found:
                matches.append((*found, past))
        for other in _candidates(lead, lead_index):
            if other is not lead:
                found = _within_list(lead, other)
                if found:
                    matches.append((*found, other))

        if not matches:
            results.append(Result(NEW, "", ""))
            continue
        # 가장 심한 판정을 쓰고, 그 안에서는 최근에 연락한 기록을 먼저 보여준다.
        top = max(SEVERITY[verdict] for verdict, _, _ in matches)
        chosen = [m for m in matches if SEVERITY[m[0]] == top]
        chosen.sort(key=lambda m: m[2].contacted or date.min, reverse=True)
        verdict, reason, _ = chosen[0]
        overlaps = [record.describe() for _, _, record in chosen[:max_overlaps]]
        if len(chosen) > max_overlaps:
            overlaps.append(f"외 {len(chosen) - max_overlaps}건")
        results.append(Result(verdict, f"{reason}, {RULE_TAG}", "\n".join(overlaps)))
    return results
