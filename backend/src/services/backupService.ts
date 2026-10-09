import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// 全部資料備份：每一張資料表整份匯出成 JSON（依資料庫結構自動列出，之後新增的資料表也會包含）。
// 員工的密碼雜湊不匯出（檔案外流也拿不到密碼）；用備份還原後，員工要請董事長重設密碼。

export const BACKUP_FORMAT = "xusi-backup-v1";
const OMIT_FIELDS: Record<string, string[]> = { User: ["passwordHash"] };

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type Delegate = {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  count: () => Promise<number>;
};

export function delegateOf(model: string): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[delegateName(model)];
}

// 依外鍵關係排出建立順序（被參照的資料表先建立），還原時照這個順序寫入
export function modelsInDependencyOrder(): string[] {
  const models = Prisma.dmmf.datamodel.models;
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    const set = new Set<string>();
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields && f.relationFromFields.length > 0 && f.type !== m.name) {
        set.add(f.type);
      }
    }
    deps.set(m.name, set);
  }
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (ordered.includes(name) || visiting.has(name)) return;
    visiting.add(name);
    for (const d of deps.get(name) ?? []) visit(d);
    visiting.delete(name);
    ordered.push(name);
  };
  for (const m of models) visit(m.name);
  return ordered;
}

export interface BackupFile {
  format: string;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportAll(): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const model of modelsInDependencyOrder()) {
    const rows = await delegateOf(model).findMany();
    const omit = OMIT_FIELDS[model] ?? [];
    tables[model] = omit.length
      ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k))))
      : rows;
  }
  return { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), tables };
}

export async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const model of modelsInDependencyOrder()) out[model] = await delegateOf(model).count();
  return out;
}
