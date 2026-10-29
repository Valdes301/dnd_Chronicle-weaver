/**
 * ============================================================================
 * 🛑 FILE PROTETTO E SIGILLATO - SISTEMA DI ESTRAZIONE MOSTRI & BESTIARIO 🛑
 * ============================================================================
 * 
 * ATTENZIONE / AVVISO DI SICUREZZA:
 * Questo file contiene la logica certificata ed ottimizzata per l'estrazione dei 
 * mostri dal Manuale dei Mostri (D&D 5e e 2024), comprensiva di:
 * - Parsing multi-creatura ad altissima fedeltà
 * - Blocco statistiche e tabella caratteristiche in Markdown
 * - Bounding box per ritaglio dell'illustrazione (imageBox) e miniatura/token (tokenBox)
 * - Calcolo automatico e fallback di CA, PF e GS
 * 
 * ⚠️ NON MODIFICARE QUESTO FILE DURANTE LO SVILUPPO DELLE REGOLE O DI ALTRE ENTITÀ.
 * Per le regole di gioco utilizzare 'extract-rules.ts'.
 * Per gli incantesimi utilizzare 'extract-spells.ts'.
 * Per gli oggetti utilizzare 'extract-items.ts'.
 * ============================================================================
 */

import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText, sanitizeMonsterType, sanitizeMonsterName, cleanAiHallucinatoryLoops } from '@/lib/formatter';

export type MonsterExtractionInput = {
    content?: string;
    photoDataUri?: string;
    selectedModel?: string;
};

export type ExtractedMonster = {
    name: string;
    type: string;
    armorClass: string;
    hitPoints: string;
    challenge: string;
    description: string;
    rawPageImage?: string | null;
    imageBox?: { ymin: number; xmin: number; ymax: number; xmax: number } | null;
    tokenBox?: { ymin: number; xmin: number; ymax: number; xmax: number } | null;
};

export type MonsterExtractionOutput = {
    monsters: ExtractedMonster[];
    modelUsed: string;
};

const MONSTER_SYSTEM_INSTRUCTION = `Sei un archivista e trascrittore supremo del Manuale dei Mostri (D&D 5e e 2024) in lingua italiana.
OBIETTIVO: Estrai TUTTE le schede complete di mostri, creature, PNG e varianti presenti nell'immagine o nel testo, conservando INTEGRALMENTE e senza alcun troncamento tutti i paragrafi descrittivi, la storia, l'habitat, i box laterali, la lore (es. introduzioni, ecologia, relazioni, "Nemici del Male Elementale", ecc.) e ogni dettaglio presente sulla pagina.

REGOLE FERREE ED ESTRAZIONE MOSTRI:
1. IDENTIFICAZIONE CREATURA:
   - Ignora decorazioni grafiche, lettere iniziali giganti, stemmi o decorazioni di pagina.
   - Il nome della creatura può essere ovunque: cerca titoli, testo in grassetto o in maiuscolo vicino a blocchi di statistiche.
   - DEVI SEMPRE ricomporre il nome completo della creatura (es. "Aarakocra").
   - NON aggiungere diciture come "(Illustrazione)", "(Artwork)" nel nome.

2. ESTRAZIONE MULTI-MOSTRO:
   - Estrai TUTTE le creature singolarmente. Se la pagina ha una colonna a sinistra e una a destra, cerca in entrambe.
   - Includi sempre box laterali, capacità di gruppo o varianti nella 'description'.

3. STATISTICHE & LORE INTEGRALE E SENZA OMISSIONI (MASSIMA PRIORITÀ):
   - Estrai con precisione: 'armorClass', 'hitPoints', 'challenge', 'type'.
   - Nel campo 'description', INCLUDI INTEGRALMENTE:
     * La tabella delle caratteristiche in Markdown (| FOR | DES | COS | INT | SAG | CAR |)
     * Il blocco di statistiche completo (CA, PF, Velocità, Abilità, Sensi, Linguaggi, Sfida)
     * TUTTE le azioni, reazioni, tratti speciali, tana ed effetti regionali
     * TRASCRIZIONE TOTALE DI OGNI SINGOLO PARAGRAFO DI LORE (NESSUNA OMISSIONE O SINTESI):
       Trascrivi PAROLA PER PAROLA ogni singolo paragrafo di ambientazione, storia, origini, ecologia, cultura e comportamento.
       Includi TUTTI i sottotitoli e riquadri narrativi con intestazione Markdown dedicata (es. '### Nemici del Male Elementale\n\n...', '### Sul Piano Materiale\n\n...', '### Alla Ricerca dei Sette Frammenti\n\n...', '### Evocare Elementali dell\'Aria\n\n...').
       Anche se la spiegazione della creatura si estende su 2 o più pagine, o si trova incolonnata attorno o sotto le illustrazioni, DEVI estrarla e trascriverla INTEGRALMENTE senza mai riassumere o tagliare nulla.
   - FORMATTAZIONE MARKDOWN RIGOROSA:
     * GARANTISCI SEMPRE uno spazio dopo i due punti (:).
     * GARANTISCI SEMPRE uno spazio dopo la fine di una sezione in grassetto (es. **Abilità:** ).
     * Inserisci SEMPRE almeno una riga vuota tra sezioni diverse (es. tra abilità, azioni, e lore).
     * Non attaccare mai testo a simboli di formattazione (es. usa **Titolo:** Testo).
4. IMMAGINE E PAGINA INTERA:
   - Associa l'intera pagina come immagine di riferimento principale.

Rispondi ESCLUSIVAMENTE in JSON valido conforme allo schema.`;

