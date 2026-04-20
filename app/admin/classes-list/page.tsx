"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authFetch } from "@/lib/authFetch";

type ClassListRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  student_phone?: string | null;
  class_type: string | null;
  total_lessons: number | null;

  first_lesson_date: string | null;
  last_lesson_date: string | null;
  lessons_count: number | null;

  created_at: string;

  change_count?: number | null;
  forced_change_count?: number | null;
  practice_hours?: number | null;
  admin_note?: string | null;

  fixed_weekday?: number | null;
  fixed_lesson_time?: string | null;
  fixed_room_name?: string | null;
  teacher_name?: string | null;
  device_type?: string | null;

  voucher_valid_from?: string | null;
  voucher_valid_until?: string | null;
  practice_open_from?: string | null;
};

function classTypeLabel(type: string | null, device?: string | null) {
  let typeLabel = "알 수 없음";

  if (type) {
    const t = type.toLowerCase();
    if (t.includes("1month")) typeLabel = "1개월";
    else if (t.includes("3month")) typeLabel = "3개월";
    else typeLabel = type;
  }

  let deviceLabel = "";

  if (device) {
    const d = device.toLowerCase();
    if (d === "controller") deviceLabel = "컨트롤러";
    else if (d === "turntable") deviceLabel = "턴테이블";
    else if (d === "both") deviceLabel = "혼합";
  }

  return deviceLabel ? `${deviceLabel} ${typeLabel}` : typeLabel;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function formatPeriod(from?: string | null, to?: string | null) {
  return `${formatDate(from)} ~ ${formatDate(to)}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

function weekdayLabel(n?: number | null) {
  const map = ["일", "월", "화", "수", "목", "금", "토"];
  if (n == null || n < 0 || n > 6) return "-";
  return map[n];
}

function ymd(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function isOverlapRange(
  rowStart: string | null | undefined,
  rowEnd: string | null | undefined,
  filterFrom: string,
  filterTo: string
) {
  const start = ymd(rowStart);
  const end = ymd(rowEnd);

  if (!filterFrom && !filterTo) return true;
  if (!start && !end) return false;

  const safeStart = start || end;
  const safeEnd = end || start;

  if (filterFrom && safeEnd < filterFrom) return false;
  if (filterTo && safeStart > filterTo) return false;

  return true;
}

const DESKTOP_GRID = "220px 290px 80px 90px 80px 95px 105px 130px 180px";

export default function AdminClassesListPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<ClassListRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [memoStudentId, setMemoStudentId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  const [extendingId, setExtendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("admin_class_list")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as ClassListRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const studentKeyword = studentFilter.trim().toLowerCase();

    return rows.filter((r) => {
      const studentName = (r.student_name ?? "").toLowerCase();
      const studentPhone = (r.student_phone ?? "").toLowerCase();
      const classId = (r.id ?? "").toLowerCase();
      const studentId = (r.student_id ?? "").toLowerCase();
      const teacherName = (r.teacher_name ?? "").toLowerCase();

      const keywordOk =
        !keyword ||
        studentName.includes(keyword) ||
        studentPhone.includes(keyword) ||
        teacherName.includes(keyword) ||
        classId.includes(keyword) ||
        studentId.includes(keyword);

      const studentOk =
        !studentKeyword ||
        studentName.includes(studentKeyword) ||
        studentPhone.includes(studentKeyword);

      const periodOk = isOverlapRange(
        r.first_lesson_date,
        r.last_lesson_date,
        periodFrom,
        periodTo
      );

      return keywordOk && studentOk && periodOk;
    });
  }, [rows, q, studentFilter, periodFrom, periodTo]);

  const openDelete = (id: string) => {
    setDeletingId(id);
    setConfirmText("");
  };

  const closeDelete = () => {
    setDeletingId(null);
    setConfirmText("");
  };

  const doDelete = async () => {
    if (!deletingId) return;

    if (confirmText.trim().toUpperCase() !== "DELETE") {
      alert('확인 문구로 "DELETE"를 입력해줘.');
      return;
    }

    const res = await authFetch(`/api/admin/classes/${deletingId}/purge`, {
      method: "POST",
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error ?? "삭제 실패");
      return;
    }

    closeDelete();
    alert("삭제되었습니다.");
    await load();
  };

  const deletingRow = useMemo(
    () => (deletingId ? rows.find((r) => r.id === deletingId) ?? null : null),
    [deletingId, rows]
  );

  const resetFilters = () => {
    setQ("");
    setStudentFilter("");
    setPeriodFrom("");
    setPeriodTo("");
  };

  const openMemo = (row: ClassListRow) => {
    setMemoStudentId(row.student_id);
    setMemoText(row.admin_note ?? "");
  };

  const closeMemo = () => {
    setMemoStudentId(null);
    setMemoText("");
    setSavingMemo(false);
  };

  const saveMemo = async () => {
    if (!memoStudentId) return;

    setSavingMemo(true);

    const res = await authFetch(`/api/admin/students/${memoStudentId}/note`, {
      method: "PATCH",
      body: JSON.stringify({
        admin_note: memoText,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error ?? "메모 저장 실패");
      setSavingMemo(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.student_id === memoStudentId
          ? { ...row, admin_note: json.admin_note ?? "" }
          : row
      )
    );

    setSavingMemo(false);
    closeMemo();
  };

  const extendPracticePeriod = async (classId: string, days: number) => {
    const ok = confirm(`연습실 오픈 시작일을 ${days}일 더 앞당길까요?`);
    if (!ok) return;

    setExtendingId(classId);

    const res = await authFetch(`/api/admin/classes/${classId}/extend`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error ?? "기간 변경 실패");
      setExtendingId(null);
      return;
    }

    alert(`연습실 기간이 앞쪽으로 ${days}일 열렸습니다.`);
    setExtendingId(null);
    await load();
  };

  return (
    <AdminLayoutShell title="수강권 목록">
      <div style={{ maxWidth: 1650 }}>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
            display: "grid",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="학생명 / 번호 / 담당선생님 / id 검색"
              style={filterInput(320)}
            />

            <input
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              placeholder="수강생 이름/번호 필터"
              style={filterInput(220)}
            />

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>
                수업기간
              </span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                style={dateInput()}
              />
              <span style={{ color: "#888", fontWeight: 900 }}>~</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                style={dateInput()}
              />
            </div>

            <button onClick={load} style={primaryBtn()}>
              새로고침
            </button>

            <button onClick={resetFilters} style={ghostBtn()}>
              필터 초기화
            </button>

            <div
              style={{
                marginLeft: "auto",
                color: "#666",
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {loading ? "불러오는 중..." : `총 ${filtered.length}개`}
            </div>
          </div>
        </div>

        <div className="admin-classes-desktop">
          <div
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fff",
              overflowX: "auto",
            }}
          >
            <div style={{ minWidth: 1480 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: DESKTOP_GRID,
                  borderBottom: "1px solid #eee",
                  background: "#fafafa",
                }}
              >
                {[
                  "학생(번호)",
                  "수강/연습실 기간",
                  "고정요일",
                  "고정시간",
                  "고정홀",
                  "레슨변경수",
                  "강제변경수",
                  "담당선생님",
                  "관리",
                ].map((h) => (
                  <div
                    key={h}
                    style={{
                      padding: "12px 12px",
                      fontWeight: 1000,
                      fontSize: 12,
                      color: "#666",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {filtered.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: DESKTOP_GRID,
                    borderBottom: "1px solid #f2f2f2",
                    alignItems: "center",
                  }}
                >
                  <div style={{ padding: "12px 12px", fontWeight: 1000, minWidth: 0 }}>
                    <div
                      style={{
                        color: "#111",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.student_name ?? "알 수 없음"}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "#888",
                        fontWeight: 900,
                        marginTop: 2,
                        wordBreak: "break-all",
                      }}
                    >
                      {r.student_phone ?? r.student_id}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: r.admin_note ? "#444" : "#aaa",
                        fontWeight: 900,
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {r.admin_note?.trim() ? `메모: ${r.admin_note}` : "메모 없음"}
                    </div>
                  </div>

                  <div style={{ padding: "12px 12px", fontWeight: 1000, minWidth: 0 }}>
                    <div
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#111",
                      }}
                      title={classTypeLabel(r.class_type, r.device_type)}
                    >
                      {classTypeLabel(r.class_type, r.device_type)}
                    </div>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 6, lineHeight: 1.35 }}>
                      수강권: {formatPeriod(r.voucher_valid_from, r.voucher_valid_until)}
                    </div>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.35 }}>
                      연습실: {formatPeriod(r.practice_open_from ?? r.voucher_valid_from, r.voucher_valid_until)}
                    </div>
                  </div>

                  <div style={cellStrong()}>{weekdayLabel(r.fixed_weekday)}</div>

                  <div style={cellStrong()}>{formatTime(r.fixed_lesson_time)}</div>

                  <div style={cellStrong()}>{r.fixed_room_name ?? "-"}</div>

                  <div style={cellStrong()}>{r.change_count ?? 0}회</div>

                  <div style={cellStrong()}>{r.forced_change_count ?? 0}회</div>

                  <div
                    style={{
                      ...cellStrong(),
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={r.teacher_name ?? "-"}
                  >
                    {r.teacher_name ?? "-"}
                  </div>

                  <div
                    style={{
                      padding: "12px 12px",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      minWidth: 0,
                    }}
                  >
                    <button onClick={() => openMemo(r)} style={smallGhostBtn()}>
                      메모
                    </button>

                    <button
                      onClick={() => extendPracticePeriod(r.id, 7)}
                      style={smallGhostBtn()}
                      disabled={extendingId === r.id}
                    >
                      {extendingId === r.id ? "처리중..." : "앞 +7일"}
                    </button>

                    <button
                      onClick={() => navigator.clipboard.writeText(r.id)}
                      style={smallGhostBtn()}
                      title="class id 복사"
                    >
                      ID 복사
                    </button>

                    <button
                      onClick={() => openDelete(r.id)}
                      style={smallDangerBtn()}
                    >
                      완전 삭제
                    </button>

                    <div
                      style={{
                        width: "100%",
                        fontSize: 11,
                        color: "#999",
                        fontWeight: 900,
                        wordBreak: "break-all",
                        marginTop: 2,
                      }}
                    >
                      {r.id}
                    </div>
                  </div>
                </div>
              ))}

              {!loading && filtered.length === 0 && (
                <div style={{ padding: 16, color: "#666", fontWeight: 900 }}>
                  데이터가 없어요.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="admin-classes-mobile" style={{ gap: 10 }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: "#fff",
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 1100, color: "#111" }}>
                  {r.student_name ?? "알 수 없음"}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#888",
                    fontWeight: 900,
                    wordBreak: "break-all",
                  }}
                >
                  {r.student_phone ?? r.student_id}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: r.admin_note ? "#444" : "#aaa",
                    fontWeight: 900,
                    lineHeight: 1.4,
                  }}
                >
                  {r.admin_note?.trim() ? `메모: ${r.admin_note}` : "메모 없음"}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #f1f1f1",
                  borderRadius: 10,
                  padding: 10,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontSize: 11, color: "#666", fontWeight: 1000 }}>수강권타입</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "#111", fontWeight: 1100 }}>
                  {classTypeLabel(r.class_type, r.device_type)}
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: "#666", fontWeight: 1000 }}>
                  수강권 기간
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#111", fontWeight: 1000 }}>
                  {formatPeriod(r.voucher_valid_from, r.voucher_valid_until)}
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: "#666", fontWeight: 1000 }}>
                  연습실 기간
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#111", fontWeight: 1000 }}>
                  {formatPeriod(r.practice_open_from ?? r.voucher_valid_from, r.voucher_valid_until)}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <MobileInfoBox label="고정요일" value={weekdayLabel(r.fixed_weekday)} />
                <MobileInfoBox label="고정시간" value={formatTime(r.fixed_lesson_time)} />
                <MobileInfoBox label="고정홀" value={r.fixed_room_name ?? "-"} />
                <MobileInfoBox label="레슨변경수" value={`${r.change_count ?? 0}회`} />
                <MobileInfoBox label="강제변경수" value={`${r.forced_change_count ?? 0}회`} />
                <MobileInfoBox label="담당선생님" value={r.teacher_name ?? "-"} />
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: "#999",
                  fontWeight: 900,
                  wordBreak: "break-all",
                }}
              >
                {r.id}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => openMemo(r)} style={smallGhostBtn()}>
                  메모
                </button>

                <button
                  onClick={() => extendPracticePeriod(r.id, 7)}
                  style={smallGhostBtn()}
                  disabled={extendingId === r.id}
                >
                  {extendingId === r.id ? "처리중..." : "앞 +7일"}
                </button>

                <button
                  onClick={() => navigator.clipboard.writeText(r.id)}
                  style={smallGhostBtn()}
                >
                  ID 복사
                </button>
                <button
                  onClick={() => openDelete(r.id)}
                  style={smallDangerBtn()}
                >
                  완전 삭제
                </button>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 && (
            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                background: "#fff",
                padding: 16,
                color: "#666",
                fontWeight: 900,
              }}
            >
              데이터가 없어요.
            </div>
          )}
        </div>
      </div>

      {deletingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={closeDelete}
        >
          <div
            style={{
              width: "min(560px, 96vw)",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #eee",
              padding: 14,
              boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 1100, fontSize: 14 }}>수강권 완전 삭제</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#666",
                fontWeight: 900,
                lineHeight: "18px",
              }}
            >
              이 작업은 되돌릴 수 없어요.
              수강권 + 레슨 + 변경요청 + 연습실 이용권/예약/크레딧 기록까지 모두 삭제됩니다.
            </div>

            {deletingRow && (
              <div
                style={{
                  marginTop: 10,
                  border: "1px solid #f0f0f0",
                  borderRadius: 12,
                  padding: 10,
                  background: "#fafafa",
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <div><b>학생</b>: {deletingRow.student_name ?? "알 수 없음"}</div>
                <div><b>번호</b>: {deletingRow.student_phone ?? deletingRow.student_id}</div>
                <div><b>수강권</b>: {classTypeLabel(deletingRow.class_type, deletingRow.device_type)}</div>
                <div><b>수강권 기간</b>: {formatPeriod(deletingRow.voucher_valid_from, deletingRow.voucher_valid_until)}</div>
                <div><b>연습실 기간</b>: {formatPeriod(deletingRow.practice_open_from ?? deletingRow.voucher_valid_from, deletingRow.voucher_valid_until)}</div>
                <div><b>고정요일</b>: {weekdayLabel(deletingRow.fixed_weekday)}</div>
                <div><b>고정시간</b>: {formatTime(deletingRow.fixed_lesson_time)}</div>
                <div><b>고정홀</b>: {deletingRow.fixed_room_name ?? "-"}</div>
                <div><b>레슨변경</b>: {deletingRow.change_count ?? 0}회</div>
                <div><b>강제변경</b>: {deletingRow.forced_change_count ?? 0}회</div>
                <div><b>담당선생님</b>: {deletingRow.teacher_name ?? "-"}</div>
                <div><b>class_id</b>: {deletingRow.id}</div>
              </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 1000 }}>
                확인 문구로 <b>DELETE</b> 를 입력해줘.
              </div>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  outline: "none",
                  fontWeight: 1000,
                }}
              />
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={closeDelete} style={ghostBtn()}>
                취소
              </button>
              <button onClick={doDelete} style={dangerBtn()}>
                완전 삭제 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {memoStudentId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={closeMemo}
        >
          <div
            style={{
              width: "min(560px, 96vw)",
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #eee",
              padding: 14,
              boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 1100, fontSize: 14 }}>학생 메모</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#666",
                fontWeight: 900,
                lineHeight: "18px",
              }}
            >
              관리자용 메모예요. 학생 관련 특이사항, 연락 선호, 운영 메모 등을 남길 수 있어요.
            </div>

            <textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="예) 야간 가능 / 변경 잦음 / 연락은 카카오 선호"
              rows={8}
              style={{
                width: "100%",
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #ddd",
                outline: "none",
                resize: "vertical",
                fontWeight: 900,
                lineHeight: 1.5,
              }}
            />

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={closeMemo} style={ghostBtn()}>
                취소
              </button>
              <button
                onClick={saveMemo}
                disabled={savingMemo}
                style={{
                  ...primaryBtn(),
                  opacity: savingMemo ? 0.7 : 1,
                  cursor: savingMemo ? "not-allowed" : "pointer",
                }}
              >
                {savingMemo ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-classes-desktop {
          display: block;
        }
        .admin-classes-mobile {
          display: none;
        }

        @media (max-width: 900px) {
          .admin-classes-desktop {
            display: none;
          }
          .admin-classes-mobile {
            display: grid;
            gap: 10;
          }
        }
      `}</style>
    </AdminLayoutShell>
  );
}

function MobileInfoBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #f1f1f1",
        borderRadius: 10,
        padding: 10,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 11, color: "#666", fontWeight: 1000 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, color: "#111", fontWeight: 1100 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 3, fontSize: 11, color: "#888", fontWeight: 900 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function filterInput(width: number): React.CSSProperties {
  return {
    width,
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
    fontWeight: 900,
  };
}

function dateInput(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
    fontWeight: 900,
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  };
}

function dangerBtn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ffdddd",
    background: "#fff5f5",
    cursor: "pointer",
    fontWeight: 1100,
    color: "#b00020",
  };
}

function smallGhostBtn(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  };
}

function smallDangerBtn(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ffdddd",
    background: "#fff5f5",
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 12,
    color: "#b00020",
  };
}

function cellStrong(): React.CSSProperties {
  return {
    padding: "12px 12px",
    fontWeight: 1000,
  };
}