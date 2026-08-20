import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import { printOutcome } from './output.js';

describe('printOutcome', () => {
  let originalLevel: number;

  beforeEach(() => {
    originalLevel = chalk.level;
    chalk.level = 3; // force ANSI codes for this test, independent of TTY detection
  });

  afterEach(() => {
    chalk.level = originalLevel;
    process.exitCode = undefined;
  });

  it('colors success messages green', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printOutcome({ message: 'Created collection', isError: false });

    expect(logSpy.mock.calls[0]?.[0]).toBe(chalk.green('Created collection'));
    logSpy.mockRestore();
  });

  it('colors error messages red and sets a non-zero exit code', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    printOutcome({ message: "Collection 'x' does not exist", isError: true });

    expect(errorSpy.mock.calls[0]?.[0]).toBe(chalk.red("Collection 'x' does not exist"));
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });

  it('colors warnings yellow, separate from the main success message', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    printOutcome({
      message: 'Synced 1 collection from config',
      isError: false,
      warnings: ["Local collection 'x' is not in the config file."],
    });

    expect(logSpy.mock.calls[0]?.[0]).toBe(chalk.green('Synced 1 collection from config'));
    expect(warnSpy.mock.calls[0]?.[0]).toBe(chalk.yellow("Local collection 'x' is not in the config file."));
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('prints info messages (data displays) without color', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printOutcome({ message: 'No collections yet', isError: false, isInfo: true });

    expect(logSpy.mock.calls[0]?.[0]).toBe('No collections yet');
    logSpy.mockRestore();
  });
});
