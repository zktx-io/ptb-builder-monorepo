#!/usr/bin/env node
import process from 'node:process';

type CliJsonCommand = 'help' | 'mermaid' | 'unknown';

function commandForArgs(args: string[]): CliJsonCommand {
  if (args.includes('--help') || args.includes('-h')) return 'help';
  return args[0] === 'mermaid' ? 'mermaid' : 'unknown';
}

function tryWrite(stream: NodeJS.WriteStream, text: string): boolean {
  try {
    stream.write(text);
    return true;
  } catch {
    return false;
  }
}

function writeStartupError(args: string[], error: unknown) {
  const json = args.includes('--json');
  const text = json
    ? `${JSON.stringify(
        {
          ok: false,
          command: commandForArgs(args),
          error: {
            cause:
              error instanceof Error
                ? { kind: 'system', message: error.message }
                : undefined,
            code: 'unexpected',
            message: 'Unexpected CLI error.',
          },
        },
        undefined,
        2,
      )}\n`
    : 'error [unexpected]: Unexpected CLI error.\n';

  const primary = json ? process.stdout : process.stderr;
  const fallback = json ? process.stderr : process.stdout;
  if (!tryWrite(primary, text)) {
    tryWrite(fallback, 'error [output.write]: Failed to write CLI output.\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { runCli } = await import('./cli.js');
  process.exitCode = await runCli(args, {
    stderr: process.stderr,
    stdout: process.stdout,
  });
}

main().catch((error) => {
  writeStartupError(process.argv.slice(2), error);
  process.exitCode = process.exitCode || 1;
});
