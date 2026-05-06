"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TeacherShell from "@/components/TeacherShell";
import { authFetch } from "@/lib/authFetch";

type FixedScheduleRow = {
  id: string;
  weekday: number;
  lesson_time: string;
  student_id: string | null;
  student_name: string;
  room_id: string | null;
  room_name: string;
  hold_for_renewal: boolean;
  memo: string | null;
};

type ApiResponse = {
  teacher: { id: string; name: string };
  schedules: FixedScheduleRow[];
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const TIMES = Array.from({ length: 11 }).map((_, i) => 13 + i);

function normalizeRoomName(name: string | null | undefined) {
  const s = String(name ?? "").trim();
  if (!s) return "";
  if (s.includes("A")) return "A홀";
  if (s.includes("B")) return "B홀";
  if (s.includes("C")) return "C홀";
  return s;
}

function hourOf(time: string | null | undefined) {
  const h = Number(String(time ?? "").slice(0, 2));
  return Number.isFinite(h) ? h : null;
}

function hhmm(time: string | null | undefined) {
  return String(time ?? "").slice(0, 5);
}

export default function TeacherFixedSchedulesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 760);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const res = await authFetch("/api/teacher/fixed-schedules");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json.error ?? "고정스케줄 조회 실패");
        setData(null);
        return;
      }

      setData(json as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const schedules = data?.schedules ?? [];
  const teacherName = data?.teacher?.name ?? "강사";

  const byCell = useMemo(() => {
    const map = new Map<string, FixedScheduleRow[]>();

    for (const row of schedules) {
      const h = hourOf(row.lesson_time);
      if (h == null) continue;

      const key = `${row.weekday}|${h}`;
      const arr = map.get(key) ?? [];
      arr.push(row);
      arr.sort((a, b) => hhmm(a.lesson_time).localeCompare(hhmm(b.lesson_time)));
      map.set(key, arr);
    }

    return map;
  }, [schedules]);

  return (
    <TeacherShell title="내 고정스케줄">
      <div style={{ padding: isMobile ? "8px 0" : "12px 0", maxWidth: 1400 }}>
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: isMobile ? 18 : 20,
                fontWeight: 1000,
                color: "#111",
              }}
            >
              고정스케줄표
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: isMobile ? 12 : 13,
                color: "#666",
                fontWeight: 800,
              }}
            >
              {loading ? "불러오는 중..." : `${teacherName} 선생님 기준`}
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            style={{
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              borderRadius: 10,
              padding: isMobile ? "8px 11px" : "9px 13px",
              fontWeight: 900,
              cursor: "pointer",
              fontSize: isMobile ? 12 : 13,
            }}
          >
            새로고침
          </button>
        </div>

        {isMobile && (
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 800,
            }}
          >
            ← 좌우로 밀어서 전체 요일을 확인할 수 있어요.
          </div>
        )}

        <div
          style={{
            border: "1px solid #d4d4d4",
            borderRadius: isMobile ? 12 : 14,
            overflow: "auto",
            background: "#fff",
            boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div style={{ minWidth: isMobile ? 720 : 980 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${isMobile ? 44 : 70}px repeat(${
                  DISPLAY_DAYS.length
                }, 1fr)`,
              }}
            >
              <div style={topBlankStyle} />

              <div
                style={{
                  gridColumn: `span ${DISPLAY_DAYS.length}`,
                  background: "#e5e7eb",
                  borderBottom: "1px solid #d1d5db",
                  borderLeft: "1px solid #d4d4d4",
                  padding: isMobile ? "8px 6px" : "11px 10px",
                  textAlign: "center",
                  fontSize: isMobile ? 15 : 20,
                  fontWeight: 1000,
                  color: "#111",
                }}
              >
                {teacherName} / 고정스케줄
              </div>

              <div
                style={{
                  ...timeHeaderStyle,
                  minHeight: isMobile ? 34 : 42,
                  fontSize: isMobile ? 11 : 14,
                }}
              >
                시간
              </div>

              {DISPLAY_DAYS.map((day) => (
                <div
                  key={day}
                  style={{
                    ...dayHeaderStyle,
                    minHeight: isMobile ? 34 : 42,
                    fontSize: isMobile ? 13 : 18,
                  }}
                >
                  {DOW[day]}
                </div>
              ))}

              {TIMES.map((hour) => (
                <Row key={hour} hour={hour} byCell={byCell} isMobile={isMobile} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </TeacherShell>
  );
}

function Row({
  hour,
  byCell,
  isMobile,
}: {
  hour: number;
  byCell: Map<string, FixedScheduleRow[]>;
  isMobile: boolean;
}) {
  return (
    <>
      <div
        style={{
          ...timeCellStyle,
          minHeight: isMobile ? 42 : 54,
          fontSize: isMobile ? 13 : 20,
        }}
      >
        {hour}
      </div>

      {DISPLAY_DAYS.map((day) => {
        const rows = byCell.get(`${day}|${hour}`) ?? [];

        return (
          <div
            key={`${day}-${hour}`}
            style={{
              ...cellStyle,
              minHeight: isMobile ? 42 : 54,
              padding: isMobile ? 2 : 5,
            }}
          >
            {rows.length > 0 && (
              <div style={{ display: "grid", gap: isMobile ? 2 : 5 }}>
                {rows.map((row) => (
                  <ScheduleChip key={row.id} row={row} isMobile={isMobile} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ScheduleChip({
  row,
  isMobile,
}: {
  row: FixedScheduleRow;
  isMobile: boolean;
}) {
  const room = normalizeRoomName(row.room_name);

  return (
    <div
      title={row.memo ?? ""}
      style={{
        borderRadius: isMobile ? 6 : 8,
        padding: isMobile ? "3px 4px" : "6px 7px",
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        color: "#111",
        fontWeight: 900,
        lineHeight: 1.15,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: isMobile ? 10 : 14,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {hourOf(row.lesson_time)}시 {row.student_name}
        {room ? ` ${room}` : ""}
      </div>

      {row.memo && (
        <div
          style={{
            marginTop: 2,
            fontSize: isMobile ? 8 : 11,
            color: "#6b7280",
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.memo}
        </div>
      )}
    </div>
  );
}

const topBlankStyle: React.CSSProperties = {
  gridColumn: "1",
  gridRow: "1",
  background: "#fff",
  borderRight: "1px solid #d4d4d4",
  borderBottom: "1px solid #d4d4d4",
};

const timeHeaderStyle: React.CSSProperties = {
  background: "#f3f4f6",
  borderRight: "1px solid #d4d4d4",
  borderBottom: "1px solid #d4d4d4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  color: "#111",
};

const dayHeaderStyle: React.CSSProperties = {
  background: "#e5e7eb",
  borderRight: "1px solid #d4d4d4",
  borderBottom: "1px solid #d4d4d4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  color: "#111",
};

const timeCellStyle: React.CSSProperties = {
  background: "#fff",
  borderRight: "1px solid #d4d4d4",
  borderBottom: "1px solid #d4d4d4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  color: "#111",
};

const cellStyle: React.CSSProperties = {
  background: "#fff",
  borderRight: "1px solid #d4d4d4",
  borderBottom: "1px solid #d4d4d4",
};