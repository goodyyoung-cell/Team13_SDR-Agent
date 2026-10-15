# PREMORTEM.md

Team: Team 13 — 읽씹방지위원회  
Members: 김이서, 손영훈, 한민수, 홍하경  
Merged on: 2026-10-04  
Last updated: 2026-10-15

## 1. Individual lists

| Member | File | Written on | Causes listed |
|---|---|---|---|
| 김이서 | `docs/premortem/김이서.md` | 2026-10-01 | 5 |
| 손영훈 | `docs/premortem/손영훈.md` | 2026-10-04 | 5 |
| 한민수 | `docs/premortem/한민수.md` | 2026-10-04 | 5 |
| 홍하경 | `docs/premortem/hakyung.md` | 2026-10-01 | 8 |

## 2. Read-out

Go around the table.  
One cause each, in turn, until every list is exhausted.  
No debating during the read-out, and nobody reads their whole list at once.  
People have to feel safe saying the awkward one, so the only allowed response is writing it down.

## 3. The merged list

| # | Failure cause (past tense, specific) | Problem cluster | Raised by | How many |
|---|---|---|---|---|
| 1 | 수작업(as-is)과 비교할 기준을 정하지 않아, 데모는 작동했지만 사람 투입 대비 무엇이 나아졌는지 증명하지 못했다. 평가도 우리가 익숙한 시나리오로 우리끼리 했다. | 검증·측정 | 한민수, 홍하경, 김이서 | 3 |
| 2 | 실제 고객 계정, 데이터, 발송 승인, 참여할 SDR을 확보하지 못해 팀원끼리만 테스트했고, 12/12에야 급하게 1~2명에게 보여 줬다. | 검증·실사용자 | 한민수, 김이서 | 2 |
| 3 | 5개 기능과 실시간 음성까지 이번 학기에 다 된다고 낙관했고, 기능은 따로 돌아갔지만 한 고객이 처음부터 인계까지 이어지는 흐름은 끝내 시연하지 못했다. | 범위 | 한민수, 홍하경 | 2 |
| 4 | 기존 AI SDR 툴(Clay, Apollo, 11x 등) 대비 무엇이 다르냐는 질문에 답하지 못했다. 시장조사를 소홀히 해 Edge 있는 기능을 만들지 못했다. | 차별화 | 손영훈, 홍하경 | 2 |
| 5 | **(us)** 회사마다 다른 유망 고객 판단 방식과 데이터 정의를 합의하지 못하고 “일단 구현 후 맞추자”로 넘어가, 익숙한 사례에서만 그럴듯하게 작동했다. | 합의·기준 | 손영훈, 홍하경 | 2 |
| 6 | **(us)** 기능별 담당만 정하고, 전체 흐름을 연결하고 AI 코드를 설명·수정할 책임자를 정하지 않았다. | 역할·통합 | 한민수, 손영훈 | 2 |
| 7 | **(us)** 백엔드나 개발 경험자가 없어 AI가 만든 코드를 리뷰하고 고치지 못했고, 결국 기존 툴을 연결하는 기초 수준에서 멈췄다. | 기술 역량 | 손영훈, 김이서 | 2 |
| 8 | **(us)** 내 도메인이 아니거나(SaaS 산업, 신규 발굴 SDR 흐름) 이해가 부족했지만, 팀의 신뢰나 진행 속도 때문에 모르는 것을 공개적으로 말하지 않고 혼자 따라잡으려 했다. | 사람·소통 | 홍하경, 김이서 | 2 |
| 9 | **(us)** “과제용 테스트인가, 현업용 에이전트인가”를 처음에 합의하지 않아 데이터와 아웃풋 품질 기준이 정해지지 않았다. | 합의·목적 | 김이서 | 1 |
| 10 | SaaS 세그먼트(고객 규모, 경쟁사, 현황) 조사를 얕게 해서 고객 문제와 세일즈 내러티브를 뾰족하게 만들지 못했고, 고객 정의가 10월 말에야 정해졌다. | 고객 정의 | 김이서 | 1 |
| 11 | **(us)** 10월 분기 마감과 11월 출장 2회로 내 몫을 하지 못했고, 일정이 맞지 않아 팀 과제에 제대로 참여하지 못했다. | 사람·일정 | 손영훈 | 1 |
| 12 | 받는 쪽 고객이 AI 영업을 받아들이지 않았다. AI와 미팅할 이유를 찾지 못했고, 사람과 바로 이야기하거나 자료만 받기를 원했다. | 고객 수용 | 홍하경 | 1 |
| 13 | 현업 SDR이 AI 인계 자료를 믿지 않고 처음부터 다시 조사했다. 고객의 실제 발언과 AI 추정이 구분되지 않았다. | SDR 수용 | 홍하경 | 1 |
| 14 | Outbound/Inbound 컨셉과 디자인을 잡는 데 초반 시간을 너무 오래 써서 개발과 테스트 기간이 부족했다. | 일정 | 손영훈 | 1 |

## 4. What only one person saw

