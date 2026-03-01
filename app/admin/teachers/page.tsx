"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { createBrowserClient } from "@supabase/ssr";

type Teacher = { id: string; name: string | null };

type Availability = {
  id: string;
  teacher_id: string;
  weekday: number;
  start_time: string; // "HH:mm:ss"
  end_time: string; // "HH:mm:ss"
  slot_minutes: number;
  device_type: string; // "both" | "controller" | "turntable"
  is_active: boolean;
  effective_from: string | null; // "YYYY-MM-DD"
  effective_until: string | null; // "YYYY-MM-DD"
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

// ✅ 60분 단위 옵션
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

export default function AdminTeachersPage() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");

  const [rows, setRows] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  // 입력 폼
  const [weekday, setWeekday] = useState<number>(1);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("18:00");
  const [deviceType, setDeviceType] = useState<DeviceType>("both");

  // ✅ 기간(기본값: 오늘~6개월 후)
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayYmd());
  const [effectiveUntil, setEffectiveUntil] = useState<string>(addMonthsYmd(todayYmd(), 6));

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
  // Load teachers (profiles_public)
  // --------------------------
  const loadTeachers = async () => {
    if (!(await ensureLoggedIn())) return;

    // role이 대소문자/공백 섞이면 ilike로 바꾸는 게 안전함
    const { data, error } = await supabase
      .from("profiles_public")
      .select("id,name")
      .ilike("role", "teacher")
      .order("name", { ascending: true });

    if (error) {
      alert(error.message ?? "강사 목록 조회 실패");
      setTeachers([]);
      return;
    }

    const list = (data ?? []) as Teacher[];
    setTeachers(list);
    if (!teacherId && list.length > 0) setTeacherId(list[0].id);
  };

  // --------------------------
  // Load availabilities (USE ADMIN ROUTE)
  // --------------------------
  const loadAvailabilities = async (tid: string) => {
    if (!tid) return;
    if (!(await ensureLoggedIn())) return;

    setLoading(true);
    try {
      // ✅ route는 teacherId 파라미터를 씀
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

  // --------------------------
  // Add row (USE ADMIN ROUTE POST)
  // --------------------------
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
          slotMinutes: 60, // ✅ 고정
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

  // --------------------------
  // Toggle active (USE ADMIN ROUTE PATCH)
  // --------------------------
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

  // --------------------------
  // Remove row (USE ADMIN ROUTE DELETE)
  // --------------------------
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

  return (
    <AdminLayoutShell title="강사 근무시간 관리">
      <div style={{ maxWidth: 980, color: "#111" }}>
        <h3 style={{ marginTop: 0 }}>강사 선택</h3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              minWidth: 220,
            }}
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

          <span style={{ color: "#555" }}>
            선택됨: <b style={{ color: "#111" }}>{selectedTeacherName}</b>
          </span>
        </div>

        <hr style={{ margin: "18px 0", borderColor: "#eee" }} />

        <h3>정규 근무시간 추가</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
            }}
          >
            {weekdayLabel.map((d, idx) => (
              <option key={idx} value={idx}>
                {d}요일
              </option>
            ))}
          </select>

          <label style={{ color: "#111" }}>
            시작{" "}
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                minWidth: 120,
              }}
            >
              {HOUR_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label style={{ color: "#111" }}>
            종료{" "}
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                minWidth: 120,
              }}
            >
              {endTimeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <select
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value as DeviceType)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
            }}
          >
            <option value="both">컨트롤러+턴테이블</option>
            <option value="controller">컨트롤러</option>
            <option value="turntable">턴테이블</option>
          </select>

          <label style={{ color: "#111" }}>
            기간 시작{" "}
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
              }}
            />
          </label>

          <label style={{ color: "#111" }}>
            기간 종료{" "}
            <input
              type="date"
              value={effectiveUntil}
              onChange={(e) => setEffectiveUntil(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
              }}
            />
          </label>

          <button
            onClick={addRow}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            추가
          </button>
        </div>

        <p style={{ color: "#666", marginTop: 8 }}>* slotMinutes는 현재 60분으로 고정이에요.</p>

        <hr style={{ margin: "18px 0", borderColor: "#eee" }} />

        <h3>등록된 근무시간</h3>

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
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  color: "#111",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {weekdayLabel[r.weekday]}요일 · {hhmm(r.start_time)} ~ {hhmm(r.end_time)} · {r.slot_minutes}분
                  </div>
                  <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                    기간:{" "}
                    <b style={{ color: "#111" }}>
                      {r.effective_from ?? "-"} ~ {r.effective_until ?? "-"}
                    </b>
                  </div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
                    상태: {r.is_active ? "활성" : "비활성"} · 기기: {r.device_type}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleActive(r.id, !r.is_active)}
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
                    {r.is_active ? "비활성화" : "활성화"}
                  </button>

                  <button
                    onClick={() => removeRow(r.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      color: "#111",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayoutShell>
  );
}