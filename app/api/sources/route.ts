import { authenticated, failure } from "@/lib/server";
import { sourceSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    const input = sourceSchema.parse(await request.json());
    const url = new URL(input.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      throw new Error("Use a public HTTPS listing URL without a custom port");
    const { data: g } = await db
      .from("groups")
      .select("id")
      .eq("id", input.group_id)
      .single();
    if (!g) throw new Error("Group not found");
    const { count } = await db
      .from("sources")
      .select("id", { count: "exact", head: true });
    if ((count || 0) >= 100) throw new Error("Source limit reached (100)");
    let propertyId = input.property_id;
    if (!propertyId) {
      const { data, error } = await db
        .from("properties")
        .insert({ owner_id: user.id, name: input.property_name })
        .select("id")
        .single();
      if (error) throw error;
      propertyId = data.id;
    }
    const host = url.hostname;
    const adapter =
      host.endsWith(".equityapartments.com") || host === "equityapartments.com"
        ? "equity"
        : host.endsWith(".zillow.com") || host === "zillow.com"
          ? "zillow"
          : host.endsWith(".apartments.com") || host === "apartments.com"
            ? "apartments"
            : "generic";
    url.hash = "";
    const { data, error } = await db
      .from("sources")
      .insert({
        owner_id: user.id,
        group_id: input.group_id,
        property_id: propertyId,
        url: url.toString(),
        adapter,
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
