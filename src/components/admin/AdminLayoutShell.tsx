"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminShell from "@/components/AdminShell";

const items = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 등록/현황" },
  { href: "/admin/classes", label: "수강권/레슨 생성" },
  { href: "/admin/classes-list", label: "수강권 목록" },
  { href: "/admin/teachers", label: "강사 근무 시간 등록" },
  { href: "/admin/teachers/schedule", label: "강사 근무 현황" },
  { href: "/admin/lessons", label: "레슨 현황" },
  { href: "/admin/lesson-change-requests", label: "레슨변경 요청 관리" },
  { href: "/admin/practice-reservations", label: "연습실 요청 관리" },
];

export default function AdminLayoutShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AdminShell title={title}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)", // ✅ 핵심: minmax(0, 1fr)
          gap: 16,
          minWidth: 0, // ✅ 전체도 안전하게
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 12,
            height: "fit-content",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 12,
              color: "#111",
            }}
          >
            관리자 메뉴
          </div>

          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {items.map((it) => {
              const active = pathname === it.href;

              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    textDecoration: "none",
                    border: active ? "1px solid #111" : "1px solid #e5e5e5",
                    background: active ? "#f5f5f5" : "#fff",
                    fontWeight: active ? 700 : 500,
                    color: "#111",
                    transition: "background 0.15s ease",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main
          style={{
            color: "#111",
            minWidth: 0, // ✅ 핵심: 여기 없으면 가로 긴 자식이 레이아웃 깨뜨림
            overflow: "hidden", // ✅ 내부 스크롤은 children쪽에서 처리하게
          }}
        >
          {children}
        </main>
      </div>
    </AdminShell>
  );
}
