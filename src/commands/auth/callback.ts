import { Command } from "commander";
import { URL } from "node:url";
import { resolveConfig } from "../../core/config";
import { exchangeToken, parseCallbackUrl } from "../../core/auth/oauth";
import { maskToken, saveToken } from "../../core/auth/token-store";
import { printOutput } from "../../core/output";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export function registerAuthCallback(authCommand: Command): void {
  authCommand
    .command("callback")
    .description("Exchange an OAuth callback URL for a token in non-interactive flows")
    .argument("[url]", "Full callback URL")
    .requiredOption("--state <state>", "OAuth state used when generating the auth URL")
    .option("--stdin", "Read the callback URL from stdin to avoid shell history")
    .action(async (callbackUrl: string | undefined, localOptions: { state: string; stdin?: boolean }, command: Command) => {
      const globalOptions = command.optsWithGlobals() as {
        config?: string;
        profile?: string;
        output?: "json" | "table" | "yaml";
        baseUrl?: string;
        debug?: boolean;
        compact?: boolean;
        color?: boolean;
      };

      const config = await resolveConfig(globalOptions);
      if (!config.appId || !config.appSecret) {
        throw new Error("Missing app_id or app_secret. Run `feishu-cli config init` first.");
      }

      if (callbackUrl && localOptions.stdin) {
        throw new Error("Pass the callback URL either as an argument or via --stdin, not both.");
      }

      const resolvedCallbackUrl = localOptions.stdin ? (await readStdin()).trim() : callbackUrl;
      if (!resolvedCallbackUrl) {
        throw new Error("Missing callback URL. Pass it as an argument or pipe it with --stdin.");
      }

      const code = parseCallbackUrl(resolvedCallbackUrl, localOptions.state);
      const redirectUrl = new URL(resolvedCallbackUrl);
      const redirectUri = `${redirectUrl.origin}${redirectUrl.pathname}`;
      const token = await exchangeToken(code, config.appId, config.appSecret, redirectUri, config.baseUrl);
      await saveToken(token);

      printOutput(
        {
          logged_in: true,
          access_token: maskToken(token.access_token),
          expires_at: token.expires_at,
          scope: token.scope,
        },
        {
          format: config.output.format,
          compact: config.compact,
        },
      );
    });
}
