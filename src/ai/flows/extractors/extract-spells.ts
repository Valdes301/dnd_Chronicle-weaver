/**
 * ============================================================================
 * ✨ MODULO ESTRAZIONE INCANTESIMI & MAGIE (SPELLS) D&D 5e / 2024 ✨
 * ============================================================================
 * 
 * Questo modulo è dedicato ESCLUSIVAMENTE all'estrazione testuale e strutturata di:
 * - Incantesimi singoli con tutti i parametri tecnici
 * - Liste di incantesimi per classe e livello
 * - Gestione di Trucchetti potenziati e Slot di livello superiore
 * - Supporto all'accorpamento continuo multi-pagina
 */

import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText } from '@/lib/formatter';

export type SpellExtractionInput = {
    content?: string;
    photoDataUri?: string;
    selectedModel?: string;
};

export type ExtractedSpell = {
    name: string;
    level: string;
    school: string;
    casting_time: string;
    range: string;
    components: string;
    duration: string;
    isConcentration?: boolean;
    isRitual?: boolean;
    classes: string;
    higherLevels?: string;
    description: string;
    isContinuation?: boolean;
};

export type SpellExtractionOutput = {
    spells: ExtractedSpell[];
    modelUsed: string;
};

const SPELL_SYSTEM_INSTRUCTION = `Sei l'Archimago Bibliotecario e Trascritore Ufficiale della Magia di D&D 5e e 2024.
OBIETTIVO: Analizza la pagina o il testo ed estrai con assoluta fedeltà e completezza TUTTI gli INCANTESIMI presenti nell'array 'spells'.

REGOLE MANDATORIE DI ESTRAZIONE INCANTESIMI:
1. TITOLI E NOMENCLATURA:
   - Nomi in italiano ufficiale corretto (es. "Fireball" -> "Palla di Fuoco", "Spiritual Weapon" -> "Arma Spirituale", "Bless" -> "Benedizione", "Divine Smite" -> "Punizione Divina").

2. PARAMETRI STRUTTURATI:
   - 'name': Nome dell'incantesimo.
   - 'level': Livello (es. "Trucchetto", "1° Livello", "2° Livello", "3° Livello", fino a "9° Livello").
   - 'school': Scuola di magia (es. "Abiurazione", "Ammaliamento", "Divinazione", "Evocazione", "Illusione", "Invocazione", "Necromanzia", "Trasmutazione").
   - 'casting_time': Tempo di lancio (es. "1 azione", "1 azione bonus", "1 reazione", "1 minuto", "10 minuti").
   - 'range': Gittata (es. "Personale", "Contatto", "9 metri", "18 metri", "27 metri", "36 metri", "90 metri").
   - 'components': Componenti (es. "V, S", "V, S, M (una ciotola tempestata di gemme del valore di 1.000 mo, consumata)").
   - 'duration': Durata (es. "Istantanea", "1 minuto", "10 minuti", "1 ora", "24 ore", "10 giorni").
   - 'isConcentration': true se richiede concentrazione, altrimenti false.
   - 'isRitual': true se può essere lanciato come rituale, altrimenti false.
   - 'classes': Elenco delle classi che possono lanciarlo (es. "Chierico, Paladino", "Mago, Stregone, Warlock", "Bardo, Druido, Mago").
   - 'higherLevels': Testo esatto delle sezioni "Ai Livelli Superiori" / "Utilizzo di uno slot incantesimo di livello superiore" o "Trucchetto Potenziato" (se presente).
   - 'description': Testo descrittivo completo dell'effetto in Markdown chiaro.

3. GESTIONE DELLE CONTINUAZIONI MULTI-PAGINA:
   - Se in cima alla pagina è presente la parte conclusiva di un incantesimo iniziato nella pagina precedente (senza titolo iniziale), indica il nome probabile dell'incantesimo in corso e imposta 'isContinuation': true.

4. NIENTE IMMAGINI: Non estrarre o ritagliare immagini per gli incantesimi; focalizzati al 100% sulla massima accuratezza testuale e delle formule.

Rispondi ESCLUSIVAMENTE in formato JSON valido con la chiave 'spells'.`;

