import fs from 'fs';
import path from 'path';

export function debugLog(message: string, data?: any) {
    const logPath = path.join(process.cwd(), 'data', 'logs', 'debug.log');
    const logMessage = `${new Date().toISOString()} - ${message}${data ? ': ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logPath, logMessage);
}
