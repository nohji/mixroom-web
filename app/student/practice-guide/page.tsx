"use client";

import StudentTopNav from "@/components/student/StudentTopNav";

const COMMON_GUIDE = {
  studioPassword: "0131*",
  restroomPassword: "5885*",
  wifiName: "U+Net7320_2.4G / 5G",
  wifiPassword: "P9652041#D",
  notes: [
    "음식 반입 금지 (음료만 허용)",
    "장비 파손·분실 시 배상 책임이 발생할 수 있습니다.",
    "무인으로 운영 시, 이용 후 정리 부탁드립니다.",
    "소지품을 반드시 확인한 후 퇴실해주세요.",
  ],
};

const HALL_GUIDES = [
  {
    hall: "A홀",
    title: "A홀 컨트롤러 사용법",
    url: "https://foregoing-throne-328.notion.site/A-1ea726ee964a801fb3efc0e280dfc95c?pvs=4",
  },
  {
    hall: "A홀",
    title: "A홀 턴테이블 사용법",
    url: "https://foregoing-throne-328.notion.site/A-1ea726ee964a80b98cacc6033bf0cdd9?pvs=4",
  },
  {
    hall: "B홀",
    title: "B홀 컨트롤러 사용법",
    url: "https://foregoing-throne-328.notion.site/B-2a0d85abadd6466c81646444a7ae0c99?pvs=4",
  },
  {
    hall: "C홀",
    title: "C홀 컨트롤러 사용법",
    url: "https://foregoing-throne-328.notion.site/C-2b7726ee964a80dc8ab2e340d08d20ee",
  },
  {
    hall: "C홀",
    title: "C홀 턴테이블 사용법",
    url: "https://foregoing-throne-328.notion.site/C-2e0726ee964a808f9d8fe8d88c713f30",
  },
];

export default function StudentPracticeGuidePage() {
  return (
    <div
      style={{
        background: "#f6f7f9",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "16px 16px 30px",
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
          🎧 연습실 사용법
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
          <div
            style={{
              fontSize: 18,
              fontWeight: 1100,
              marginBottom: 6,
              color: "#000",
            }}
          >
            ⚠️ 이용 전 꼭 확인해주세요
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#111",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            📌 연습실 이용 전 비밀번호, 와이파이, 주의사항 및 홀별 사용법을
            반드시 확인해주세요.
           
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#111",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
           
            📌 무인 운영 시간에는 퇴실 전 정리 꼭 부탁드립니다.
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#111",
              fontWeight: 600,
            }}
          >
            📌 홀마다 장비 구성이 다를 수 있으니,
            <br />
            사용 전 해당 홀의 사용법 링크를 꼭 확인해주세요.
          </div>
        </div>

        <Section title="🔐 공통 안내">
          <InfoBox label="🔒 스튜디오 비밀번호" value={COMMON_GUIDE.studioPassword} />
          <InfoBox
            label="🚻 화장실 비밀번호 (반층 아래)"
            value={COMMON_GUIDE.restroomPassword}
          />
          <InfoBox
            label="📶 와이파이"
            value={
              <>
                {COMMON_GUIDE.wifiName}
                <br />
                비밀번호: {COMMON_GUIDE.wifiPassword}
              </>
            }
          />
        </Section>

        <Section title="⚠️ 주의사항" highlight>
          {COMMON_GUIDE.notes.map((note) => (
            <WarnItem key={note}>{note}</WarnItem>
          ))}
        </Section>

        <Section title="🎛 홀별 사용법">
          {HALL_GUIDES.map((item) => (
            <GuideLinkCard
              key={item.hall}
              hall={item.hall}
              title={item.title}
              url={item.url}
            />
          ))}
        </Section>

        <div
          style={{
            borderRadius: 16,
            border: "1px solid #d1fae5",
            background: "#ecfdf5",
            padding: 16,
            marginTop: 12,
            fontSize: 14,
            lineHeight: 1.7,
            fontWeight: 700,
            color: "#065f46",
          }}
        >
          궁금한 점은 언제든지 카카오톡 채널 ‘믹스룸 스튜디오’로 문의해주세요😊
        </div>

        <div style={{ height: 30 }} />
      </div>
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

      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#f9fafb",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: "#111",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          fontWeight: 600,
          color: "#374151",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function WarnItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fef3c7",
        color: "#92400e",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        lineHeight: 1.7,
        fontWeight: 700,
      }}
    >
      ⚠️ {children}
    </div>
  );
}

function GuideLinkCard({
  hall,
  title,
  url,
}: {
  hall: string;
  title: string;
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        textDecoration: "none",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
        color: "#111",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            {hall}
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 1000,
              color: "#111",
              marginBottom: 6,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 600,
              color: "#6b7280",
            }}
          >
            사용 전 반드시 확인해주세요.
          </div>
        </div>

        <div
          style={{
            flexShrink: 0,
            borderRadius: 9999,
            background: "#111",
            color: "#fff",
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          열기
        </div>
      </div>
    </a>
  );
}