import { NextRequest, NextResponse } from 'next/server';
import { catalogHandbookNewAction } from '@/lib/actions';
import { clearLogs } from '@/lib/logger';
import { abortActiveAiOperations } from '@/ai/genai-client';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export const maxDuration = 300; // 300 secondi timeout max

function writeLastScanDebug(info: any) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, 'last_scan_debug.json');
    // Sovrascrittura atomica: conserva solo l'ultima scansione per non accumulare file
    fs.writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf8');
  } catch (err) {
    console.error("[last_scan_debug] Errore salvataggio:", err);
  }
}

export async function POST(req: NextRequest) {
  // Supporto immediato ad action=abort
  const actionParam = req.nextUrl.searchParams.get('action');
  if (actionParam === 'abort') {
    abortActiveAiOperations();
    return NextResponse.json({ success: true, message: "Operazioni IA interrotte immediatamente." });
  }

  clearLogs(); // Reset logs per ogni nuova importazione
  const startTime = Date.now();
  let body: any = null;
  try {
    body = await req.json();
    if (body?.abort) {
      abortActiveAiOperations();
      return NextResponse.json({ success: true, message: "Operazioni IA interrotte immediatamente." });
    }
    const res = await catalogHandbookNewAction(body);
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(2));

    const rawData = res?.data;
    writeLastScanDebug({
      timestamp: new Date().toISOString(),
      durationSeconds: durationSec,
      modelUsed: rawData?.modelUsed || body?.selectedModel || 'gemini-3.8-flash',
      targetContentType: body?.targetContentType || 'all',
      sourceManual: body?.sourceManual || 'auto',
      hasImage: Boolean(body?.photoDataUri),
      success: Boolean(res?.success),
      error: res?.error || null,
      extractedData: rawData || null,
      summary: rawData ? {
        pageAnalysis: (rawData as any).pageAnalysis || null,
        monstersFound: (rawData.monsters || []).map((m: any) => ({
          name: m.name,
          type: m.type,
          armorClass: m.armorClass,
          hitPoints: m.hitPoints,
          challenge: m.challenge,
          description: m.description || '',
          hasImageBox: Boolean(m.imageBox),
          imageBox: m.imageBox || null,
          hasTokenBox: Boolean(m.tokenBox),
          tokenBox: m.tokenBox || null,
          descriptionLength: (m.description || '').length
        })),
        itemsCount: (rawData.items || []).length,
        spellsCount: (rawData.spells || []).length,
        skillsCount: (rawData.skills || []).length,
        rulesCount: (rawData.rules || []).length
      } : null
    });

    return NextResponse.json(res);
  } catch (error: any) {
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(2));
    const errorMsg = typeof error === 'string' ? error : (error?.message || 'Servizio IA temporaneamente sovraccarico. Riprova tra qualche secondo.');

    writeLastScanDebug({
      timestamp: new Date().toISOString(),
      durationSeconds: durationSec,
      modelUsed: body?.selectedModel || 'gemini-3.8-flash',
      targetContentType: body?.targetContentType || 'all',
      success: false,
      error: errorMsg,
      stack: error?.stack || null
    });

    console.error("API /api/catalog-new Error:", error);
    return NextResponse.json({
      success: false,
      data: null,
      error: errorMsg
    }, { status: 200 });
  }
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'last_scan_debug.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ exists: false, log: null });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const log = JSON.parse(content);
    return NextResponse.json({ exists: true, log });
  } catch (err: any) {
    return NextResponse.json({ exists: false, error: err?.message }, { status: 500 });
  }
}

export async function DELETE() {
  abortActiveAiOperations();
  return NextResponse.json({ success: true, message: "Operazioni IA interrotte immediatamente." });
}
