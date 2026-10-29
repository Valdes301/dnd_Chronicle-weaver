/**
 * ============================================================================
 * ⚔️ MODULO ESTRAZIONE ARMERIA & OGGETTI D&D 5e / 2024 💎
 * ============================================================================
 * 
 * Questo modulo gestisce la distinzione e l'estrazione esaustiva tra:
 * 1. ⚔️ ARMERIA:
 *    - Armi (corpo a corpo, distanza, da lancio, magiche e convenzionali)
 *    - Armature (leggere, medie, pesanti) e Scudi
 *    - Macchine d'Assedio, Veicoli da Guerra e Strumenti d'Attacco
 * 
 * 2. 💎 OGGETTI:
 *    - Oggetti Meravigliosi, Anelli, Verghe, Bacchette, Bastoni, Pozioni, Pergamene
 *    - Strumenti Artigianali, Arnesi da Lavoro/Scasso, Kit, Borse e Strumenti Musicali
 *    - Attrezzatura da avventura, Merci e Consumabili
 * 
 * Supporta inoltre:
 * - Riconoscimento e ritaglio coordinate illustrazioni ('imageBox')
 * - Tabelle interne in Markdown (es. liquidi, effetti casuali)
 * - Accorpamento multi-pagina
 */

import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText } from '@/lib/formatter';

export type ItemCategory = 'Armeria' | 'Oggetti';

export type ItemExtractionInput = {
    content?: string;
    photoDataUri?: string;
    selectedModel?: string;
    filterCategory?: 'all' | 'Armeria' | 'Oggetti';
};

export type ExtractedItem = {
    name: string;
    category: ItemCategory;
    type: string;
    rarity: string;
    attunement: string;
    cost?: string;
    weight?: string;
    damage?: string;
    armorClass?: string;
    properties?: string;
    abilityCheck?: string;
    description: string;
    imageBox?: [number, number, number, number];
};

export type ItemExtractionOutput = {
    items: ExtractedItem[];
    modelUsed: string;
};

const ITEM_SYSTEM_INSTRUCTION = `Sei il Mastro Forgiatore, Armaiolo Supremo e Archivista di D&D 5e e 2024.
OBIETTIVO: Analizza la pagina o il testo ed estrai TUTTI gli elementi presenti catalogandoli con precisione assoluta tra "Armeria" e "Oggetti".

CRITERI DI CLASSIFICAZIONE 'category':
1. 'category': "Armeria"
   - Tutte le ARMI (es. Spade, Archi, Giavellotti magici o mondani, Pugnali, Balestre).
   - Tutte le ARMATURE e SCUDI (es. Cotta di maglia, Giaco di maglia elfico, Piastre, Scudo guardiano).
   - Tutte le MACCHINE D'ASSEDIO & VEICOLI DA GUERRA (es. Manganella, Trabucco, Carrozza Lanciafiamme, Lanciabarili, Torre d'Assedio).

2. 'category': "Oggetti"
   - Tutti gli OGGETTI MERAVIGLIOSI, ANELLI, BACCHETTE, BASTONI, POZIONI, PERGAMENE (es. Globo Fluttuante, Guanti del Potere Ogre, Giara Alchemica).
   - Tutti gli STRUMENTI, ARNESI, KIT e STRUMENTI MUSICALI (es. Strumenti da Muratore, Arnesi da Scasso, Borsa da Erborista, Sostanze da Avvelenatore, Giochi).
   - Attrezzatura da avventura varia e merci.

REGOLE DI ESTRAZIONE E FORMATTAZIONE:
- Nomi in italiano ufficiale corretto (es. "Giavellotto del Fulmine", "Guanti del Potere Ogre", "Strumenti da Vasaio").
- 'type': il sottotipo preciso (es. "Arma (Giavellotto)", "Armatura (Giaco di Maglia)", "Macchina d'Assedio (Oggetto Enorme)", "Oggetto Meraviglioso", "Strumento Artigianale", "Arnesi").
- 'rarity': Comune, Non comune, Rara, Molto rara, Leggendaria, Artefatto, oppure vuoto per oggetti mondani.
- 'attunement': "No", "Richiede sintonia", oppure "Richiede sintonia con un incantatore".
- 'cost' e 'weight': estrai costo (es. "10 mo", "25 mo", "1 ma") e peso (es. "4 kg", "0,5 kg") se indicati.
- 'damage' e 'armorClass': se è un'arma o armatura o veicolo d'assedio, compila i danni (es. "1d6 perforante + 4d6 fulmine") o CA e PF.
- 'description': Descrizione dettagliata e integrale in Markdown ricco. Se l'oggetto contiene tabelle (come la tabella dei liquidi della Giara Alchemica), formattala fedelmente in tabella Markdown!
- 'imageBox': Se sulla pagina è presente una chiara illustrazione visibile di quello specifico oggetto/arma, restituisci il rettangolo di delimitazione normalizzato [ymin, xmin, ymax, xmax] con valori da 0 a 1000.

Rispondi ESCLUSIVAMENTE in formato JSON valido con la chiave 'items'.`;

