import { chromium } from "playwright";
import { safeResource, publicTarget } from "./safe-fetch";
// All browser traffic is fulfilled through the DNS-pinned public HTTPS fetcher.
// No cookies, login sessions, service workers, downloads, POSTs or CAPTCHA bypass.
export async function render(url: string) {
  await publicTarget(url);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    let requests = 0;
    await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      try {
        if (
          ++requests > 100 ||
          route.request().method() !== "GET" ||
          ["image", "media", "font"].includes(route.request().resourceType())
        )
          return await route.abort();
        const response = await safeResource(route.request().url());
        await route.fulfill({
          status: response.status,
          contentType: response.type,
          body: response.body,
        });
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const html = await page.content();
    if (/captcha|access denied|verify you are human/i.test(html))
      throw new Error("BLOCKED: Browser encountered an access challenge");
    return html;
  } finally {
    await browser.close();
  }
}
