"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Teacher = {
  id: string;
  name: string | null;
};

type AvailabilityRow = {
  id: string;
  teacher_id: string;
  teacher_name: string;
  weekday: number;
  start_time: string; // "HH:mm:ss"
  end_time: string;   // "HH:mm:ss"
};

const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"];

function hhmm(t: string) {
  return String(t ?? "").slice(0, 5);
}

function toMin(t: string) {
  const [hh, mm] = hhmm(t).split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function buildHourOptions() {
  const arr: string[] = [];
  for (let h = 0; h <= 23; h++) arr.push(`${String(h).padStart(2, "0")}:00`);
  return arr;
}

const HOUR_OPTIONS = buildHourOptions();

// teacher_availability.weekday가 0~6(일~토)인지 1~7(월~일)인지 둘 다 흡수
function normalizeWeekday(v: number) {
  if (v === 7) return 0;
  return v;
}

function hourCovered(startTime: string, endTime: string, hourText: string) {
  const target = toMin(hourText);
  const start = toMin(startTime);
  const end = toMin(endTime);
  return target >= start && target < end;
}

export default function AdminTeacherSchedulePage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("all");

  // --------------------------
  // Auth helpers
  // --------------------------
  const ensureLoggedIn = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      alert("로그인이 필요합니다.");
      return false;
    }
    return true;
  };

  const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const adminFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    if (!token) throw new Error("세션 토큰이 없습니다. 다시 로그인해 주세요.");

    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j?.error ?? `HTTP_${res.status}`);
    }
    return j;
  };

  // --------------------------
  // Load schedule
  // --------------------------
  const loadSchedule = useCallback(async () => {
    if (!(await ensureLoggedIn())) return;

    setLoading(true);
    try {
      const j = await adminFetch("/api/admin/teachers/schedule", {
        method: "GET",
      });

      setTeachers(Array.isArray(j?.teachers) ? (j.teachers as Teacher[]) : []);
      setRows(Array.isArray(j?.rows) ? (j.rows as AvailabilityRow[]) : []);
    } catch (e: any) {
      alert(e?.message ?? "강사 근무 현황 조회 실패");
      setTeachers([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const filteredRows = useMemo(() => {
    if (selectedTeacherId === "all") return rows;
    return rows.filter((r) => r.teacher_id === selectedTeacherId);
  }, [rows, selectedTeacherId]);

  const visibleTeachers = useMemo(() => {
    if (selectedTeacherId === "all") return teachers;
    return teachers.filter((t) => t.id === selectedTeacherId);
  }, [teachers, selectedTeacherId]);

  const scheduleHours = useMemo(() => {
    let minHour = 24;
    let maxHour = 0;

    for (const row of filteredRows) {
      const s = Number(hhmm(row.start_time).split(":")[0] ?? 0);
      const e = Number(hhmm(row.end_time).split(":")[0] ?? 0);
      minHour = Math.min(minHour, s);
      maxHour = Math.max(maxHour, e);
    }

    if (!filteredRows.length) {
      minHour = 12;
      maxHour = 23;
    }

    return HOUR_OPTIONS.filter((t) => {
      const hour = Number(t.split(":")[0] ?? 0);
      return hour >= minHour && hour < maxHour;
    });
  }, [filteredRows]);

  const getNamesAtCell = useCallback(
    (weekday: number, hourText: string) => {
      const names = filteredRows
        .filter((r) => normalizeWeekday(r.weekday) === weekday)
        .filter((r) => hourCovered(r.start_time, r.end_time, hourText))
        .map((r) => r.teacher_name);

      return Array.from(new Set(names));
    },
    [filteredRows]
  );

  const teacherSummary = useMemo(() => {
    return visibleTeachers.map((teacher) => {
      const teacherRows = rows
        .filter((r) => r.teacher_id === teacher.id)
        .sort((a, b) => {
          if (normalizeWeekday(a.weekday) !== normalizeWeekday(b.weekday)) {
            return normalizeWeekday(a.weekday) - normalizeWeekday(b.weekday);
          }
          return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
        });

      const summary = teacherRows.map((r) => ({
        id: r.id,
        label: `${weekdayLabel[normalizeWeekday(r.weekday)]}요일 · ${hhmm(r.start_time)} ~ ${hhmm(r.end_time)}`,
      }));

      return {
        teacher,
        summary,
      };
    });
  }, [rows, visibleTeachers]);

  return (
    <AdminLayoutShell title="강사 근무 현황">
      <div style={{ maxWidth: 1200, color: "#111" }}>
        <h3 style={{ marginTop: 0 }}>강사 근무 현황</h3>
        <p style={{ color: "#666", marginTop: 6 }}>
          요일 및 시간별로 등록된 강사 근무 가능 시간을 한눈에 볼 수 있어요.
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 16,
          }}
        >
          <select
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              minWidth: 220,
            }}
          >
            <option value="all">전체 강사</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ?? t.id}
              </option>
            ))}
          </select>

          <button
            onClick={loadSchedule}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              color: "#111",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            새로고침
          </button>
        </div>

        <hr style={{ margin: "18px 0", borderColor: "#eee" }} />

        <h3>강사별 요약</h3>

        {loading ? (
          <p style={{ color: "#111" }}>불러오는 중...</p>
        ) : teacherSummary.length === 0 ? (
          <p style={{ color: "#666" }}>등록된 강사가 없어요.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {teacherSummary.map(({ teacher, summary }) => (
              <div
                key={teacher.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                  color: "#111",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 10 }}>
                  {teacher.name ?? "(이름 없음)"}
                </div>

                {summary.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 13 }}>등록된 근무시간이 없습니다.</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {summary.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          fontSize: 13,
                          color: "#333",
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "#f8f8f8",
                        }}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <hr style={{ margin: "18px 0", borderColor: "#eee" }} />

        <h3>요일 × 시간표</h3>

        {loading ? (
          <p style={{ color: "#111" }}>불러오는 중...</p>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <div
              style={{
                minWidth: 980,
                display: "grid",
                gridTemplateColumns: "90px repeat(7, minmax(120px, 1fr))",
              }}
            >
              <div style={headCell(true)}>시간</div>
              {weekdayLabel.map((day, idx) => (
                <div key={idx} style={headCell()}>
                  {day}
                </div>
              ))}

              {scheduleHours.length === 0 ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 24,
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  등록된 근무시간이 없습니다.
                </div>
              ) : (
                scheduleHours.map((hourText) => (
                  <GridRow
                    key={hourText}
                    hourText={hourText}
                    getNamesAtCell={getNamesAtCell}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}

function GridRow({
  hourText,
  getNamesAtCell,
}: {
  hourText: string;
  getNamesAtCell: (weekday: number, hourText: string) => string[];
}) {
  return (
    <>
      <div style={timeCell()}>{hourText}</div>

      {Array.from({ length: 7 }).map((_, weekday) => {
        const names = getNamesAtCell(weekday, hourText);
        const empty = names.length === 0;

        return (
          <div
            key={`${weekday}-${hourText}`}
            style={{
              minHeight: 76,
              borderTop: "1px solid #eee",
              borderLeft: "1px solid #eee",
              padding: 8,
              background: empty ? "#fafafa" : "#fff",
            }}
          >
            {empty ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#bbb",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                -
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {names.map((name) => (
                  <div
                    key={name}
                    style={{
                      padding: "7px 9px",
                      borderRadius: 10,
                      background: "#111",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      lineHeight: 1.35,
                    }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function headCell(isFirst = false): React.CSSProperties {
  return {
    padding: "12px 10px",
    textAlign: "center",
    fontWeight: 800,
    fontSize: 14,
    color: "#111",
    background: "#fafafa",
    borderBottom: "1px solid #e5e5e5",
    borderLeft: isFirst ? "none" : "1px solid #e5e5e5",
  };
}

function timeCell(): React.CSSProperties {
  return {
    borderTop: "1px solid #eee",
    padding: "12px 8px",
    textAlign: "center",
    fontWeight: 800,
    fontSize: 13,
    color: "#111",
    background: "#fcfcfc",
  };
}