type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogContext = Record<string, unknown>;
function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
  fatal: (message: string, context?: LogContext) => write('fatal', message, context),
};
