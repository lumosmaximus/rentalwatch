import { authenticated, failure } from "@/lib/server";
import { segmentSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const { db } = await authenticated(request);
    const input = segmentSchema.parse(await request.json());
    const { data: s } = await db
      .from("sources")
      .select("id,extraction")
      .eq("id", input.source_id)
      .single();
    if (!s?.extraction)
      throw new Error(
        "Wait for the source inspection to finish before selecting options",
      );
    const { data, error } = await db.rpc('create_tracking_segment',{p_source:input.source_id,p_name:input.name,p_rules:input.rules,p_cadence:input.cadence_hours});
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
