import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ai-interactions.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function log(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
}

export function clearLogs() {
  if (fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '');
  }
}

export function getLogFilePath() {
  return LOG_FILE;
}