const SPELL_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        spells: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    level: { type: "STRING" },
                    school: { type: "STRING" },
                    casting_time: { type: "STRING" },
                    range: { type: "STRING" },
                    components: { type: "STRING" },
                    duration: { type: "STRING" },
                    isConcentration: { type: "BOOLEAN" },
                    isRitual: { type: "BOOLEAN" },
                    classes: { type: "STRING" },
                    higherLevels: { type: "STRING" },
                    description: { type: "STRING" },
                    isContinuation: { type: "BOOLEAN" }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["spells"]
};

function parseJsonSafely(raw: string): any {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch {}
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlock) {
        try { return JSON.parse(codeBlock[1].trim()); } catch {}
    }
    const startIdx = raw.indexOf('{');
    const lastIdx = raw.lastIndexOf('}');
    if (startIdx !== -1 && lastIdx > startIdx) {
        try { return JSON.parse(raw.substring(startIdx, lastIdx + 1)); } catch {}
    }
    return {};
}

function getArrayResilient(obj: any, keys: string[]): any[] {
    if (!obj || typeof obj !== 'object') return [];
    for (const key of keys) {
        if (Array.isArray(obj[key])) return obj[key];
    }
    for (const key of keys) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) return [obj[key]];
    }
    return [];
}

export async function extractSpellsFromInput(input: SpellExtractionInput): Promise<SpellExtractionOutput> {
    const { content, photoDataUri, selectedModel = 'gemini-3.8-flash' } = input;
    const genAi = getGenAI();
    const model = selectedModel;

    const contents: any[] = [];
    if (photoDataUri) {
        let base64Part = photoDataUri;
        let mimeType = 'image/jpeg';
        if (photoDataUri.includes(';base64,')) {
            const parts = photoDataUri.split(';base64,');
            mimeType = parts[0].replace('data:', '');
            base64Part = parts[1];
        }
        contents.push({
            inlineData: {
                mimeType,
                data: base64Part
            }
        });
    }

    if (content && content.trim()) {
        contents.push({
            text: `CONTENUTO DELLA PAGINA DA ANALIZZARE:\n${content.trim()}`
        });
    }

    contents.push({
        text: "Estrai fedelmente TUTTI gli incantesimi presenti con parametri completi (livello, scuola, tempo di lancio, gittata, componenti, durata, concentrazione, rituale, classi, slot superiori/trucchetto potenziato e descrizione). Restituisci ESCLUSIVAMENTE il JSON con l'array 'spells'."
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: SPELL_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: SPELL_RESPONSE_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: 8192,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);
    const rawSpells = getArrayResilient(parsed, ['spells', 'spell', 'incantesimi', 'incantesimo', 'magie', 'magia']);

    const spells: ExtractedSpell[] = rawSpells
        .map((s: any) => {
            const duration = s.duration || s.durata || "Istantanea";
            const isConcentration = s.isConcentration !== undefined
                ? Boolean(s.isConcentration)
                : duration.toLowerCase().includes('concentrazione');
            
            const castingTime = s.casting_time || s.tempo_di_lancio || s.tempoDiLancio || "1 azione";
            const isRitual = s.isRitual !== undefined
                ? Boolean(s.isRitual)
                : (castingTime.toLowerCase().includes('rituale') || (s.description || '').toLowerCase().includes('rituale'));

            return {
                name: formatTitleOrTag(s.name || s.nome || "Incantesimo"),
                level: s.level || s.livello || "1° Livello",
                school: s.school || s.scuola || "Universale",
                casting_time: castingTime,
                range: s.range || s.gittata || "Personale",
                components: s.components || s.componenti || "V, S",
                duration: duration,
                isConcentration,
                isRitual,
                classes: s.classes || s.classi || "",
                higherLevels: s.higherLevels || s.aiLivelliSuperiori || s.slotSuperiori || undefined,
                description: formatNarrativeText(s.description || s.descrizione || ""),
                isContinuation: Boolean(s.isContinuation)
            };
        })
        .filter((s: ExtractedSpell) => s.name && s.description);

    return {
        spells,
        modelUsed: model
    };
}
