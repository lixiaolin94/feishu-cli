import { describe, expect, it } from "vitest";
import { formatOutput } from "./output";

describe("formatOutput", () => {
  it("formats JSON with indentation by default", () => {
    const result = formatOutput({ a: 1 }, { format: "json" });
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it("formats compact JSON", () => {
    const result = formatOutput({ a: 1 }, { format: "json", compact: true });
    expect(result).toBe('{"a":1}');
  });

  it("formats YAML", () => {
    const result = formatOutput({ name: "test" }, { format: "yaml" });
    expect(result).toContain("name: test");
  });

  it("formats a table from array data", () => {
    const result = formatOutput(
      [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      { format: "table" },
    );
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("id");
    expect(result).toContain("name");
  });

  it("extracts items from nested data for table format", () => {
    const result = formatOutput(
      { data: { items: [{ id: 1 }] } },
      { format: "table" },
    );
    expect(result).toContain("id");
    expect(result).toContain("1");
  });

  it("wraps scalar values for table format", () => {
    const result = formatOutput("hello", { format: "table" });
    expect(result).toContain("value");
    expect(result).toContain("hello");
  });
});
