"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  { href: "/admin/practice-credits", label: "연습실 사용권 관리" },
];

export default function AdminLayoutShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth <= 900);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const sidebar = (
    <aside
      style={{
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 12,
        height: "fit-content",
        boxSizing: "border-box",
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
                padding: "12px 14px",
                borderRadius: 10,
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
  );

  return (
    <AdminShell title={title}>
      <div
        style={{
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* 모바일 상단 메뉴 버튼 */}
        {isMobile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ☰ 메뉴
            </button>

            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "#111",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
          </div>
        )}

        {/* 데스크탑: 2열 / 모바일: 본문만 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "220px minmax(0, 1fr)",
            gap: 16,
            minWidth: 0,
            alignItems: "start",
          }}
        >
          {!isMobile && sidebar}

          <main
            style={{
              color: "#111",
              minWidth: 0,
              width: "100%",
              overflow: "hidden",
            }}
          >
            {children}
          </main>
        </div>

        {/* 모바일 드로어 메뉴 */}
        {isMobile && menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 9999,
              display: "flex",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(320px, 84vw)",
                height: "100%",
                background: "#fff",
                borderRight: "1px solid #e5e5e5",
                padding: 12,
                boxSizing: "border-box",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800, color: "#111" }}>관리자 메뉴</div>

                <button
                  onClick={() => setMenuOpen(false)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    color: "#111",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  닫기
                </button>
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
                        padding: "12px 14px",
                        borderRadius: 10,
                        textDecoration: "none",
                        border: active ? "1px solid #111" : "1px solid #e5e5e5",
                        background: active ? "#f5f5f5" : "#fff",
                        fontWeight: active ? 700 : 500,
                        color: "#111",
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
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}