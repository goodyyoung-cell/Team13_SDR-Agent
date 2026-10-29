"""실행: prototypes/홍하경 폴더에서 python -m unittest"""

import csv
import unittest
from datetime import date
from pathlib import Path

from dedup import BLOCK, CAUTION, NEW, REVIEW, judge, normalize_company, normalize_phone

SAMPLES = Path(__file__).resolve().parent.parent / "samples"
TODAY = date(2026, 10, 29)  # 스펙의 손으로 하는 확인 기준일


def read_csv(name):
    with open(SAMPLES / name, encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def judge_sample(check):
    [result] = judge(read_csv(f"{check}_new_leads.csv"), read_csv(f"{check}_history.csv"), TODAY)
    return result


class HandChecks(unittest.TestCase):
    """docs/specs/홍하경-dedup.md의 '손으로 하는 확인' 세 가지."""

    def test_check1_same_phone_different_format_is_blocked(self):
        result = judge_sample("check1")
        self.assertEqual(result.verdict, BLOCK)
        self.assertEqual(result.reason, "전화번호 같음, 2026-10-10 연락(90일 이내), 규칙 일치")
        self.assertIn("접촉 이력 2행", result.overlap)

    def test_check2_other_person_same_company_is_caution(self):
        result = judge_sample("check2")
        self.assertEqual(result.verdict, CAUTION)
        self.assertEqual(result.reason, "같은 회사(도메인 abc.co.kr)의 다른 사람, 규칙 일치")

    def test_check3_same_name_and_company_needs_review(self):
        result = judge_sample("check3")
        self.assertEqual(result.verdict, REVIEW)
        self.assertEqual(result.reason, "이름·회사 같음, 이메일·전화 다름, 규칙 일치")


class Rules(unittest.TestCase):
    lead = {"이름": "김민준", "회사": "에이비씨", "이메일": "MJ@abc.co.kr ", "전화": ""}

    def history(self, contacted):
        return [{"이름": "김민준", "회사": "에이비씨", "이메일": "mj@abc.co.kr", "전화": "", "마지막 연락일": contacted}]

    def test_phone_formats(self):
        for raw in ["010-1234-5678", "01012345678", "+82 10-1234-5678", "+82 (0)10 1234 5678", "1012345678"]:
            self.assertEqual(normalize_phone(raw), "01012345678", raw)

    def test_company_legal_forms(self):
        for raw in ["(주)에이비씨", "에이비씨 주식회사", "㈜ 에이비씨", "에이비씨"]:
            self.assertEqual(normalize_company(raw), "에이비씨", raw)
        self.assertEqual(normalize_company("Toss Co., Ltd."), normalize_company("toss inc."))

    def test_window_boundary_and_older_contact(self):
        self.assertEqual(judge([self.lead], self.history("2026-07-31"), TODAY)[0].verdict, BLOCK)  # 90일째
        self.assertEqual(judge([self.lead], self.history("2026-07-30"), TODAY)[0].verdict, CAUTION)  # 91일째
        self.assertEqual(judge([self.lead], self.history("2026-07-30"), TODAY, window_days=120)[0].verdict, BLOCK)

    def test_same_contact_without_date_needs_review(self):
        self.assertEqual(judge([self.lead], self.history(""), TODAY)[0].verdict, REVIEW)

    def test_duplicate_inside_new_list(self):
        twin = dict(self.lead, 전화="010-1111-2222")
        results = judge([self.lead, twin], [], TODAY)
        self.assertEqual([r.verdict for r in results], [REVIEW, REVIEW])
        self.assertIn("새 리스트 안 3행과 이메일 같음", results[0].reason)

    def test_personal_email_domain_is_not_same_company(self):
        lead = {"이름": "A", "회사": "가나", "이메일": "a@gmail.com", "전화": ""}
        past = [{"이름": "B", "회사": "다라", "이메일": "b@gmail.com", "전화": "", "마지막 연락일": "2026-10-01"}]
        self.assertEqual(judge([lead], past, TODAY)[0].verdict, NEW)


if __name__ == "__main__":
    unittest.main()
