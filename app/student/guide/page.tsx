"use client";

import StudentTopNav from "@/components/student/StudentTopNav";

export default function StudentGuidePage() {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: 16,
        background: "#f6f7f9",
        minHeight: "100vh",
      }}
    >
      <StudentTopNav />

      <div
        style={{
          fontSize: 26,
          fontWeight: 1200,
          marginBottom: 16,
          color: "#000",
        }}
      >
        📌 이용 안내 (필독)
      </div>

      <div
        style={{
          background: "#fff7ed",
          border: "2px solid #fb923c",
          borderRadius: 16,
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 1100, marginBottom: 6, color: "#000" }}>
          ⚠️ 반드시 확인해주세요
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#111", fontWeight: 600 }}>
          수업 변경, 연습실 예약 및 취소 규정을 반드시 확인해주세요.
          <br />
          규정 미확인으로 발생하는 문제는 책임지지 않습니다.
        </div>
      </div>

      <Section title="🔁 레슨 변경 및 연장 규정">
        <Item>
          레슨 일정 <b>변경 및 연장은 레슨 전날 오후 5시까지</b> 가능합니다.
        </Item>

        <Item>
          <b>전날 오후 5시 이후 및 당일</b>에는 변경·연장이 어렵습니다.
        </Item>

        <Item>
          사전 연락 없이 불참 시 <b>해당 회차는 차감</b>됩니다.
        </Item>

        <Item>
          문의사항은 <b>카카오톡 채널 ‘믹스룸 스튜디오’</b>로 편하게 연락 주세요.
        </Item>
      </Section>

      <Section title="🎧 연습실 사용 안내" highlight>
        <div
          style={{
            background: "#111",
            color: "#fff",
            padding: 12,
            borderRadius: 12,
            marginBottom: 12,
            fontWeight: 1000,
            fontSize: 14,
          }}
        >
          무료 제공 시간
        </div>

        <Item>
          <b>1개월권 (1개월 기준)</b>
          <br />
          [턴테이블] 5시간 / [컨트롤러] 4시간 무료 제공
        </Item>

        <Item>
          <b>3개월권 (3개월 + 연장 1주 기준)</b>
          <br />
          [턴테이블] 15시간 / [컨트롤러] 12시간 무료 제공
        </Item>

        <Divider />

        <Item>
          연습실은 <b>첫 레슨 등록 후부터 사용 가능</b>합니다.
        </Item>

        <Item>
          <b>마지막 수업일까지 사용 가능</b>하며, 미사용 시간은 소멸됩니다.
        </Item>

        <Item>
          <b>당일을 기준으로 한 달 이내의 날짜까지만</b> 미리 예약 가능합니다.
        </Item>

        <Item>
          최소 <b>1시간 단위 예약</b> / <b>1일 최대 2시간</b>
        </Item>

        <Item>
          연습실 운영 관리 및 원활한 예약 확인을 위해
          <br />
          <b>당일 및 다음날 예약은 불가</b>합니다.
        </Item>

        <Item>
          <b>예약 시간 기준 48시간 전부터는 취소 불가</b>합니다.
        </Item>

        <Item>
          예약 후 미사용 시에도 <b>동일하게 차감</b>됩니다.
        </Item>

        <Item>
          연습실 예약은 <b>관리자 승인 후 확정</b>됩니다.
        </Item>

        <Divider />

        <Item>
          무료 제공 시간을 초과할 경우
          <br />
          <b>수강생 전용 할인가로 연습실 이용권을 구매</b>하여 이용할 수 있습니다.
        </Item>

        <Item>
          이용권 구매는 <b>카카오톡 채널 ‘믹스룸 스튜디오’</b>로 문의해 주세요.
        </Item>

        <Divider />

        <Item>
          연습실 이용 중 장비 및 시설 파손 시
          <br />
          <b>이용자에게 수리비 또는 배상 책임</b>이 발생할 수 있습니다.
        </Item>
      </Section>

      <div style={{ height: 30 }} />
    </div>
  );
}

function Section({
  title,
  children,
  highlight,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? "#f3f4f6" : "#ffffff",
        border: highlight ? "2px solid #111" : "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 18,
        marginBottom: 16,
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 1100,
          marginBottom: 12,
          color: "#000",
        }}
      >
        {title}
      </div>

      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 14,
        lineHeight: 1.7,
        fontWeight: 600,
        color: "#111",
      }}
    >
      • {children}
    </div>
  );
}

function Divider() {
    return (
      <div
        style={{
          height: 1,
          background: "#e5e7eb",
          margin: "10px 0",
        }}
      />
    );
  }