"use client";

import { useEffect, useMemo, useState } from "react";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";
import { authFetch } from "@/lib/authFetch";
import { ui, sectionTitle, mutedText } from "@/styles/ui";

type UserRow = {
  id: string;
  role: "student" | "teacher" | "admin";
  name: string | null;
  phone: string | null;
  must_change_password: boolean;
  created_at: string | null;

  // 휴면 관리
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_reason?: string | null;
};

function normalizePhone(input: string) {
  return input.replace(/\D/g, "");
}

type MustChangeFilter = "all" | "must" | "done";
type ActiveFilter = "all" | "active" | "inactive";

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
  const [mustFilter, setMustFilter] = useState<MustChangeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const load = async () => {
    setLoading(true);

    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("role", roleFilter);

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

    if (!name.trim()) {
      setCreateMsg("이름을 입력해줘!");
      return;
    }

    if (!phoneDigits) {
      setCreateMsg("휴대폰 번호를 입력해줘!");
      return;
    }

    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setCreateMsg("휴대폰 번호는 10~11자리!");
      return;
    }

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

  const toggleActive = async (id: string, next: boolean) => {
    const ok = confirm(
      next
        ? "이 계정을 다시 활성화할까요?"
        : "이 계정을 휴면 처리할까요?\n휴면 처리 시 로그인과 주요 기능 사용이 제한됩니다."
    );
    if (!ok) return;

    const res = await authFetch("/api/admin/users/activate", {
      method: "PATCH",
      body: JSON.stringify({
        userId: id,
        isActive: next,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error ?? "상태 변경 실패");
      return;
    }

    await load();
  };

  const filteredRows = useMemo(() => {
    let list = rows;

    if (mustFilter === "must") {
      list = list.filter((r) => r.must_change_password);
    } else if (mustFilter === "done") {
      list = list.filter((r) => !r.must_change_password);
    }

    if (activeFilter === "active") {
      list = list.filter((r) => r.is_active);
    } else if (activeFilter === "inactive") {
      list = list.filter((r) => !r.is_active);
    }

    return list;
  }, [rows, mustFilter, activeFilter]);

  const stats = useMemo(() => {
    const students = rows.filter((r) => r.role === "student").length;
    const teachers = rows.filter((r) => r.role === "teacher").length;
    const admins = rows.filter((r) => r.role === "admin").length;
    const mustChange = rows.filter((r) => r.must_change_password).length;
    const active = rows.filter((r) => r.is_active).length;
    const inactive = rows.filter((r) => !r.is_active).length;

    return {
      students,
      teachers,
      admins,
      mustChange,
      active,
      inactive,
    };
  }, [rows]);

  return (
    <AdminLayoutShell title="사용자 등록/관리">
      <div style={{ maxWidth: 1100, padding: 0 }}>
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

            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "student" | "teacher" | "admin")}
              style={ui.select}
            >
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
              <div style={{ color: "#111", fontWeight: 800, lineHeight: 1.5 }}>
                현황: 수강생 {stats.students} / 강사 {stats.teachers} / 관리자 {stats.admins} / 활성{" "}
                {stats.active} / 휴면 {stats.inactive} / 최초비번미변경 {stats.mustChange}
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
                  onChange={(e) => setRoleFilter(e.target.value as "all" | "student" | "teacher" | "admin")}
                  style={ui.select}
                >
                  <option value="all">전체 역할</option>
                  <option value="student">수강생</option>
                  <option value="teacher">강사</option>
                  <option value="admin">관리자</option>
                </select>

                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
                  style={ui.select}
                >
                  <option value="all">계정 상태: 전체</option>
                  <option value="active">활성만</option>
                  <option value="inactive">휴면만</option>
                </select>

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
                        {["이름", "역할", "휴대폰", "상태", "최초비번변경", "생성일", "휴면일", "관리", "id"].map(
                          (h) => (
                            <th key={h} style={ui.th}>
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.id}>
                          <td style={ui.td}>{r.name ?? "-"}</td>
                          <td style={ui.td}>{r.role}</td>
                          <td style={ui.td}>{r.phone ?? "-"}</td>

                          <td style={ui.td}>
                            {r.is_active ? (
                              <span style={ui.badgeSuccess}>활성</span>
                            ) : (
                              <span style={ui.badgeWarn}>휴면</span>
                            )}
                          </td>

                          <td style={ui.td}>
                            {r.must_change_password ? (
                              <span style={ui.badgeWarn}>미변경</span>
                            ) : (
                              <span style={ui.badgeSuccess}>완료</span>
                            )}
                          </td>

                          <td style={ui.td}>{r.created_at ? r.created_at.slice(0, 10) : "-"}</td>
                          <td style={ui.td}>{r.deactivated_at ? r.deactivated_at.slice(0, 10) : "-"}</td>

                          <td style={ui.td}>
                            <button
                              onClick={() => toggleActive(r.id, !r.is_active)}
                              style={ui.buttonSubtle}
                            >
                              {r.is_active ? "비활성화" : "활성화"}
                            </button>
                          </td>

                          <td style={{ ...ui.td, fontSize: 12, color: "#555" }}>{r.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 8, ...mutedText }}>
                ※ “최초비번 변경 여부”, “계정 상태” 필터는 현재 프론트에서만 필터링해요. <br />
                ※ 휴면 계정은 로그인과 주요 기능 사용이 제한되도록 서버/API 쪽에서도 함께 막아주는 게 좋아요.
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminLayoutShell>
  );
}