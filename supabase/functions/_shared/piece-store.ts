// A piece's records in the database, behind the same Store the sandbox uses (see piece.ts). Add and update go through
// two database functions that enforce the limits and write the change log in one step; there is no delete to call.
import { cleanPayload } from "./edges.ts";
import type { Rec, Store } from "./piece.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export function dbStore(db: Db, pieceId: string, limits: { per_day: number; max_records: number }): Store {
  return {
    async add(stage, data, source, by) {
      const { data: r, error } = await db.rpc("piece_add", { p_piece: pieceId, p_stage: stage, p_data: cleanPayload(data), p_source: source, p_by: by, p_per_day: limits.per_day, p_max: limits.max_records });
      if (error || !r) return { ok: false, error: "server" };
      return r.ok ? { ok: true, id: r.id, ref: r.ref } : { ok: false, error: r.error };
    },
    async update(id, stage, data, by) {
      const { data: r, error } = await db.rpc("piece_update", { p_piece: pieceId, p_record: id, p_stage: stage, p_data: data ? cleanPayload(data) : null, p_by: by });
      if (error || !r) return { ok: false, error: "server" };
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    async list(stages, limit, newestFirst) {
      let q = db.from("piece_records").select("id,ref,stage,data,source,created_at,updated_at").eq("piece_id", pieceId);
      if (stages) q = q.in("stage", stages);
      const { data } = await q.order("updated_at", { ascending: !newestFirst }).limit(Math.min(Math.max(limit, 1), 200));
      return (data ?? []) as Rec[];
    },
  };
}
