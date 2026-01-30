"use client";

import LogoutButton from "@/components/LogoutButton";

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: 24, color: "#111", background: "#fff", minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, color: "#111" }}>{title}</h2>
        <LogoutButton />
      </div>

      {children}
    </div>
  );
}
