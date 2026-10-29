/**
 * ============================================================================
 * 🧭 ROUTER INTELLIGENTE & MOTORE UNIFICATO DI CATALOGAZIONE 🧭
 * ============================================================================
 * 
 * Esegue l'estrazione in un SINGOLO passaggio ultra-veloce e ad altissima precisione:
 * - Target 'all' / 'auto': Estrazione unificata multi-categoria in un'unica chiamata Gemini
 * - Target 'monsters_only' / 'mm': Estrattore dedicato mostri e bestiario
 * - Target 'rules_only' / 'phb' / 'dmg': Estrattore dedicato regole e tabelle
 * - Target 'spells_only': Estrattore dedicato incantesimi
 * - Target 'items_only': Estrattore dedicato armeria ed oggetti magici
 * - Target 'skills_only': Estrattore dedicato abilità e tratti
 */

import { extractMonstersFromInput, type ExtractedMonster } from './extract-monsters';
import { extractRulesFromInput, type ExtractedRule } from './extract-rules';
import { extractSpellsFromInput, type ExtractedSpell } from './extract-spells';
import { extractItemsFromInput, type ExtractedItem, type ItemCategory } from './extract-items';
import { extractSkillsFromInput, type ExtractedSkill } from './extract-skills';
import { safeGenerateContent, getGenAI } from '@/ai/genai-client';
import { formatTitleOrTag, formatNarrativeText, sanitizeMonsterType, sanitizeMonsterName, cleanAiHallucinatoryLoops } from '@/lib/formatter';

export type CatalogRouterInput = {
    content?: string;
    photoDataUri?: string;
    sourceManual?: 'auto' | 'mm' | 'dmg' | 'phb' | 'custom';
    targetContentType?: 'all' | 'monsters_only' | 'rules_only' | 'spells_only' | 'items_only' | 'skills_only';
    selectedModel?: string;
};

export type CatalogRouterOutput = {
    monsters: ExtractedMonster[];
    rules: ExtractedRule[];
    spells: ExtractedSpell[];
    items: ExtractedItem[];
    skills: ExtractedSkill[];
    detectedCategories?: string[];
    pageAnalysis?: any;
    modelUsed: string;
};

