"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StudentTopNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/student/lesson-change", label: "레슨" },
    { href: "/student/practice", label: "연습실" },
    { href: "/student/guide", label: "필독사항" },
  ] as const;

  return (
    <div
      style={{
        border: "1px solid #d7dbe0",
        background: "#fff",
        borderRadius: 14,
        padding: 8,
        display: "flex",
        gap: 8,
      }}
    >
      {tabs.map((t) => {
        const active =
          pathname === t.href ||
          pathname.startsWith(t.href);

        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "10px 0",
              borderRadius: 12,
              border: active ? "1px solid #111" : "1px solid transparent",
              background: active ? "#111" : "#fff",
              color: active ? "#fff" : "#111",
              fontWeight: 1100,
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}