"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { authFetch } from "@/lib/authFetch";

type ClassListRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  class_type: string | null;
  total_lessons: number | null;
  first_lesson_date: string | null;
  last_lesson_date: string | null;
  lessons_count: number | null;
  created_at: string;
};

function classTypeLabel(t: string | null) {
  if (!t) return "알 수 없음";
  const s = t.toLowerCase();
  if (s.includes("1month")) return "1개월";
  if (s.includes("3month")) return "3개월";
  return t;
}

export default function AdminClassesListPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<ClassListRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = async () => {
    setLoading(true);

    // ✅ view에서 한 방에 가져오기
    let query = supabase
      .from("admin_class_list")
      .select("*")
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      alert(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const name = (r.student_name ?? "").toLowerCase();
      const id = (r.id ?? "").toLowerCase();
      return name.includes(s) || id.includes(s);
    });
  }, [rows, q]);

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

  return (
    <AdminLayoutShell title="수강권 목록">
      <div style={{ maxWidth: 1200 }}>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fff",
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="학생명 또는 class id 검색"
            style={{
              width: 320,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              outline: "none",
              fontWeight: 900,
            }}
          />
          <button
            onClick={load}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            새로고침
          </button>

          <div style={{ marginLeft: "auto", color: "#666", fontSize: 13, fontWeight: 900 }}>
            {loading ? "불러오는 중..." : `총 ${filtered.length}개`}
          </div>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 140px 110px 220px 110px 1fr", borderBottom: "1px solid #eee" }}>
            {["학생", "수강권", "레슨", "기간", "생성일", "액션"].map((h) => (
              <div key={h} style={{ padding: "12px 12px", fontWeight: 1000, fontSize: 12, color: "#666" }}>
                {h}
              </div>
            ))}
          </div>

          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "220px 140px 110px 220px 110px 1fr",
                borderBottom: "1px solid #f2f2f2",
                alignItems: "center",
              }}
            >
              <div style={{ padding: "12px 12px", fontWeight: 1000 }}>
                {r.student_name ?? "알 수 없음"}
                <div style={{ fontSize: 11, color: "#888", fontWeight: 900, marginTop: 2 }}>
                  {r.student_id}
                </div>
              </div>

              <div style={{ padding: "12px 12px", fontWeight: 1000 }}>
                {classTypeLabel(r.class_type)}
                <div style={{ fontSize: 11, color: "#888", fontWeight: 900, marginTop: 2 }}>
                  총 {r.total_lessons ?? "-"}회
                </div>
              </div>

              <div style={{ padding: "12px 12px", fontWeight: 1000 }}>
                {r.lessons_count ?? 0}개
              </div>

              <div style={{ padding: "12px 12px", fontWeight: 1000 }}>
                {(r.first_lesson_date ?? "-") + " ~ " + (r.last_lesson_date ?? "-")}
              </div>

              <div style={{ padding: "12px 12px", fontWeight: 1000, fontSize: 12, color: "#444" }}>
                {String(r.created_at).slice(0, 10)}
              </div>

              <div style={{ padding: "12px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {/* 상세 페이지 만들면 링크로 바꾸면 됨 */}
                <button
                  onClick={() => navigator.clipboard.writeText(r.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                  title="class id 복사"
                >
                  ID 복사
                </button>

                <button
                  onClick={() => openDelete(r.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ffdddd",
                    background: "#fff5f5",
                    cursor: "pointer",
                    fontWeight: 1000,
                    fontSize: 12,
                    color: "#b00020",
                  }}
                >
                  완전 삭제
                </button>

                <div style={{ fontSize: 11, color: "#999", fontWeight: 900 }}>
                  {r.id}
                </div>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: 16, color: "#666", fontWeight: 900 }}>데이터가 없어요.</div>
          )}
        </div>
      </div>

      {/* Delete modal */}
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
            <div style={{ marginTop: 8, fontSize: 12, color: "#666", fontWeight: 900, lineHeight: "18px" }}>
              이 작업은 되돌릴 수 없어요. classes + lessons + lesson_change_requests가 함께 삭제됩니다.
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
                <div><b>수강권</b>: {classTypeLabel(deletingRow.class_type)} · 총 {deletingRow.total_lessons ?? "-"}회</div>
                <div><b>레슨</b>: {deletingRow.lessons_count ?? 0}개</div>
                <div><b>기간</b>: {(deletingRow.first_lesson_date ?? "-") + " ~ " + (deletingRow.last_lesson_date ?? "-")}</div>
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
                placeholder='DELETE'
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
              <button
                onClick={closeDelete}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 1000,
                }}
              >
                취소
              </button>
              <button
                onClick={doDelete}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ffdddd",
                  background: "#fff5f5",
                  cursor: "pointer",
                  fontWeight: 1100,
                  color: "#b00020",
                }}
              >
                완전 삭제 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayoutShell>
  );
}
