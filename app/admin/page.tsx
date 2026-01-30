// "use client";

// import { useEffect, useMemo, useState } from "react";
// import { supabase } from "@/lib/supabaseClient";

// type Lesson = {
//   id: string;
//   lesson_date: string; // YYYY-MM-DD
//   lesson_time: string; // HH:mm
//   status: string;
//   allow_change_override: boolean;
// };

// type ChangeRequest = {
//   id: string;
//   lesson_id: string;
//   student_id: string;
//   from_date: string;
//   from_time: string;
//   to_date: string;
//   to_time: string;
//   status: "pending" | "approved" | "rejected";
//   created_at: string;
// };

// export default function AdminPage() {
//   /** ------------------------------
//    *  1) 수강생 생성 (API 호출)
//    * ------------------------------ */
//   const [studentEmail, setStudentEmail] = useState("");
//   const [studentName, setStudentName] = useState("");
//   const [createStudentMsg, setCreateStudentMsg] = useState("");

//   const createStudent = async () => {
//     setCreateStudentMsg("");

//     const res = await fetch("/api/admin/create-student", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         email: studentEmail,
//         name: studentName,
//       }),
//     });

//     const result = await res.json().catch(() => ({}));

//     if (!res.ok) {
//       setCreateStudentMsg(result.error ?? "수강생 생성 실패");
//       return;
//     }

//     setCreateStudentMsg("수강생 등록 완료!");
//     setStudentEmail("");
//     setStudentName("");
//   };

//   /** ------------------------------
//    *  2) 수강권 생성 (API 호출)
//    *  - studentId를 profiles.id(uuid)로 넣어야 함
//    * ------------------------------ */
//   const [classStudentId, setClassStudentId] = useState("");
//   const [classType, setClassType] = useState<"1month" | "3month">("1month");
//   const [weekday, setWeekday] = useState(3); // 기본: 수요일
//   const [time, setTime] = useState("19:00");
//   const [createClassMsg, setCreateClassMsg] = useState("");

//   const createClass = async () => {
//     setCreateClassMsg("");

//     const res = await fetch("/api/admin/create-class", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         studentId: classStudentId,
//         type: classType,
//         weekday,
//         time,
//       }),
//     });

//     const result = await res.json().catch(() => ({}));

//     if (!res.ok) {
//       setCreateClassMsg(result.error ?? "수강권 생성 실패");
//       return;
//     }

//     setCreateClassMsg("수강권 생성 + 레슨 자동 생성 완료!");
//     // 생성 후 레슨 목록 새로고침
//     await loadLessons();
//   };

//   /** ------------------------------
//    *  3) 레슨 변경 요청 관리 (pending 목록)
//    *  - 승인: lessons 업데이트 + 요청 status approved
//    *  - 거절: 요청 status rejected
//    * ------------------------------ */
//   const [requests, setRequests] = useState<ChangeRequest[]>([]);
//   const [loadingRequests, setLoadingRequests] = useState(true);

//   const loadRequests = async () => {
//     setLoadingRequests(true);

//     const { data, error } = await supabase
//       .from("lesson_change_requests")
//       .select("id, lesson_id, student_id, from_date, from_time, to_date, to_time, status, created_at")
//       .eq("status", "pending")
//       .order("created_at", { ascending: true });

//     if (error) {
//       alert(error.message);
//       setRequests([]);
//     } else {
//       setRequests((data ?? []) as ChangeRequest[]);
//     }

//     setLoadingRequests(false);
//   };

//   const approveRequest = async (req: ChangeRequest) => {
//     // 1) lessons 업데이트
//     const { error: lessonErr } = await supabase
//       .from("lessons")
//       .update({
//         lesson_date: req.to_date,
//         lesson_time: req.to_time,
//       })
//       .eq("id", req.lesson_id);

//     if (lessonErr) {
//       alert(lessonErr.message);
//       return;
//     }

//     // 2) 요청 승인 처리
//     const { error: reqErr } = await supabase
//       .from("lesson_change_requests")
//       .update({ status: "approved" })
//       .eq("id", req.id);

//     if (reqErr) {
//       alert(reqErr.message);
//       return;
//     }

//     alert("승인 완료!");
//     setRequests((prev) => prev.filter((r) => r.id !== req.id));
//     await loadLessons();
//   };

