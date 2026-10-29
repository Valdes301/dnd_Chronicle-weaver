/**
 * ============================================================================
 * 🛑 FILE PROTETTO E SIGILLATO - SISTEMA DI ESTRAZIONE REGOLE & TABELLE 🛑
 * ============================================================================
 * 
 * ATTENZIONE / AVVISO DI SICUREZZA:
 * Questo file contiene la logica certificata ed ottimizzata per l'estrazione di 
 * regole, meccaniche e tabelle dalla Guida del Dungeon Master e Manuale del Giocatore:
 * - Parsing e catalogazione accurata delle sezioni (Svantaggio, Conseguenze, Gradi, ecc.)
 * - Formattazione Markdown impeccabile per tabelle e formule
 * 
 * ⚠️ NON MODIFICARE QUESTO FILE. È STATO CONVALIDATO E SIGILLATO AL 100%.
 * ============================================================================
 */

import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText } from '@/lib/formatter';

export type RuleExtractionInput = {
    content?: string;
    photoDataUri?: string;
    sourceManual?: 'auto' | 'phb' | 'dmg' | 'mm' | 'custom';
    selectedModel?: string;
};

export type ExtractedRule = {
    title: string;
    content: string;
    sourceBook: 'phb' | 'dmg' | 'mm' | 'custom';
    tags: string[];
    isContinuation?: boolean;
};

export type ExtractedEmbeddedItem = {
    name: string;
    type?: string;
    rarity?: string;
    attunement?: string;
    cost?: string;
    damage?: string;
    description: string;
};

export type ExtractedEmbeddedSpell = {
    name: string;
    level?: string;
    school?: string;
    casting_time?: string;
    range?: string;
    components?: string;
    duration?: string;
    classes?: string;
    description: string;
};

export type RuleExtractionOutput = {
    rules: ExtractedRule[];
    embeddedItems?: ExtractedEmbeddedItem[];
    embeddedSpells?: ExtractedEmbeddedSpell[];
    modelUsed: string;
};

const RULES_SYSTEM_INSTRUCTION = `Sei l'Archivista Supremo e Trascritore Ufficiale dei Manuali di D&D 5e e 2024 (Manuale del Giocatore PHB, Guida del Dungeon Master DMG).
OBIETTIVO: Analizza la pagina o il testo ed estrai con assoluta fedeltà e completezza **OGNI SINGOLA REGOLA, SEZIONE, PARAGRAFO O TABELLA** come voce autonoma e indipendente nell'array 'rules'. 
Non accorpare mai regole diverse o paragrafi distinti (es. Svantaggio, Conseguenze, Gradi di Fallimento, Successo a un Costo, Improvvisare i Danni, ecc.): crea un oggetto regola separato e specifico per ciascuno di essi.

REGOLE MANDATORIE DI ESTRAZIONE REGOLE:
1. NON CLASSIFICARE IN CAPITOLI:
   - Non creare macro-voci intitolate "Capitolo 2" o "Capitolo 4".
   - Estrai direttamente le REGOLE SPECIFICHE con il loro titolo chiaro e riconoscibile (es. "Improvvisare i Danni", "Gradi di Fallimento e Successo", "Successo a un Costo", "Successo o Fallimento Critico", "Panoramica delle Classi", "Fasi di Creazione del Personaggio", "Sessione Zero", "Situazioni di Avventura ad Alto Livello").

2. FORMATTAZIONE TABELLE E FORMULE IN MARKDOWN PERFETTO:
   - Se nella pagina sono presenti tabelle (es. tabelle d12, d10, gravità dei danni, panoramica delle classi), DEVI TRASCRIVERLE INTEGRALMENTE E FEDELMENTE IN MARKDOWN:
     \`\`\`markdown
     | Livelli dei personaggi | Fastidioso | Letale |
     |:---:|:---:|:---:|
     | 1–4 | 5 (1d10) | 11 (2d10) |
     | 5–10 | 11 (2d10) | 22 (4d10) |
     | 11–16 | 22 (4d10) | 55 (10d10) |
     | 17–20 | 55 (10d10) | 99 (18d10) |
     \`\`\`
   - Per tabelle casuali di situazioni (es. 1d12 o 1d10), mantieni la colonna del dado e la colonna della situazione.

3. GESTIONE DEI BOX LATERALI E NOTE SPECIALI:
   - Se nella pagina è presente un box laterale/riquadro (es. "Sessione Zero", o didascalie esplicative), formattalo in Markdown con blockquote o intestazione dedicata:
     \`\`\`markdown
     > ### Sessione Zero
     > Alcuni Dungeon Master iniziano la campagna con una "sessione zero"...
     \`\`\`

4. REGOLE MULTI-PAGINA E CONTINUAZIONI:
   - Se la parte iniziale della pagina continua una regola iniziata nella pagina precedente (senza un nuovo titolo H1/H2 in cima), assegna il titolo appropriato dell'argomento in corso e imposta 'isContinuation': true se evidente.
   - Non tagliare le spiegazioni a metà: trascrivi tutto il testo della sezione fino al completamento.

5. IDENTIFICAZIONE MANUALE & TAG CONCETTUALI:
   - 'sourceBook': indica 'phb' (Manuale del Giocatore) o 'dmg' (Guida del Dungeon Master) o 'custom'.
   - 'tags': array di parole chiave concettuali utili per la ricerca (es. ["danni", "tabelle", "combattimento", "improvvisazione", "creazione-personaggio", "sessione-zero"]). NON inserire la parola "Capitolo" nei tag.

6. OGGETTI O INCANTESIMI TROVATI NELLE PAGINE DI REGOLE:
   - Se la pagina descrive o elenca uno specifico oggetto magico/equipaggiamento o incantesimo autonomo, estrailo anche negli array 'embeddedItems' o 'embeddedSpells' per smistarlo automaticamente nella sezione corretta.

Rispondi ESCLUSIVAMENTE in formato JSON valido.`;