const MONSTER_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        pageAnalysis: {
            type: "OBJECT",
            description: "Analisi visiva preliminare e inventario completo di tutte le creature presenti sulla pagina prima di compilare le schede dettagliate.",
            properties: {
                pageLayout: { type: "STRING", description: "Layout rilevato: 'colonna_singola', 'due_colonne', 'piu_colonne', 'riquadri_verticali'" },
                detectedCreatures: {
                    type: "ARRAY",
                    items: { type: "STRING" },
                    description: "Elenco di TUTTI i nomi o titoli di creature/mostri visibili nella pagina (ispezionando accuratamente colonna sinistra E destra)."
                }
            }
        },
        monsters: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    type: { type: "STRING", description: "Breve tipo, taglia e allineamento (es. 'Umanoide Medio (Aarakocra), Neutrale Buono'). Massimo 80 caratteri, nessuna lore o commenti qui." },
                    armorClass: { type: "STRING" },
                    hitPoints: { type: "STRING" },
                    challenge: { type: "STRING" },
                    description: { type: "STRING" },
                    imageBox: {
                        type: "OBJECT",
                        properties: {
                            ymin: { type: "NUMBER" },
                            xmin: { type: "NUMBER" },
                            ymax: { type: "NUMBER" },
                            xmax: { type: "NUMBER" }
                        }
                    },
                    tokenBox: {
                        type: "OBJECT",
                        properties: {
                            ymin: { type: "NUMBER" },
                            xmin: { type: "NUMBER" },
                            ymax: { type: "NUMBER" },
                            xmax: { type: "NUMBER" }
                        }
                    }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["monsters"]
};

