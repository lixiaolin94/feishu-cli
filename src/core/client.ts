import { Client, LoggerLevel } from "@larksuiteoapi/node-sdk";

export interface ClientConfig {
  appId?: string;
  appSecret?: string;
  baseUrl: string;
  debug: boolean;
}

let cachedClient: Client | null = null;
let cachedKey = "";

const silentLogger = {
  fatal: (): void => {},
  error: (): void => {},
  warn: (): void => {},
  info: (): void => {},
  debug: (): void => {},
  trace: (): void => {},
};

function writeLog(prefix: string, args: unknown[]): void {
  process.stderr.write(`${prefix} ${args.map(String).join(" ")}\n`);
}

const stderrLogger = {
  fatal: (...args: unknown[]): void => writeLog("[fatal]", args),
  error: (...args: unknown[]): void => writeLog("[error]", args),
  warn: (...args: unknown[]): void => writeLog("[warn]", args),
  info: (...args: unknown[]): void => writeLog("[info]", args),
  debug: (...args: unknown[]): void => writeLog("[debug]", args),
  trace: (...args: unknown[]): void => writeLog("[trace]", args),
};

type FeishuCliClient = Client & { __feishuCliDebug?: boolean };

export function getClient(config: ClientConfig): Client {
  if (!config.appId || !config.appSecret) {
    throw new Error("Missing app_id or app_secret. Run `feishu-cli config init` or set FEISHU_APP_ID / FEISHU_APP_SECRET.");
  }

  const key = JSON.stringify({
    appId: config.appId,
    appSecret: config.appSecret,
    baseUrl: config.baseUrl,
    debug: config.debug,
  });

  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }

  cachedClient = new Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: config.baseUrl,
    loggerLevel: config.debug ? LoggerLevel.info : LoggerLevel.error,
    logger: config.debug ? stderrLogger : silentLogger,
  });
  (cachedClient as FeishuCliClient).__feishuCliDebug = config.debug;
  cachedKey = key;
  return cachedClient;
}
