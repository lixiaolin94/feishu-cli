import { describe, expect, it } from "vitest";
import { toKebab, toOptionName, parseJsonValue, clonePayload } from "./utils";

describe("toKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(toKebab("pageSize")).toBe("page-size");
    expect(toKebab("userAccessToken")).toBe("user-access-token");
  });

  it("converts snake_case to kebab-case", () => {
    expect(toKebab("page_token")).toBe("page-token");
  });

  it("handles already kebab-case input", () => {
    expect(toKebab("page-size")).toBe("page-size");
  });
});

describe("toOptionName", () => {
  it("converts kebab-case to camelCase", () => {
    expect(toOptionName("page-size")).toBe("pageSize");
  });

  it("converts snake_case to camelCase", () => {
    expect(toOptionName("page_token")).toBe("pageToken");
  });
});

describe("parseJsonValue", () => {
  it("parses valid JSON", () => {
    expect(parseJsonValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonValue("[1,2]")).toEqual([1, 2]);
    expect(parseJsonValue('"hello"')).toBe("hello");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonValue("{bad}")).toThrow("Invalid JSON");
  });
});

describe("clonePayload", () => {
  it("creates a deep copy", () => {
    const original = { a: { b: 1 } };
    const cloned = clonePayload(original);
    cloned.a.b = 2;
    expect(original.a.b).toBe(1);
  });
});
