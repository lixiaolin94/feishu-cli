import { createInterface, Interface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export class MutedOutput extends Writable {
  muted = false;

  _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.muted) {
      process.stderr.write(chunk, encoding);
    }
    callback();
  }
}

export function createPromptInterface(): { rl: Interface; output: MutedOutput } {
  const output = new MutedOutput();
  const rl = createInterface({
    input: process.stdin,
    output,
  });

  return { rl, output };
}

export async function promptHidden(
  rl: Interface,
  output: MutedOutput,
  prompt: string,
  fallback?: string,
): Promise<string | undefined> {
  process.stderr.write(prompt);
  output.muted = true;

  try {
    const answer = (await rl.question("")).trim();
    process.stderr.write("\n");
    return answer || fallback;
  } finally {
    output.muted = false;
  }
}
