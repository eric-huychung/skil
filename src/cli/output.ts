import chalk from 'chalk';

/** Result of running a CLI command handler: what to print and whether it's an error. */
export interface CommandOutcome {
  message: string;
  isError: boolean;
  /** True for neutral data displays (tables, "nothing to show" messages) that shouldn't be colored green. */
  isInfo?: boolean;
  /** Actionable warnings to print alongside a success message, colored yellow. */
  warnings?: string[];
}

/**
 * Prints a CommandOutcome to the appropriate stream, colored by outcome
 * type, and sets a non-zero exit code on error. Colors are disabled
 * automatically outside a TTY (chalk's default behavior), so piped/CI
 * output stays plain text.
 */
export function printOutcome(outcome: CommandOutcome): void {
  if (outcome.isError) {
    console.error(chalk.red(outcome.message));
    process.exitCode = 1;
    return;
  }

  console.log(outcome.isInfo ? outcome.message : chalk.green(outcome.message));
  for (const warning of outcome.warnings ?? []) {
    console.warn(chalk.yellow(warning));
  }
}
