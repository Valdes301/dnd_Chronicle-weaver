import { NextRequest, NextResponse } from 'next/server';
import { generateGranularQuestAction } from '@/lib/actions';
import { abortActiveAiOperations } from '@/ai/genai-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 300s timeout per prevenire interruzioni su prompt complessi

export async function POST(req: NextRequest) {
  try {
    const actionParam = req.nextUrl.searchParams.get('action');
    if (actionParam === 'abort') {
      abortActiveAiOperations();
      return NextResponse.json({ success: true, message: "Operazioni IA interrotte immediatamente." });
    }

    const body = await req.json();
    if (body?.abort) {
      abortActiveAiOperations();
      return NextResponse.json({ success: true, message: "Operazioni IA interrotte immediatamente." });
    }

    const { config, modification } = body;
    if (!config) {
      return NextResponse.json({
        success: false,
        error: "Configurazione della quest mancante.",
        logs: [`[${new Date().toLocaleTimeString('it-IT')}] ❌ Errore: Configurazione della quest mancante.`]
      }, { status: 400 });
    }

    const result = await generateGranularQuestAction(config, modification);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[generate-quest API] Errore imprevisto:", err);
    const errorMsg = err?.message || String(err) || "Errore sconosciuto durante la generazione della quest.";
    return NextResponse.json({
      success: false,
      error: errorMsg,
      logs: [
        `[${new Date().toLocaleTimeString('it-IT')}] ❌ Errore critico server API: ${errorMsg}`
      ]
    }, { status: 500 });
  }
}
