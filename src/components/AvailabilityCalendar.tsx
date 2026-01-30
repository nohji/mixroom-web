"use client";

import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, parseISO } from "date-fns";

type SlotRow = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  source: "regular" | "open";
};

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export default function AvailabilityCalendar({
  teacherId,
  rangeDays = 365,
  onPick,
}: {
  teacherId: string;
  rangeDays?: number; // 기본 30일
  onPick?: (picked: { date: string; time: string }) => void;
}) {
  const [rows, setRows] = useState<SlotRow[]>([]);
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(false);

  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const to = useMemo(() => addDays(from, rangeDays), [from, rangeDays]);

  // date => slots[]
  const slotsByDate = useMemo(() => {
    const m = new Map<string, SlotRow[]>();
    for (const r of rows) {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    // 시간 정렬
    for (const [k, list] of m.entries()) {
      list.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      m.set(k, list);
    }
    return m;
  }, [rows]);

  const enabledDates = useMemo(() => {
    // 달력에서 활성화할 날짜들
    return Array.from(slotsByDate.keys()).map((d) => parseISO(d));
  }, [slotsByDate]);

  const selectedYmd = selected ? ymd(selected) : null;
  const selectedSlots = selectedYmd ? slotsByDate.get(selectedYmd) ?? [] : [];

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const res = await fetch(
        `/api/availability/teacher-slots?teacherId=${encodeURIComponent(
          teacherId
        )}&from=${encodeURIComponent(ymd(from))}&to=${encodeURIComponent(ymd(to))}`
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "가능 시간 조회 실패");
        setRows([]);
      } else {
        setRows((data.rows ?? []) as SlotRow[]);
      }
      setLoading(false);
    };
    run();
  }, [teacherId, from, to]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>가능 날짜 선택</div>

        <DayPicker
          mode="single"
          selected={selected}
          onSelect={setSelected}
          fromDate={from}
          toDate={to}
          disabled={(date) => {
            // “가능 슬롯이 없는 날짜”는 비활성화
            const k = ymd(date);
            return !slotsByDate.has(k);
          }}
          modifiers={{
            available: enabledDates,
          }}
          modifiersStyles={{
            available: { fontWeight: 700 },
          }}
        />

        <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
          {loading ? "가능 시간 불러오는 중..." : `가능 슬롯 날짜: ${slotsByDate.size}일`}
        </div>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          {selectedYmd ? `${selectedYmd} 가능한 시간` : "날짜를 선택하세요"}
        </div>

        {selectedYmd && selectedSlots.length === 0 && (
          <p style={{ color: "#666" }}>해당 날짜에 가능한 시간이 없습니다.</p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {selectedSlots.map((s) => (
            <button
              key={`${s.date}-${s.time}`}
              onClick={() => onPick?.({ date: s.date, time: s.time })}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 700 }}>{s.time}</span>
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 6px",
                  borderRadius: 999,
                  border: "1px solid #eee",
                  color: s.source === "open" ? "#b45309" : "#111",
                  background: s.source === "open" ? "#fff7ed" : "#f5f5f5",
                }}
              >
                {s.source === "open" ? "예외" : "정규"}
              </span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
          • 정규 = 근무시간 기반 자동 슬롯<br />
          • 예외 = 관리자가 따로 열어둔 슬롯
        </div>
      </div>
    </div>
  );
}
