// Keep in sync with the .csv files in this directory.
// Used by index.html when opened directly via file:// (avoids fetch CORS restriction).

var FIXTURE_CRM = `contact_email,contact_name,company,date,channel,rep_name,outcome_note,source_id
bjh@cloudworks.io,박지훈,클라우드웍스,2026-07-15,email,김민수,가격 제안서 요청. 3주 내 검토 예정이라고 함.,crm-001
bjh@cloudworks.io,박지훈,클라우드웍스,2026-08-03,call,김민수,연결 안 됨. 다음 주 재연락 요청.,crm-002
lsj@smartsales.kr,이수진,스마트세일즈,2026-06-01,meeting,최준호,제품 소개 미팅. 이메일 마케팅 도구에 관심 있음.,crm-003`;

var FIXTURE_SLACK = `date,sender_name,recipient_email,customer_name,company,message_text,source_id
2026-09-10,박지현,,최민준,주식회사 핀테크허브,@김민수 핀테크허브 최민준 CTO님 Q1 예산 확정되면 1월에 다시 보자고 하셨어요,slack-001
2026-09-12,이지은,bjh@cloudworks.io,박지훈,클라우드웍스,박지훈님 어제 미팅 잘 됐어요. 다음 달 파일럿 논의하기로 했습니다.,slack-002`;

var FIXTURE_EMAIL = `date,from_email,to_email,subject,body_snippet,source_id
2026-08-20,lsj@smartsales.kr,sales@ourcompany.kr,RE: CRM 솔루션 데모 요청,데모 잘 봤습니다. 내부 검토 후 연락드리겠습니다.,email-001
2026-09-05,sales@ourcompany.kr,lsj@smartsales.kr,팔로업: 도입 검토 현황,안녕하세요 이수진님. 혹시 검토 현황이 어떻게 되시나요?,email-002
2026-09-20,bjh@cloudworks.io,sales@ourcompany.kr,파일럿 제안서 검토 결과,내부 검토 결과 긍정적입니다. 다음 주 계약 논의 가능할지요?,email-003`;