//   const rejectRequest = async (id: string) => {
//     const { error } = await supabase
//       .from("lesson_change_requests")
//       .update({ status: "rejected" })
//       .eq("id", id);

//     if (error) {
//       alert(error.message);
//       return;
//     }

//     alert("거절 처리됨");
//     setRequests((prev) => prev.filter((r) => r.id !== id));
//   };

//   /** ------------------------------
//    *  4) 레슨 예외 허용 ON/OFF
//    *  - allow_change_override 토글
//    * ------------------------------ */
//   const [lessons, setLessons] = useState<Lesson[]>([]);
//   const [loadingLessons, setLoadingLessons] = useState(true);

//   const loadLessons = async () => {
//     setLoadingLessons(true);

//     const { data, error } = await supabase
//       .from("lessons")
//       .select("id, lesson_date, lesson_time, status, allow_change_override")
//       .order("lesson_date", { ascending: true })
//       .order("lesson_time", { ascending: true });

//     if (error) {
//       alert(error.message);
//       setLessons([]);
//     } else {
//       setLessons((data ?? []) as Lesson[]);
//     }

//     setLoadingLessons(false);
//   };

//   const toggleOverride = async (lessonId: string, nextValue: boolean) => {
//     const { error } = await supabase
//       .from("lessons")
//       .update({ allow_change_override: nextValue })
//       .eq("id", lessonId);

//     if (error) {
//       alert(error.message);
//       return;
//     }

//     setLessons((prev) =>
//       prev.map((l) =>
//         l.id === lessonId ? { ...l, allow_change_override: nextValue } : l
//       )
//     );

//     alert(nextValue ? "예외 허용 ON" : "예외 허용 OFF");
//   };

//   /** ------------------------------
//    *  초기 로딩
//    * ------------------------------ */
//   useEffect(() => {
//     loadRequests();
//     loadLessons();
//   }, []);

//   const weekdayLabel = useMemo(
//     () => ["일", "월", "화", "수", "목", "금", "토"],
//     []
//   );

//   return (
//     <div style={{ padding: 24, maxWidth: 900 }}>
//       <h1>🛠️ Mixroom Admin</h1>

//       {/* 1) 수강생 생성 */}
//       <section style={{ marginTop: 24 }}>
//         <h2>1) 수강생 등록</h2>
//         <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
//           <input
//             placeholder="이메일"
//             value={studentEmail}
//             onChange={(e) => setStudentEmail(e.target.value)}
//             style={{ padding: 8, minWidth: 240 }}
//           />
//           <input
//             placeholder="이름"
//             value={studentName}
//             onChange={(e) => setStudentName(e.target.value)}
//             style={{ padding: 8, minWidth: 160 }}
//           />
//           <button onClick={createStudent} style={{ padding: "8px 12px" }}>
//             수강생 생성
//           </button>
//         </div>
//         {createStudentMsg && <p style={{ marginTop: 8 }}>{createStudentMsg}</p>}
//         <p style={{ color: "gray", marginTop: 8 }}>
//           ※ 수강생 생성은 서버 API로 처리돼요. (임시 비밀번호는 서버에서 설정)
//         </p>
//       </section>

//       <hr style={{ margin: "24px 0" }} />

//       {/* 2) 수강권 생성 */}
//       <section>
//         <h2>2) 수강권 생성 + 레슨 자동 생성</h2>
//         <p style={{ color: "gray" }}>
//           ※ studentId는 <b>profiles.id(uuid)</b>를 넣어야 해요.
//         </p>

//         <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
//           <input
//             placeholder="studentId (profiles.id)"
//             value={classStudentId}
//             onChange={(e) => setClassStudentId(e.target.value)}
//             style={{ padding: 8, minWidth: 360 }}
//           />

//           <select
//             value={classType}
//             onChange={(e) => setClassType(e.target.value as any)}
//             style={{ padding: 8 }}
//           >
//             <option value="1month">1개월 (4회)</option>
//             <option value="3month">3개월 (12회)</option>
//           </select>

//           <select
//             value={weekday}
//             onChange={(e) => setWeekday(Number(e.target.value))}
//             style={{ padding: 8 }}
//           >
//             {weekdayLabel.map((d, idx) => (
//               <option key={idx} value={idx}>
//                 {d}요일
//               </option>
//             ))}
//           </select>

