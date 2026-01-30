// src/styles/ui.ts
// ✅ 기존 exports 유지하면서, 페이지/테이블/배지까지 확장한 버전

import type React from "react";

export const colors = {
  bg: "#ffffff",
  text: "#111111",
  textSub: "#555555",
  textMuted: "#777777",
  border: "#e5e5e5",

  danger: "#b00020",
  warning: "#b36b00",
  success: "#1a7f37",
};

/** 공통 박스 (섹션, 카드) */
export const boxStyle: React.CSSProperties = {
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 16,
};

/** 기본 버튼 (검정) */
export const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

/** 보조 버튼 (흰색) */
export const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
};

/** 비활성 버튼 */
export const disabledButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#f3f3f3",
  color: "#999",
  cursor: "not-allowed",
};

/** input 공통 */
export const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
};

/** select 공통 */
export const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

/** 페이지 제목 */
export const pageTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: colors.text,
};

/** 섹션 제목 */
export const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: colors.text,
};

/** 작은 설명 텍스트 */
export const mutedText: React.CSSProperties = {
  color: colors.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
};

/** ------------------------------
 * ✅ 추가 확장: ui 객체(내가 준 스타일 방식)
 * - 기존 style exports를 그대로 두고, 더 큰 단위의 레이아웃/테이블/배지까지 제공
 * ------------------------------ */
export const ui = {
  page: {
    maxWidth: 1100,
    padding: 24,
    color: colors.text,
    background: colors.bg,
  } as React.CSSProperties,

  card: {
    ...boxStyle,
    background: colors.bg,
  } as React.CSSProperties,

  row: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  } as React.CSSProperties,

  input: {
    ...inputStyle,
    outline: "none",
  } as React.CSSProperties,

  select: {
    ...selectStyle,
    outline: "none",
  } as React.CSSProperties,

  button: {
    ...primaryButton,
  } as React.CSSProperties,

  buttonSubtle: {
    ...secondaryButton,
    border: "1px solid #ddd",
  } as React.CSSProperties,

  badge: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #ddd",
    fontSize: 12,
    color: colors.text,
    background: "#fff",
  } as React.CSSProperties,

  badgeWarn: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #f1c1c1",
    fontSize: 12,
    color: colors.danger,
    background: "#fff5f5",
  } as React.CSSProperties,

  badgeSuccess: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #cbe9d3",
    fontSize: 12,
    color: colors.success,
    background: "#f2fbf5",
  } as React.CSSProperties,

  tableWrap: {
    overflowX: "auto",
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: "#fff",
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
  } as React.CSSProperties,

  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    color: colors.text,
    fontWeight: 800,
    fontSize: 13,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f3f3",
    color: colors.text,
    fontSize: 14,
    verticalAlign: "top",
  } as React.CSSProperties,

  muted: {
    color: colors.textMuted,
  } as React.CSSProperties,
};
