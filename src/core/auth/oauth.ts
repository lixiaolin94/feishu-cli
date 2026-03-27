import http from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { URL } from "node:url";
import { StoredToken, saveToken } from "./token-store";

export const DEFAULT_OAUTH_PORT = 9768;
const CALLBACK_PATH = "/callback";

export interface AuthUrlResult {
  authUrl: string;
  state: string;
  redirectUri: string;
}

export interface LoginOptions {
  appId: string;
  appSecret: string;
  baseUrl: string;
  scopes?: string;
  manual?: boolean;
  printUrl?: boolean;
  port?: number;
}

function getAccountsBaseUrl(baseUrl: string): string {
  return new URL(baseUrl).hostname.includes("larksuite")
    ? "https://accounts.larksuite.com"
    : "https://accounts.feishu.cn";
}

function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Failed to open browser with ${command}`));
    });
  });
}

function useManualMode(explicitManual?: boolean): boolean {
  if (explicitManual) {
    return true;
  }
  return Boolean(process.env.SSH_CONNECTION || process.env.CI || process.env.TERM_PROGRAM === "vscode");
}

export function generateAuthUrl(options: LoginOptions): AuthUrlResult {
  const port = options.port ?? DEFAULT_OAUTH_PORT;
  const state = randomBytes(16).toString("hex");
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const authorizeUrl = new URL(`${getAccountsBaseUrl(options.baseUrl)}/open-apis/authen/v1/authorize`);

  authorizeUrl.searchParams.set("client_id", options.appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  // Always request offline_access so the token response includes a refresh_token,
  // which allows automatic token renewal without re-login every 2 hours.
  const scopes = options.scopes
    ? (options.scopes.includes("offline_access") ? options.scopes : `offline_access ${options.scopes}`)
    : "offline_access";
  authorizeUrl.searchParams.set("scope", scopes);

  return {
    authUrl: authorizeUrl.toString(),
    state,
    redirectUri,
  };
}

export function parseCallbackUrl(rawUrl: string, expectedState: string): string {
  const parsed = new URL(rawUrl);
  const state = parsed.searchParams.get("state");
  const error = parsed.searchParams.get("error");
  const errorDescription = parsed.searchParams.get("error_description");
  const code = parsed.searchParams.get("code");

  if (error) {
    throw new Error(`Authorization failed: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`);
  }
  if (state !== expectedState) {
    throw new Error("State mismatch. Make sure the callback URL belongs to the current login attempt.");
  }
  if (!code) {
    throw new Error("Missing code in callback URL.");
  }
  return code;
}

function toStoredToken(data: Record<string, unknown>): StoredToken {
  const now = Date.now();
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 0;
  const refreshExpiresIn = typeof data.refresh_token_expires_in === "number" ? data.refresh_token_expires_in : 0;

  return {
    access_token: String(data.access_token ?? ""),
    refresh_token: data.refresh_token ? String(data.refresh_token) : undefined,
    token_type: data.token_type ? String(data.token_type) : undefined,
    expires_at: expiresIn ? new Date(now + expiresIn * 1000).toISOString() : undefined,
    refresh_expires_at: refreshExpiresIn ? new Date(now + refreshExpiresIn * 1000).toISOString() : undefined,
    scope: data.scope ? String(data.scope) : undefined,
  };
}

async function doTokenRequest(baseUrl: string, body: Record<string, string>): Promise<StoredToken> {
  const response = await fetch(`${baseUrl}/open-apis/authen/v2/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Token endpoint returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.error) {
    throw new Error(`OAuth error: ${String(payload.error)}${payload.error_description ? ` - ${String(payload.error_description)}` : ""}`);
  }
  if (!payload.access_token) {
    throw new Error("Token response did not include access_token.");
  }

  return toStoredToken(payload);
}

export async function exchangeToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
  baseUrl: string,
): Promise<StoredToken> {
  return doTokenRequest(baseUrl, {
    grant_type: "authorization_code",
    code,
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
  });
}

export async function refreshAccessToken(
  refreshToken: string,
  appId: string,
  appSecret: string,
  baseUrl: string,
): Promise<StoredToken> {
  return doTokenRequest(baseUrl, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appId,
    client_secret: appSecret,
  });
}

async function loginManual(authUrl: string, state: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    process.stderr.write(`Open this URL in a browser and authorize the app:\n${authUrl}\n\n`);
    process.stderr.write("Paste the full callback URL after authorization.\n");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const callbackUrl = await rl.question("> ");
      try {
        return parseCallbackUrl(callbackUrl.trim(), state);
      } catch (error) {
        process.stderr.write(`${(error as Error).message}\n`);
      }
    }
  } finally {
    rl.close();
  }

  throw new Error("Too many invalid callback URLs.");
}

async function loginLocal(authUrl: string, state: string, port: number): Promise<string> {
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "", `http://127.0.0.1:${port}`);
        if (requestUrl.pathname !== CALLBACK_PATH) {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }

        const callbackUrl = requestUrl.toString();
        const parsedCode = parseCallbackUrl(callbackUrl, state);
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<html><body><h2>Authorization successful.</h2><p>You can return to the terminal.</p></body></html>");
        resolve(parsedCode);
        server.close();
      } catch (error) {
        res.statusCode = 400;
        res.end(String((error as Error).message));
        reject(error);
        server.close();
      }
    });

    server.listen(port, "127.0.0.1", async () => {
      process.stderr.write(`Waiting for OAuth callback on http://127.0.0.1:${port}${CALLBACK_PATH}\n`);
      try {
        await openBrowser(authUrl);
      } catch {
        process.stderr.write(`Could not open a browser automatically. Open this URL manually:\n${authUrl}\n`);
        process.stderr.write("If automatic browser launch is unreliable in this environment, re-run with `feishu-cli auth login --manual`.\n");
      }
    });

    server.on("error", reject);
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for OAuth callback."));
    }, 120_000);
  });

  return code;
}

export async function login(options: LoginOptions): Promise<AuthUrlResult & { token?: StoredToken }> {
  const auth = generateAuthUrl(options);
  if (options.printUrl) {
    return auth;
  }

  const code = useManualMode(options.manual)
    ? await loginManual(auth.authUrl, auth.state)
    : await loginLocal(auth.authUrl, auth.state, options.port ?? DEFAULT_OAUTH_PORT);

  const token = await exchangeToken(code, options.appId, options.appSecret, auth.redirectUri, options.baseUrl);
  await saveToken(token);
  return {
    ...auth,
    token,
  };
}
