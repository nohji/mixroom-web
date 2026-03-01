// src/lib/prisma.ts
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase는 ssl 필요한 경우가 많음. URL에 sslmode=require 있으면 보통 OK.
      // 그래도 연결 이슈 나면 아래 주석 해제:
      // ssl: { rejectUnauthorized: false },
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
