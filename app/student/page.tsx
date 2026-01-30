"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lesson = {
  id: string;
  lesson_date: string; // YYYY-MM-DD
  lesson_time: string; // HH:mm
  status: string;
  allow_change_override: boolean;
};

export default function StudentPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔹 레슨 목록 불러오기
  useEffect(() => {
    const loadLessons = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      // 1️⃣ 내 수강권(classes)
      const { data: classes } = await supabase
        .from("classes")
        .select("id")
        .eq("student_id", user.id);

      if (!classes || classes.length === 0) {
        setLessons([]);
        setLoading(false);
        return;
      }

      const classIds = classes.map((c) => c.id);

      // 2️⃣ 내 레슨 목록
      const { data: lessonsData } = await supabase
        .from("lessons")
        .select(
          "id, lesson_date, lesson_time, status, allow_change_override"
        )
        .in("class_id", classIds)
        .order("lesson_date", { ascending: true });

      setLessons(lessonsData ?? []);
      setLoading(false);
    };

    loadLessons();
  }, []);

  // 🔹 레슨 변경 요청 (서버 API 사용)
  const requestChange = async (lesson: Lesson) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const lessonDateTime = new Date(
      `${lesson.lesson_date}T${lesson.lesson_time}:00`
    );

    const diffHours =
      (lessonDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    // UI 1차 제한 (서버에서도 다시 검증함)
    const canRequest =
      diffHours > 24 || lesson.allow_change_override;

    if (!canRequest) {
      alert("레슨 변경은 시작 24시간 전까지만 가능해요.");
      return;
    }

    const toDate = prompt("변경할 날짜를 입력해 주세요 (YYYY-MM-DD)");
    if (!toDate) return;

    const toTime = prompt("변경할 시간을 입력해 주세요 (예: 19:00)");
    if (!toTime) return;

    const res = await fetch(
      "/api/student/request-lesson-change",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          studentId: user.id,
          to_date: toDate,
          to_time: toTime,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      alert(result.error);
    } else {
      alert("변경 요청이 접수됐어요! (관리자 승인 대기)");
    }
  };

  if (loading) return <p>레슨 불러오는 중...</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>내 레슨 일정</h1>

      {lessons.length === 0 && (
        <p>등록된 레슨이 없습니다.</p>
      )}

      <ul>
        {lessons.map((lesson) => {
          const lessonDateTime = new Date(
            `${lesson.lesson_date}T${lesson.lesson_time}:00`
          );

          const diffHours =
            (lessonDateTime.getTime() - Date.now()) /
            (1000 * 60 * 60);

          const canRequest =
            diffHours > 24 || lesson.allow_change_override;

          return (
            <li key={lesson.id} style={{ marginBottom: 12 }}>
              {lesson.lesson_date} {lesson.lesson_time} (
              {lesson.status})

              <button
                style={{ marginLeft: 10 }}
                disabled={!canRequest}
                onClick={() => requestChange(lesson)}
              >
                변경 요청
              </button>

              {!canRequest && (
                <span
                  style={{
                    marginLeft: 8,
                    color: "gray",
                  }}
                >
                  (24시간 이내 변경 불가)
                </span>
              )}

              {lesson.allow_change_override && (
                <span
                  style={{
                    marginLeft: 8,
                    color: "orange",
                  }}
                >
                  (관리자 예외 허용)
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
