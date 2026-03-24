import fs from "node:fs/promises";
import path from "node:path";
import { getDefaultTokenPath } from "../config";

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: string;
  refresh_expires_at?: string;
  scope?: string;
}

function nowWithBufferMs() {
  return Date.now() + 60_000;
}

export function isAccessTokenValid(token: StoredToken | null | undefined): boolean {
  if (!token?.access_token || !token.expires_at) {
    return false;
  }
  return nowWithBufferMs() < new Date(token.expires_at).getTime();
}

export function isRefreshTokenValid(token: StoredToken | null | undefined): boolean {
  if (!token?.refresh_token) {
    return false;
  }
  if (!token.refresh_expires_at) {
    return true;
  }
  return nowWithBufferMs() < new Date(token.refresh_expires_at).getTime();
}

export function maskToken(token: string | undefined): string | undefined {
  if (!token) {
    return token;
  }
  if (token.length <= 12) {
    return "***";
  }
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

export async function loadToken(tokenPath = getDefaultTokenPath()): Promise<StoredToken | null> {
  try {
    const content = await fs.readFile(tokenPath, "utf8");
    return JSON.parse(content) as StoredToken;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveToken(token: StoredToken, tokenPath = getDefaultTokenPath()): Promise<void> {
  await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
}

export async function deleteToken(tokenPath = getDefaultTokenPath()): Promise<void> {
  try {
    await fs.unlink(tokenPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