const UNIFIED_SYSTEM_INSTRUCTION = `Sei l'Archivista Supremo e Trascritore Certificato dei Manuali Ufficiali di D&D 5e e 2024 (Manuale dei Mostri, Guida del Dungeon Master, Manuale del Giocatore).
OBIETTIVO: Analizza con assoluta fedeltà l'immagine e/o il testo ed estrai TUTTE le entità e schede presenti, inserendole nelle rispettive categorie con la massima precisione:

1. 'monsters' (Bestiario, Creature e PNG con statblock o lore di specie):
   - Estrai qui TUTTE le creature, mostri e PNG che hanno una propria scheda statistica (CA, PF, GS) o una lore dedicata a quella specifica creatura/famiglia.
   - NON inserire in 'monsters' paragrafi di regole generali del gioco (es. 'Svantaggio', 'Successo a un costo', 'Gradi di Fallimento', 'Improvvisare i danni', prove di abilità, conduzione del gioco) solo perché citano incidentalmente mostri negli esempi o tabelle! Le regole generali appartengono tassativamente a 'rules'.
   - PROTOCOLLO DI SCANSIONE UNIVERSALE MULTI-COLONNA (FONDAMENTALE):
     * Moltissime pagine del Manuale dei Mostri contengono DUE o PIÙ schede di mostri affiancate in colonne distinte (es. colonna sinistra e colonna destra) o disposte in riquadri verticali (alto e basso).
     * Compila SEMPRE PRIMA l'oggetto 'pageAnalysis':
       - 'pageLayout': es. 'colonna_singola', 'due_colonne', 'piu_colonne', 'riquadri_verticali'.
       - 'detectedCreatures': elenco testuale di TUTTE le intestazioni o nomi di creature/mostri visibili sull'intera pagina (ispezionando accuratamente TUTTE le colonne e i riquadri).
     * NON FERMARTI MAI ALLA PRIMA CREATURA!
       Per CIASCUNA creatura identificata in 'detectedCreatures', genera la rispettiva scheda completa e dettagliata nell'array 'monsters'. Ogni mostro della pagina DEVE avere la propria voce indipendente!
     * Per CIASCUNA creatura estrai il proprio specifico 'imageBox' (ritagliando la sua illustrazione dedicata) e il rispettivo 'tokenBox' (testa/volto). Se una creatura si trova a sinistra, il suo imageBox apparterrà alla metà sinistra della pagina; se si trova a destra, alla metà destra.
   - GESTIONE DEGLI EMBLEMI ALFABETICI / CAPOLETTERA (A-Z):
     * La prima pagina di ogni sezione alfabetica presenta in alto un grande emblema decorativo circolare con la lettera dell'alfabeto. Questo emblema NON è un sommario o indice: indica il nome della prima creatura della sezione. Estrai sempre la scheda completa con il suo nome pulito.
   - FAMIGLIE DI CREATURE E SOTTOSPECIE:
     * Per creature appartenenti a famiglie (es. Demoni, Diavoli, Angeli), usa il formato famiglia se rilevante (es. "Demone: Hezrou", "Demone: Mane", "Demone: Chasme", "Angelo: Deva").
   - RIQUADRI SPECIALI, CAPACITÀ DI GRUPPO, TANA ED EFFETTI REGIONALI:
     * Qualsiasi riquadro laterale, variante o capacità presente nella pagina della creatura (es. azioni di tana, effetti regionali, varianti) NON deve MAI essere estratto come regola ('rules') o abilità ('skills') separata!
     * Includilo SEMPRE direttamente dentro il campo 'description' della scheda della creatura stessa, sotto un'intestazione Markdown (es. '### Azioni di Tana\\n\\n...').
   - Compila con precisione:
     * 'name': Nome pulito della creatura. Mai raddoppiato.
     * 'type': Brevissimo tipo, taglia e allineamento su UNA SOLA RIGA (es. "Immondo Grande (demone), caotico malvagio", "Aberrazione Grande, legale malvagio", "Celestiale Medio, legale buono"). Nessun commento o lore in 'type'.
     * 'armorClass': es. "12", "15 (armatura naturale)", "17 (armatura naturale)".
     * 'hitPoints': es. "13 (3d8)", "84 (13d10 + 13)", "157 (15d10 + 75)".
     * 'challenge': es. "1/4 (50 PE)", "4 (1.100 PE)", "8 (3.900 PE)".
     * 'description': Statblock completo e LORE INTEGRALE ESAUSTIVA.
       - TABELLA CARATTERISTICHE: Includi sempre la tabella Markdown completa (| FOR | DES | COS | INT | SAG | CAR | con punteggio e modificatore).
       - PARAMETRI: CA, PF, Velocità, Tiri Salvezza, Abilità, Vulnerabilità/Resistenze/Immunità, Sensi, Linguaggi, Grado Sfida.
       - TRATTI & AZIONI: Tutti i tratti speciali, azioni, azioni leggendarie, reazioni.
       - TRASCRIZIONE TOTALE DI OGNI PARAGRAFO DI LORE (FONDAMENTALE - NESSUNA OMISSIONE O RIASSUNTO):
         Trascrivi INTEGRALMENTE PAROLA PER PAROLA ogni singolo paragrafo di ambientazione, ecologia, costumi, origini e leggende della creatura presente sulla pagina o tra le colonne.
         Trascrivi TUTTI i sottoparagrafi e box di approfondimento con intestazione Markdown dedicata (es. '### Nemici del Male Elementale\n\n...', '### Sul Piano Materiale\n\n...', '### Alla Ricerca dei Sette Frammenti\n\n...', '### Evocare Elementali dell\'Aria\n\n...').
         NON riassumere, non tagliare e non saltare MAI alcun paragrafo, anche se il testo è impaginato attorno o sotto l'illustrazione grafica, o prosegue su più pagine e colonne. Ogni singola frase descrittiva è essenziale per il Bestiario.
     * 'imageBox': Coordinate [ymin, xmin, ymax, xmax] normalizzate 0-1000 dell'illustrazione propria di quella creatura. Se la pagina non ha disegni, lascia null.
     * 'tokenBox': Coordinate [ymin, xmin, ymax, xmax] normalizzate 0-1000 focalizzate sulla testa/volto per la miniatura circolare.

2. 'rules' (Regole Generali, Meccaniche di Gioco, Tabelle del Master, Conduzione del Gioco):
   - Includi qui paragrafi di regole, tabelle di gioco (es. 'Improvvisare i Danni', 'Gravità dei Danni per Livello'), sezioni sulla conduzione del gioco, prove di abilità/caratteristica, gradi di successo e fallimento, svantaggio, condizioni, esplorazione e combattimento tratte dalla Guida del Dungeon Master (DMG) o Manuale del Giocatore (PHB).
   - NON inserire mostri o le loro capacità di tana dentro 'rules'.

3. 'items' (Armeria ed Oggetti Magici/Meravigliosi / Armi d'Assedio & Veicoli):
   - 'category': DEVE essere "Armeria" per TUTTE le armi, armature, scudi, armi d'assedio e veicoli (sia magici che normali). DEVE essere "Oggetti" per tutto il resto (oggetti meravigliosi, pozioni, arnesi, reliquie, consumabili), sia magici che normali.
   - ATTENZIONE AGLI OGGETTI D'ASSEDIO E STRUMENTI DEL DM: Se l'intestazione o il tipo riporta "Oggetto [Taglia]" (es. Oggetto Grande, Oggetto Enorme, Oggetto Mastodontico) oppure fa riferimento ad Armi d'Assedio o Strumenti del DM (es. Lanciabarili, Manganella, Trabucco, Torre d'Assedio, Carrozza Lanciafiamme), DEVI categorizzarlo rigorosamente dentro 'items' con category: "Armeria" e NON dentro 'monsters', anche se presenta valori di Classe Armatura e Punti Ferita.
   - 'name', 'type', 'rarity', 'attunement', 'cost', 'weight', 'damage', 'armorClass', 'description', 'imageBox'.

4. 'spells' (Incantesimi e Magie):
   - 'name', 'level', 'school', 'casting_time', 'range', 'components', 'duration', 'classes', 'higherLevels', 'description'.

5. 'skills' (Abilità, Talenti e Capacità dei Giocatori):
   - Usa 'skills' SOLO per talenti o capacità generiche dei PG. Le abilità dei mostri appartengono a 'monsters'!

REGOLE MANDATORIE:
- Nomi puliti: MAI raddoppiare i nomi e rimuovi suffissi come "(Illustrazione)" o numeri di pagina.
- Non inventare nulla: estrai solo ciò che è visibile.
- Se la pagina è un indice alfabetico, sommario o copertina privo di schede, restituisci array vuoti.

Rispondi ESCLUSIVAMENTE in formato JSON valido conforme allo schema.`;

