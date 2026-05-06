"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

const teacherMenus = [
  { href: "/teacher/schedule", label: "주간 스케줄" },
  { href: "/teacher/fixed-schedules", label: "고정스케줄" },
];

export default function TeacherShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell title={title}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {teacherMenus.map((menu) => {
          const active =
            pathname === menu.href || pathname.startsWith(`${menu.href}/`);

          return (
            <Link
              key={menu.href}
              href={menu.href}
              style={{
                padding: "9px 14px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 900,
                fontSize: 14,
                border: active ? "1px solid #111" : "1px solid #d4d4d4",
                background: active ? "#111" : "#fff",
                color: active ? "#fff" : "#111",
              }}
            >
              {menu.label}
            </Link>
          );
        })}
      </div>

      {children}
    </AppShell>
  );
}