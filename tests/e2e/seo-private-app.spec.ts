import { expect, test } from "@playwright/test";

test("private app shell is explicitly non-indexable", async ({ request }) => {
  const response = await request.get("/app");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["cache-control"]).toContain("no-store");

  const html = await response.text();
  expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive"');
  expect(html).toContain('<meta name="googlebot" content="noindex, nofollow, noarchive"');
  expect(html).toContain('<link rel="canonical" href="https://www.neurakeep.com/app"');
  expect(html).toContain('<meta property="og:title" content="Hosted NeuraKeep | Secure Sign In"');
  expect(html).toContain('<meta name="twitter:title" content="Hosted NeuraKeep | Secure Sign In"');
  expect(html).toContain("<h1>Hosted NeuraKeep</h1>");
});
