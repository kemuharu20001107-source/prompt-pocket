import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { appUrl } = JSON.parse(await readFile(new URL("../docs/deployment.json", import.meta.url), "utf8"));
const paths = ["index.html", "styles.css", "app.js", "store.js", "seed.js", "prompt-text.js"];
await Promise.all(paths.map(async (file) => {
  const response = await fetch(appUrl + "/" + (file === "index.html" ? "" : file), {
    redirect: "error",
    signal: AbortSignal.timeout(20000)
  });
  assert.equal(response.status, 200, file + " should be public HTTP 200");
  const type = response.headers.get("content-type") || "";
  assert.ok(file.endsWith(".html") ? /text\/html/.test(type) :
    file.endsWith(".css") ? /text\/css/.test(type) : /javascript/.test(type),
    file + " should have a usable content type, got " + type);
  const expected = await readFile(new URL("../web/" + file, import.meta.url), "utf8");
  assert.equal(await response.text(), expected, file + " should match the saved source");
  console.log("OK", file, response.status, type);
}));
