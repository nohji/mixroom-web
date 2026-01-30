"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";
import { ui, pageTitle, sectionTitle, mutedText } from "@/styles/ui";

type UserRow = {
  id: string;
  role: "student" | "teacher" | "admin";
  name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string | null;
};

function normalizePhone(input: string) {
  return input.replace(/\D/g, "");
}

type MustChangeFilter = "all" | "must" | "done";

export default function AdminUsersPage() {
  // 생성 폼
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"student" | "teacher" | "admin">("student");
  const [createMsg, setCreateMsg] = useState("");

  // 리스트
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 필터
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [mustFilter, setMustFilter] = useState<MustChangeFilter>("all"); // ✅ 추가

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("role", roleFilter);
    // ✅ 서버가 이 파라미터를 지원하지 않아도 문제없게 "프론트 필터"로 처리할거라 굳이 안보내도 됨
    // qs.set("must", mustFilter);

    const res = await authFetch(`/api/admin/list-users?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "사용자 목록 조회 실패");
      setRows([]);
    } else {
      setRows((data.rows ?? []) as UserRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createUser = async () => {
    setCreateMsg("");
    const phoneDigits = normalizePhone(phone);

    if (!name.trim()) return setCreateMsg("이름을 입력해줘!");
    if (!phoneDigits) return setCreateMsg("휴대폰 번호를 입력해줘!");
    if (phoneDigits.length < 10 || phoneDigits.length > 11)
      return setCreateMsg("휴대폰 번호는 10~11자리!");

    const res = await authFetch("/api/admin/create-user", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        phone: phoneDigits,
        role,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateMsg(data.error ?? "생성 실패");
      return;
    }

    setCreateMsg(`생성 완료! (${data.role}) / 초기비번: 0000`);
    setName("");
    setPhone("");
    setRole("student");
    await load();
  };

  // ✅ must_change_password 필터는 프론트에서 적용 (서버 수정 없이 바로 동작)
  const filteredRows = useMemo(() => {
    if (mustFilter === "all") return rows;
    if (mustFilter === "must") return rows.filter((r) => r.must_change_password);
    return rows.filter((r) => !r.must_change_password);
  }, [rows, mustFilter]);

  const stats = useMemo(() => {
    const students = rows.filter((r) => r.role === "student").length;
    const teachers = rows.filter((r) => r.role === "teacher").length;
    const admins = rows.filter((r) => r.role === "admin").length;
    const mustChange = rows.filter((r) => r.must_change_password).length;
    return { students, teachers, admins, mustChange };
  }, [rows]);

  return (
    <AdminLayoutShell title="사용자 등록/관리">
      <div style={{ maxWidth: 980, padding: 0 }}>
        {/* 등록 폼 */}
        <section style={ui.card}>
          <h3 style={sectionTitle}>사용자 생성</h3>

          <div style={ui.row}>
            <input
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={ui.input}
            />

            <input
              placeholder="휴대폰 (하이픈 없이 입력 가능)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              style={{ ...ui.input, minWidth: 240 }}
            />

            <select value={role} onChange={(e) => setRole(e.target.value as any)} style={ui.select}>
              <option value="student">수강생</option>
              <option value="teacher">강사</option>
              <option value="admin">관리자</option>
            </select>

            <button onClick={createUser} style={ui.button}>
              생성
            </button>
          </div>

          {createMsg && <p style={{ marginTop: 10, color: "#111" }}>{createMsg}</p>}

          <p style={{ marginTop: 8, ...mutedText }}>
            • 휴대폰으로 로그인하지만 내부적으로는 email을 자동 생성해서 사용해요. <br />
            • 최초 로그인 후 비밀번호 변경 강제(must_change_password=true).
          </p>
        </section>

        {/* 현황 */}
        <section style={{ marginTop: 16 }}>
          <div style={ui.card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: "#111", fontWeight: 800 }}>
                현황: 수강생 {stats.students} / 강사 {stats.teachers} / 관리자 {stats.admins} / 최초비번미변경{" "}
                {stats.mustChange}
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  placeholder="이름/휴대폰 검색"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={ui.input}
                />

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  style={ui.select}
                >
                  <option value="all">전체 역할</option>
                  <option value="student">수강생</option>
                  <option value="teacher">강사</option>
                  <option value="admin">관리자</option>
                </select>

                {/* ✅ 추가: 최초비번 변경 여부 필터 */}
                <select
                  value={mustFilter}
                  onChange={(e) => setMustFilter(e.target.value as MustChangeFilter)}
                  style={ui.select}
                >
                  <option value="all">최초비번 변경: 전체</option>
                  <option value="must">미변경만</option>
                  <option value="done">변경완료만</option>
                </select>

                <button onClick={load} style={ui.buttonSubtle}>
                  조회
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {loading ? (
                <p style={{ color: "#111" }}>불러오는 중...</p>
              ) : filteredRows.length === 0 ? (
                <p style={{ color: "#111" }}>사용자가 없습니다.</p>
              ) : (
                <div style={ui.tableWrap}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        {["이름", "역할", "휴대폰", "최초비번변경", "생성일", "id"].map((h) => (
                          <th key={h} style={ui.th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id}>
                          <td style={ui.td}>{r.name ?? "-"}</td>
                          <td style={ui.td}>{r.role}</td>
                          <td style={ui.td}>{r.phone ?? "-"}</td>
                          <td style={ui.td}>
                            {r.must_change_password ? (
                              <span style={ui.badgeWarn}>미변경</span>
                            ) : (
                              <span style={ui.badgeSuccess}>완료</span>
                            )}
                          </td>
                          <td style={ui.td}>{r.created_at ? r.created_at.slice(0, 10) : "-"}</td>
                          <td style={{ ...ui.td, fontSize: 12, color: "#555" }}>{r.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 8, ...mutedText }}>
                ※ “최초비번 변경 여부” 필터는 지금은 프론트에서만 필터링해요(서버 수정 없이 즉시 적용).
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminLayoutShell>
  );
}
