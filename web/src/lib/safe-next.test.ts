import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("kendi içimizdeki yolları kabul eder", () => {
    expect(safeNext("/trades?x=1")).toBe("/trades?x=1");
    expect(safeNext("/notes/a%2Fb#top")).toBe("/notes/a%2Fb#top");
  });

  it.each([
    null,
    undefined,
    "",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test/x",
    "/\n/evil.test",
    "/\r/evil.test",
    "https://evil.test",
    "javascript:alert(1)",
  ])("dışarı giden %j reddedilir", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });
});
