import { Command } from "commander";
import { createProgram } from "../cli";

type Shell = "bash" | "zsh" | "fish";

function collectSubcommands(command: Command): string[] {
  return command.commands.map((sub) => sub.name());
}

function collectAllOptions(command: Command): string[] {
  const flags = new Set<string>();
  let current: Command | null = command;

  while (current) {
    for (const option of current.options) {
      const flag = option.long ?? option.short;
      if (flag) {
        flags.add(flag);
      }
    }
    current = current.parent ?? null;
  }

  return [...flags];
}

function findSubcommand(program: Command, args: string[]): Command {
  let current = program;

  for (const arg of args) {
    if (arg.startsWith("-")) {
      continue;
    }
    const sub = current.commands.find((cmd) => cmd.name() === arg);
    if (!sub) {
      break;
    }
    current = sub;
  }

  return current;
}

function generateWords(args: string[]): string[] {
  const program = createProgram();
  const target = findSubcommand(program, args);
  const subs = collectSubcommands(target);
  const opts = collectAllOptions(target);
  return [...subs, ...opts];
}

function bashScript(): string {
  return `# bash completion for feishu-cli
# Add to ~/.bashrc: eval "$(feishu-cli completion bash)"

_feishu_cli_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local words
  words=$(feishu-cli completion --words -- "\${COMP_WORDS[@]:1:COMP_CWORD-1}" 2>/dev/null)
  COMPREPLY=($(compgen -W "$words" -- "$cur"))
}

complete -o default -F _feishu_cli_completions feishu-cli
`;
}

function zshScript(): string {
  return `# zsh completion for feishu-cli
# Add to ~/.zshrc: eval "$(feishu-cli completion zsh)"

_feishu_cli() {
  local -a _feishu_completions
  _feishu_completions=("\${(@f)$(feishu-cli completion --words -- "\${words[@]:1:CURRENT-2}" 2>/dev/null)}")
  compadd -a _feishu_completions
}

compdef _feishu_cli feishu-cli
`;
}

function fishScript(): string {
  return `# fish completion for feishu-cli
# Add to ~/.config/fish/completions/feishu-cli.fish or run:
# feishu-cli completion fish | source

complete -c feishu-cli -f -a '(feishu-cli completion --words -- (commandline -cop)[2..] 2>/dev/null)'
`;
}

export function registerCompletion(program: Command): void {
  const completionCommand = program
    .command("completion")
    .description("Generate shell completion scripts (bash, zsh, fish)")
    .argument("[args...]", "Shell type or completion context")
    .option("--words", "Output completion words for the given arguments (internal)")
    .action((args: string[] | undefined, options: { words?: boolean }) => {
      const values = args ?? [];

      if (options.words) {
        const words = generateWords(values);
        process.stdout.write(words.join("\n") + "\n");
        return;
      }

      let shell = values[0];
      if (!shell) {
        const detected = detectShell();
        if (!detected) {
          process.stderr.write('Specify a shell: feishu-cli completion bash|zsh|fish\n');
          process.exitCode = 1;
          return;
        }
        shell = detected;
      }

      const scripts: Record<Shell, () => string> = {
        bash: bashScript,
        zsh: zshScript,
        fish: fishScript,
      };

      const generator = scripts[shell as Shell];
      if (!generator) {
        process.stderr.write(`Unknown shell: ${shell}. Supported: bash, zsh, fish\n`);
        process.exitCode = 1;
        return;
      }

      process.stdout.write(generator());
    });

  completionCommand.allowUnknownOption(true);
  completionCommand.allowExcessArguments(false);
}

function detectShell(): Shell | undefined {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("/bash")) return "bash";
  if (shell.endsWith("/zsh")) return "zsh";
  if (shell.endsWith("/fish")) return "fish";
  return undefined;
}
