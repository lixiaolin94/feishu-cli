import { refreshAccessToken } from "./oauth";
import { isAccessTokenValid, isRefreshTokenValid, loadToken, saveToken } from "./token-store";

interface ResolveUserTokenOptions {
  explicitToken?: string;
  configToken?: string;
  appId?: string;
  appSecret?: string;
  baseUrl: string;
}

export async function resolveUserAccessToken(options: ResolveUserTokenOptions): Promise<string | undefined> {
  if (options.explicitToken) {
    return options.explicitToken;
  }

  if (process.env.FEISHU_USER_ACCESS_TOKEN) {
    return process.env.FEISHU_USER_ACCESS_TOKEN;
  }

  const storedToken = await loadToken();
  if (storedToken) {
    if (isAccessTokenValid(storedToken)) {
      return storedToken.access_token;
    }

    if (isRefreshTokenValid(storedToken) && options.appId && options.appSecret) {
      try {
        const refreshed = await refreshAccessToken(
          storedToken.refresh_token as string,
          options.appId,
          options.appSecret,
          options.baseUrl,
        );
        await saveToken(refreshed);
        return refreshed.access_token;
      } catch (error) {
        process.stderr.write(`[auth] failed to refresh user token: ${(error as Error).message}\n`);
      }
    }
  }

  if (options.configToken) {
    return options.configToken;
  }

  return undefined;
}
