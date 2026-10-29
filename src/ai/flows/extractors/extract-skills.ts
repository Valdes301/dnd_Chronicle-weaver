/**
 * ============================================================================
 * 🧠 MODULO ESTRAZIONE ABILITÀ, PRIVILEGI, TRATTI DI SPECIE & TALENTI 🧠
 * ============================================================================
 * 
 * Questo modulo è dedicato all'estrazione di:
 * - Privilegi di Classe & Sottoclasse (per livello e con tipo azione/risorsa)
 * - Tratti di Specie / Razza (es. Goliath, Elfi, Nani con varianti e taglie)
 * - Talenti e Capacità speciali (prerequisiti, benefici scalari)
 * - Abilità standard (caratteristica associata, CD)
 */

import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText } from '@/lib/formatter';

export type SkillCategory = 
    | 'Privilegio di Sottoclasse'
    | 'Privilegio di Classe'
    | 'Tratto di Specie'
    | 'Talento'
    | 'Abilità Standard'
    | 'Capacità Speciale';

export type SkillExtractionInput = {
    content?: string;
    photoDataUri?: string;
    selectedModel?: string;
};

export type ExtractedSkill = {
    name: string;
    category: SkillCategory;
    sourceName?: string;
    level?: string;
    ability?: string;
    actionType?: string;
    description: string;
};

export type SkillExtractionOutput = {
    skills: ExtractedSkill[];
    modelUsed: string;
};

const SKILL_SYSTEM_INSTRUCTION = `Sei l'Archivista e Maestro delle Regole dei Personaggi di D&D 5e e 2024.
OBIETTIVO: Analizza la pagina o il testo ed estrai con precisione e completezza TUTTI i PRIVILEGI DI CLASSE/SOTTOCLASSE, TRATTI DI SPECIE, TALENTI e ABILITÀ nell'array 'skills'.

TIPI DI CATEGORIE 'category':
- "Privilegio di Sottoclasse": capacità sbloccate da domini, cammini, archetipi o collegi (es. "Invocare Duplicato", "Bagliore di Interdizione", "Duplicato Migliorato").
- "Privilegio di Classe": capacità base della classe (es. "Incanalare Divinità", "Attacco Furtivo", "Azione Impetuosa", "Ira").
- "Tratto di Specie": tratti razziali o di specie (es. "Tratti del Goliath", "Costituzione Robusta", "Discendenza Gigantica", "Scurovisione").
- "Talento": talenti generali o con prerequisiti (es. "Allerta", "Tiratore Scelto", "Maestro d'Armi Aste").
- "Abilità Standard": competenze e prove di abilità (es. "Atletica", "Furtività", "Percezione").
- "Capacità Speciale": altre doti, manovre o tratti unici.

PARAMETRI DI ESTRAZIONE:
- 'name': Nome esatto in italiano (es. "Invocare Duplicato", "Costituzione Robusta", "Bagliore di Interdizione").
- 'category': Uno dei valori ammessi sopra.
- 'sourceName': Origine/classe/specie (es. "Chierico (Dominio dell'Inganno)", "Chierico (Dominio della Luce)", "Specie: Goliath").
- 'level': Livello richiesto (es. "Livello 3", "Livello 6", "Livello 17", "1° Livello") se specificato.
- 'actionType': Tipo di attivazione (es. "Azione Bonus", "Reazione", "Azione", "Passivo").
- 'ability': Caratteristica chiave (es. "Saggezza", "Forza", "Destrezza", "Costituzione") se applicabile.
- 'description': Testo esaustivo e fedele in Markdown, preservando tutte le varianti ed elenchi (es. i diversi tipi di giganti per il Goliath o le funzioni dell'illusione).

Rispondi ESCLUSIVAMENTE in formato JSON valido con la chiave 'skills'.`;

const SKILL_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        skills: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    category: { 
                        type: "STRING", 
                        enum: [
                            "Privilegio di Sottoclasse",
                            "Privilegio di Classe",
                            "Tratto di Specie",
                            "Talento",
                            "Abilità Standard",
                            "Capacità Speciale"
                        ] 
                    },
                    sourceName: { type: "STRING" },
                    level: { type: "STRING" },
                    ability: { type: "STRING" },
                    actionType: { type: "STRING" },
                    description: { type: "STRING" }
                },
                required: ["name", "category", "description"]
            }
        }
    },
    required: ["skills"]
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

export async function extractSkillsFromInput(input: SkillExtractionInput): Promise<SkillExtractionOutput> {
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
        text: "Estrai fedelmente TUTTI i privilegi di classe/sottoclasse, tratti di specie, talenti e capacità speciali presenti, categorizzandoli correttamente. Restituisci ESCLUSIVAMENTE il JSON con l'array 'skills'."
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: SKILL_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: SKILL_RESPONSE_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: 8192,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);
    const rawSkills = getArrayResilient(parsed, ['skills', 'skill', 'abilita', 'capacita', 'privilegi', 'tratti', 'talenti']);

    const validCategories: SkillCategory[] = [
        'Privilegio di Sottoclasse',
        'Privilegio di Classe',
        'Tratto di Specie',
        'Talento',
        'Abilità Standard',
        'Capacità Speciale'
    ];

    const skills: ExtractedSkill[] = rawSkills
        .map((s: any) => {
            let cat: SkillCategory = 'Capacità Speciale';
            if (validCategories.includes(s.category)) {
                cat = s.category;
            } else {
                const lowerCat = (s.category || '').toLowerCase();
                if (lowerCat.includes('sotto') || lowerCat.includes('dominio')) cat = 'Privilegio di Sottoclasse';
                else if (lowerCat.includes('classe')) cat = 'Privilegio di Classe';
                else if (lowerCat.includes('specie') || lowerCat.includes('razz')) cat = 'Tratto di Specie';
                else if (lowerCat.includes('talent')) cat = 'Talento';
                else if (lowerCat.includes('abilit')) cat = 'Abilità Standard';
            }

            return {
                name: formatTitleOrTag(s.name || s.nome || "Capacità"),
                category: cat,
                sourceName: s.sourceName || s.origine || s.classe || s.specie || undefined,
                level: s.level || s.livello || undefined,
                ability: s.ability || s.caratteristica || undefined,
                actionType: s.actionType || s.tipoAzione || undefined,
                description: formatNarrativeText(s.description || s.descrizione || "")
            };
        })
        .filter((s: ExtractedSkill) => s.name && s.description);

    return {
        skills,
        modelUsed: model
    };
}