const ITEM_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        items: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    category: { type: "STRING", enum: ["Armeria", "Oggetti"] },
                    type: { type: "STRING" },
                    rarity: { type: "STRING" },
                    attunement: { type: "STRING" },
                    cost: { type: "STRING" },
                    weight: { type: "STRING" },
                    damage: { type: "STRING" },
                    armorClass: { type: "STRING" },
                    properties: { type: "STRING" },
                    abilityCheck: { type: "STRING" },
                    description: { type: "STRING" },
                    imageBox: {
                        type: "ARRAY",
                        items: { type: "INTEGER" },
                        description: "[ymin, xmin, ymax, xmax] normalizzato 0-1000 dell'illustrazione dell'oggetto se visibile"
                    }
                },
                required: ["name", "category", "type", "description"]
            }
        }
    },
    required: ["items"]
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

function normalizeItemBox(box: any): [number, number, number, number] | undefined {
    if (!box) return undefined;
    if (Array.isArray(box) && box.length >= 4) {
        const [ymin, xmin, ymax, xmax] = box.map(Number);
        if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax) && ymax > ymin && xmax > xmin) {
            return [ymin, xmin, ymax, xmax];
        }
    }
    if (typeof box === 'object') {
        const ymin = Number(box.ymin ?? box.top ?? box.y1);
        const xmin = Number(box.xmin ?? box.left ?? box.x1);
        const ymax = Number(box.ymax ?? box.bottom ?? box.y2);
        const xmax = Number(box.xmax ?? box.right ?? box.x2);
        if (!isNaN(ymin) && !isNaN(xmin) && !isNaN(ymax) && !isNaN(xmax) && ymax > ymin && xmax > xmin) {
            return [ymin, xmin, ymax, xmax];
        }
    }
    if (typeof box === 'string') {
        const nums = box.replace(/[\[\]\(\)\{\}\"\'a-zA-Z_:]/g, ' ').trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        if (nums.length >= 4 && nums[2] > nums[0] && nums[3] > nums[1]) {
            return [nums[0], nums[1], nums[2], nums[3]];
        }
    }
    return undefined;
}

export async function extractItemsFromInput(input: ItemExtractionInput): Promise<ItemExtractionOutput> {
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
        text: "Estrai fedelmente TUTTI gli elementi presenti classificandoli in 'Armeria' (armi, armature, macchine d'assedio) oppure 'Oggetti' (oggetti magici/meravigliosi, strumenti, arnesi, kit). Includi tabelle Markdown, costi, pesi, proprietà e le coordinate imageBox delle illustrazioni. Restituisci ESCLUSIVAMENTE il JSON richiesto."
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: ITEM_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: ITEM_RESPONSE_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: 8192,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);
    const rawItems = getArrayResilient(parsed, ['items', 'item', 'oggetti', 'armeria', 'equipment', 'magicItems']);

    const items: ExtractedItem[] = rawItems
        .map((i: any) => {
            const name = formatTitleOrTag(i.name || i.nome || "Oggetto");
            const rawCat = (i.category || '').toLowerCase();
            const rawType = (i.type || i.tipo || '').toLowerCase();
            
            // Determinazione affidabile della categoria Armeria vs Oggetti
            let category: ItemCategory = 'Oggetti';
            if (
                rawCat.includes('armer') ||
                rawCat.includes('arm') ||
                rawType.includes('arma') ||
                rawType.includes('armatura') ||
                rawType.includes('scudo') ||
                rawType.includes('assedio') ||
                rawType.includes('veicolo') ||
                rawType.includes('weapon') ||
                rawType.includes('armor') ||
                i.damage ||
                i.armorClass
            ) {
                category = 'Armeria';
            }

            const validBox = normalizeItemBox(i.imageBox);

            return {
                name,
                category,
                type: i.type || i.tipo || (category === 'Armeria' ? 'Arma / Equipaggiamento Bellico' : 'Oggetto Meraviglioso'),
                rarity: i.rarity || i.rarita || 'Comune',
                attunement: i.attunement || i.sintonia || 'No',
                cost: i.cost || i.costo || '',
                weight: i.weight || i.peso || '',
                damage: i.damage || i.danno || undefined,
                armorClass: i.armorClass || i.classeArmatura || i.ca || undefined,
                properties: i.properties || i.proprieta || undefined,
                abilityCheck: i.abilityCheck || i.provaCaratteristica || undefined,
                description: formatNarrativeText(i.description || i.descrizione || ''),
                imageBox: validBox
            };
        })
        .filter((i: ExtractedItem) => i.name && i.description);

    return {
        items,
        modelUsed: model
    };
}