| Cause | Raised by | What we decided to do about it |
|---|---|---|
| “과제용 테스트인가, 현업용 에이전트인가”를 처음에 합의하지 않아 데이터와 아웃풋 품질 기준이 정해지지 않았다. **(us)** | 김이서 | 10월 11일 팀 미팅에서 이번 학기 결과물의 목표를 “검증 가능한 프로토타입”으로 명시하고, 실제 현업 적용을 위해 추가로 필요한 조건은 별도 목록으로 분리한다. |
| SaaS 세그먼트 조사를 얕게 해서 고객 문제와 세일즈 내러티브가 뾰족해지지 않았다. | 김이서 | `QUESTIONS.md` 3번의 팀 내 이견으로 올리고, 상담에서 첫 빌드 전에 반드시 확정해야 할 최소 고객 정의와 이후 검증으로 넘길 항목을 구분한다. |
| 10월 분기 마감과 11월 출장 2회로 팀 과제 참여가 어려웠다. **(us)** | 손영훈 | 10월 11일까지 참여가 어려운 주간을 공유하고, 해당 기간의 의사결정·개발 업무는 미리 다른 담당자에게 넘긴다. |
| 받는 쪽 고객이 AI 영업을 받아들이지 않았다. | 홍하경 | 실제 타깃 고객 관점의 외부 참여자 3명에게 이메일→AI 스크리닝 콜 흐름을 보여주고, AI와 대화할 이유와 사람 연결이 필요한 시점을 기록한다. |
| 현업 SDR이 AI 인계 자료를 믿지 않고 다시 조사했다. | 홍하경 | 현업 SDR 2명에게 인계 자료만 전달해 다음 행동을 결정하게 하고, 반드시 확인해야 하는 정보와 ‘고객 실제 발언/AI 추정’ 구분 방식을 수정한다. |
| Outbound/Inbound 컨셉과 디자인을 잡는 데 초반 시간을 너무 오래 썼다. | 손영훈 | 아래 ‘The three we act on’의 실행 항목으로 올려 MVP scope와 핵심 flow 확정에 deadline을 둔다. |

## 5. The three we act on

| # | Failure cause | Early warning signal — what we would actually observe, and when | Countermeasure — the action | Owner | By when |
|---|---|---|---|---|---|
| 1 | 수작업(as-is)과 비교할 기준을 정하지 않아, 데모는 작동했지만 사람 투입 대비 무엇이 나아졌는지 증명하지 못했다. 평가도 우리가 익숙한 시나리오로 우리끼리 했다. | **10월 18일까지** 리드 1건 처리시간, 일정 시간 내 처리 가능한 고객 수, 선별 판단 일치도 등 비교 지표와 평가용 시나리오가 문서화되지 않았다. 또는 구현에 사용한 시나리오를 그대로 평가에도 쓰고 있다. | 수작업 baseline을 먼저 측정할 지표 2~3개를 정하고, 구현에 사용하지 않은 평가용 고객 시나리오를 별도로 만든다. 동일한 시나리오를 수작업과 Agent 방식으로 각각 수행해 시간·처리량·판단 결과를 기록한다. | 한민수 | 2026-10-18 |
| 2 | **(us)** 회사마다 다른 유망 고객 판단 방식과 데이터 정의를 합의하지 못하고 “일단 구현 후 맞추자”로 넘어가, 익숙한 사례에서만 그럴듯하게 작동했다. | **10월 18일까지** 유망 고객 판단 기준, 입력 데이터 정의, 공통 기준과 제품별 조정 기준이 한 문서에 정리되어 있지 않다. | 10월 11일 팀 미팅의 고정 아젠다로 선별 기준과 데이터 정의를 논의한다. 공통으로 사용할 기준과 제품·회사별로 조정 가능한 기준을 구분해 1차 문서로 만들고, 대표 고객 사례에 적용해 팀원 간 판단 차이를 확인한다. | 손영훈 | 2026-10-18 |
| 3 | Outbound/Inbound 컨셉과 디자인을 잡는 데 초반 시간을 너무 오래 써서 개발과 테스트 기간이 부족했다. | 같은 컨셉·기능 논의가 **2회 이상 반복**되거나, 세부 기능·UI·신규 기능이 계속 추가되거나, 개발 담당자가 의사결정을 기다린다. 특히 **10월 11일까지 MVP 범위와 하나의 end-to-end 핵심 flow가 확정되지 않았다.** | Must/Should/Could로 scope를 구분하고 하나의 end-to-end flow를 먼저 확정한다. 주요 논점마다 decision deadline을 두고, deadline 내 합의되지 않으면 PM이 MVP 원칙에 따라 결정한다. 이후 추가 아이디어는 backlog로 이동하고, 매주 남은 개발·테스트 기간을 기준으로 scope를 점검한다. | 홍하경 | 2026-10-11 |

## Revision log

| Date | What changed and why |
|---|---|
| 2026-10-05 | Draft for consultation |
| 2026-10-05 | Merged individual premortems, documented single-person risks, and drafted three action items for team confirmation |
| 2026-10-15 | Updated 홍하경's file path to docs/premortem/hakyung.md and cause count to 8 after the revised premortem was committed |
---

Method note: Gary Klein, "Performing a Project Premortem", Harvard Business Review, September 2007.
