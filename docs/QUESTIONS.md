# QUESTIONS.md

Team: 13조
Last updated: 2026-10-04

Your biggest open questions about this project.
Write this together, after the premortem merge.

At most five, most important first.
The consultation opens with question 1, so put the one you are least sure about there, not the one that is easiest to ask.

Write in Korean or English.
Keep the headings exactly as they are.

---

## What counts as an open question

- **The answer would change what you do next.** If every possible answer leaves your next two weeks the same, it is curiosity, not an open question.
- **It is specific to this project.** "Is our idea good?" cannot be answered in 30 minutes. "We assume the person in `PROJECT.md` will enter data by hand every day, and none of us has asked one. How do we test that in a week?" can.
- **You have already tried something.** Say what you think the answer is today, even if it is a guess. A question with a guess attached gets a much better answer than a bare one.

Two good places to look for questions:

- `docs/PREMORTEM.md` — a cause of failure you could not find a countermeasure for is a question.
- `docs/PROJECT.md` — the section you argued about longest, or the one where you wrote "nobody yet".

## Our questions

### 1. 실제 고객 접촉에는 회사 승인이 필요해서 AI가 모의 고객 역할을 하는 방식으로 테스트하기로 했는데, 이것이 이 수업의 "실제 사용자 피드백"으로 인정되는가? 아니라면 누구에게, 언제까지, 어떤 방식으로 테스트해야 하는가?

- **Why it matters:** AI 모의 고객 테스트로 충분하다면, 모의 고객 시나리오와 평가 기준을 다듬는 데 집중하고 기능 범위를 그 테스트에 맞춘다. 충분하지 않다면, 지금 바로 팀원들의 네트워크에서 현업 SDR 2~3명을 섭외해 인계 자료를 직접 써 보게 하는 일정을 따로 잡아야 한다.
- **What we think today:** 팀원 회사에서 바로 테스트할 수 있는 SaaS SDR 환경이 확실하지 않고, 실제 고객 접촉에는 회사 승인이 필요해서 AI가 모의 고객 역할을 하는 방식으로 테스트하기로 했다. 다만 병합 프리모템에서 "실제 고객 계정, 데이터, 발송 승인, 참여할 SDR을 확보하지 못해 팀원끼리만 테스트했다"(2번, 2명)가 나왔고, 개인 리스트에는 "기획서의 '모의 실험으로 비교한다'는 문장이 유저 테스트를 미루는 면죄부가 됐다"는 원인도 있었다. 또 받는 고객이 AI 영업을 거부하는 문제(12번)와 현업 SDR이 AI 인계 자료를 믿지 않는 문제(13번)는 사람이 직접 써 봐야만 발견된다. 그래서 AI 모의 고객만으로 이 리스크들을 확인할 수 있는지 확신이 없다. 보완책으로 AI를 통해 가상의 SDR을 만들어 인계 자료를 테스트하는 방안도 생각하고 있다.
- **Who could answer it:** 교수님 / 팀원 회사의 SDR·영업 담당자 / 외부 SaaS 기업의 현업 SDR

### 2. 팀에 개발 경험자가 없어 AI가 만든 코드를 리뷰하고 고칠 사람이 없는데, 이 수업에서 "작동하는 에이전트"로 인정받으려면 완성도를 어디까지 가져가야 하고, 기존 툴을 연결하는 방식도 괜찮은가?

- **Why it matters:** 기존 툴 연결 방식이 인정된다면, 직접 구현보다 SDR의 판단 로직(고객 선별 기준, 인계 자료 구성)을 다듬는 데 시간을 쓰겠다. 직접 구현이 기대된다면, 난도가 높은 기능을 범위에서 빼고 AI 코드를 설명하고 수정할 책임자 한 명과 학습 시간을 먼저 확보해야 한다.
- **What we think today:** 병합 프리모템에서 "백엔드나 개발 경험자가 없어 AI가 만든 코드를 리뷰하고 고치지 못했고, 기존 툴을 연결하는 기초 수준에서 멈췄다"(7번, 2명)와 "전체 흐름을 연결하고 AI 코드를 설명·수정할 책임자를 정하지 않았다"(6번, 2명)가 함께 나왔다. 또 "5개 기능과 실시간 음성까지 다 된다고 낙관했다"(3번, 2명)도 나와서, 기획서의 5개 기능을 모두 직접 구현하기는 어렵다고 보고 있다. 다만 어디까지 줄여야 하는지는 정하지 못했다. 현재는 바이브 코딩 경험이 있는 팀원이 코드리뷰 QA를 맡는 방안을 생각하고 있다.
- **Who could answer it:** 교수님 / 만들어 봐야 앎 (10/10 첫 빌드 이후)

### 3. 컨셉 설계(Outbound/Inbound)와 고객 정의에 시간을 얼마나 쓰고 언제 빌드로 넘어가야 하는가? 10/10 첫 빌드 전에 최소한 무엇까지 확정해야 하는가?

- **Why it matters:** 빠르게 만들면서 고치는 것이 맞다면, 10/10 전까지 한 방향(Outbound 또는 Inbound)과 최소 흐름 하나만 정하고 바로 빌드에 들어간다. 고객 정의를 먼저 깊이 해야 한다면, 10/17까지 세그먼트(고객 규모, 경쟁사, 현황)와 선별 기준 정리에 시간을 쓰고 빌드 시작을 늦춘다.
- **What we think today:** 병합 프리모템에서 "Outbound/Inbound 컨셉과 디자인을 잡는 데 초반 시간을 너무 오래 써서 개발과 테스트 기간이 부족했다"(14번)와 "SaaS 세그먼트 조사를 얕게 해서 고객 문제와 세일즈 내러티브를 뾰족하게 만들지 못했다"(10번)가 서로 반대 방향으로 나왔다. 오래 토론했지만 팀 안에서 결론을 내지 못했다(아래 Where we disagree 참고).
- **Who could answer it:** 교수님 / 만들어 봐야 앎

## Where we disagree

**3번 질문**에 대해 팀 안에서 답이 다르다.

- **"초반 설계를 줄이고 빨리 만들어야 한다"** (14번에서 나온 관점): 컨셉과 디자인을 잡는 데 시간을 오래 쓰면 개발과 테스트 기간이 부족해진다. 방향을 하나 정하고 만들면서 고치는 편이 낫다.
- **"고객 정의를 먼저 깊이 해야 한다"** (10번에서 나온 관점): 세그먼트 조사가 얕은 상태로 만들면 고객 문제와 세일즈 내러티브가 뾰족해지지 않고, 결국 고객 정의가 늦게 정해져 다시 만들게 된다.

---

## After the consultation

Fill this in within a week of your slot.

| # | What we heard | What we will do about it | Owner | By when |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Revision log

| Date | What changed and why |
|---|---|
| 2026-10-04 | Draft for consultation |
