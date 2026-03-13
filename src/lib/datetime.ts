export function formatDateTimeKST(value: string | null | undefined) {
    if (!value) return "-";
  
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
  
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
  
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  }
  
  export function formatDateKST(value: string | null | undefined) {
    if (!value) return "-";
  
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
  
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  
    return `${get("year")}-${get("month")}-${get("day")}`;
  }