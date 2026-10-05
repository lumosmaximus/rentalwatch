import dns from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";
export async function publicTarget(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Only HTTPS on port 443 is supported");
  const hosts = (process.env.INGESTION_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (process.env.INGESTION_PUBLIC_SOURCES !== "true" && !hosts.includes(url.hostname.toLowerCase()))
    throw new Error("UNSUPPORTED: Host awaits administrator approval");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.parse(a.address).range() !== "unicast")
  )
    throw new Error("Private or reserved network target rejected");
  return { url, address: addresses[0] };
}
export async function safeResource(
  raw: string,
  redirects = 0,
): Promise<{ status: number; location?: string; body: string; type: string }> {
  if (redirects > 4) throw new Error("Too many redirects");
  const { url, address } = await publicTarget(raw);
  const response = await new Promise<{
    status: number;
    location?: string;
    body: string;
    type: string;
  }>((resolve, reject) => {
    const req = https.get(
      url,
      {
        signal: AbortSignal.timeout(20000),
        family: address.family,
        lookup: (_host, _opts, cb) => cb(null, address.address, address.family),
        headers: {
          "User-Agent": "RentalWatch/1.0 (+rental inventory monitoring)",
          Accept: "text/html",
        },
      },
      (res) => {
        let body = "";
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 3_000_000) {
            req.destroy(new Error("Response too large"));
            return;
          }
          body += chunk.toString();
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            location: res.headers.location,
            body,
            type: res.headers["content-type"] || "",
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(20000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.location)
    return safeResource(
      new URL(response.location, url).toString(),
      redirects + 1,
    );
  if (
    [401, 403, 429].includes(response.status) ||
    /captcha|access denied|verify you are human/i.test(response.body)
  )
    throw new Error(
      `BLOCKED: Source refused automated access (${response.status})`,
    );
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response;
}
export async function safeFetch(raw: string) {
  const response = await safeResource(raw);
  if (!response.type.includes("text/html"))
    throw new Error("UNSUPPORTED: Expected an HTML listing page");
  return response.body;
}
