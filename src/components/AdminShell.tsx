"use client";

import AppShell from "@/components/AppShell";

export default function AdminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <AppShell title={title}>{children}</AppShell>;
}
