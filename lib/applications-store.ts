import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { applications } from "./db/schema";
import type { SubsidyCategory, ApplicationStatus } from "./subsidy-categories";
import type { Crop } from "./types";

export interface CropDeclaration {
  crop: Crop;
  areaHa: number;
  declaredYieldCha: number;
  fertilizerKgHa: number;
  declaredSowingDate: string;
}

export interface StoredApplication {
  id: string;
  farmerId: string;
  category: SubsidyCategory;
  type: string;
  scope: string;
  amount: number;
  status: ApplicationStatus;
  date: string;
  submittedAt: string;
  cropDeclaration?: CropDeclaration;
}

type Row = typeof applications.$inferSelect;

function rowToApp(r: Row): StoredApplication {
  return {
    id: r.id,
    farmerId: r.farmerId,
    category: r.category as SubsidyCategory,
    type: r.type,
    scope: r.scope,
    amount: r.amount,
    status: r.status as ApplicationStatus,
    date: r.date,
    submittedAt: r.submittedAt.toISOString(),
    cropDeclaration: (r.cropDeclaration as CropDeclaration | null) ?? undefined,
  };
}

export async function getStoredApplicationsFor(farmerId: string): Promise<StoredApplication[]> {
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.farmerId, farmerId))
    .orderBy(desc(applications.submittedAt));
  return rows.map(rowToApp);
}

export async function getAllStoredApplications(): Promise<StoredApplication[]> {
  const rows = await db.select().from(applications).orderBy(desc(applications.submittedAt));
  return rows.map(rowToApp);
}

export interface NewApplicationInput {
  farmerId: string;
  category: SubsidyCategory;
  type: string;
  scope: string;
  amount: number;
  cropDeclaration?: CropDeclaration;
}

export async function addApplication(input: NewApplicationInput): Promise<StoredApplication> {
  const id = `APP-USER-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const now = new Date();
  const [row] = await db
    .insert(applications)
    .values({
      id,
      farmerId: input.farmerId,
      category: input.category,
      type: input.type,
      scope: input.scope,
      amount: input.amount,
      status: "На проверке",
      date: now.toISOString().slice(0, 10),
      submittedAt: now,
      cropDeclaration: input.cropDeclaration ?? null,
    })
    .returning();
  return rowToApp(row);
}
