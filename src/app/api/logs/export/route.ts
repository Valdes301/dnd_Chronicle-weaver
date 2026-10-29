import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getLogFilePath } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const logPath = getLogFilePath();
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '', 'utf8');
    return new NextResponse('', { status: 200 });
  }

  const logContent = fs.readFileSync(logPath, 'utf8');
  
  return new NextResponse(logContent, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename=ai-interactions.log',
    },
  });
}
