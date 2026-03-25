import { describe, expect, it } from "vitest";
import { deriveTitle, markdownToSimpleBlocks, parseDocumentId } from "./doc-helpers";

describe("parseDocumentId", () => {
  it("extracts document ids from URLs", () => {
    expect(parseDocumentId("https://example.com/docx/RnModWT5ioCO0DxShfscGkqtnfe")).toEqual({
      documentId: "RnModWT5ioCO0DxShfscGkqtnfe",
      source: "https://example.com/docx/RnModWT5ioCO0DxShfscGkqtnfe",
    });
  });

  it("accepts raw document ids", () => {
    expect(parseDocumentId("RnModWT5ioCO0DxShfscGkqtnfe")).toEqual({
      documentId: "RnModWT5ioCO0DxShfscGkqtnfe",
      source: "RnModWT5ioCO0DxShfscGkqtnfe",
    });
  });
});

describe("markdownToSimpleBlocks", () => {
  it("splits markdown by paragraph groups", () => {
    expect(markdownToSimpleBlocks("# Title\n\nbody")).toHaveLength(2);
  });
});

describe("deriveTitle", () => {
  it("prefers explicit titles", () => {
    expect(deriveTitle("/tmp/example.md", "Custom Title")).toBe("Custom Title");
  });

  it("falls back to file stem", () => {
    expect(deriveTitle("/tmp/example.md")).toBe("example");
  });
});
