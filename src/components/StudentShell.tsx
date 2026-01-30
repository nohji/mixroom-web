"use client";

import AppShell from "@/components/AppShell";

export default function StudentShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <AppShell title={title}>{children}</AppShell>;
}
