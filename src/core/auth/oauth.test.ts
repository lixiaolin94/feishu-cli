import { describe, expect, it } from "vitest";
import { generateAuthUrl, parseCallbackUrl } from "./oauth";

describe("generateAuthUrl", () => {
  it("generates a feishu authorize URL with correct params", () => {
    const result = generateAuthUrl({
      appId: "cli_test",
      appSecret: "secret",
      baseUrl: "https://open.feishu.cn",
      port: 9999,
    });

    expect(result.authUrl).toContain("accounts.feishu.cn");
    expect(result.authUrl).toContain("client_id=cli_test");
    expect(result.authUrl).toContain("redirect_uri=");
    expect(result.authUrl).toContain("response_type=code");
    expect(result.redirectUri).toBe("http://127.0.0.1:9999/callback");
    expect(result.state).toHaveLength(32);
  });

  it("uses larksuite accounts for larksuite base URLs", () => {
    const result = generateAuthUrl({
      appId: "cli_test",
      appSecret: "secret",
      baseUrl: "https://open.larksuite.com",
    });

    expect(result.authUrl).toContain("accounts.larksuite.com");
  });

  it("includes scopes when provided", () => {
    const result = generateAuthUrl({
      appId: "cli_test",
      appSecret: "secret",
      baseUrl: "https://open.feishu.cn",
      scopes: "contact:user.base:readonly",
    });

    expect(result.authUrl).toContain("scope=contact");
  });
});

describe("parseCallbackUrl", () => {
  const state = "abc123";

  it("extracts code from a valid callback URL", () => {
    const code = parseCallbackUrl(
      `http://127.0.0.1:9768/callback?code=mycode&state=${state}`,
      state,
    );
    expect(code).toBe("mycode");
  });

  it("throws on state mismatch", () => {
    expect(() =>
      parseCallbackUrl(
        `http://127.0.0.1:9768/callback?code=mycode&state=wrong`,
        state,
      ),
    ).toThrow("State mismatch");
  });

  it("throws on authorization error", () => {
    expect(() =>
      parseCallbackUrl(
        `http://127.0.0.1:9768/callback?error=access_denied&error_description=User+denied&state=${state}`,
        state,
      ),
    ).toThrow("access_denied");
  });

  it("throws when code is missing", () => {
    expect(() =>
      parseCallbackUrl(
        `http://127.0.0.1:9768/callback?state=${state}`,
        state,
      ),
    ).toThrow("Missing code");
  });
});
