"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import TeacherShell from "@/components/TeacherShell";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  class_id: string;
  lesson_date: string;
  lesson_time: string;
  status: string;
  allow_change_override: boolean;
  room_id: string | null;
  student_name: string;
};

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysStr(base: string, days: number) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TeacherSchedulePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(addDaysStr(todayStr(), 30));

  // ✅ 달력 API에 필요한 teacherId(= 로그인 유저 id)
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const qs = new URLSearchParams();
    qs.set("from", from);
    qs.set("to", to);

    const res = await authFetch(`/api/teacher/my-lessons?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "레슨 조회 실패");
      setRows([]);
    } else {
      setRows((data.rows ?? []) as Row[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    // 1) teacherId 로드
    const loadTeacherId = async () => {
      const { data } = await supabase.auth.getUser();
      setTeacherId(data.user?.id ?? null);
    };

    loadTeacherId();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const key = r.lesson_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    // 날짜별 시간 정렬
    const entries = Array.from(map.entries());
    entries.forEach(([_, list]) => {
      list.sort((a, b) => `${a.lesson_date} ${a.lesson_time}`.localeCompare(`${b.lesson_date} ${b.lesson_time}`));
    });
    return entries;
  }, [rows]);

  return (
    <TeacherShell title="내 레슨">
      <div style={{ padding: 24, maxWidth: 980 }}>
        <h2 style={{ marginTop: 0 }}>강사: 내 레슨 목록</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            from{" "}
            <input value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 6 }} />
          </label>
          <label>
            to{" "}
            <input value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 6 }} />
          </label>
          <button onClick={load} style={{ padding: "6px 10px" }}>
            조회
          </button>
        </div>

        {loading ? (
          <p style={{ marginTop: 12 }}>불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p style={{ marginTop: 12 }}>해당 기간에 레슨이 없습니다.</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {grouped.map(([date, list]) => (
              <div key={date} style={{ marginBottom: 18 }}>
                <h4 style={{ margin: "0 0 8px 0" }}>{date}</h4>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {list.map((r) => (
                    <li key={r.id} style={{ marginBottom: 6 }}>
                      <b>{r.lesson_time}</b> · {r.student_name} · {r.status}{" "}
                      {r.allow_change_override ? <span style={{ color: "orange" }}>(예외ON)</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ✅ 구분선 */}
        <hr style={{ margin: "24px 0" }} />

        {/* ✅ 달력 UI 섹션 */}
        <h3 style={{ marginTop: 0 }}>📅 내 근무 기반 가능 시간(달력)</h3>
        <p style={{ color: "#666", marginTop: 6 }}>
          날짜를 누르면 해당 날짜에 가능한 시간 슬롯이 표시돼요. (정규/예외)
        </p>

        {!teacherId ? (
          <p>로그인 정보 확인 중...</p>
        ) : (
          <AvailabilityCalendar
            teacherId={teacherId}
            rangeDays={365}
            onPick={({ date, time }) => {
              // 지금은 선택 확인용 (다음 단계에서 “예외 슬롯 열기”나 “변경요청 승인/생성”에 연결)
              alert(`선택됨: ${date} ${time}`);
            }}
          />
        )}
      </div>
    </TeacherShell>
  );
}