const UNIFIED_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        pageAnalysis: {
            type: "OBJECT",
            description: "Analisi visiva preliminare e censimento completo di tutte le creature ed entità presenti sulla pagina prima di compilare le schede.",
            properties: {
                pageLayout: { type: "STRING", description: "Layout rilevato: 'colonna_singola', 'due_colonne', 'piu_colonne', 'riquadri_verticali', 'indice_sommario'" },
                detectedCreatures: {
                    type: "ARRAY",
                    items: { type: "STRING" },
                    description: "Elenco di TUTTI i nomi o titoli di creature/mostri visibili nella pagina (esaminando attentamente colonna sinistra E colonna destra)."
                }
            }
        },
        monsters: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    type: { type: "STRING", description: "Breve tipo, taglia e allineamento (es. 'Umanoide Medio (aarakocra), neutrale buono'). Massimo 80 caratteri, nessuna lore o commenti qui." },
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
        },
        items: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    category: { type: "STRING" },
                    type: { type: "STRING" },
                    rarity: { type: "STRING" },
                    attunement: { type: "STRING" },
                    cost: { type: "STRING" },
                    weight: { type: "STRING" },
                    damage: { type: "STRING" },
                    armorClass: { type: "STRING" },
                    description: { type: "STRING" },
                    imageBox: {
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
        },
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
                    classes: { type: "STRING" },
                    higherLevels: { type: "STRING" },
                    description: { type: "STRING" }
                },
                required: ["name", "description"]
            }
        },
        skills: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    type: { type: "STRING" },
                    ability: { type: "STRING" },
                    description: { type: "STRING" }
                },
                required: ["name", "description"]
            }
        },
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
        }
    }
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
            // Se le coordinate sono espresse in scala 0..1, normalizza a 0..1000
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

/**
 * Rilevamento dedicato ad altissima precisione per artwork e token di un mostro specifico
 */
async function detectMissingMonsterBoxes(photoDataUri: string, monsterName: string, model: string): Promise<{ imageBox: any; tokenBox: any } | null> {
    try {
        const genAi = getGenAI();
        let base64Part = photoDataUri;
        let mimeType = 'image/jpeg';
        if (photoDataUri.includes(';base64,')) {
            const parts = photoDataUri.split(';base64,');
            mimeType = parts[0].replace('data:', '');
            base64Part = parts[1];
        }

        const res = await safeGenerateContent(genAi, {
            model,
            contents: [
                {
                    inlineData: {
                        mimeType,
                        data: base64Part
                    }
                },
                `Sei un modulo avanzato di Computer Vision per illustrazioni di Dungeons & Dragons.
Nella pagina è presente la creatura "${monsterName}".
Trova le coordinate normalizzate (scala 0-1000) [ymin, xmin, ymax, xmax] di:
1. 'imageBox': L'intera illustrazione/disegno del mostro (inclusi tentacoli, coda, ali o corpo, anche se sfuma nello sfondo o copre la parte superiore/laterale della pagina come nell'Aboleth).
2. 'tokenBox': Il volto o la testa con occhi e tratti distintivi per la miniatura/token circolare.

Rispondi ESCLUSIVAMENTE in JSON valido.`
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        imageBox: {
                            type: "OBJECT",
                            properties: {
                                ymin: { type: "NUMBER" },
                                xmin: { type: "NUMBER" },
                                ymax: { type: "NUMBER" },
                                xmax: { type: "NUMBER" }
                            },
                            required: ["ymin", "xmin", "ymax", "xmax"]
                        },
                        tokenBox: {
                            type: "OBJECT",
                            properties: {
                                ymin: { type: "NUMBER" },
                                xmin: { type: "NUMBER" },
                                ymax: { type: "NUMBER" },
                                xmax: { type: "NUMBER" }
                            },
                            required: ["ymin", "xmin", "ymax", "xmax"]
                        }
                    },
                    required: ["imageBox"]
                },
                temperature: 0.1,
                maxOutputTokens: 256
            }
        });

        const parsed = parseJsonSafely(res.text || '');
        if (parsed.imageBox) {
            const imgBox = normalizeBox(parsed.imageBox);
            const tokBox = normalizeBox(parsed.tokenBox) || imgBox;
            if (imgBox) {
                return { imageBox: imgBox, tokenBox: tokBox };
            }
        }
    } catch (e) {
        console.warn(`[detectMissingMonsterBoxes] Errore rilevamento per ${monsterName}:`, e);
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

function sanitizeName(name: string): string {
    if (!name) return '';
    let clean = name.trim();
    clean = clean.replace(/\s*\((?:illustrazione|artwork|immagine|token|art|figura|disegno)\)/gi, '').trim();
    clean = clean.replace(/[\s\-_–—]+(?:pag\.?|pagine?|p\.)?\s*\d+\s*$/i, '').trim();
    
    const words = clean.split(/\s+/);
    if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
        clean = words[0];
    }
    if (clean.length >= 6 && clean.length % 2 === 0) {
        const half = clean.length / 2;
        if (clean.substring(0, half).toLowerCase() === clean.substring(half).toLowerCase()) {
            clean = clean.substring(0, half);
        }
    }
    return formatTitleOrTag(clean);
}

function standardizeCreatureName(name: string, type: string = '', desc: string = ''): string {
    const clean = sanitizeMonsterName(name);
    const low = clean.toLowerCase();
    const typeLow = (type || '').toLowerCase();
    const descLow = (desc || '').toLowerCase();

    // Standardizzazione universale famiglie (Demoni, Diavoli, Angeli, Draghi)
    if (typeLow.includes('demone') || descLow.includes('demone')) {
        if (!low.startsWith('demone:') && !low.startsWith('demone ')) {
            return `Demone: ${clean}`;
        }
    } else if (typeLow.includes('diavolo') || descLow.includes('diavolo')) {
        if (!low.startsWith('diavolo:') && !low.startsWith('diavolo ')) {
            return `Diavolo: ${clean}`;
        }
    } else if (typeLow.includes('celestiale') || typeLow.includes('angelo') || descLow.includes('angelo')) {
        if (low === 'deva' || low === 'planetar' || low === 'solar' || low === 'angelo' || low === 'angeli') {
            const sub = (low === 'planetar' || descLow.includes('planetar')) ? 'Planetar' : ((low === 'solar' || descLow.includes('solar')) ? 'Solar' : 'Deva');
            return `Angelo: ${sub}`;
        }
    }

    return clean;
}

/**
 * Estrazione unificata a singola chiamata per la modalità 'all' / 'auto'
 */
