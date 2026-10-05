import { safeFetch } from "../worker/safe-fetch";
import { writeFile, mkdir } from "node:fs/promises";
async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("Provide an approved HTTPS source URL");
  const html = await safeFetch(url);
  await mkdir(".local", { recursive: true });
  await writeFile(".local/source.html", html);
  console.log(
    `Fetched ${html.length} characters for adapter inspection (not demo data).`,
  );
}
void main();
