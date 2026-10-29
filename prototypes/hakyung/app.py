"""중복 걸러내기 P0 화면. 실행: python -m streamlit run app.py"""

import io
from datetime import date

import pandas as pd
import streamlit as st

from dedup import HISTORY_COLUMNS, NEW_LEAD_COLUMNS, judge


def read_table(upload) -> pd.DataFrame:
    """CSV(UTF-8 또는 한글 엑셀이 저장하는 CP949)나 엑셀 파일을 모두 문자열로 읽는다."""
    if upload.name.lower().endswith((".xlsx", ".xls")):
        table = pd.read_excel(upload, dtype=str, keep_default_na=False)
    else:
        raw = upload.getvalue()
        for encoding in ("utf-8-sig", "cp949"):
            try:
                table = pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("CSV 인코딩을 읽지 못했습니다. UTF-8이나 CP949로 저장해 주세요.")
    table.columns = [str(column).strip() for column in table.columns]
    return table


def missing_columns(table: pd.DataFrame, required) -> list:
    return [column for column in required if column not in table.columns]


def to_excel(table: pd.DataFrame) -> bytes:
    buffer = io.BytesIO()
    table.to_excel(buffer, index=False)
    return buffer.getvalue()


st.set_page_config(page_title="중복 걸러내기", layout="wide")
st.title("중복 걸러내기")
st.caption("새 리드 리스트를 과거 접촉 이력과 대조해, 같은 사람·같은 회사에 두 번 연락하는 일을 막습니다. "
           "파일은 이 컴퓨터 안에서만 처리하고 외부로 보내지 않습니다.")

left, right = st.columns(2)
with left:
    new_upload = st.file_uploader("새 리드 리스트 (CSV·엑셀)", type=["csv", "xlsx", "xls"])
    st.caption("필요한 컬럼: " + ", ".join(NEW_LEAD_COLUMNS))
with right:
    history_upload = st.file_uploader("과거 접촉 이력 (CSV·엑셀)", type=["csv", "xlsx", "xls"])
    st.caption("필요한 컬럼: " + ", ".join(HISTORY_COLUMNS))

options_left, options_right = st.columns(2)
with options_left:
    window_days = st.number_input("차단 기준 기간 (일)", min_value=1, max_value=3650, value=90, step=1)
with options_right:
    today = st.date_input("기준일", value=date.today())

if not (new_upload and history_upload):
    st.info("두 파일을 모두 올리면 판정 결과가 나옵니다.")
    st.stop()

try:
    new_table, history_table = read_table(new_upload), read_table(history_upload)
except Exception as error:  # 화면에 이유를 보여주고 멈춘다
    st.error(f"파일을 읽지 못했습니다: {error}")
    st.stop()

problems = []
for label, table, required in [("새 리드 리스트", new_table, NEW_LEAD_COLUMNS),
                               ("과거 접촉 이력", history_table, HISTORY_COLUMNS)]:
    missing = missing_columns(table, required)
    if missing:
        problems.append(f"{label}에 {', '.join(missing)} 컬럼이 없습니다. (지금 컬럼: {', '.join(table.columns)})")
if problems:
    for problem in problems:
        st.error(problem)
    st.stop()

results = judge(new_table.to_dict("records"), history_table.to_dict("records"), today, int(window_days))
output = new_table.copy()
output["판정"] = [result.verdict for result in results]
output["이유"] = [result.reason for result in results]
output["겹친 기록"] = [result.overlap for result in results]

st.download_button(
    "결과 엑셀 받기",
    data=to_excel(output),
    file_name=f"중복확인_{today.isoformat()}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    type="primary",
)
st.dataframe(output, use_container_width=True, hide_index=True)
