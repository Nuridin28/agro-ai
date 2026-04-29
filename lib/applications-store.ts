// Простой JSON-стор для пользовательских заявок на субсидии.
// На прод заменить на БД (Postgres). В прототипе — `data/applications.json`.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { SubsidyCategory, ApplicationStatus } from "./subsidy-categories";
import type { Crop } from "./types";

// Опциональные поля, которые задаёт фермер для категорий fertilizer/seeds.
// Они нужны, чтобы фрод-движок мог реально проверить заявку на разумность
// (заявленный урожай vs. бонитет/агрохимия/метео).
export interface CropDeclaration {
  crop: Crop;
  areaHa: number;
  declaredYieldCha: number;     // заявленная урожайность, ц/га
  fertilizerKgHa: number;        // факт. закуп удобрений на га
  declaredSowingDate: string;   // YYYY-MM-DD
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
  // Опционально для категорий с зерновыми/семенами — добавляется через
  // расширенную форму. Без этих полей фрод-движок не запускается.
  cropDeclaration?: CropDeclaration;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "applications.json");

async function ensureFile(): Promise<void> {
  try { await fs.access(FILE); }
  catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, "[]", "utf8");
  }
}

async function readAll(): Promise<StoredApplication[]> {
  await ensureFile();
  const raw = await fs.readFile(FILE, "utf8");
  try { return JSON.parse(raw) as StoredApplication[]; } catch { return []; }
}

async function writeAll(apps: StoredApplication[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(apps, null, 2), "utf8");
}

export async function getStoredApplicationsFor(farmerId: string): Promise<StoredApplication[]> {
  const all = await readAll();
  return all.filter((a) => a.farmerId === farmerId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

// Все поданные через форму заявки — для инспекторского дашборда.
// Сортированы по дате подачи, новые сверху.
export async function getAllStoredApplications(): Promise<StoredApplication[]> {
  const all = await readAll();
  return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
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
  const all = await readAll();
  const now = new Date();
  const app: StoredApplication = {
    id: `APP-USER-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    farmerId: input.farmerId,
    category: input.category,
    type: input.type,
    scope: input.scope,
    amount: input.amount,
    status: "На проверке",
    date: now.toISOString().slice(0, 10),
    submittedAt: now.toISOString(),
    cropDeclaration: input.cropDeclaration,
  };
  all.push(app);
  await writeAll(all);
  return app;
}