function normalizeBox(box: any): { ymin: number; xmin: number; ymax: number; xmax: number } | null {
    if (!box) return null;
    let ymin: any, xmin: any, ymax: any, xmax: any;

    if (typeof box === 'string') {
        const nums = box.replace(/[\[\]\(\)\{\}\"\'a-zA-Z_:]/g, ' ').trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        if (nums.length >= 4) [ymin, xmin, ymax, xmax] = nums;
    } else if (Array.isArray(box) && box.length >= 4) {
        [ymin, xmin, ymax, xmax] = box;
    } else if (typeof box === 'object') {
        ymin = box.ymin ?? box.top ?? box.y1 ?? box.box_2d?.[0];
        xmin = box.xmin ?? box.left ?? box.x1 ?? box.box_2d?.[1];
        ymax = box.ymax ?? box.bottom ?? box.y2 ?? box.box_2d?.[2];
        xmax = box.xmax ?? box.right ?? box.x2 ?? box.box_2d?.[3];
    }

    if (ymin != null && xmin != null && ymax != null && xmax != null) {
        let nYmin = Number(ymin);
        let nXmin = Number(xmin);
        let nYmax = Number(ymax);
        let nXmax = Number(xmax);

        if (!isNaN(nYmin) && !isNaN(nXmin) && !isNaN(nYmax) && !isNaN(nXmax)) {
            // Se le coordinate sono in formato decimale 0..1, converti a 0..1000
            if (Math.max(nYmin, nXmin, nYmax, nXmax) <= 1.05) {
                nYmin = Math.round(nYmin * 1000);
                nXmin = Math.round(nXmin * 1000);
                nYmax = Math.round(nYmax * 1000);
                nXmax = Math.round(nXmax * 1000);
            }
            const realYmin = Math.max(0, Math.min(nYmin, nYmax));
            const realYmax = Math.min(1000, Math.max(nYmin, nYmax));
            const realXmin = Math.max(0, Math.min(nXmin, nXmax));
            const realXmax = Math.min(1000, Math.max(nXmin, nXmax));

            if (realYmax - realYmin >= 10 && realXmax - realXmin >= 10) {
                return { ymin: realYmin, xmin: realXmin, ymax: realYmax, xmax: realXmax };
            }
        }
    }
    return null;
}

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

/**
 * Pulisce il nome dell'entità evitando duplicazioni (es. "AarakocraAarakocra" -> "Aarakocra")
 * e rimuovendo suffissi non desiderati come "(Illustrazione)" o numeri di pagina.
 */
function standardizeMonsterName(name: string, type: string = ''): string {
    if (!name) return '';
    const clean = sanitizeMonsterName(name);
    const low = clean.toLowerCase();
    const typeLow = (type || '').toLowerCase();

    if (typeLow.includes('demone') && !low.startsWith('demone:') && !low.startsWith('demone ')) {
        return `Demone: ${clean}`;
    }
    if (typeLow.includes('diavolo') && !low.startsWith('diavolo:') && !low.startsWith('diavolo ')) {
        return `Diavolo: ${clean}`;
    }
    if (typeLow.includes('celestiale') || typeLow.includes('angelo')) {
        if (low === 'deva' || low === 'planetar' || low === 'solar' || low === 'angelo') {
            const sub = (low === 'planetar') ? 'Planetar' : ((low === 'solar') ? 'Solar' : 'Deva');
            return `Angelo: ${sub}`;
        }
    }
    return clean;
}

/**
 * Pulisce la descrizione da eventuale codice JSON grezzo sfuggito dai prompt
 */
function sanitizeDescription(desc: string): string {
    if (!desc) return '';
    let clean = desc.trim();

    // Se la descrizione è un frammento JSON grezzo (es. { "monsters": [...] })
    if (clean.startsWith('{') || clean.startsWith('[') || clean.includes('{"monsters":')) {
        try {
            const parsed = JSON.parse(clean);
            if (parsed.description) return formatNarrativeText(parsed.description);
            if (Array.isArray(parsed.monsters) && parsed.monsters[0]?.description) {
                return formatNarrativeText(parsed.monsters[0].description);
            }
        } catch {
            // Se il parsing JSON fallisce, ripuliamo via regex
            clean = clean.replace(/^\{[\s\S]*?"description":\s*"/i, '');
            clean = clean.replace(/"\s*\}[\s\S]*$/, '');
            clean = clean.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
    }

    return formatNarrativeText(clean);
}

/**
 * Funzione certificata di estrazione mostri da pagina/immagine.
 */
export async function extractMonstersFromInput(input: MonsterExtractionInput): Promise<MonsterExtractionOutput> {
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
            text: `CONTENUTO DELLA PAGINA:\n${content.trim()}`
        });
    }

    contents.push({
        text: `PROTOCOLLO DI SCANSIONE UNIVERSALE MULTI-COLONNA:
1. Ispeziona visivamente l'intera pagina suddividendola in colonne e sezioni indipendenti:
   - COLONNA SINISTRA: verifica se è presente una creatura (illustrazione e/o blocco statistiche).
   - COLONNA DESTRA: verifica se è presente una seconda creatura (illustrazione e/o blocco statistiche).
   - PARTE SUPERIORE / INFERIORE: verifica eventuali altre creature o varianti disposte verticalmente.
2. Compila innanzitutto 'pageAnalysis':
   - 'pageLayout': es. 'colonna_singola', 'due_colonne', 'piu_colonne', 'riquadri_verticali'.
   - 'detectedCreatures': inventario esaustivo di TUTTI i mostri/PNG individuati nella pagina (esaminando entrambe le colonne).
3. Inserisci TUTTI i mostri censiti dentro l'array 'monsters' con statblock completo (CA, PF, GS, tabella caratteristiche, azioni e lore). NON fermarti mai al primo mostro!
4. Assegna a CIASCUN mostro il proprio 'imageBox' (coordinate normalizzate 0-1000 dell'illustrazione propria di quella creatura) e 'tokenBox' (testa/volto).
5. Se la pagina è puramente un indice, sommario o testo introduttivo privo di schede, restituisci {"monsters": []}. Restituisci ESCLUSIVAMENTE il JSON richiesto.`
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: MONSTER_SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 32768,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);

    let rawMonsters = getArrayResilient(parsed, ['monsters', 'monster', 'mostri', 'mostro', 'bestiario', 'creatures', 'creature', 'creatura', 'newMonsters', 'new_monsters']);
    if (rawMonsters.length === 0 && parsed.name && (parsed.armorClass || parsed.hitPoints || parsed.type || parsed.ca || parsed.pf || parsed.classeArmatura)) {
        rawMonsters = [parsed];
    }

    const invalidNameBlacklist = ['indice', 'indice analitico', 'sommario', 'table of contents', 'manuale dei mostri', 'appendice', 'introduzione', 'mostri', 'creature'];

    const monsters: ExtractedMonster[] = rawMonsters
        .map((m: any) => {
            const rawName = (m.name || m.nome || m.titolo || '').toString();
            const rawType = (m.type || m.tipo || 'Mostro').toString();
            const cleanName = standardizeMonsterName(rawName, rawType);

            const imgBox = normalizeBox(m.imageBox || m.box || m.coordinate || m.riquadro || m.image_box);
            let tokBox = normalizeBox(m.tokenBox || m.token_box);
            
            if (!tokBox && imgBox) {
                const boxW = Math.abs(imgBox.xmax - imgBox.xmin);
                const boxH = Math.abs(imgBox.ymax - imgBox.ymin);
                const size = Math.min(boxW, boxH * 0.7);
                const centerX = imgBox.xmin + boxW / 2;
                const topY = imgBox.ymin + (boxH * 0.1);
                tokBox = {
                    ymin: Math.max(0, Math.round(topY)),
                    xmin: Math.max(0, Math.round(centerX - size / 2)),
                    ymax: Math.min(1000, Math.round(topY + size)),
                    xmax: Math.min(1000, Math.round(centerX + size / 2))
                };
            }

            let desc = sanitizeDescription(m.description || m.descrizione || m.lore || m.testo || '');
            let ac = m.armorClass || m.ca || m.classeArmatura || m.classe_armatura || m.armor_class || '';
            if (!ac && desc) {
                const acMatch = desc.match(/(?:Classe Armatura|CA|Armor Class)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
                if (acMatch) ac = acMatch[1].trim().replace(/\*+/g, '');
            }
            let hp = m.hitPoints || m.pf || m.puntiFerita || m.punti_ferita || m.hit_points || '';
            if (!hp && desc) {
                const hpMatch = desc.match(/(?:Punti Ferita|PF|Hit Points)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
                if (hpMatch) hp = hpMatch[1].trim().replace(/\*+/g, '');
            }
            let cr = m.challenge || m.gs || m.gradoSfida || m.grado_sfida || m.sfida || '';
            if (!cr && desc) {
                const crMatch = desc.match(/(?:Grado di Sfida|Sfida|GS|Challenge)[:\s*]+([0-9\/]+[^\n\r\|]*)/i);
                if (crMatch) cr = crMatch[1].trim().replace(/\*+/g, '');
            }

            const cleanType = sanitizeMonsterType(rawType);
            const cleanDesc = cleanAiHallucinatoryLoops(desc);

            return {
                name: cleanName || 'Creatura',
                type: cleanType,
                armorClass: ac,
                hitPoints: hp,
                challenge: cr,
                description: cleanDesc,
                imageUrl: photoDataUri || null,
                thumbnailUrl: photoDataUri || null,
                rawPageImage: photoDataUri || null,
                imageBox: imgBox,
                tokenBox: tokBox
            };
        })
        .filter((m: ExtractedMonster) => {
            // Filtra indici, sommari e voci vuote o spurie
            const lowerName = m.name.toLowerCase().trim();
            if (invalidNameBlacklist.includes(lowerName)) return false;
            if (lowerName.startsWith('pagina ') || lowerName.startsWith('pag. ')) return false;
            if (!m.name || m.name.length < 2) return false;
            // Se non ha descrizione né statistiche, non è una scheda mostro
            if (!m.description && !m.armorClass && !m.hitPoints && !m.challenge) return false;
            // Se la descrizione è solo una menzione di indice (es. "Pagina 12 dell'indice")
            if (m.description.toLowerCase().includes("pagina") && m.description.length < 40 && !m.armorClass && !m.hitPoints) return false;
            return true;
        });

    // Calcolo automatico e universale del tokenBox per qualsiasi creatura provvista di imageBox
    if (photoDataUri && monsters.length > 0) {
        for (const m of monsters) {
            if (!m.tokenBox && m.imageBox) {
                const boxW = Math.abs(m.imageBox.xmax - m.imageBox.xmin);
                const boxH = Math.abs(m.imageBox.ymax - m.imageBox.ymin);
                const size = Math.min(boxW, boxH * 0.7);
                const centerX = m.imageBox.xmin + boxW / 2;
                const topY = m.imageBox.ymin + (boxH * 0.1);
                m.tokenBox = {
                    ymin: Math.max(0, Math.round(topY)),
                    xmin: Math.max(0, Math.round(centerX - size / 2)),
                    ymax: Math.min(1000, Math.round(topY + size)),
                    xmax: Math.min(1000, Math.round(centerX + size / 2))
                };
            }
        }
    }

    return {
        monsters,
        modelUsed: model
    };
}
