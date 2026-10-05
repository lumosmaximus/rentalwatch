import { createClient } from "@supabase/supabase-js";
export async function authenticated(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Unauthorized");
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new Error("Supabase is not configured");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return { db, user: data.user };
}
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return Response.json(
    { error: message },
    { status: message === "Unauthorized" ? 401 : 400 },
  );
}
