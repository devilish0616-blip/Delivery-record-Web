-- 排班功能已移除：從職務與員工的權限陣列中移除 "MANAGE_SCHEDULE"（Schedule 資料表保留，不在此刪除）
UPDATE "JobPosition"
SET "capabilities" = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements("capabilities") AS c WHERE c <> '"MANAGE_SCHEDULE"'::jsonb),
  '[]'::jsonb
)
WHERE "capabilities" @> '["MANAGE_SCHEDULE"]'::jsonb;

UPDATE "User"
SET "extraCapabilities" = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements("extraCapabilities") AS c WHERE c <> '"MANAGE_SCHEDULE"'::jsonb),
  '[]'::jsonb
)
WHERE "extraCapabilities" @> '["MANAGE_SCHEDULE"]'::jsonb;
