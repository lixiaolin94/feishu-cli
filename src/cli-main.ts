import "dotenv/config";
import { createProgram } from "./cli";
import { formatErrorForHuman, mapError } from "./core/errors";

function installBrokenPipeHandler(stream: NodeJS.WriteStream): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });
}

async function main(): Promise<void> {
  installBrokenPipeHandler(process.stdout);
  installBrokenPipeHandler(process.stderr);
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  process.stderr.write(`${formatErrorForHuman(mapError(error))}\n`);
  process.stderr.write("Run with --debug for details.\n");
  process.exitCode = 1;
});
