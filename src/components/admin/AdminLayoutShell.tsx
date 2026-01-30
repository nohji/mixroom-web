"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminShell from "@/components/AdminShell";

const items = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 등록/현황" },
  { href: "/admin/classes", label: "수강권/레슨 생성" },
  { href: "/admin/teachers", label: "강사 근무시간" },
  { href: "/admin/lessons", label: "레슨 현황" },
  { href: "/admin/lesson-change-status", label: "레슨 변경 현황" },
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
          gridTemplateColumns: "220px 1fr",
          gap: 16,
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
                    border: active
                      ? "1px solid #111"
                      : "1px solid #e5e5e5",
                    background: active ? "#f5f5f5" : "#fff",
                    fontWeight: active ? 700 : 500,
                    color: "#111",
                    transition: "background 0.15s ease",
                  }}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main style={{ color: "#111" }}>{children}</main>
      </div>
    </AdminShell>
  );
}