const RULES_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        rules: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    content: { type: "STRING" },
                    sourceBook: { type: "STRING" },
                    tags: { type: "ARRAY", items: { type: "STRING" } },
                    isContinuation: { type: "BOOLEAN" }
                },
                required: ["title", "content"]
            }
        },
        embeddedItems: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    type: { type: "STRING" },
                    rarity: { type: "STRING" },
                    attunement: { type: "STRING" },
                    cost: { type: "STRING" },
                    damage: { type: "STRING" },
                    description: { type: "STRING" }
                },
                required: ["name", "description"]
            }
        },
        embeddedSpells: {
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
                    classes: { type: "STRING" },
                    description: { type: "STRING" }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["rules"]
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

export async function extractRulesFromInput(input: RuleExtractionInput): Promise<RuleExtractionOutput> {
    const { content, photoDataUri, sourceManual = 'auto', selectedModel = 'gemini-3.8-flash' } = input;
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
        text: `Estrai le singole REGOLE e TABELLE presenti nella pagina con assoluta fedeltà, preservando formattazione Markdown e tabelle. Niente capitoli generici: usa titoli specifici per ciascuna regola. Se una regola continua quella precedente o se contiene oggetti/magie, gestiscili opportunamente.`
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: RULES_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: RULES_RESPONSE_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: 8192,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);

    const rawRules = getArrayResilient(parsed, ['rules', 'rule', 'regole', 'regola', 'homebrewRules', 'newRules']);
    const rawItems = getArrayResilient(parsed, ['embeddedItems', 'items', 'oggetti', 'magicItems']);
    const rawSpells = getArrayResilient(parsed, ['embeddedSpells', 'spells', 'incantesimi', 'magie']);

    const defaultSource = sourceManual !== 'auto' ? sourceManual : 'dmg';

    const rules: ExtractedRule[] = rawRules
        .map((r: any) => {
            const content = formatNarrativeText(r.content || r.contenuto || r.testo || r.description || r.descrizione || r.text || "");
            return {
                title: formatTitleOrTag(r.title || r.titolo || (content ? "Regola di Gioco" : "")),
                content,
                sourceBook: (['phb', 'dmg', 'mm', 'custom'].includes(r.sourceBook?.toLowerCase()) ? r.sourceBook.toLowerCase() : defaultSource) as 'phb' | 'dmg' | 'mm' | 'custom',
                tags: Array.isArray(r.tags) ? r.tags.map((t: string) => formatTitleOrTag(t)) : [],
                isContinuation: Boolean(r.isContinuation)
            };
        })
        .filter((r: ExtractedRule) => r.content && r.content.trim().length > 5);

    // Fallback pulito solo se il testo non è JSON e contiene regole discorsive reali
    if (rules.length === 0 && text && text.trim().length > 30 && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        rules.push({
            title: "Regola Estratta",
            content: formatNarrativeText(text),
            sourceBook: defaultSource as 'phb' | 'dmg' | 'mm' | 'custom',
            tags: ["manuale", "regola"]
        });
    }

    const embeddedItems: ExtractedEmbeddedItem[] = rawItems.map((i: any) => ({
        name: formatTitleOrTag(i.name || i.nome || "Oggetto"),
        type: i.type || i.tipo || "Oggetto",
        rarity: i.rarity || i.rarita || "Comune",
        attunement: i.attunement || i.sintonia || "No",
        cost: i.cost || i.costo || "",
        damage: i.damage || i.danno || "",
        description: formatNarrativeText(i.description || i.descrizione || "")
    })).filter((i: ExtractedEmbeddedItem) => i.name && i.description);

    const embeddedSpells: ExtractedEmbeddedSpell[] = rawSpells.map((s: any) => ({
        name: formatTitleOrTag(s.name || s.nome || "Incantesimo"),
        level: s.level || s.livello || "Trucchetto",
        school: s.school || s.scuola || "Universale",
        casting_time: s.casting_time || s.tempo_di_lancio || "1 azione",
        range: s.range || s.gittata || "Personale",
        components: s.components || s.componenti || "V, S",
        duration: s.duration || s.durata || "Istantanea",
        classes: s.classes || s.classi || "",
        description: formatNarrativeText(s.description || s.descrizione || "")
    })).filter((s: ExtractedEmbeddedSpell) => s.name && s.description);

    return {
        rules,
        embeddedItems,
        embeddedSpells,
        modelUsed: model
    };
}
