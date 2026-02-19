import { config } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const priority: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function shouldLog(level: Level): boolean {
  return priority[level] >= priority[config.LOG_LEVEL];
}

function format(level: Level, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug: (message: string): void => {
    if (shouldLog('debug')) console.debug(format('debug', message));
  },
  info: (message: string): void => {
    if (shouldLog('info')) console.info(format('info', message));
  },
  warn: (message: string): void => {
    if (shouldLog('warn')) console.warn(format('warn', message));
  },
  error: (message: string): void => {
    if (shouldLog('error')) console.error(format('error', message));
  }
};