//           <input
//             placeholder="시간 (예: 19:00)"
//             value={time}
//             onChange={(e) => setTime(e.target.value)}
//             style={{ padding: 8, width: 120 }}
//           />

//           <button onClick={createClass} style={{ padding: "8px 12px" }}>
//             수강권 생성
//           </button>
//         </div>

//         {createClassMsg && <p style={{ marginTop: 8 }}>{createClassMsg}</p>}
//       </section>

//       <hr style={{ margin: "24px 0" }} />

//       {/* 3) 레슨 변경 요청 관리 */}
//       <section>
//         <h2>3) 레슨 변경 요청 관리 (Pending)</h2>
//         <button onClick={loadRequests} style={{ padding: "6px 10px" }}>
//           새로고침
//         </button>

//         {loadingRequests ? (
//           <p style={{ marginTop: 10 }}>요청 불러오는 중...</p>
//         ) : requests.length === 0 ? (
//           <p style={{ marginTop: 10 }}>대기 중인 요청 없음</p>
//         ) : (
//           <ul style={{ marginTop: 10 }}>
//             {requests.map((req) => (
//               <li key={req.id} style={{ marginBottom: 12 }}>
//                 <div>
//                   {req.from_date} {req.from_time} → {req.to_date} {req.to_time}
//                 </div>
//                 <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
//                   <button
//                     onClick={() => approveRequest(req)}
//                     style={{ padding: "6px 10px" }}
//                   >
//                     승인
//                   </button>
//                   <button
//                     onClick={() => rejectRequest(req.id)}
//                     style={{ padding: "6px 10px" }}
//                   >
//                     거절
//                   </button>
//                 </div>
//               </li>
//             ))}
//           </ul>
//         )}
//       </section>

//       <hr style={{ margin: "24px 0" }} />

//       {/* 4) 예외 허용 토글 */}
//       <section>
//         <h2>4) 레슨 예외 허용 관리 (24시간 이내 변경 허용)</h2>
//         <button onClick={loadLessons} style={{ padding: "6px 10px" }}>
//           레슨 목록 새로고침
//         </button>

//         {loadingLessons ? (
//           <p style={{ marginTop: 10 }}>레슨 목록 불러오는 중...</p>
//         ) : lessons.length === 0 ? (
//           <p style={{ marginTop: 10 }}>레슨이 없습니다.</p>
//         ) : (
//           <ul style={{ marginTop: 10 }}>
//             {lessons.map((lesson) => (
//               <li key={lesson.id} style={{ marginBottom: 10 }}>
//                 {lesson.lesson_date} {lesson.lesson_time} ({lesson.status}){" "}
//                 {lesson.allow_change_override ? (
//                   <span style={{ color: "orange" }}>[예외 ON]</span>
//                 ) : (
//                   <span style={{ color: "gray" }}>[예외 OFF]</span>
//                 )}
//                 <button
//                   style={{ marginLeft: 10, padding: "6px 10px" }}
//                   onClick={() =>
//                     toggleOverride(lesson.id, !lesson.allow_change_override)
//                   }
//                 >
//                   {lesson.allow_change_override ? "예외 해제" : "예외 허용"}
//                 </button>
//               </li>
//             ))}
//           </ul>
//         )}
//       </section>
//     </div>
//   );
// }


"use client";

import Link from "next/link";
import AdminLayoutShell from "@/components/admin/AdminLayoutShell";

export default function AdminHomePage() {
  return (
    <AdminLayoutShell title="🛠️ Mixroom Admin">
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 }}>
        <p style={{ marginTop: 0 }}>
          관리자 기능은 왼쪽 메뉴에서 이동해서 사용하세요.
        </p>

        <ul style={{ marginBottom: 0 }}>
          <li>
            <Link href="/admin/students">수강생 등록</Link>
          </li>
          <li>
            <Link href="/admin/classes">수강권 생성 + 레슨 자동 생성</Link>
          </li>
          <li>
            <Link href="/admin/lesson-change-status">
              레슨 변경 요청 관리 + 예외 허용 토글
            </Link>
          </li>
        </ul>
      </div>
    </AdminLayoutShell>
  );
}