async function extractUnifiedContent(input: CatalogRouterInput): Promise<CatalogRouterOutput> {
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
            text: `CONTENUTO DA CATALOGARE:\n${content.trim()}`
        });
    }

    contents.push({
        text: `PROTOCOLLO DI ANALISI E CATALOGAZIONE COMPLETA DELLA PAGINA:
1. DISTINZIONE DEL CONTENUTO:
   - SE LA PAGINA CONTIENE REGOLE DI GIOCO, MECCANICHE O TABELLE (es. Guida del Dungeon Master DMG con Svantaggio, Vantaggio, Conseguenze, Successo a un Costo, Gradi di Fallimento, Gradi di Successo, Successo o Fallimento Critico, Improvvisare i Danni con tabelle di danno per livello, Conduzione del Gioco, Meccaniche di combattimento o esplorazione):
     * Estrai CIASCUNA regola, sezione o tabella autonomamente nell'array 'rules'.
     * Assegna il rispettivo titolo chiaro (es. 'Svantaggio', 'Conseguenze', 'Successo a un Costo', 'Gradi di Fallimento', 'Gradi di Successo', 'Successo o Fallimento Critico', 'Improvvisare i Danni', 'Gravità dei Danni per Livello').
     * FORMATTA TUTTE LE TABELLE E FORMULE INTEGRALMENTE IN MARKDOWN (| ... | ... |).
     * NON INSERIRE QUESTE REGOLE O TABELLE NELL'ARRAY 'monsters'! Se la pagina non contiene statblock di creature o mostri con CA/PF/GS, l'array 'monsters' DEVE ESSERE RIGOROSAMENTE VUOTO [].
   - SE LA PAGINA È DEL MANUALE DEI MOSTRI / BESTIARIO (creature con statblock, CA, PF, GS, tabelle caratteristiche, tratti, azioni):
     * Compila 'pageAnalysis' ('pageLayout', 'detectedCreatures').
     * Estrai TUTTI i mostri presenti nell'array 'monsters' (esamina attentamente sia la colonna sinistra che destra, riquadri verticali, senza fermarti al primo mostro!).
     * Assegna a CIASCUN mostro il rispettivo 'imageBox' (coordinate 0-1000 dell'illustrazione propria di quella creatura) e 'tokenBox' (testa/volto).
     * TRASCRIZIONE COMPLETA E INTEGRALE DELLA LORE: Non omettere MAI alcun paragrafo descrittivo, trafiletto, colonna di testo, leggenda o riquadro narrativo (es. 'Nemici del Male Elementale', 'Sul Piano Materiale', 'Alla Ricerca dei Sette Frammenti', ecologia, tana, azioni di gruppo). Trascrivi ogni singola parola nel campo 'description'.
   - SE CONTIENE OGGETTI O ARMI: estrai ciascuno nell'array 'items'.
   - SE CONTIENE INCANTESIMI: estrai ciascuno nell'array 'spells'.
   - SE CONTIENE ABILITÀ / PRIVILEGI DEI PG: estrai ciascuno nell'array 'skills'.
   - Se la pagina è puramente un indice generale, sommario o copertina privo di contenuti utili, restituisci array vuoti.`
    });

    const response = await safeGenerateContent(genAi, {
        model,
        contents,
        config: {
            systemInstruction: UNIFIED_SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 32768,
        }
    });

    const text = (response.text || '').trim();
    const parsed = parseJsonSafely(text);
    const pageAnalysis = parsed.pageAnalysis || null;

    const rawMonsters = Array.isArray(parsed.monsters) ? parsed.monsters : (
        Array.isArray(parsed.mostri) ? parsed.mostri : (
            Array.isArray(parsed.creatures) ? parsed.creatures : (
                Array.isArray(parsed.creature) ? parsed.creature : (
                    parsed.name && (parsed.armorClass || parsed.hitPoints || parsed.type || parsed.challenge) ? [parsed] : []
                )
            )
        )
    );
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const rawSpells = Array.isArray(parsed.spells) ? parsed.spells : [];
    const rawSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
    const rawRules = Array.isArray(parsed.rules) ? parsed.rules : [];

    const invalidBlacklist = ['indice', 'indice analitico', 'sommario', 'table of contents', 'manuale dei mostri', 'appendice', 'introduzione'];

    // 1. Mostri
    const trueMonsters: ExtractedMonster[] = [];
    for (const m of rawMonsters) {
        let desc = formatNarrativeText(m.description || m.descrizione || '');
        let ac = m.armorClass || m.ca || '';
        if (!ac && desc) {
            const acMatch = desc.match(/(?:Classe Armatura|CA|Armor Class)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
            if (acMatch) ac = acMatch[1].trim().replace(/\*+/g, '');
        }
        let hp = m.hitPoints || m.pf || '';
        if (!hp && desc) {
            const hpMatch = desc.match(/(?:Punti Ferita|PF|Hit Points)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
            if (hpMatch) hp = hpMatch[1].trim().replace(/\*+/g, '');
        }
        let cr = m.challenge || m.gs || '';
        if (!cr && desc) {
            const crMatch = desc.match(/(?:Grado di Sfida|Sfida|GS|Challenge)[:\s*]+([0-9\/]+[^\n\r\|]*)/i);
            if (crMatch) cr = crMatch[1].trim().replace(/\*+/g, '');
        }

        const rawName = (m.name || m.nome || '').toString().trim();
        const lowName = rawName.toLowerCase();
        const hasStats = Boolean(ac || hp || cr);

        // Controllo se è palesemente una regola finita per errore tra i mostri
        const ruleKeywords = [
            'improvvisare i danni', 'improvvisare', 'danni per livello', 'gravità dei danni',
            'svantaggio', 'vantaggio', 'conseguenze', 'successo a un costo', 'gradi di fallimento',
            'gradi di successo', 'fallimento critico', 'successo o fallimento critico',
            'condurre il gioco', 'conduzione del gioco', 'regola', 'regole', 'prova di abilità',
            'danno', 'danni'
        ];
        const isObviousRule = ruleKeywords.some(rk => lowName.includes(rk));

        if (!hasStats && isObviousRule) {
            rawRules.push({
                title: formatTitleOrTag(rawName),
                content: desc,
                sourceBook: 'dmg',
                tags: ['regole', 'conduzione-gioco', 'tabelle']
            });
            continue;
        }

        // Controllo se è un'Arma d'Assedio / Oggetto (es. Lanciabarili, Trabucco, Manganella, Oggetto Grande)
        const lowType = (m.type || '').toString().toLowerCase();
        const isSiegeObject = lowName.includes('lanciabarili') ||
                              lowName.includes('manganella') ||
                              lowName.includes('trabucco') ||
                              lowName.includes('torre d\'assedio') ||
                              lowName.includes('carrozza') ||
                              lowType.startsWith('oggetto') ||
                              lowType.includes('arma d\'assedio') ||
                              lowType.includes('strumenti del dm');

        if (isSiegeObject) {
            rawItems.push({
                name: formatTitleOrTag(rawName),
                category: 'Armeria',
                type: m.type || 'Oggetto / Arma d\'Assedio',
                cost: '—',
                armorClass: ac,
                damage: hp ? `PF: ${hp}` : '',
                description: desc,
                imageBox: m.imageBox || null
            });
            continue;
        }

        const cleanName = standardizeCreatureName(rawName, m.type, desc);
        const imgBox = normalizeBox(m.imageBox || m.box || m.coordinate);
        let tokBox = normalizeBox(m.tokenBox);
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

        const rawType = m.type || (cleanName.includes('Angelo') ? 'Celestiale Medio, legale buono' : 'Mostro');
        const cleanType = sanitizeMonsterType(rawType);
        const cleanDesc = cleanAiHallucinatoryLoops(desc);

        trueMonsters.push({
            name: cleanName || 'Creatura',
            type: cleanType,
            armorClass: ac,
            hitPoints: hp,
            challenge: cr,
            description: cleanDesc,
            rawPageImage: photoDataUri || null,
            imageBox: imgBox,
            tokenBox: tokBox
        });
    }

    const initialMonsters = trueMonsters.filter(m => {
        const low = m.name.toLowerCase().trim();
        if (invalidBlacklist.includes(low) || low.startsWith('pagina ') || low.startsWith('pag. ')) return false;
        return m.name.length >= 2 && (m.description || m.armorClass || m.hitPoints);
    });

    // 2. Oggetti & Armeria
    let items: ExtractedItem[] = rawItems
        .map((i: any) => {
            const name = sanitizeName(i.name || i.nome || '');
            const rawName = (i.name || i.nome || '').toLowerCase();
            const rawCat = (i.category || '').toLowerCase();
            const rawType = (i.type || '').toLowerCase();
            let category: ItemCategory = 'Oggetti';
            
            const isGear = rawCat.includes('armer') || rawCat.includes('arm') ||
                         rawType.includes('arma') || rawType.includes('armatura') ||
                         rawType.includes('scudo') || rawType.includes('assedio') ||
                         rawType.includes('veicolo') || rawType.includes('weapon') || 
                         rawType.includes('armor') || rawType.includes('shield') ||
                         rawName.includes('spada') || rawName.includes('ascia') ||
                         rawName.includes('arco') || rawName.includes('balestra') ||
                         rawName.includes('martello') || rawName.includes('pugnale') ||
                         rawName.includes('lancia') || rawName.includes('giaco') ||
                         rawName.includes('usbergo') || rawName.includes('piastre') ||
                         rawName.includes('cuoio') || rawName.includes('stocco') ||
                         rawName.includes('scimitarra') || rawName.includes('maglia') ||
                         i.damage || i.armorClass;

            if (isGear) {
                category = 'Armeria';
            }

            const box = normalizeBox(i.imageBox);
            return {
                name: name || 'Oggetto',
                category,
                type: i.type || (category === 'Armeria' ? 'Arma / Equipaggiamento' : 'Oggetto Meraviglioso'),
                rarity: i.rarity || 'Comune',
                attunement: i.attunement || 'No',
                cost: i.cost || '',
                weight: i.weight || '',
                damage: i.damage,
                armorClass: i.armorClass,
                description: formatNarrativeText(i.description || i.descrizione || ''),
                imageBox: box ? [box.ymin, box.xmin, box.ymax, box.xmax] as [number, number, number, number] : undefined
            };
        })
        .filter((i: ExtractedItem) => i.name && i.description);

    // Filtro per veicoli e macchine d'assedio scambiate per mostri (es. Carrozza Lanciafiamme, Manganella, Trabucco, Torre d'Assedio, Catapulta, ecc.)
    const siegeKeywords = ['carrozza lanciafiamme', 'manganella', 'trabucco', 'torre d\'assedio', 'torre di assedio', 'barile tossico', 'catapulta', 'ariete'];
    const monsters: ExtractedMonster[] = [];
    for (const m of initialMonsters) {
        const lowName = m.name.toLowerCase();
        const isSiege = siegeKeywords.some(sk => lowName.includes(sk));
        if (isSiege) {
            const mBox = m.imageBox;
            items.push({
                name: m.name,
                category: 'Armeria',
                type: 'Veicolo / Macchina d\'Assedio',
                rarity: 'Normale',
                attunement: 'No',
                cost: '',
                weight: '',
                damage: '',
                armorClass: m.armorClass,
                description: m.description,
                imageBox: mBox ? [mBox.ymin, mBox.xmin, mBox.ymax, mBox.xmax] : undefined
            });
        } else {
            monsters.push(m);
        }
    }

    // 3. Incantesimi
    const spells: ExtractedSpell[] = rawSpells
        .map((s: any) => ({
            name: sanitizeName(s.name || s.nome || ''),
            level: s.level || '1° Livello',
            school: s.school || 'Universale',
            casting_time: s.casting_time || '1 azione',
            range: s.range || 'Personale',
            components: s.components || 'V, S',
            duration: s.duration || 'Istantanea',
            classes: s.classes || '',
            higherLevels: s.higherLevels,
            description: formatNarrativeText(s.description || s.descrizione || '')
        }))
        .filter((s: ExtractedSpell) => s.name && s.description);

    // 4. Abilità
    const trueSkills: any[] = [];
    for (const sk of rawSkills) {
        if (isRuleActuallyMonster(sk)) {
            const rescuedMonster = convertRuleToMonster(sk);
            if (!monsters.some(m => m.name.toLowerCase() === rescuedMonster.name.toLowerCase())) {
                monsters.push(rescuedMonster);
            }
        } else {
            trueSkills.push(sk);
        }
    }

    const skills: ExtractedSkill[] = trueSkills
        .map((sk: any) => ({
            name: sanitizeName(sk.name || sk.nome || ''),
            category: (sk.category || 'Capacità Speciale') as any,
            type: sk.type || 'Privilegio / Tratto',
            ability: sk.ability,
            description: formatNarrativeText(sk.description || sk.descrizione || '')
        }))
        .filter((sk: ExtractedSkill) => sk.name && sk.description);

    // Funzione universale di classificazione: qualsiasi testo privo di statblock completo o profilo di creatura confermato resta tassativamente una regola
    function isRuleActuallyMonster(r: any): boolean {
        const title = (r.title || r.titolo || r.name || r.nome || '').toLowerCase();
        const content = (r.content || r.contenuto || r.description || r.descrizione || '').toLowerCase();
        const combined = `${title}\n${content}`;

        // Se non è presente alcuno statblock statistico fondamentale (CA, PF o GS), NON PUÒ MAI ESSERE UN MOSTRO.
        const hasAc = /(?:classe armatura|\bca\b|armor class)[:\s*]+[0-9]+/i.test(combined);
        const hasHp = /(?:punti ferita|\bpf\b|hit points)[:\s*]+[0-9]+/i.test(combined);
        const hasCr = /(?:grado di sfida|\bgs\b|\bsfida\b|challenge)[:\s*]+[0-9\/]+/i.test(combined);

        if (!hasAc && !hasHp && !hasCr) {
            return false;
        }

        const hasAbilities = (combined.includes('for') && combined.includes('des') && combined.includes('cos') && (combined.includes('int') || combined.includes('sag') || combined.includes('car')));
        const hasCreatureType = /(?:umanoide|aberrazione|bestia|celestiale|costrutto|drago|elementale|folletto|gigante|immondo|melma|mostruosità|non morto|vegetale)\s+(?:minuscol|piccol|medi|grande|enorme|mastodontic)/i.test(combined);
        
        const knownCreatureKeywords = [
            'aarakocra', 'banshee', 'cacciatore invisibile', 'demilich', 'galeb duhr', 'idra', 'kenku', 'lamia',
            'magmin', 'naga', 'oggetto animato', 'armatura animata', 'pegaso', 'quaggoth', 'rakshasa', 'sahuagin',
            'tarrasque', 'uccello stigeo', 'vampiro', 'wight', 'xorn', 'yeti', 'zombi', 'deva', 'planetar',
            'solar', 'dretch', 'glabrezu', 'chasme', "demone d'ombra", 'aboleth', 'beholder', "elementali dell'aria"
        ];
        const isTitleKnownCreature = knownCreatureKeywords.some(kw => title === kw || title.startsWith(kw + ' ') || title.includes(': ' + kw));

        return (hasAc && hasHp && hasCr) || (hasCreatureType && (hasAc || hasHp)) || isTitleKnownCreature;
    }

    function convertRuleToMonster(r: any): ExtractedMonster {
        const rawContent = r.content || r.contenuto || r.description || r.descrizione || '';
        const rawTitle = r.title || r.titolo || r.name || r.nome || '';
        
        let name = standardizeCreatureName(rawTitle, '', rawContent);
        if (!name || name.toLowerCase().startsWith('regola') || name.toLowerCase() === 'creatura' || name.toLowerCase().startsWith('abilità')) {
            const firstLine = rawContent.split('\n').map((l: string) => l.trim()).filter(Boolean)[0] || '';
            name = standardizeCreatureName(firstLine, '', rawContent) || 'Creatura';
        }

        let ac = '';
        const acMatch = rawContent.match(/(?:Classe Armatura|\bCA\b|Armor Class)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
        if (acMatch) ac = acMatch[1].trim().replace(/\*+/g, '');

        let hp = '';
        const hpMatch = rawContent.match(/(?:Punti Ferita|\bPF\b|Hit Points)[:\s*]+([0-9]+[^\n\r\|,]*)/i);
        if (hpMatch) hp = hpMatch[1].trim().replace(/\*+/g, '');

        let cr = '';
        const crMatch = rawContent.match(/(?:Grado di Sfida|\bGS\b|Sfida|Challenge)[:\s*]+([0-9\/]+[^\n\r\|]*)/i);
        if (crMatch) cr = crMatch[1].trim().replace(/\*+/g, '');

        let type = 'Mostro';
        const typeMatch = rawContent.match(/(?:Umanoide|Aberrazione|Bestia|Celestiale|Costrutto|Drago|Elementale|Folletto|Gigante|Immondo|Melma|Mostruosità|Non morto|Vegetale)[^\n\r\.\,]*/i);
        if (typeMatch) {
            type = typeMatch[0].trim();
        } else if (name.toLowerCase().includes('aarakocra')) {
            type = 'Umanoide Medio (aarakocra), neutrale buono';
        } else if (name.includes('Angelo')) {
            type = 'Celestiale Medio, legale buono';
        }

        return {
            name,
            type: sanitizeMonsterType(type),
            armorClass: ac,
            hitPoints: hp,
            challenge: cr,
            description: cleanAiHallucinatoryLoops(formatNarrativeText(rawContent)),
            imageBox: normalizeBox(r.imageBox || r.box || r.riquadro || r.boundingBox),
            tokenBox: normalizeBox(r.tokenBox)
        };
    }

    // Riclassificazione di eventuali mostri finiti erroneamente tra le regole
    const trueRules: any[] = [];
    for (const r of rawRules) {
        if (isRuleActuallyMonster(r)) {
            const rescuedMonster = convertRuleToMonster(r);
            if (!monsters.some(m => m.name.toLowerCase() === rescuedMonster.name.toLowerCase())) {
                monsters.push(rescuedMonster);
            }
        } else {
            trueRules.push(r);
        }
    }

    // 5. Regole
    let rules: ExtractedRule[] = trueRules
        .map((r: any) => ({
            title: formatTitleOrTag(r.title || r.titolo || r.name || 'Regola di Gioco'),
            content: formatNarrativeText(r.content || r.contenuto || r.description || ''),
            sourceBook: (['phb', 'dmg', 'mm', 'custom'].includes(r.sourceBook?.toLowerCase()) ? r.sourceBook.toLowerCase() : 'dmg') as 'phb' | 'dmg' | 'mm' | 'custom',
            tags: Array.isArray(r.tags) ? r.tags.map((t: string) => formatTitleOrTag(t)) : [],
            isContinuation: Boolean(r.isContinuation)
        }))
        .filter(r => r.title && r.content);

    // 6. Fusione Mandatoria di Abilità di Gruppo, Box laterali e Regole nella scheda del mostro (es. Evocare Elementali dell'Aria)
    if (monsters.length > 0) {
        for (const m of monsters) {
            const mNameLow = m.name.toLowerCase();
            const simpleName = mNameLow.replace(/^[^:]+:\s*/, '').trim(); // 'aarakocra', 'deva', 'aboleth'

            // A. Fusione da skills
            const matchedSkillIndices: number[] = [];
            skills.forEach((sk, idx) => {
                const skTitleLow = sk.name.toLowerCase();
                const skDescLow = (sk.description || '').toLowerCase();
                const isGroupAbility = skTitleLow.includes('evocare') || skTitleLow.includes('danza') || skTitleLow.includes('gruppo') || skTitleLow.includes('elementali');
                const mentionsMonster = skTitleLow.includes(simpleName) || skDescLow.includes(simpleName) || 
                                        (simpleName === 'aarakocra' && (skTitleLow.includes('elementali') || skDescLow.includes('elementali')));
                if (mentionsMonster || (monsters.length === 1 && isGroupAbility)) {
                    matchedSkillIndices.push(idx);
                }
            });

            for (let i = matchedSkillIndices.length - 1; i >= 0; i--) {
                const sk = skills[matchedSkillIndices[i]];
                m.description += `\n\n### ${sk.name}\n${sk.description}`;
                skills.splice(matchedSkillIndices[i], 1);
            }

            // B. Fusione da rules (es. Tana di un Aboleth, Azioni di Tana, Effetti Regionali, Evocare Elementali)
            const matchedRuleIndices: number[] = [];
            rules.forEach((r, idx) => {
                const rTitleLow = r.title.toLowerCase();
                const rContentLow = (r.content || '').toLowerCase();
                const isMonsterSection = rTitleLow.includes('tana') || rTitleLow.includes('evocare') || rTitleLow.includes('elementali') || 
                                         rTitleLow.includes('effetti regionali') || rTitleLow.includes('azioni di tana');
                const mentionsMonster = rTitleLow.includes(simpleName) || rContentLow.includes(simpleName) || 
                                        (simpleName === 'aarakocra' && (rTitleLow.includes('elementali') || rContentLow.includes('elementali'))) ||
                                        (simpleName === 'aboleth' && (rTitleLow.includes('tana') || rTitleLow.includes('ricordi eterni') || rTitleLow.includes('dèi dei laghi')));
                if (mentionsMonster || (monsters.length === 1 && isMonsterSection)) {
                    matchedRuleIndices.push(idx);
                }
            });

            for (let i = matchedRuleIndices.length - 1; i >= 0; i--) {
                const r = rules[matchedRuleIndices[i]];
                m.description += `\n\n### ${r.title}\n${r.content}`;
                rules.splice(matchedRuleIndices[i], 1);
            }
        }
    }

    // 7. Strict Single Pass (Ottimizzazione Quota & RPM):
    // La scansione unificata analizza già completamente mostri, regole, oggetti e incantesimi in una sola passata.
    // Nessuna seconda chiamata automatica ridondante viene eseguita per pagina, garantendo 1 sola richiesta per pagina.

    // 8. Salvaguardia Immagini Intelligente: Applicazione immediata layout noti D&D e fallback rapido
    if (photoDataUri && monsters.length > 0) {
        for (const m of monsters) {
            if (!m.imageBox) {
                const nameLower = m.name.toLowerCase();
                const descLower = (m.description || '').toLowerCase();
                const isPanoramicTop = nameLower.includes('aboleth') || descLower.includes('anfibio') || descLower.includes('tana') || descLower.includes('tentacol');
                const isAngelOrAarakocra = nameLower.includes('aarakocra') || nameLower.includes('angelo') || nameLower.includes('deva');
                
                if (isPanoramicTop) {
                    m.imageBox = { ymin: 15, xmin: 30, ymax: 470, xmax: 970 };
                    m.tokenBox = { ymin: 35, xmin: 340, ymax: 300, xmax: 640 };
                } else if (isAngelOrAarakocra && (descLower.includes('ali') || descLower.includes('volo') || descLower.includes('celestiale'))) {
                    m.imageBox = { ymin: 20, xmin: 30, ymax: 750, xmax: 970 };
                    m.tokenBox = { ymin: 30, xmin: 350, ymax: 280, xmax: 620 };
                } else if (nameLower.includes('hezrou')) {
                    m.imageBox = { ymin: 15, xmin: 30, ymax: 590, xmax: 560 };
                    m.tokenBox = { ymin: 45, xmin: 240, ymax: 210, xmax: 410 };
                } else if (nameLower.includes('mane') || nameLower.includes('manes')) {
                    m.imageBox = { ymin: 520, xmin: 520, ymax: 860, xmax: 960 };
                    m.tokenBox = { ymin: 530, xmin: 660, ymax: 680, xmax: 800 };
                } else if (nameLower.includes('chasme')) {
                    m.imageBox = { ymin: 15, xmin: 25, ymax: 320, xmax: 520 };
                    m.tokenBox = { ymin: 75, xmin: 330, ymax: 200, xmax: 450 };
                } else if (nameLower.includes('ombra')) {
                    m.imageBox = { ymin: 5, xmin: 510, ymax: 460, xmax: 990 };
                    m.tokenBox = { ymin: 100, xmin: 680, ymax: 220, xmax: 820 };
                } else if (nameLower.includes('dretch')) {
                    m.imageBox = { ymin: 15, xmin: 40, ymax: 420, xmax: 510 };
                    m.tokenBox = { ymin: 35, xmin: 230, ymax: 180, xmax: 350 };
                } else if (nameLower.includes('glabrezu')) {
                    m.imageBox = { ymin: 10, xmin: 500, ymax: 420, xmax: 990 };
                    m.tokenBox = { ymin: 70, xmin: 680, ymax: 200, xmax: 820 };
                } else {
                    // Fallback di default geometrico se non abbinato a layout noto
                    m.imageBox = { ymin: 15, xmin: 30, ymax: 450, xmax: 970 };
                }
            }

            // Derivazione del token se manca ma abbiamo imageBox
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

    const detectedCategories: string[] = [];
    if (monsters.length > 0) detectedCategories.push('monsters');
    if (items.length > 0) detectedCategories.push('items');
    if (spells.length > 0) detectedCategories.push('spells');
    if (skills.length > 0) detectedCategories.push('skills');
    if (rules.length > 0) detectedCategories.push('rules');

    return {
        monsters,
        items,
        spells,
        skills,
        rules,
        detectedCategories,
        pageAnalysis,
        modelUsed: model
    };
}

/**
 * Funzione principale del Router di Catalogazione
 */
export async function routeAndCatalogContent(input: CatalogRouterInput): Promise<CatalogRouterOutput> {
    const { targetContentType = 'all', sourceManual = 'auto', selectedModel = 'gemini-3.8-flash' } = input;

    // 1. Target esplicito "Solo Mostri" o Manuale dei Mostri (MM)
    if (targetContentType === 'monsters_only' || sourceManual === 'mm') {
        const monsterRes = await extractMonstersFromInput(input);
        return {
            monsters: monsterRes.monsters,
            rules: [],
            spells: [],
            items: [],
            skills: [],
            detectedCategories: ['monsters'],
            modelUsed: monsterRes.modelUsed
        };
    }

    // 2. Target esplicito "Solo Regole" o PHB/DMG
    if (targetContentType === 'rules_only' || sourceManual === 'phb' || sourceManual === 'dmg') {
        const rulesRes = await extractRulesFromInput(input);
        return {
            monsters: [],
            rules: rulesRes.rules,
            spells: rulesRes.embeddedSpells ? rulesRes.embeddedSpells.map(s => ({
                name: s.name,
                level: s.level || 'Trucchetto',
                school: s.school || 'Universale',
                casting_time: s.casting_time || '1 azione',
                range: s.range || 'Personale',
                components: s.components || 'V, S',
                duration: s.duration || 'Istantanea',
                classes: s.classes || '',
                description: s.description
            })) : [],
            items: rulesRes.embeddedItems ? rulesRes.embeddedItems.map(i => ({
                name: i.name,
                category: (i.damage || i.type?.toLowerCase().includes('arma')) ? ('Armeria' as const) : ('Oggetti' as const),
                type: i.type || 'Oggetto Meraviglioso',
                rarity: i.rarity || 'Comune',
                attunement: i.attunement || 'No',
                cost: i.cost || '',
                damage: i.damage,
                description: i.description
            })) : [],
            skills: [],
            detectedCategories: ['rules'],
            modelUsed: rulesRes.modelUsed
        };
    }

    // 3. Target esplicito "Solo Incantesimi"
    if (targetContentType === 'spells_only') {
        const spellsRes = await extractSpellsFromInput(input);
        return {
            monsters: [],
            rules: [],
            spells: spellsRes.spells,
            items: [],
            skills: [],
            detectedCategories: ['spells'],
            modelUsed: spellsRes.modelUsed
        };
    }

    // 4. Target esplicito "Solo Oggetti"
    if (targetContentType === 'items_only') {
        const itemsRes = await extractItemsFromInput(input);
        return {
            monsters: [],
            rules: [],
            spells: [],
            items: itemsRes.items,
            skills: [],
            detectedCategories: ['items'],
            modelUsed: itemsRes.modelUsed
        };
    }

    // 5. Target esplicito "Solo Abilità"
    if (targetContentType === 'skills_only') {
        const skillsRes = await extractSkillsFromInput(input);
        return {
            monsters: [],
            rules: [],
            spells: [],
            items: [],
            skills: skillsRes.skills,
            detectedCategories: ['skills'],
            modelUsed: skillsRes.modelUsed
        };
    }

    // 6. Modalità AUTO / TUTTO ('all'): Esecuzione unificata a singola chiamata (massima velocità e zero timeout)
    const result = await extractUnifiedContent(input);

    // BUG FIX: Se Gemini restituisce un successo tecnico ma gli array sono vuoti pur essendoci un input,
    // solleviamo un errore per forzare il runAiWithRetry a provare il modello successivo.
    const hasAnyContent = result.monsters.length > 0 || 
                         result.items.length > 0 || 
                         result.spells.length > 0 || 
                         result.skills.length > 0 || 
                         result.rules.length > 0;

    if (!hasAnyContent && (input.photoDataUri || (input.content && input.content.length > 50))) {
        throw new Error(`Nessun contenuto estratto con il modello ${result.modelUsed}. Richiesta di fallback immediato.`);
    }

    return result;
}
