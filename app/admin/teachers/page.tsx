"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Teacher = { id: string; name: string | null };

type Availability = {
  id: string;
  teacher_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  device_type: string;
  is_active: boolean;
  effective_from: string | null;
  effective_until: string | null;
};

const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"];

function hhmm(t: string) {
  return String(t ?? "").slice(0, 5);
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMonthsYmd(baseYmd: string, months: number) {
  const d = new Date(`${baseYmd}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildHourOptions() {
  const arr: string[] = [];
  for (let h = 0; h <= 23; h++) arr.push(`${String(h).padStart(2, "0")}:00`);
  return arr;
}
const HOUR_OPTIONS = buildHourOptions();

function toMin(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

type DeviceType = "both" | "controller" | "turntable";

function deviceTypeLabel(v: string) {
  if (v === "both") return "컨트롤러+턴테이블";
  if (v === "controller") return "컨트롤러";
  if (v === "turntable") return "턴테이블";
  return v;
}

export default function AdminTeachersPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [isMobile, setIsMobile] = useState(false);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");

  const [rows, setRows] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekday, setWeekday] = useState<number>(1);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("18:00");
  const [deviceType, setDeviceType] = useState<DeviceType>("both");

  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayYmd());
  const [effectiveUntil, setEffectiveUntil] = useState<string>(addMonthsYmd(todayYmd(), 6));

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const loadTeachers = async () => {
    if (!(await ensureLoggedIn())) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id,name")
      .ilike("role", "teacher")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      alert(error.message ?? "강사 목록 조회 실패");
      setTeachers([]);
      return;
    }

    const list = (data ?? []) as Teacher[];
    setTeachers(list);
    setTeacherId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return list[0]?.id ?? "";
    });
  };

  const loadAvailabilities = async (tid: string) => {
    if (!tid) return;
    if (!(await ensureLoggedIn())) return;

    setLoading(true);
    try {
      const j = await adminFetch(`/api/admin/teacher-availabilities?teacherId=${encodeURIComponent(tid)}`, {
        method: "GET",
      });

      const list = Array.isArray(j?.rows) ? (j.rows as Availability[]) : [];
      setRows(list);
    } catch (e: any) {
      alert(e?.message ?? "근무시간 조회 실패");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    loadAvailabilities(teacherId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  const addRow = async () => {
    if (!teacherId) return;
    if (!(await ensureLoggedIn())) return;

    if (!effectiveFrom || !effectiveUntil) {
      alert("기간(시작일/종료일)을 선택해줘!");
      return;
    }
    if (effectiveFrom > effectiveUntil) {
      alert("기간 오류: 시작일이 종료일보다 늦어요.");
      return;
    }
    if (toMin(startTime) >= toMin(endTime)) {
      alert("시간 오류: 시작시간은 종료시간보다 빨라야 해요.");
      return;
    }

    try {
      await adminFetch(`/api/admin/teacher-availabilities`, {
        method: "POST",
        body: JSON.stringify({
          teacherId,
          weekday,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
          slotMinutes: 60,
          isActive: true,
          deviceType,
          effectiveFrom,
          effectiveUntil,
        }),
      });

      await loadAvailabilities(teacherId);
    } catch (e: any) {
      alert(e?.message ?? "추가 실패");
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    if (!(await ensureLoggedIn())) return;

    try {
      await adminFetch(`/api/admin/teacher-availabilities`, {
        method: "PATCH",
        body: JSON.stringify({
          id,
          isActive: next,
        }),
      });

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
    } catch (e: any) {
      alert(e?.message ?? "토글 실패");
    }
  };

  const removeRow = async (id: string) => {
    if (!confirm("삭제할까요?")) return;
    if (!(await ensureLoggedIn())) return;

    try {
      await adminFetch(`/api/admin/teacher-availabilities`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });

      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.message ?? "삭제 실패");
    }
  };

  const selectedTeacherName = useMemo(() => {
    return teachers.find((t) => t.id === teacherId)?.name ?? "(이름 없음)";
  }, [teachers, teacherId]);

  const endTimeOptions = useMemo(() => {
    const s = toMin(startTime);
    return HOUR_OPTIONS.filter((t) => toMin(t) > s);
  }, [startTime]);

  const activeCount = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.filter((r) => !r.is_active).length;

  return (
    <AdminLayoutShell title="강사 근무시간 관리">
      <div style={{ width: "100%", maxWidth: 1100, minWidth: 0, color: "#111" }}>
        {/* 강사 선택 */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>강사 선택</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(240px, 320px) auto 1fr",
              gap: 10,
              alignItems: "center",
            }}
          >
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              style={{ ...controlStyle, width: "100%" }}
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.id}
                </option>
              ))}
            </select>

            <button
              onClick={() => teacherId && loadAvailabilities(teacherId)}
              style={{
                ...ghostButton,
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
            >
              새로고침
            </button>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #ececec",
                background: "#fafafa",
                fontSize: 14,
                fontWeight: 800,
                color: "#333",
              }}
            >
              선택됨: <b style={{ color: "#111" }}>{selectedTeacherName}</b>
            </div>
          </div>
        </section>

        <div style={{ height: 14 }} />

        {/* 상단 요약 */}
        <section style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(0, 180px))",
              gap: 10,
            }}
          >
            <StatCard label="등록 수" value={rows.length} />
            <StatCard label="활성" value={activeCount} />
            <StatCard label="비활성" value={inactiveCount} />
          </div>
        </section>

        <div style={{ height: 14 }} />

        {/* 근무시간 추가 */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>정규 근무시간 추가</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <Field label="요일">
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                style={{ ...controlStyle, width: "100%" }}
              >
                {weekdayLabel.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d}요일
                  </option>
                ))}
              </select>
            </Field>

            <Field label="시작 시간">
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ ...controlStyle, width: "100%" }}
              >
                {HOUR_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="종료 시간">
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ ...controlStyle, width: "100%" }}
              >
                {endTimeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="기기">
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                style={{ ...controlStyle, width: "100%" }}
              >
                <option value="both">컨트롤러+턴테이블</option>
                <option value="controller">컨트롤러</option>
                <option value="turntable">턴테이블</option>
              </select>
            </Field>

            <Field label="기간 시작">
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                style={{ ...controlStyle, width: "100%" }}
              />
            </Field>

            <Field label="기간 종료">
              <input
                type="date"
                value={effectiveUntil}
                onChange={(e) => setEffectiveUntil(e.target.value)}
                style={{ ...controlStyle, width: "100%" }}
              />
            </Field>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={addRow}
              style={{
                ...darkButton,
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
            >
              추가
            </button>

            <div style={{ color: "#666", fontSize: 13 }}>
              * slotMinutes는 현재 <b>60분</b>으로 고정이에요.
            </div>
          </div>
        </section>

        <div style={{ height: 14 }} />

        {/* 등록 목록 */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>등록된 근무시간</div>

          {loading ? (
            <p style={{ color: "#111" }}>불러오는 중...</p>
          ) : rows.length === 0 ? (
            <p style={{ color: "#666" }}>등록된 근무시간이 없습니다.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 14,
                    padding: 14,
                    background: "#fff",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: isMobile ? 15 : 16,
                          color: "#111",
                          lineHeight: 1.45,
                        }}
                      >
                        {weekdayLabel[r.weekday]}요일 · {hhmm(r.start_time)} ~ {hhmm(r.end_time)}
                      </div>

                      <div style={{ color: "#555", fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
                        기간: <b style={{ color: "#111" }}>{r.effective_from ?? "-"} ~ {r.effective_until ?? "-"}</b>
                        <br />
                        기기: <b style={{ color: "#111" }}>{deviceTypeLabel(r.device_type)}</b> · 슬롯:{" "}
                        <b style={{ color: "#111" }}>{r.slot_minutes}분</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.is_active ? (
                        <span style={badgeSuccess}>활성</span>
                      ) : (
                        <span style={badgeWarn}>비활성</span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr 1fr" : "max-content max-content",
                      gap: 8,
                    }}
                  >
                    <button
                      onClick={() => toggleActive(r.id, !r.is_active)}
                      style={{
                        ...ghostButton,
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      {r.is_active ? "비활성화" : "활성화"}
                    </button>

                    <button
                      onClick={() => removeRow(r.id)}
                      style={{
                        ...dangerGhostButton,
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayoutShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#444" }}>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #ececec",
        borderRadius: 14,
        background: "#fafafa",
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#111" }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 16,
  background: "#fff",
  padding: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 1000,
  color: "#111",
  marginBottom: 12,
};

const controlStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  boxSizing: "border-box",
};

const ghostButton: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const darkButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const dangerGhostButton: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #f0c9c9",
  background: "#fff",
  color: "#b42318",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const badgeSuccess: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#ecfdf3",
  color: "#027a48",
  border: "1px solid #abefc6",
  fontSize: 12,
  fontWeight: 900,
};

const badgeWarn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#fff7ed",
  color: "#b54708",
  border: "1px solid #fed7aa",
  fontSize: 12,
  fontWeight: 900,
};