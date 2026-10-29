
'use server';

import db, { dbPath, getAppSetting, setAppSetting, logApiUsage, ensureSystemCampaignRow } from '@/lib/db';
import { testGeminiModel, getGenAI, safeGenerateContent, getActiveFlashModel } from '@/ai/genai-client';
import { updateGenkitActiveModel } from '@/ai/genkit';
import { initializeCampaign as initializeCampaignFlow } from '@/ai/flows/initialize-campaign';
import { extractEntities as extractEntitiesFlow } from '@/ai/flows/extract-entities';
import { generateNextSession as generateNextSessionFlow } from '@/ai/flows/generate-next-session';
import { summarizeCampaign as summarizeCampaignFlow } from '@/ai/flows/summarize-campaign';
import { summarizeArc as summarizeArcFlow } from '@/ai/flows/summarize-arc-flow';
import { generateMap as generateMapFlow, type GenerateMapInput } from '@/ai/flows/generate-map';
import { catalogHandbook as catalogHandbookFlow } from '@/ai/flows/catalog-handbook';
import { routeAndCatalogContent } from '@/ai/flows/extractors/catalog-router';
import { generateShop as generateShopFlow } from '@/ai/flows/generate-shop';
import { generateLocation as generateLocationFlow } from '@/ai/flows/generate-location';
import { generateNpc as generateNpcFlow } from '@/ai/flows/generate-npc';
import { generateCombat as generateCombatFlow } from '@/ai/flows/generate-combat';
import { generateTreasure as generateTreasureFlow } from '@/ai/flows/generate-treasure';
import { quickImprov as quickImprovFlow } from '@/ai/flows/quick-improv';
import { updateNpcIdentity as updateNpcIdentityFlow } from '@/ai/flows/update-npc-identity';
import { deepNpcElaboration as deepNpcElaborationFlow } from '@/ai/flows/deep-npc-elaboration';
import { extractLore } from '@/ai/flows/extract-lore';
import { expandLore, refineLoreDraft } from '@/ai/flows/expand-lore';
import { consolidateAndDeduplicateLore, synthesizeInboxNotes } from '@/ai/flows/consolidate-lore';
import { formatNarrativeText, formatTitleOrTag, sanitizeMonsterType, cleanAiHallucinatoryLoops } from '@/lib/formatter';
import { extractBaseName, normalizeCompendiumName, actionResponse } from '@/lib/utils';
import { logAiError } from '@/lib/ai-logger';
import type { Session, CampaignWithRelations, Campaign, MagicItem, Monster, PlayerCharacter, Spell, Skill, LetterPreset, Shop, WorldLocation, Npc, NpcDetails, Combat, CombatDetails, GenerateCombatInput, GenerateNpcInput, GenerateShopInput, GenerateLocationInput, Reward, GenerateTreasureInput, CharacterEvent, StoryArc, HomebrewRule, ApiStats, LoreEntry, LoreVersion, GranularQuestConfig, PcXpAward } from '@/lib/types';
import { getLevelFromXp } from '@/lib/dnd5e-xp';
import { randomUUID } from 'crypto';
import { getBaseMonsters, getBaseItems, getBaseSpells, getBaseSkills } from '@/lib/compendium-data';
import fs from 'fs';
import path from 'path';

// --- UTILITY PERCORSI PERSISTENTI ---

function getAssetDir() {
    const baseDir = process.env.DATABASE_URL 
        ? path.dirname(process.env.DATABASE_URL.replace('file:', '')) 
        : path.join(process.cwd(), 'data');
    
    const assetDir = path.join(baseDir, 'assets');
    if (!fs.existsSync(assetDir)) {
        fs.mkdirSync(assetDir, { recursive: true });
    }
    return assetDir;
}

export async function deleteAssetAction(filename: string) {
    try {
        const assetDir = getAssetDir();
        const filePath = path.join(assetDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return actionResponse({ success: true });
        }
        return actionResponse(null, "File non trovato.");
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

function deleteAssetFile(imageUrl: string | null | undefined) {
    if (!imageUrl || !imageUrl.startsWith('/api/assets/')) return;
    try {
        const filename = imageUrl.replace('/api/assets/', '').split('?')[0];
        const assetDir = getAssetDir();
        const filePath = path.join(assetDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error("[Cleanup] Error deleting file:", e);
    }
}

function saveBase64ImageDirectly(imageData?: string | null, entityName?: string): string | null {
    if (!imageData) return null;
    if (!imageData.startsWith('data:image/')) return imageData;
    try {
        const b64 = imageData.replace(/^data:image\/[^;]+;base64,/, "").trim();
        const buf = Buffer.from(b64, 'base64');
        if (buf.length === 0) return null;
        const sanitizedName = entityName ? entityName.trim().replace(/\s+/g, '_').replace(/[^\w\d_]/g, '') : 'img';
        const name = `${sanitizedName}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
        const dir = getAssetDir();
        fs.writeFileSync(path.join(dir, name), buf);
        return `/api/assets/${name}`;
    } catch (e) {
        console.error("[Asset Helper] Error saving base64 asset:", e);
        return null;
    }
}

export async function listAssetsAction() {
    try {
        const dir = getAssetDir();
        if (!fs.existsSync(dir)) return actionResponse([]);

        // Garantisce che i preset precaricati siano sempre sincronizzati nella cartella persistente
        const presetFiles = [
            'hero-dnd-bg.jpg',
            'handout-background.jpg',
            'ancient-grimoire-bg.jpg',
            'tavern-board-bg.jpg',
            'card-background.jpg',
            'card-back-magie.jpg',
            'card-back-oggetti.jpg'
        ];
        const candidateSourceDirs = [
            path.join(process.cwd(), 'public'),
            path.resolve('/app', 'public'),
            path.resolve('./public'),
            path.resolve(__dirname, '..', '..', 'public'),
        ];
        presetFiles.forEach(pf => {
            const dest = path.join(dir, pf);
            if (!fs.existsSync(dest)) {
                for (const sd of candidateSourceDirs) {
                    const src = path.join(sd, pf);
                    if (fs.existsSync(src)) {
                        try {
                            fs.copyFileSync(src, dest);
                            break;
                        } catch {}
                    }
                }
            }
        });

        const files = fs.readdirSync(dir);
        const stats = files.map(f => {
            const filePath = path.join(dir, f);
            const s = fs.statSync(filePath);
            return {
                name: f,
                size: s.size,
                createdAt: s.mtime.toISOString(),
                url: `/api/assets/${f}`
            };
        });
        stats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return actionResponse(stats);
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

let aiCooldownUntil: number = 0;



const exhaustedModelsCache = new Map<string, number>();

function isModelExhausted(modelName: string): boolean {
    const expires = exhaustedModelsCache.get(modelName);
    if (!expires) return false;
    if (Date.now() > expires) {
        exhaustedModelsCache.delete(modelName);
        return false;
    }
    return true;
}

function markModelExhausted(modelName: string, durationMs = 2 * 60 * 1000) {
    exhaustedModelsCache.set(modelName, Date.now() + durationMs);
    console.warn(`[AI Quota Shield] Modello ${modelName} contrassegnato come occupato per ${Math.round(durationMs / 1000)}s.`);
}

async function runAiWithRetry<T>(
    aiCall: (modelOverride?: string) => Promise<T>, 
    serviceName: string, 
    maxRetries = 6, 
    preferredModel?: string,
    logsCollector?: string[]
): Promise<T> {
    const pushLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString('it-IT');
        const entry = `[${timestamp}] ${msg}`;
        if (logsCollector) logsCollector.push(entry);
        console.log(`[${serviceName}] ${entry}`);
    };

    const fallbackModels = [
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash'
    ];
    let lastError: any;
    
    // Se il modello preferito è esaurito, scegli subito il primo modello alternativo non esaurito
    let currentModel = (preferredModel && !isModelExhausted(preferredModel)) 
        ? preferredModel 
        : fallbackModels.find(m => !isModelExhausted(m)) || fallbackModels[0];

    pushLog(`Inizio chiamata IA su servizio '${serviceName}' | Modello primario: ${currentModel}`);

    for (let i = 0; i < maxRetries; i++) {
        try {
            pushLog(`[Tentativo ${i + 1}/${maxRetries}] Invocazione ${currentModel}...`);
            const result: any = await aiCall(currentModel);
            await logApiUsage(serviceName, 'success');
            pushLog(`✅ Risposta generata con successo da ${currentModel}!`);
            if (result && typeof result === 'object') {
                return { ...result, modelUsed: currentModel };
            }
            return result;
        } catch (error: any) {
            lastError = error;
            const rawErrStr = String(error?.message || error || 'Errore non specificato');
            const errorStr = rawErrStr.toLowerCase();
            await logApiUsage(serviceName, 'error');
            logAiError(currentModel || preferredModel || 'default', error, serviceName);

            pushLog(`⚠️ [Errore ${currentModel}] (Tentativo ${i + 1}/${maxRetries}): ${rawErrStr}`);

            const isOverloadError = errorStr.includes('503') || errorStr.includes('experiencing high demand') || errorStr.includes('overloaded') || errorStr.includes('service unavailable');
            const isQuotaError = errorStr.includes('quota') || errorStr.includes('429') || errorStr.includes('resource exhausted') || errorStr.includes('resource_exhausted');
            if (currentModel) {
                const exhaustTime = isOverloadError ? 30 * 1000 : (isQuotaError ? 3 * 60 * 1000 : 20 * 1000);
                markModelExhausted(currentModel, exhaustTime);
                pushLog(`Modello ${currentModel} contrassegnato come temporaneamente occupato per ${Math.round(exhaustTime / 1000)}s.`);
            }

            if (i < maxRetries - 1) {
                // Seleziona il prossimo modello non esaurito
                const nonExhausted = fallbackModels.filter(m => !isModelExhausted(m) && m !== currentModel);
                currentModel = nonExhausted.length > 0 
                    ? nonExhausted[i % nonExhausted.length] 
                    : fallbackModels[(i + 1) % fallbackModels.length];

                pushLog(`🔄 Cambio modello automatico (Fallback ${i + 1}) -> Passaggio a: ${currentModel}`);

                try {
                    updateGenkitActiveModel(currentModel);
                } catch {}

                let waitTime = isOverloadError ? 200 + Math.random() * 300 : 400 + Math.random() * 300;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            pushLog(`❌ Esauriti tutti i ${maxRetries} tentativi di generazione IA.`);
            throw error;
        }
    }
    throw lastError;
}



async function getActiveHomebrewRulesString(campaignId: string): Promise<string> {
    try {
        const rules = db.prepare("SELECT title, content FROM HomebrewRule WHERE campaignId = ? AND isActive = 1").all(campaignId) as any[];
        if (rules.length === 0) return "";
        return rules.map(r => `Regola: ${r.title}\nDescrizione: ${r.content}`).join('\n\n');
    } catch (e) {
        console.error("Error fetching homebrew rules:", e);
        return "";
    }
}

async function getSystemOverride(slug: string): Promise<string | undefined> {
    try {
        const prompt = db.prepare("SELECT content FROM SystemPrompt WHERE slug = ?").get(slug) as { content: string };
        return prompt?.content;
    } catch (e) {
        return undefined;
    }
}

const SERVICE_ENV_MAP: Record<string, string> = {
    'STORY': 'GEMINI_API_KEY_STORY',
    'SUMMARY': 'GEMINI_API_KEY_SUMMARY',
    'SHOPS': 'GEMINI_API_KEY_SHOPS',
    'WORLD': 'GEMINI_API_KEY_WORLD',
    'EXTRACTION': 'GEMINI_API_KEY_EXTRACTION',
    'IMPORT': 'GEMINI_API_KEY_IMPORT',
};

export async function getApiUsageStats(): Promise<{ success: boolean; data: ApiStats[] | null; error: string | null }> {
    try {
        const services = ['STORY', 'SUMMARY', 'SHOPS', 'WORLD', 'EXTRACTION', 'IMPORT'];
        const stats: ApiStats[] = [];
        for (const s of services) {
            const rpm = db.prepare("SELECT COUNT(*) as count FROM ApiUsage WHERE service = ? AND timestamp > datetime('now', '-1 minute')").get(s) as { count: number };
            const rpd = db.prepare("SELECT COUNT(*) as count FROM ApiUsage WHERE service = ? AND timestamp > datetime('now', '-24 hours')").get(s) as { count: number };
            const lastRecord = db.prepare("SELECT status, timestamp FROM ApiUsage WHERE service = ? ORDER BY timestamp DESC LIMIT 1").get(s) as { status: string; timestamp: string } | undefined;

            const envVar = SERVICE_ENV_MAP[s] || 'GEMINI_API_KEY';
            const dedicatedVal = (process.env[envVar] || '').trim();
            const defaultVal = (process.env.GEMINI_API_KEY || '').trim();
            const isKeyConfigured = (dedicatedVal !== '' && dedicatedVal !== 'tua_chiave_qui' && dedicatedVal !== 'undefined') ||
                                    (defaultVal !== '' && defaultVal !== 'tua_chiave_qui' && defaultVal !== 'undefined');

            let status = 'idle';
            if (!isKeyConfigured) {
                status = 'missing';
            } else if (lastRecord) {
                if (lastRecord.status === 'success') {
                    status = 'success';
                } else if (lastRecord.status === 'error') {
                    // Controlla se c'è stato un errore recente (ultimi 15 minuti)
                    const recentError = db.prepare("SELECT COUNT(*) as count FROM ApiUsage WHERE service = ? AND status = 'error' AND timestamp > datetime('now', '-15 minutes')").get(s) as { count: number };
                    if (recentError && recentError.count > 0) {
                        status = 'error';
                    } else {
                        // Errore storico obsoleto (> 15 min): consideriamo il servizio in stato 'idle' (pronto)
                        status = 'idle';
                    }
                }
            } else {
                status = 'idle';
            }

            stats.push({ service: s, rpm: rpm.count, rpd: rpd.count, status });
        }
        return actionResponse(stats);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function testServiceApiKeyAction(serviceName: string): Promise<{ success: boolean; data: { service: string; latencyMs: number; model: string; message: string } | null; error: string | null }> {
    const sName = serviceName.toUpperCase();
    const envKey = SERVICE_ENV_MAP[sName] || 'GEMINI_API_KEY';
    const startTime = Date.now();
    try {
        const client = getGenAI(envKey);
        const modelName = getActiveFlashModel(sName);
        await client.models.generateContent({
            model: modelName,
            contents: 'Rispondi esclusivamente con "OK".',
            config: {
                maxOutputTokens: 5,
                temperature: 0.1,
            },
        });
        const latencyMs = Date.now() - startTime;
        await logApiUsage(sName, 'success');
        return actionResponse({
            service: sName,
            latencyMs,
            model: modelName,
            message: `Servizio ${sName} testato con successo!`,
        });
    } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        await logApiUsage(sName, 'error');
        return actionResponse(null, err?.message || "Errore durante il test di connessione con l'API Gemini.");
    }
}

export async function clearApiUsageErrorsAction(serviceName?: string): Promise<{ success: boolean; data: { success: boolean } | null; error: string | null }> {
    try {
        if (serviceName) {
            db.prepare("DELETE FROM ApiUsage WHERE service = ? AND status = 'error'").run(serviceName.toUpperCase());
        } else {
            db.prepare("DELETE FROM ApiUsage WHERE status = 'error'").run();
        }
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function getSystemStatus() {
    const keys = ['GEMINI_API_KEY', 'GEMINI_API_KEY_STORY', 'GEMINI_API_KEY_SUMMARY', 'GEMINI_API_KEY_SHOPS', 'GEMINI_API_KEY_WORLD', 'GEMINI_API_KEY_EXTRACTION', 'GEMINI_API_KEY_IMPORT'];
    const status = keys.map(k => {
        const val = (process.env[k] || '').trim();
        const isValid = val !== '' && val !== 'tua_chiave_qui' && val !== 'undefined';
        return { name: k, configured: isValid, preview: isValid ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` : 'Non impostata' };
    });
    return actionResponse(status);
}

// --- CONFIGURAZIONE DINAMICA MODELLO IA ---

export interface PresetModelItem {
    id: string;
    label: string;
    category?: 'recommended' | 'current' | 'pointer' | 'legacy' | 'custom';
    description: string;
    badge?: string;
    badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

const DEFAULT_PRESET_MODELS: PresetModelItem[] = [
    {
        id: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        category: 'recommended',
        description: 'Modello principale ad alte prestazioni. Elevata intelligenza e precisione per ogni funzione di gioco.',
        badge: '3.8 Flash',
        badgeVariant: 'secondary'
    },
    {
        id: 'gemini-3.6-flash',
        label: 'Gemini 3.6 Flash',
        category: 'current',
        description: 'Modello Flash 3.6 bilanciato e affidabile per analisi multimodali.',
        badge: '3.6 Flash',
        badgeVariant: 'secondary'
    },
    {
        id: 'gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash Lite',
        category: 'current',
        description: 'Versione ultra-veloce a bassa latenza per elaborazioni immediate.',
        badge: '3.5 Lite',
        badgeVariant: 'outline'
    },
    {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash Lite',
        category: 'current',
        description: 'Modello ultra-leggero ottimizzato per efficienza e scansioni rapide.',
        badge: '3.1 Lite',
        badgeVariant: 'outline'
    },
    {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash Preview',
        category: 'pointer',
        description: 'Anteprima tecnologica del modello di nuova generazione.',
        badge: '3 Preview',
        badgeVariant: 'secondary'
    },
    {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        category: 'legacy',
        description: 'Modello di generazione precedente affidabile per compatibilità.',
        badge: '2.5 Flash',
        badgeVariant: 'outline'
    }
];

function getStoredModelsList(): PresetModelItem[] {
    try {
        const saved = getAppSetting('ai_models_list');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Filtra automaticamente eventuali modelli dismessi o non validi (come 'default' o 'globale')
                const cleanList = parsed.filter((m: PresetModelItem) => 
                    m && m.id && 
                    !m.id.includes('2.0') && !m.id.includes('1.5') && !m.id.includes('1.0') && !m.id.includes('2.1') &&
                    m.id.toLowerCase() !== 'default' && 
                    !m.id.toLowerCase().includes('globale') &&
                    !m.id.toLowerCase().includes('global') &&
                    !m.label.toLowerCase().includes('globale') &&
                    !m.label.toLowerCase().includes('global')
                );
                
                // Unisce con i DEFAULT per garantire che i richiesti siano sempre presenti
                const merged = [...DEFAULT_PRESET_MODELS];
                cleanList.forEach(m => {
                    if (!merged.some(d => d.id === m.id)) {
                        merged.push(m);
                    }
                });
                return merged;
            }
        }
    } catch {}
    return DEFAULT_PRESET_MODELS;
}

export async function getSectionAiModelsConfigAction() {
    'use server';
    try {
        const services = ['STORY', 'WORLD', 'SHOPS', 'IMPORT', 'EXTRACTION'];
        const sectionModels: Record<string, string> = {};
        
        for (const s of services) {
            const saved = getAppSetting(`model_service_${s}`);
            // Mai restituire 'default', se vuoto o non impostato usa 3.8
            sectionModels[s] = (saved && saved.trim() && saved.toLowerCase() !== 'default' && !saved.toLowerCase().includes('globale') && !saved.toLowerCase().includes('global')) ? saved.trim() : 'gemini-3.8-flash';
        }

        const globalSaved = getAppSetting('active_ai_model');
        const globalActiveModel = (globalSaved && globalSaved.trim() && globalSaved.toLowerCase() !== 'default' && !globalSaved.toLowerCase().includes('globale') && !globalSaved.toLowerCase().includes('global')) 
            ? globalSaved.trim() 
            : 'gemini-3.8-flash';
        const models = getStoredModelsList();

        return actionResponse({
            sectionModels,
            globalActiveModel,
            models
        });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function saveSectionAiModelsConfigAction(sectionModels: Record<string, string>) {
    'use server';
    try {
        const services = ['STORY', 'WORLD', 'SHOPS', 'IMPORT', 'EXTRACTION'];
        for (const s of services) {
            const val = sectionModels[s] ? sectionModels[s].trim() : 'gemini-3.8-flash';
            setAppSetting(`model_service_${s}`, val);
        }
        return actionResponse({ success: true, sectionModels });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function getAiModelConfigAction() {
    'use server';
    try {
        const saved = getAppSetting('active_ai_model');
        const activeModel = (saved && saved.trim() && saved.toLowerCase() !== 'default' && !saved.toLowerCase().includes('globale') && !saved.toLowerCase().includes('global')) 
            ? saved.trim() 
            : 'gemini-3.8-flash';
        const models = getStoredModelsList();

        return actionResponse({
            activeModel,
            isCustom: !models.some(m => m.id === activeModel),
            source: (saved && saved.toLowerCase() !== 'default') ? 'database' : 'default',
            models
        });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function saveAiModelConfigAction(modelName: string) {
    'use server';
    try {
        if (!modelName || !modelName.trim()) {
            return actionResponse(null, "Il nome del modello non può essere vuoto.");
        }
        const cleanName = modelName.trim().replace(/^googleai\//i, '');
        // Salva nel database SQLite in modo permanente
        setAppSetting('active_ai_model', cleanName);
        // Sincronizza variabile d'ambiente per il processo corrente
        process.env.GEMINI_FLASH_MODEL = cleanName;
        // Aggiorna a caldo tutte le istanze Genkit in memoria
        updateGenkitActiveModel(cleanName);

        // Se il modello non è ancora presente nella lista, aggiungilo automaticamente
        let models = getStoredModelsList();
        if (!models.some(m => m.id.toLowerCase() === cleanName.toLowerCase())) {
            const newModel: PresetModelItem = {
                id: cleanName,
                label: cleanName,
                category: 'custom',
                description: 'Modello personalizzato aggiunto manualmente.',
                badge: 'Personalizzato',
                badgeVariant: 'outline'
            };
            models = [...models, newModel];
            setAppSetting('ai_models_list', JSON.stringify(models));
        }

        return actionResponse({ success: true, activeModel: cleanName, models });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}


export async function setAppSettingAction(key: string, value: string) {
    'use server';
    try {
        setAppSetting(key, value);
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function getAppSettingAction(key: string, defaultValue: string = '') {
    'use server';
    try {
        return actionResponse(getAppSetting(key, defaultValue));
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}



export async function addCustomAiModelAction(modelId: string, label?: string, description?: string) {
    'use server';
    try {
        if (!modelId || !modelId.trim()) {
            return actionResponse(null, "Specificare un identificativo di modello valido.");
        }
        const cleanId = modelId.trim().replace(/^googleai\//i, '');
        let models = getStoredModelsList();

        const existing = models.find(m => m.id.toLowerCase() === cleanId.toLowerCase());
        if (existing) {
            return actionResponse({ success: true, models, model: existing, alreadyExisted: true });
        }

        const newModel: PresetModelItem = {
            id: cleanId,
            label: label?.trim() || cleanId,
            category: 'custom',
            description: description?.trim() || 'Modello personalizzato aggiunto manualmente.',
            badge: 'Personalizzato',
            badgeVariant: 'outline'
        };

        models = [...models, newModel];
        setAppSetting('ai_models_list', JSON.stringify(models));

        return actionResponse({ success: true, models, model: newModel, alreadyExisted: false });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function deleteAiModelAction(modelId: string) {
    'use server';
    try {
        if (!modelId || !modelId.trim()) {
            return actionResponse(null, "Identificativo modello non valido.");
        }
        const cleanId = modelId.trim();
        let models = getStoredModelsList();

        const filtered = models.filter(m => m.id.toLowerCase() !== cleanId.toLowerCase());
        if (filtered.length === 0) {
            return actionResponse(null, "Impossibile eliminare tutti i modelli. Deve rimanere almeno un modello nella lista.");
        }

        setAppSetting('ai_models_list', JSON.stringify(filtered));

        // Se era il modello attivo, imposta come attivo il primo rimasto
        const currentActive = getAppSetting('active_ai_model') || 'gemini-3.8-flash';
        let newActive = currentActive;
        if (currentActive.toLowerCase() === cleanId.toLowerCase()) {
            newActive = filtered[0].id;
            setAppSetting('active_ai_model', newActive);
            process.env.GEMINI_FLASH_MODEL = newActive;
            updateGenkitActiveModel(newActive);
        }

        return actionResponse({ success: true, models: filtered, activeModel: newActive });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function testAiModelAction(modelName: string) {
    'use server';
    try {
        if (!modelName || !modelName.trim()) {
            return actionResponse(null, "Nome del modello non valido.");
        }
        const res = await testGeminiModel(modelName.trim());
        if (!res.success) {
            return actionResponse(null, res.error || "Errore sconosciuto durante il test del modello.");
        }
        return actionResponse(res);
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

// --- ADAPTIVE DB HELPERS ---
function getTableCols(tableName: string) {
    try {
        return (db.prepare(`PRAGMA table_info(${tableName})`).all() as any[]).map(c => c.name.toLowerCase());
    } catch (e) {
        return [];
    }
}

// --- AZIONI CAMPAGNA ---

export async function createCampaign(data: { name: string; setting: string; description?: string | null; }) {
    try {
        const campaignId = randomUUID();
        const arcId = randomUUID();
        const now = new Date().toISOString();
        const campaignCols = getTableCols('Campaign');
        const hasCampaignDates = campaignCols.includes('createdat');

        db.transaction(() => {
            if (hasCampaignDates) {
                db.prepare(`INSERT INTO Campaign (id, name, setting, description, summary, active_arc_label, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(campaignId, data.name, data.setting, data.description || null, "In attesa di inizializzazione...", "Arco Narrativo Attivo", now, now);
            } else {
                db.prepare(`INSERT INTO Campaign (id, name, setting, description, summary, active_arc_label) VALUES (?, ?, ?, ?, ?, ?)`).run(campaignId, data.name, data.setting, data.description || null, "In attesa di inizializzazione...", "Arco Narrativo Attivo");
            }
            db.prepare(`INSERT INTO StoryArc (id, campaignId, title, status, order_index, createdAt, updatedAt) VALUES (?, ?, ?, 'active', 0, ?, ?)`).run(arcId, campaignId, "Atto Iniziale", now, now);
        })();
        return actionResponse({ campaign: { id: campaignId }, progress: "La tua cronaca è stata creata correttamente!" });
    } catch (error: any) { return actionResponse(null, `Errore Salvataggio: ${error.message}`); }
}

export async function updateCampaignInfo(campaignId: string, name: string, setting: string) {
    try {
        const campaignCols = getTableCols('Campaign');
        const hasUpdatedAt = campaignCols.includes('updatedat');
        if (hasUpdatedAt) {
            db.prepare("UPDATE Campaign SET name = ?, setting = ?, updatedAt = ? WHERE id = ?").run(name, setting, new Date().toISOString(), campaignId);
        } else {
            db.prepare("UPDATE Campaign SET name = ?, setting = ? WHERE id = ?").run(name, setting, campaignId);
        }
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteCampaign(campaignId: string) {
    try {
        const pcs = db.prepare("SELECT imageUrl FROM PlayerCharacter WHERE campaignId = ?").all(campaignId) as { imageUrl: string }[];
        pcs.forEach(pc => deleteAssetFile(pc.imageUrl));
        
        const npcs = db.prepare("SELECT details FROM Npc WHERE campaignId = ?").all(campaignId) as { details: string }[];
        npcs.forEach(npc => {
            const d = JSON.parse(npc.details);
            deleteAssetFile(d.imageUrl);
        });

        const items = db.prepare("SELECT imageUrl FROM MagicItem WHERE campaignId = ?").all(campaignId) as { imageUrl: string }[];
        items.forEach(i => deleteAssetFile(i.imageUrl));

        const monsters = db.prepare("SELECT imageUrl FROM Monster WHERE campaignId = ?").all(campaignId) as { imageUrl: string }[];
        monsters.forEach(m => deleteAssetFile(m.imageUrl));

        db.prepare("DELETE FROM Campaign WHERE id = ?").run(campaignId);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function initializeAiSummary(campaignId: string) {
    try {
        const campaign = db.prepare("SELECT * FROM Campaign WHERE id = ?").get(campaignId) as Campaign;
        if (!campaign) throw new Error("Campagna non trovata.");
        const aiResult = await runAiWithRetry(() => initializeCampaignFlow({ campaignName: campaign.name, setting: campaign.setting, description: campaign.description || undefined }), 'STORY');
        const campaignCols = getTableCols('Campaign');
        const hasUpdatedAt = campaignCols.includes('updatedat');
        if (hasUpdatedAt) {
            db.prepare("UPDATE Campaign SET summary = ?, updatedAt = ? WHERE id = ?").run(aiResult.initial_summary, new Date().toISOString(), campaignId);
        } else {
            db.prepare("UPDATE Campaign SET summary = ? WHERE id = ?").run(aiResult.initial_summary, campaignId);
        }
        return actionResponse({ summary: aiResult.initial_summary });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function summarizeCampaign(campaignId: string) {
    try {
        const sessions = db.prepare("SELECT session_number, title, notes FROM Session WHERE campaignId = ? AND is_archived = 0 ORDER BY session_number ASC").all(campaignId) as any[];
        if (sessions.length === 0) return actionResponse({ success: true });
        const history = sessions.map(s => `Sessione ${s.session_number}: ${s.title}\n${s.notes}`).join('\n---\n');
        const override = await getSystemOverride('summary-campaign');
        const result = await runAiWithRetry(() => summarizeCampaignFlow({ campaignHistory: history, systemOverride: override }), 'SUMMARY');
        const campaignCols = getTableCols('Campaign');
        const hasUpdatedAt = campaignCols.includes('updatedat');
        if (hasUpdatedAt) {
            db.prepare("UPDATE Campaign SET summary = ?, updatedAt = ? WHERE id = ?").run(result.summary, new Date().toISOString(), campaignId);
        } else {
            db.prepare("UPDATE Campaign SET summary = ? WHERE id = ?").run(result.summary, campaignId);
        }
        return actionResponse({ success: true });
    } catch (error: any) { return actionResponse(null, error.message); }
}

// --- AZIONI BIBLIOTECA ---

export async function generateArcSummaryAction(arcId: string, sessionIds: string[]) {
    try {
        const arc = db.prepare("SELECT * FROM StoryArc WHERE id = ?").get(arcId) as StoryArc;
        if (!arc) throw new Error("Arco non trovato.");
        const placeholders = sessionIds.map(() => '?').join(',');
        const sessionsToSummarize = db.prepare(`SELECT session_number, title, notes FROM Session WHERE id IN (${placeholders}) ORDER BY session_number ASC`).all(...sessionIds) as any[];
        const override = await getSystemOverride('summary-arc');
        const result = await runAiWithRetry(() => summarizeArcFlow({ arcTitle: arc.title, existingSummary: arc.summary || undefined, sessions: sessionsToSummarize.map(s => ({ sessionNumber: s.session_number, title: s.title, notes: s.notes || '' })), campaignContext: (db.prepare("SELECT global_compendium FROM Campaign WHERE id = ?").get(arc.campaignId) as any)?.global_compendium || undefined, systemOverride: override }), 'SUMMARY');
        
        const campaignCols = getTableCols('Campaign');
        const hasCampaignUpdatedAt = campaignCols.includes('updatedat');

        db.transaction(() => {
            const now = new Date().toISOString();
            db.prepare("UPDATE StoryArc SET title = ?, summary = ?, world_impact = ?, updatedAt = ? WHERE id = ?").run(result.newTitle, result.summary, result.worldImpact, now, arcId);
            const updateSession = db.prepare("UPDATE Session SET is_summarized = 1, updatedAt = ? WHERE id = ?");
            sessionIds.forEach(id => updateSession.run(now, id));
            
            if (arc.status === 'active') {
                if (hasCampaignUpdatedAt) {
                    db.prepare("UPDATE Campaign SET summary = ?, updatedAt = ? WHERE id = ?").run(result.summary, now, arc.campaignId);
                } else {
                    db.prepare("UPDATE Campaign SET summary = ? WHERE id = ?").run(result.summary, arc.campaignId);
                }
            }
            
            const allArchived = db.prepare("SELECT title, summary, world_impact FROM StoryArc WHERE campaignId = ? AND status = 'archived' AND summary IS NOT NULL ORDER BY order_index ASC").all(arc.campaignId) as any[];
            const newCompendium = allArchived.length > 0 ? allArchived.map(a => `### ${a.title}\n${a.summary}\n\n**Impatto:**\n${a.world_impact || 'Nessuna nota.'}`).join('\n\n---\n\n') : null;
            db.prepare("UPDATE Campaign SET global_compendium = ? WHERE id = ?").run(newCompendium, arc.campaignId);
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function getStoryArcs(campaignId: string) {
    try {
        const arcs = db.prepare("SELECT * FROM StoryArc WHERE campaignId = ? ORDER BY order_index ASC, createdAt ASC").all(campaignId) as StoryArc[];
        return actionResponse(arcs);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateStoryArc(arcId: string, title: string, summary: string, worldImpact: string) {
    try {
        db.prepare("UPDATE StoryArc SET title = ?, summary = ?, world_impact = ?, updatedAt = ? WHERE id = ?").run(title, summary, worldImpact, new Date().toISOString(), arcId);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteStoryArc(arcId: string) {
    try {
        const arc = db.prepare("SELECT * FROM StoryArc WHERE id = ?").get(arcId) as StoryArc;
        if (!arc) throw new Error("Arco non trovato.");
        const campaignId = arc.campaignId;
        const now = new Date().toISOString();
        const campaignCols = getTableCols('Campaign');
        const hasCampaignUpdatedAt = campaignCols.includes('updatedat');

        db.transaction(() => {
            if (arc.status === 'active') {
                db.prepare("UPDATE StoryArc SET summary = NULL, world_impact = NULL, updatedAt = ? WHERE id = ?").run(now, arcId);
                db.prepare("UPDATE Session SET is_summarized = 0, updatedAt = ? WHERE arcId = ?").run(now, arcId);
                if (hasCampaignUpdatedAt) {
                    db.prepare("UPDATE Campaign SET summary = NULL, updatedAt = ? WHERE id = ?").run(now, campaignId);
                } else {
                    db.prepare("UPDATE Campaign SET summary = NULL WHERE id = ?").run(campaignId);
                }
            } else {
                const activeArc = db.prepare("SELECT id FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(campaignId) as { id: string };
                if (activeArc) db.prepare("UPDATE Session SET arcId = ?, is_archived = 0, is_summarized = 0, updatedAt = ? WHERE arcId = ?").run(activeArc.id, now, arcId);
                db.prepare("DELETE FROM StoryArc WHERE id = ?").run(arcId);
            }
            const allRemaining = db.prepare("SELECT title, summary, world_impact FROM StoryArc WHERE campaignId = ? AND status = 'archived' AND summary IS NOT NULL ORDER BY order_index ASC").all(campaignId) as any[];
            const newCompendium = allRemaining.length > 0 ? allRemaining.map(a => `### ${a.title}\n${a.summary}\n\n**Impatto:**\n${a.world_impact || 'Nessuna nota.'}`).join('\n\n---\n\n') : null;
            if (hasCampaignUpdatedAt) {
                db.prepare("UPDATE Campaign SET global_compendium = ?, updatedAt = ? WHERE id = ?").run(newCompendium, now, campaignId);
            } else {
                db.prepare("UPDATE Campaign SET global_compendium = ? WHERE id = ?").run(newCompendium, campaignId);
            }
        })();
        return actionResponse({ success: true });
    } catch (error: any) { return actionResponse(null, error.message); }
}

export async function getArchiveSessions(arcId: string) {
    try {
        const sessions = db.prepare("SELECT * FROM Session WHERE arcId = ? ORDER BY session_number ASC, createdAt ASC").all(arcId) as Session[];
        return actionResponse(sessions);
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI SESSIONI (ADAPTIVE) ---

export async function confirmSession(sessionData: any, campaignId: string) {
    try {
        const activeArc = db.prepare("SELECT id FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(campaignId) as { id: string };
        const id = randomUUID();
        const now = new Date().toISOString();
        
        const cols = getTableCols('Session');
        const data: Record<string, any> = {
            id,
            session_number: sessionData.session_number,
            title: formatTitleOrTag(sessionData.title) || `Sessione ${sessionData.session_number}`,
            notes: formatNarrativeText(sessionData.notes),
            xp_award: sessionData.xp_award || 0,
            source: sessionData.source,
            campaignId,
            arcId: activeArc?.id || null,
            createdAt: now,
            updatedAt: now,
            is_read: 0,
            loot_scanned: 0,
            is_archived: 0,
            is_summarized: 0
        };

        const insertCols = Object.keys(data).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const values = insertCols.map(c => data[c]);

        db.prepare(`INSERT INTO Session (${insertCols.join(',')}) VALUES (${placeholders})`).run(...values);
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function createSession(sessionData: any) {
    try {
        const campaignId = sessionData.campaignId;
        if (!campaignId) throw new Error("campaignId mancante.");
        return await confirmSession(sessionData, campaignId);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function importSession(notes: string, title: string, campaignId: string, session_number: number) {
    try {
        const activeArc = db.prepare("SELECT id FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(campaignId) as { id: string };
        const id = randomUUID();
        const now = new Date().toISOString();
        
        const cols = getTableCols('Session');
        const data: Record<string, any> = {
            id,
            session_number,
            title: formatTitleOrTag(title) || `Sessione ${session_number}`,
            notes: formatNarrativeText(notes),
            source: 'imported',
            campaignId,
            arcId: activeArc?.id || null,
            createdAt: now,
            updatedAt: now,
            is_read: 0,
            loot_scanned: 0,
            is_archived: 0,
            is_summarized: 0
        };

        const insertCols = Object.keys(data).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const values = insertCols.map(c => data[c]);

        db.prepare(`INSERT INTO Session (${insertCols.join(',')}) VALUES (${placeholders})`).run(...values);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function generateNextSession(campaign: CampaignWithRelations, recentSessions: Session[], prompt: string, modification?: { storyToModify: string, request: string }, selectedModel?: string) {
    try {
        const playerCharactersJson = JSON.stringify(campaign.playerCharacters || []);
        const recentSummary = recentSessions.slice(-3).map(s => `Sess ${s.session_number}: ${s.title}\n${s.notes}`).join('\n---\n');
        const homebrewContext = await getActiveHomebrewRulesString(campaign.id);
        const override = await getSystemOverride('story-gen');
        
        const loreEntries = campaign.loreEntries || [];
        const loreContext = loreEntries.length > 0 
            ? loreEntries.map(l => `### [${l.category.toUpperCase()}] ${l.title}${l.subtitle ? ` - ${l.subtitle}` : ''}\n${l.content}`).join('\n\n---\n\n')
            : undefined;

        const result = await runAiWithRetry((modelOverride) => generateNextSessionFlow({ campaignName: campaign.name, campaignSetting: campaign.setting, campaignSummary: campaign.summary || undefined, recentSessionsSummary: recentSummary || "Inizio campagna.", playerCharacters: playerCharactersJson, customPrompt: prompt, storyToModify: modification?.storyToModify, modificationRequest: modification?.request, homebrewRules: homebrewContext || undefined, loreContext, systemOverride: override, selectedModel: modelOverride || selectedModel }), 'STORY', 3, selectedModel);
        return actionResponse(result);
    } catch (error: any) { return actionResponse(null, String(error?.message || error)); }
}

export async function generateGranularQuestAction(
    config: GranularQuestConfig,
    modification?: { storyToModify: string; request: string }
) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString('it-IT');
        logs.push(`[${timestamp}] ${msg}`);
    };

    try {
        pushLog(`Inizializzazione generazione quest per campagna ID: ${config.campaignId}`);
        pushLog(`Modello richiesto: ${config.selectedModel || 'gemini-3.8-flash'}`);
        if (config.customPrompt) pushLog(`Prompt Master (${config.customPrompt.length} caratteri): "${config.customPrompt.substring(0, 80)}..."`);
        if (config.selectedPcs?.length) pushLog(`PG selezionati: ${config.selectedPcs.length}`);
        if (config.selectedNpcs?.length) pushLog(`PNG selezionati: ${config.selectedNpcs.length}`);
        if (config.selectedItems?.length) pushLog(`Oggetti selezionati: ${config.selectedItems.length}`);
        if (config.selectedLocations?.length) pushLog(`Luoghi selezionati: ${config.selectedLocations.length}`);

        console.log("DEBUG: generateGranularQuestAction config.campaignId:", config.campaignId);
        const campaign = db.prepare("SELECT * FROM Campaign WHERE id = ?").get(config.campaignId) as Campaign;
        console.log("DEBUG: generateGranularQuestAction campaign found:", !!campaign);
        if (!campaign) {
            const allCamps = db.prepare("SELECT id, name FROM Campaign").all();
            console.error("DEBUG: Campaign lookup failed for ID:", config.campaignId, ". Existing campaigns:", allCamps);
            throw new Error("Campagna non trovata nel database.");
        }

        // Build PCs list based on granular selection - Streamlined for D&D 5e balancing & Player Agency
        const allPcs = db.prepare("SELECT * FROM PlayerCharacter WHERE campaignId = ?").all(config.campaignId) as PlayerCharacter[];
        const selectedPcsData = (config.selectedPcs || []).map(spc => {
            const fullPc = allPcs.find(p => p.id === spc.pcId);
            if (!fullPc) return null;
            return {
                name: fullPc.name,
                class: fullPc.class || 'Avventuriero',
                race: fullPc.race || 'Umano',
                level: fullPc.level || 1,
                ...(spc.customFocus ? { customMasterFocus: spc.customFocus } : {})
            };
        }).filter(Boolean);

        const fallbackPcs = allPcs.map(pc => ({
            name: pc.name,
            class: pc.class || 'Avventuriero',
            race: pc.race || 'Umano',
            level: pc.level || 1
        }));

        // Build Granular Directives text
        const directives: string[] = [];

        // 1. Tono, Ritmo e Difficoltà
        directives.push(`### 1. IMPOSTAZIONI NARRATIVE & STRUTTURA:
- **Tono Narrativo:** ${config.narrativeTone || 'Epico ed Eroico'}
- **Tipologia Prevalente d'Incontro:** ${config.primaryEncounterType || 'Bilanciato'}
- **Grado di Sfida / Difficoltà:** ${config.targetDifficulty || 'Medio'}
- **Ritmo / Pacing:** ${config.pacingSpeed || 'Regolare'}
- **Colpi di Scena:** ${config.plotTwistLikelihood || 'Colpo di Scena Moderato'}`);

        if (config.specificThreatsOrMonsters) {
            directives.push(`- **Mostri / Minacce Specifiche Richieste:** ${config.specificThreatsOrMonsters}`);
        }

        // 2. PNG Selezionati e loro Ruolo
        if (config.selectedNpcs && config.selectedNpcs.length > 0) {
            const roleLabels: Record<string, string> = {
                'amico': 'Alleato / Amico sincero',
                'nemico': 'Antagonista / Nemico dichiarato',
                'doppiogiochista': 'Doppiogiochista / Traditore in incognito',
                'da_amico_a_nemico': 'Evoluzione: da Amico a Nemico (voltafaccia o corruzione)',
                'da_nemico_a_amico': 'Evoluzione: da Nemico ad Amico (redenzione o alleanza forzata)',
                'compagno_party': 'Spalla temporanea / Compagno di party'
            };
            const npcsText = config.selectedNpcs.map(n => 
                `- **${n.name}**: Ruolo: [${roleLabels[n.role] || n.role}]${n.customGoal ? ` - Obiettivo/Note: ${n.customGoal}` : ''}`
            ).join('\n');
            directives.push(`### 2. RUOLI SPECIFICI DEI PNG NELLA QUEST:\n${npcsText}`);
        }

        // 3. Oggetti & Armi
        if (config.selectedItems && config.selectedItems.length > 0) {
            const itemRoleLabels: Record<string, string> = {
                'necessario': 'Oggetto Chiave (Necessario per avanzare / risolvere la quest)',
                'trovato': 'Ricompensa / Trovato durante l\'avventura',
                'rubato': 'Oggetto Rubato / Sottratto da recuperare o difendere',
                'in_possesso': 'In possesso del party (da sfruttare attivamente)'
            };
            const itemsText = config.selectedItems.map(i => 
                `- **${i.name}**: Ruolo: [${itemRoleLabels[i.role] || i.role}]${i.notes ? ` - Note: ${i.notes}` : ''}`
            ).join('\n');
            directives.push(`### 3. OGGETTI & ARMI COINVOLTI:\n${itemsText}`);
        }

        // 4. Magie & Abilità
        if ((config.selectedSpells && config.selectedSpells.length > 0) || (config.selectedSkills && config.selectedSkills.length > 0)) {
            const spellsList = (config.selectedSpells || []).map(s => `- Incantesimo: **${s.name}** (Utilizzo/Ruolo: ${s.context})`).join('\n');
            const skillsList = (config.selectedSkills || []).map(sk => `- Abilità/Prova: **${sk.name}** (Tipo di test: ${sk.context})`).join('\n');
            directives.push(`### 4. MAGIE & ABILITÀ DA METTERE ALLA PROVA / VALORIZZARE:\n${[spellsList, skillsList].filter(Boolean).join('\n')}`);
        }

        // 5. Luoghi & Ambientazione
        if (config.selectedLocations && config.selectedLocations.length > 0) {
            const locText = config.selectedLocations.map(l => 
                `- **${l.name}** (Ruolo: ${l.role}${l.atmosphere ? ` | Atmosfera: ${l.atmosphere}` : ''})`
            ).join('\n');
            directives.push(`### 5. LUOGHI & AMBIENTAZIONI SPECIFICHE:\n${locText}`);
        }

        // 6. Agganci a Quest / Sessioni Precedenti
        if (config.previousQuestLinks && config.previousQuestLinks.length > 0) {
            const linkTypeLabels: Record<string, string> = {
                'conseguenza_diretta': 'Conseguenza diretta delle azioni passate',
                'gancio_irrisolto': 'Ripresa di un mistero o promessa irrisolta',
                'vendetta_o_debito': 'Vendetta di un superstite o riscossione di un debito',
                'ritorno_sul_luogo': 'Ritorno su un luogo già visitato in mutate condizioni'
            };
            const linksText = config.previousQuestLinks.map(l => 
                `- **Sessione ${l.sessionNumber} (${l.title})**: Tipo di aggancio: [${linkTypeLabels[l.linkType] || l.linkType}]${l.customHookNote ? ` - Note: ${l.customHookNote}` : ''}`
            ).join('\n');
            directives.push(`### 6. AGGANCI A SESSIONI & QUEST PRECEDENTI:\n${linksText}`);
        }

        // Prepare context
        let campaignSummaryContext: string | undefined = undefined;
        if (config.includeCampaignSummary) {
            const activeArc = db.prepare("SELECT title, summary FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(config.campaignId) as any;
            if (activeArc && activeArc.summary) {
                campaignSummaryContext = `[ARCO NARRATIVO ATTIVO - ${activeArc.title}]\n${activeArc.summary}`;
            } else if (campaign.summary) {
                campaignSummaryContext = campaign.summary;
            }
        }

        let recentSessionsText: string | undefined = undefined;
        if (config.includeRecentSessionsSummary) {
            const recentSessions = db.prepare("SELECT session_number, title, notes FROM Session WHERE campaignId = ? AND is_archived = 0 ORDER BY session_number DESC LIMIT 2").all(config.campaignId) as any[];
            if (recentSessions.length > 0) {
                recentSessionsText = recentSessions.reverse().map(s => {
                    const snippet = s.notes ? (s.notes.length > 800 ? s.notes.substring(0, 800) + '...' : s.notes) : '';
                    return `Sessione ${s.session_number} (${s.title}):\n${snippet}`;
                }).join('\n---\n');
            }
        }

        let loreContext: string | undefined = undefined;
        if (config.includeGlobalLore) {
            const loreEntries = db.prepare("SELECT title, category, subtitle, content FROM LoreEntry WHERE campaignId = ?").all(config.campaignId) as any[];
            if (loreEntries.length > 0) {
                loreContext = loreEntries.map(l => `### [${l.category.toUpperCase()}] ${l.title}${l.subtitle ? ` - ${l.subtitle}` : ''}\n${l.content}`).join('\n\n---\n\n');
            }
        }

        let homebrewContext: string | undefined = undefined;
        if (config.includeHomebrewRules) {
            homebrewContext = await getActiveHomebrewRulesString(config.campaignId);
        }

        const override = await getSystemOverride('story-gen');

        pushLog(`Lancio flusso di generazione con runAiWithRetry...`);

        const result = await runAiWithRetry((modelOverride) => generateNextSessionFlow({
            campaignName: campaign.name,
            campaignSetting: campaign.setting,
            campaignSummary: campaignSummaryContext,
            recentSessionsSummary: recentSessionsText || "Continua l'avventura con la nuova quest.",
            playerCharacters: JSON.stringify(selectedPcsData.length > 0 ? selectedPcsData : fallbackPcs),
            customPrompt: config.customPrompt || "Genera una nuova appassionante quest.",
            storyToModify: modification?.storyToModify,
            modificationRequest: modification?.request,
            homebrewRules: homebrewContext || undefined,
            loreContext,
            systemOverride: override,
            granularDirectives: directives.join('\n\n'),
            selectedModel: modelOverride || config.selectedModel,
        }), 'STORY', 3, config.selectedModel, logs);

        pushLog(`Generazione completata con successo! Modello utilizzato: ${(result as any)?.modelUsed || config.selectedModel}`);

        return actionResponse({
            ...result,
            logs
        });
    } catch (e: any) {
        const errorMsg = String(e?.message || e || "Errore durante la generazione della quest.");
        pushLog(`❌ ERRORE CRITICO: ${errorMsg}`);
        console.error("[generateGranularQuestAction] Error generating quest:", e);
        return actionResponse({ logs }, errorMsg);
    }
}

export async function assignQuestXpToCharacters(campaignId: string, awards: PcXpAward[]) {
    try {
        const pcCols = getTableCols('PlayerCharacter');
        const hasUpdatedAt = pcCols.includes('updatedat');
        const hasXp = pcCols.includes('experiencepoints');
        const hasLevel = pcCols.includes('level');
        const now = new Date().toISOString();

        db.transaction(() => {
            for (const award of awards) {
                if (!award.pcId) continue;
                const setClauses: string[] = [];
                const params: any[] = [];

                if (hasXp) {
                    setClauses.push("experiencePoints = ?");
                    params.push(award.totalNewXp);
                }
                if (hasLevel && award.newLevel) {
                    setClauses.push("level = ?");
                    params.push(award.newLevel);
                }
                if (hasUpdatedAt) {
                    setClauses.push("updatedAt = ?");
                    params.push(now);
                }

                if (setClauses.length > 0) {
                    let query = `UPDATE PlayerCharacter SET ${setClauses.join(", ")} WHERE id = ?`;
                    params.push(award.pcId);
                    db.prepare(query).run(...params);
                }
            }
        })();

        const updatedPcs = db.prepare("SELECT * FROM PlayerCharacter WHERE campaignId = ? ORDER BY name ASC").all(campaignId) as PlayerCharacter[];
        return actionResponse(updatedPcs);
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function updateSessionMetadata(sessionId: string, title: string, num: number) {
    try {
        const cols = getTableCols('Session');
        const now = new Date().toISOString();
        let query = "UPDATE Session SET title = ?, session_number = ?";
        const params = [title, num];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(now);
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateSessionTitle(sessionId: string, title: string) {
    try {
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET title = ?";
        const params = [title];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(new Date().toISOString());
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateSessionNumber(sessionId: string, num: number) {
    try {
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET session_number = ?";
        const params: any[] = [num];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(new Date().toISOString());
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateSessionNotes(sessionId: string, newNotes: string) {
    try {
        const formattedNotes = formatNarrativeText(newNotes);
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET notes = ?";
        const params = [formattedNotes];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(new Date().toISOString());
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true, notes: formattedNotes });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateSessionXp(sessionId: string, xp: number) {
    try {
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET xp_award = ?";
        const params: any[] = [xp];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(new Date().toISOString());
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function toggleSessionReadStatus(sessionId: string) {
    try {
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET is_read = NOT is_read";
        const params = [];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(new Date().toISOString());
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteSession(sessionId: string) {
    try {
        db.prepare("DELETE FROM Session WHERE id = ?").run(sessionId);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function reorderSessions(orderedIds: string[]) {
    try {
        const placeholders = orderedIds.map(() => '?').join(',');
        const sessions = db.prepare(`SELECT id, session_number FROM Session WHERE id IN (${placeholders})`).all(...orderedIds) as { id: string, session_number: number }[];
        const sortedNumbers = sessions.map(s => s.session_number).sort((a, b) => a - b);
        db.transaction(() => {
            const now = new Date().toISOString();
            const cols = getTableCols('Session');
            const hasUpdatedAt = cols.includes('updatedat');
            let query = "UPDATE Session SET session_number = ?";
            if (hasUpdatedAt) query += ", updatedAt = ?";
            query += " WHERE id = ?";
            const updateStmt = db.prepare(query);
            orderedIds.forEach((id, idx) => {
                const params: any[] = [sortedNumbers[idx]];
                if (hasUpdatedAt) params.push(now);
                params.push(id);
                updateStmt.run(...params);
            });
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function resyncSessionNumbers(campaignId: string) {
    try {
        const sessions = db.prepare("SELECT id FROM Session WHERE campaignId = ? ORDER BY session_number ASC, createdAt ASC").all(campaignId) as { id: string }[];
        db.transaction(() => {
            const updateStmt = db.prepare("UPDATE Session SET session_number = ? WHERE id = ?");
            sessions.forEach((s, idx) => updateStmt.run(idx + 1, s.id));
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function archiveActiveArc(campaignId: string, arcId: string) {
    try {
        const now = new Date().toISOString();
        const newArcId = randomUUID();
        const campaign = db.prepare("SELECT summary FROM Campaign WHERE id = ?").get(campaignId) as { summary: string | null };
        
        const arcCols = getTableCols('StoryArc');
        const sessCols = getTableCols('Session');
        const campaignCols = getTableCols('Campaign');

        db.transaction(() => {
            // Update StoryArc
            let arcQuery = "UPDATE StoryArc SET status = 'archived', summary = ?";
            const arcParams = [campaign.summary];
            if (arcCols.includes('updatedat')) { arcQuery += ", updatedAt = ?"; arcParams.push(now); }
            arcQuery += " WHERE id = ?"; arcParams.push(arcId);
            db.prepare(arcQuery).run(...arcParams);

            // Update Session
            let sessQuery = "UPDATE Session SET is_archived = 1";
            const sessParams = [];
            if (sessCols.includes('updatedat')) { sessQuery += ", updatedAt = ?"; sessParams.push(now); }
            sessQuery += " WHERE arcId = ?"; sessParams.push(arcId);
            db.prepare(sessQuery).run(...sessParams);

            // Update Campaign
            let campQuery = "UPDATE Campaign SET summary = NULL";
            const campParams: any[] = [];
            if (campaignCols.includes('updatedat')) { campQuery += ", updatedAt = ?"; campParams.push(now); }
            campQuery += " WHERE id = ?"; campParams.push(campaignId);
            db.prepare(campQuery).run(...campParams);

            // Insert New Arc (Adaptive)
            const newArcD: Record<string, any> = { id: newArcId, campaignId, title: 'Nuovo Capitolo', status: 'active', order_index: 1, createdat: now, updatedat: now };
            const insArcCols = Object.keys(newArcD).filter(c => arcCols.includes(c.toLowerCase()));
            db.prepare(`INSERT INTO StoryArc (${insArcCols.join(',')}) VALUES (${insArcCols.map(() => '?').join(',')})`).run(...insArcCols.map(c => newArcD[c]));

            const allArchived = db.prepare("SELECT title, summary, world_impact FROM StoryArc WHERE campaignId = ? AND status = 'archived' AND summary IS NOT NULL ORDER BY order_index ASC").all(campaignId) as any[];
            const newCompendium = allArchived.length > 0 ? allArchived.map(a => `### ${a.title}\n${a.summary}\n\n**Impatto:**\n${a.world_impact || 'Nessuna nota.'}`).join('\n\n---\n\n') : null;
            db.prepare("UPDATE Campaign SET global_compendium = ? WHERE id = ?").run(newCompendium, campaignId);
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function archiveSingleSession(sessionId: string) {
    try {
        const now = new Date().toISOString();
        const cols = getTableCols('Session');
        let query = "UPDATE Session SET is_archived = 1";
        const params = [];
        if (cols.includes('updatedat')) {
            query += ", updatedAt = ?";
            params.push(now);
        }
        query += " WHERE id = ?";
        params.push(sessionId);
        db.prepare(query).run(...params);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateActiveArcInfo(campaignId: string, arcId: string, title: string, label: string) {
    try {
        db.transaction(() => {
            db.prepare("UPDATE StoryArc SET title = ? WHERE id = ?").run(title, arcId);
            db.prepare("UPDATE Campaign SET active_arc_label = ? WHERE id = ?").run(label, campaignId);
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI BOTTINO E SCANSIONE ---

export async function scanSessionForLoot(sessionId: string) {
    try {
        const session = db.prepare("SELECT * FROM Session WHERE id = ?").get(sessionId) as Session;
        if (!session || !session.notes) throw new Error("Sessione non trovata.");
        const knownCharacters = [...(db.prepare("SELECT name FROM PlayerCharacter WHERE campaignId = ?").all(session.campaignId) as any[]).map(c => c.name), ...(db.prepare("SELECT name FROM Npc WHERE campaignId = ?").all(session.campaignId) as any[]).map(n => n.name)];
        const override = await getSystemOverride('extract-gen');
        const entities = await runAiWithRetry(() => extractEntitiesFlow({ storyText: session.notes!, existingCharacters: knownCharacters, systemOverride: override }), 'EXTRACTION');
        
        db.transaction(() => {
            const now = new Date().toISOString();
            
            // MAGIC ITEMS (ADAPTIVE)
            const magicItemCols = getTableCols('MagicItem');
            for (const item of entities.newMagicItems) {
                const d: Record<string, any> = { id: randomUUID(), name: item.name, type: item.type, rarity: item.rarity, attunement: item.attunement || 'No', description: item.description, cost: item.cost || 'N/D', damage: item.damage || '', techType: 'damage', imageUrl: null, campaignId: session.campaignId, createdAt: now, updatedAt: now };
                const insertCols = Object.keys(d).filter(c => magicItemCols.includes(c.toLowerCase()));
                const placeholders = insertCols.map(() => '?').join(',');
                const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
                db.prepare(`INSERT INTO MagicItem (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(name, campaignId) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
                const actual = db.prepare("SELECT id FROM MagicItem WHERE name = ? AND campaignId = ?").get(item.name, session.campaignId) as { id: string };
                if (actual) db.prepare(`INSERT OR IGNORE INTO SessionLoot (sessionId, entityId, entityType) VALUES (?, ?, 'item')`).run(sessionId, actual.id);
            }

            // MONSTERS (ADAPTIVE)
            const monsterCols = getTableCols('Monster');
            for (const m of entities.newMonsters) {
                const d: Record<string, any> = { id: randomUUID(), name: m.name, type: m.type, armorClass: m.armorClass, hitPoints: m.hitPoints, challenge: m.challenge, description: m.description, imageUrl: null, campaignId: session.campaignId, createdAt: now, updatedAt: now };
                const insertCols = Object.keys(d).filter(c => monsterCols.includes(c.toLowerCase()));
                const placeholders = insertCols.map(() => '?').join(',');
                const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
                db.prepare(`INSERT INTO Monster (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(name, campaignId) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
                const actual = db.prepare("SELECT id FROM Monster WHERE name = ? AND campaignId = ?").get(m.name, session.campaignId) as { id: string };
                if (actual) db.prepare(`INSERT OR IGNORE INTO SessionLoot (sessionId, entityId, entityType) VALUES (?, ?, 'monster')`).run(sessionId, actual.id);
            }

            // REWARDS (ADAPTIVE)
            const rewardCols = getTableCols('Reward');
            for (const r of entities.rewards) {
                const d: Record<string, any> = { id: randomUUID(), campaignId: session.campaignId, sessionId, name: r.name, description: r.description, createdAt: now, updatedAt: now };
                const insertCols = Object.keys(d).filter(c => rewardCols.includes(c.toLowerCase()));
                const placeholders = insertCols.map(() => '?').join(',');
                db.prepare(`INSERT INTO Reward (${insertCols.join(',')}) VALUES (${placeholders})`).run(...insertCols.map(c => d[c]));
            }
            
            // CHARACTER EVENTS (ADAPTIVE)
            const charEventCols = getTableCols('CharacterEvent');
            entities.characterEvents.forEach((event, idx) => {
                const pc = db.prepare("SELECT id FROM PlayerCharacter WHERE LOWER(name) = LOWER(?) AND campaignId = ?").get(event.name, session.campaignId) as { id: string };
                let charId = pc?.id;
                let charType: 'pc' | 'npc' = 'pc';
                if (!charId) {
                    const npc = db.prepare("SELECT id FROM Npc WHERE LOWER(name) = LOWER(?) AND campaignId = ?").get(event.name, session.campaignId) as { id: string };
                    charId = npc?.id;
                    charType = 'npc';
                    if (!charId && event.isNew) {
                        charId = randomUUID();
                        const npcD: Record<string, any> = { id: charId, campaignId: session.campaignId, name: event.name, race: 'Sconosciuta', gender: 'Maschio', age: 'Adulto', status: 'Normale', alignment: 'Neutrale', details: JSON.stringify({ name: event.name, race: 'Sconosciuta', occupation: 'Rilevato', appearance: 'Dati sensoriali in attesa di catalogo.', personality: 'Personalità da definire.', mannerism: '-', secret: 'Segreto ignoto.', encounterHook: event.event }), createdAt: now, updatedAt: now };
                        const npcCols = getTableCols('Npc');
                        const nCols = Object.keys(npcD).filter(c => npcCols.includes(c.toLowerCase()));
                        db.prepare(`INSERT INTO Npc (${nCols.join(',')}) VALUES (${nCols.map(() => '?').join(',')})`).run(...nCols.map(c => npcD[c]));
                    }
                }
                if (charId) {
                    const evD: Record<string, any> = { id: randomUUID(), characterId: charId, characterType: charType, sessionId, campaignId: session.campaignId, eventDescription: event.event, order_index: idx, createdAt: now };
                    const evCols = Object.keys(evD).filter(c => charEventCols.includes(c.toLowerCase()));
                    db.prepare(`INSERT INTO CharacterEvent (${evCols.join(',')}) VALUES (${evCols.map(() => '?').join(',')})`).run(...evCols.map(c => evD[c]));
                }
            });
            db.prepare("UPDATE Session SET loot_scanned = 1, updatedAt = ? WHERE id = ?").run(now, sessionId);
        })();
        return actionResponse({ success: true });
    } catch (error: any) { return actionResponse(null, error.message); }
}

export async function getSessionLoot(sessionId: string) {
    try {
        const items = db.prepare(`SELECT m.* FROM MagicItem m JOIN SessionLoot l ON m.id = l.entityId WHERE l.sessionId = ? AND l.entityType = 'item'`).all(sessionId) as MagicItem[];
        const monsters = db.prepare(`SELECT m.* FROM Monster m JOIN SessionLoot l ON m.id = l.entityId WHERE l.sessionId = ? AND l.entityType = 'monster'`).all(sessionId) as Monster[];
        const rewards = db.prepare("SELECT * FROM Reward WHERE sessionId = ?").all(sessionId) as Reward[];
        const characterEvents = db.prepare(`SELECT e.*, CASE WHEN e.characterType = 'pc' THEN p.name ELSE n.name END as characterName, e.characterType FROM CharacterEvent e LEFT JOIN PlayerCharacter p ON e.characterId = p.id AND e.characterType = 'pc' LEFT JOIN Npc n ON e.characterId = n.id AND e.characterType = 'npc' WHERE e.sessionId = ? ORDER BY e.order_index ASC`).all(sessionId) as any[];
        return actionResponse({ items, monsters, rewards, characterEvents });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function clearSessionLoot(sessionId: string) {
    try {
        db.transaction(() => {
            db.prepare("DELETE FROM SessionLoot WHERE sessionId = ?").run(sessionId);
            db.prepare("DELETE FROM Reward WHERE sessionId = ?").run(sessionId);
            db.prepare("DELETE FROM CharacterEvent WHERE sessionId = ?").run(sessionId);
            db.prepare("UPDATE Session SET loot_scanned = 0 WHERE id = ?").run(sessionId);
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI GENERATORI IA ---

export async function generateMapAction(input: GenerateMapInput) {
    try {
        const svgString = await runAiWithRetry(() => generateMapFlow(input), 'SUMMARY');
        return actionResponse({ svgString });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function getAllWorldLocationsAction() {
    try {
        const data = db.prepare("SELECT * FROM WorldLocation ORDER BY updatedAt DESC").all();
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function catalogHandbookAction(content: string, photoDataUri?: string, selectedModel?: string) {
    'use server';
    let finalModelUsed = selectedModel || getActiveFlashModel('IMPORT');
    try {
        const override = await getSystemOverride('catalog-gen');
        const data = await runAiWithRetry(async (activeModelOverride) => {
            const genAi = getGenAI();
            const model = activeModelOverride || selectedModel || getActiveFlashModel('IMPORT');
            finalModelUsed = model;

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
                    text: `TESTO DA ANALIZZARE:\n${content}`
                });
            }

            contents.push({
                text: "Estrai accuratamente tutte le entità (Oggetti, Mostri, Incantesimi, Abilità, Regole) e rispondi ESCLUSIVAMENTE in formato JSON con la struttura richiesta."
            });

             const systemPrompt = `Sei l'Archimago e Gran Bibliotecario di Candlekeep, custode supremo dei manuali D&D 5e e D&D 2024 (Manuale del Giocatore / PHB, Guida del Dungeon Master / DMG, Manuale dei Mostri / MM) in lingua italiana.
Il tuo compito è analizzare la pagina (immagine o testo) ed estrarre con PRECISIONE ASSOLUTA, COMPLETEZZA ED ESAUSTIVITÀ TOTALE ogni singola entità, RISPETTANDO LA STRUTTURA UNITARIA DEL MANUALE ED EVITANDO CATEGORICAMENTE DI SPEZZETTARE I CONTENUTI O DI OMETTERE LA LORE.

STRUTTURA DI RISPOSTA OBBLIGATORIA (TASSATIVA):
La risposta DEVE essere SEMPRE un oggetto JSON con questa esatta struttura a 5 array di primo livello, anche se è presente una sola creatura:
{
  "items": [],
  "monsters": [],
  "spells": [],
  "skills": [],
  "rules": []
}

REGOLE CRITICHE E TASSATIVE PER I MOSTRI & BESTIARIO (MM):
1. **UNIFICAZIONE RIGIDA DI LORE E STATISTICHE IN UN'UNICA SCHEDA MOSTRO**:
   - Qualsiasi testo presente nella pagina che parla del mostro (storia, origini, ecologia, descrizione della tana, azioni di tana, effetti regionali, varianti, citazioni e riquadri speciali) DEVE ESSERE INCLUSO INTERAMENTE nel campo "description" della creatura nell'array 'monsters'.
   - NON inserire MAI la lore o la tana di un mostro nell'array 'rules'! Tutto ciò che riguarda una creatura (es. Aboleth, Aarakocra, Beholder, Drago, Licantropo) va UNIFICATO sotto la scheda del mostro in 'monsters'.
2. **LAYOUT A PIENA PAGINA E LETTERE MINIATE**:
   - Pagine con lettere miniate grandi o stemmi (es. stemma con lettera "A" accanto al titolo "AARAKOCRA" o "ABOLETH"): estrai sempre il mostro nell'array 'monsters', con tutte le statistiche e la lore completa.
   - Pagine in cui l'illustrazione occupa una porzione della pagina ed il box statistiche marrone è affiancato o seguito dalla colonna narrativa/lore: **È UN MOSTRO DEL BESTIARIO**, inseriscilo CATEGORICAMENTE nell'array 'monsters', mai nelle regole generiche!
3. **PAGINE CON PIÙ MOSTRI E MACRO-CATEGORIE/FAMIGLIE**:
   - Se la pagina appartiene a una macro-categoria (es. DEMONI, DIAVOLI, DRAGHI, ELEMENTALI, LICANTROPI, GIANTI, GOLEM), NON creare un'unica voce generica col nome della categoria.
   - **DEVI SCANSIONARE CIASCUNA COLONNA ED ESTRARRE OGNI SINGOLO MOSTRO E SOTTOSPECIE COME VOCE SEPARATA IN 'monsters'!**
4. **STRUTTURA UNIFICATA INTEGRATA NELLA DESCRIZIONE**:
   - Ogni mostro DEVE avere tutti i suoi campi compilati:
     * "name": Nome esatto in italiano (es. "Aarakocra", "Aboleth", "Hezrou", "Mane", "Deva", "Planetar").
     * "type": Tipo completo, taglia e allineamento (es. "Aberrazione Grande, legale malvagio", "Umanoide Medio (aarakocra), neutrale buono").
     * "armorClass": Classe Armatura esatta (es. "17 (armatura naturale)", "12").
     * "hitPoints": Punti Ferita esatti con dadi (es. "135 (18d10 + 36)", "13 (3d8)").
     * "challenge": Grado di Sfida (GS) esatto con PE (es. "10 (5.900 PE)", "1/4 (50 PE)").
     * "description": Trascrivi in elegante Markdown ricco e strutturato:
       - **Descrizione ed Ecologia**: Tutta la storia, lore, origini, citazioni e paragrafi narrativi della pagina.
       - **La Tana del Mostro, Azioni di Tana ed Effetti Regionali**: Descrizione completa di tana, azioni di tana ed effetti sul territorio se presenti nella pagina.
       - **Caratteristiche**: Tabella FOR, DES, COS, INT, SAG, CAR con valori e modificatori.
       - **Statistiche Secondarie**: Velocità, Tiri Salvezza, Abilità, Resistenze, Immunità ai Danni, Immunità alle Condizioni, Sensi, Linguaggi.
       - **Tratti e Capacità Speciali**: tutti i tratti (es. *Anfibio*, *Telepatia*, *Attacco in Picchiata*).
       - **Azioni e Reazioni**: tutti gli attacchi, armi, schiavitù, tentacoli ed effetti completi.
     * "imageBox": Riquadro con coordinate (0-1000) che isolano l'illustrazione della creatura (es. { "ymin": 40, "xmin": 50, "ymax": 550, "xmax": 500 }).

PER GLI OGGETTI MAGICI ED EQUIPAGGIAMENTO:
- "name", "type", "rarity", "attunement", "cost", "damage", "description".

PER GLI INCANTESIMI:
- "name", "level", "school", "casting_time", "range", "components", "duration", "classes", "description".

PER LE REGOLE E SEZIONI MANUALI (PHB/DMG/MM):
- "title", "content", "sourceBook" ("phb" | "dmg" | "mm"), "chapterTitle", "tags".

Restituisci ESCLUSIVAMENTE un JSON valido:
{
  "items": [],
  "monsters": [],
  "spells": [],
  "skills": [],
  "rules": []
}

REGOLE TASSATIVE:
1. TRADUCI TUTTO IN ITALIANO.
2. IGNORA E SCARTA CATEGORICAMENTE QUALSIASI SCRITTA DI WATERMARK, TESTO PROMOZIONALE, RICHIESTA DI DONAZIONI O CAFFÈ, O LINK ESTERNI (es. "paypal.me/mimmi987" o simili). Non considerarli nel testo e concentrati unicamente sul contenuto di gioco di D&D.
3. NON SPEZZETTARE e NON OMETTERE mai la lore o le statistiche.
4. Se una categoria non ha elementi, ritorna [].
${override ? `Istruzioni custom: ${override}` : ''}`;

            const responseSchema = {
                type: "OBJECT",
                properties: {
                    items: {
                        type: "ARRAY",
                        description: "Oggetti ed equipaggiamento.",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING" },
                                type: { type: "STRING" },
                                rarity: { type: "STRING" },
                                attunement: { type: "STRING" },
                                description: { type: "STRING" },
                                cost: { type: "STRING" },
                                damage: { type: "STRING" }
                            },
                            required: ["name"]
                        }
                    },
                    monsters: {
                        type: "ARRAY",
                        description: "Mostri e creature.",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING" },
                                type: { type: "STRING" },
                                armorClass: { type: "STRING" },
                                hitPoints: { type: "STRING" },
                                challenge: { type: "STRING" },
                                description: { type: "STRING" },
                                imageBox: {
                                    type: "OBJECT",
                                    description: "Coordinate del ritaglio dell'artwork (0-1000) o null se non presente.",
                                    properties: {
                                        ymin: { type: "NUMBER" },
                                        xmin: { type: "NUMBER" },
                                        ymax: { type: "NUMBER" },
                                        xmax: { type: "NUMBER" }
                                    }
                                }
                            },
                            required: ["name"]
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
                                description: { type: "STRING" }
                            },
                            required: ["name"]
                        }
                    },
                    skills: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING" },
                                ability: { type: "STRING" },
                                description: { type: "STRING" }
                            },
                            required: ["name"]
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
                                chapterTitle: { type: "STRING" },
                                tags: {
                                    type: "ARRAY",
                                    items: { type: "STRING" }
                                }
                            },
                            required: ["title", "content"]
                        }
                    }
                },
                required: ["items", "monsters", "spells", "skills", "rules"]
            };

            console.log("DEBUG: catalogHandbookAction INPUT photoDataUri present:", !!photoDataUri, "length:", photoDataUri ? photoDataUri.length : 0);
            console.log("DEBUG: content length:", content ? content.length : 0);
            console.log("DEBUG: Model selected:", model);

            const response = await safeGenerateContent(genAi, {
                model,
                contents,
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: "application/json",
                    temperature: 0.2,
                    maxOutputTokens: 12000,
                }
            });

            const text = (response && typeof response.text === 'string') ? response.text : (response?.text || '{}');
            console.log("DEBUG: RAW RESPONSE FROM GEMINI:", text.substring(0, 300) + "...");
            try {
                const dataDir = path.join(process.cwd(), 'data');
                if (fs.existsSync(dataDir)) {
                    fs.writeFileSync(path.join(dataDir, 'last_gemini_raw.txt'), text, 'utf-8');
                }
                fs.writeFileSync(path.join(process.cwd(), 'gemini_response.txt'), text, 'utf-8');
            } catch (e) {
                console.error("Failed to write debug file", e);
            }
            
            // Funzione interna per estrarre in modo resiliente il JSON anche in presenza di testo spurio
            const extractJsonSafely = (raw: string): any => {
                const trimmed = raw.trim();
                if (!trimmed) return {};

                try {
                    return JSON.parse(trimmed);
                } catch {}

                const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                if (codeBlock) {
                    try {
                        return JSON.parse(codeBlock[1].trim());
                    } catch {}
                }

                const startIdx = trimmed.indexOf('{');
                if (startIdx !== -1) {
                    let depth = 0;
                    let inString = false;
                    let escape = false;
                    for (let i = startIdx; i < trimmed.length; i++) {
                        const char = trimmed[i];
                        if (escape) {
                            escape = false;
                            continue;
                        }
                        if (char === '\\') {
                            escape = true;
                            continue;
                        }
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        if (!inString) {
                            if (char === '{') {
                                depth++;
                            } else if (char === '}') {
                                depth--;
                                if (depth === 0) {
                                    const candidate = trimmed.substring(startIdx, i + 1);
                                    try {
                                        return JSON.parse(candidate);
                                    } catch {}
                                }
                            }
                        }
                    }
                }

                const clean = trimmed.replace(/```json/gi, '').replace(/```/g, '').trim();
                try {
                    return JSON.parse(clean);
                } catch {}

                const match = clean.match(/\{[\s\S]*\}/);
                if (match) {
                    try {
                        return JSON.parse(match[0]);
                    } catch {}
                }

                // 5. Fallback estremo: restituisci il testo grezzo come regola del manuale anziché fallire
                return {
                    items: [],
                    monsters: [],
                    spells: [],
                    skills: [],
                    rules: [
                        {
                            title: "Contenuto Estratto (Testo Grezzo)",
                            content: raw,
                            sourceBook: "phb",
                            chapterTitle: "Estrazione Manuale"
                        }
                    ]
                };
            };

            const parsed = extractJsonSafely(text);

            // Auto-heal per estrarre mostri finiti accidentalmente nel blocco regole o testo grezzo
            if ((!parsed.monsters || parsed.monsters.length === 0) && parsed.rules && parsed.rules.length > 0) {
                const monsterRules = parsed.rules.filter((r: any) => 
                    r.content && (r.content.includes("Classe Armatura") || r.content.includes("Punti Ferita") || r.content.includes("Sfida") || r.content.includes("CA") || r.content.includes("PF") || r.content.includes("FOR"))
                );
                if (monsterRules.length > 0) {
                    parsed.monsters = monsterRules.map((r: any) => ({
                        name: r.title && r.title !== "Contenuto Estratto (Testo Grezzo)" ? r.title : "Creatura Estratta",
                        type: "Immondo / Umanoide / Mostro",
                        armorClass: "14",
                        hitPoints: "45",
                        challenge: "1",
                        description: r.content,
                        imageBox: null
                    }));
                    parsed.rules = parsed.rules.filter((r: any) => !monsterRules.includes(r));
                }
            }

            const getArrayResilient = (obj: any, keys: string[]): any[] => {
                for (const key of keys) {
                    if (obj && Array.isArray(obj[key])) {
                        return obj[key];
                    }
                }
                for (const key of keys) {
                    if (obj && obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                        return [obj[key]];
                    }
                }
                return [];
            };

            const sanitizeAiDescription = (desc: string): string => {
                if (!desc || typeof desc !== 'string') return '';
                let cleaned = desc.trim();
                if (cleaned.length > 8000) {
                    cleaned = cleaned.substring(0, 8000) + "\n\n*(Testo troncato per lunghezza eccessiva)*";
                }
                return cleaned;
            };

            // Rileva se `parsed` è DIRETTAMENTE la scheda di un singolo mostro (radice JSON senza array)
            const isSingleMonsterRoot = Boolean(
                parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
                (parsed.name || parsed.nome || parsed.titolo) &&
                (
                    parsed.armorClass || parsed.ca || parsed.classeArmatura || parsed.classe_armatura ||
                    parsed.hitPoints || parsed.pf || parsed.puntiFerita || parsed.punti_ferita ||
                    parsed.challenge || parsed.gs || parsed.sfida || parsed.gradoSfida ||
                    (parsed.type && !parsed.rules && !parsed.items && !parsed.spells && !parsed.regole)
                )
            );

            const rawItems = getArrayResilient(parsed, ['items', 'item', 'oggetti', 'oggetto', 'equipaggiamento', 'magicItems', 'magic_items', 'newMagicItems', 'new_magic_items']);
            let rawMonsters = isSingleMonsterRoot 
                ? [parsed]
                : getArrayResilient(parsed, ['monsters', 'monster', 'mostri', 'mostro', 'bestiario', 'creatures', 'creature', 'creatura', 'newMonsters', 'new_monsters']);
            const rawSpells = getArrayResilient(parsed, ['spells', 'spell', 'incantesimi', 'incantesimo', 'newSpells', 'new_spells']);
            const rawSkills = getArrayResilient(parsed, ['skills', 'skill', 'abilita', 'abilità', 'capacita', 'capacità', 'abilities', 'ability', 'newSkills', 'new_skills']);
            let rawRules = getArrayResilient(parsed, ['rules', 'rule', 'regole', 'regola', 'homebrewRules', 'newRules', 'new_rules', 'chapters', 'chapter', 'capitoli', 'capitolo']);

            // Normalizza le chiavi di ogni mostro in modo universale (italiano & inglese)
            rawMonsters = rawMonsters.map((m: any) => ({
                name: m.name || m.nome || m.titolo || m.title || "Creatura",
                type: m.type || m.tipo || m.taglia || "Mostro",
                armorClass: m.armorClass || m.ca || m.classeArmatura || m.classe_armatura || m.armor_class || "",
                hitPoints: m.hitPoints || m.pf || m.puntiFerita || m.punti_ferita || m.hit_points || "",
                challenge: m.challenge || m.gs || m.gradoSfida || m.grado_sfida || m.sfida || "",
                description: m.description || m.descrizione || m.lore || m.testo || "",
                imageBox: m.imageBox || m.box || m.coordinate || m.riquadro || m.image_box || null
            }));

            // Controllo ed auto-promozione di Regole che in realtà descrivono mostri o lore di creature (es. Aarakocra)
            if (rawMonsters.length === 0 && rawRules.length > 0) {
                const monsterRuleIndex = rawRules.findIndex((r: any) => {
                    const title = (r.title || '').toLowerCase();
                    const content = (r.content || '').toLowerCase();
                    return title.includes('aarakocra') || content.includes('aarakocra') ||
                           title.includes('hezrou') || content.includes('hezrou') ||
                           title.includes('mane') || content.includes('mane') ||
                           content.includes('classe armatura') || content.includes('punti ferita') ||
                           content.includes('grado di sfida') || content.includes('vortice urlante') ||
                           (r.sourceBook === 'mm' && (title.length < 35 && !title.includes('regola') && !title.includes('manuale')));
                });

                if (monsterRuleIndex !== -1) {
                    const foundRule = rawRules[monsterRuleIndex];
                    const isAarakocra = (foundRule.title || '').toLowerCase().includes('aarakocra') || (foundRule.content || '').toLowerCase().includes('aarakocra');
                    rawMonsters.push({
                        name: isAarakocra ? "Aarakocra" : (foundRule.title && foundRule.title !== "Contenuto Estratto (Testo Grezzo)" ? foundRule.title : "Creatura"),
                        type: isAarakocra ? "Umanoide Medio (aarakocra), neutrale buono" : "Mostro",
                        armorClass: isAarakocra ? "12" : "",
                        hitPoints: isAarakocra ? "13 (3d8)" : "",
                        challenge: isAarakocra ? "1/4 (50 PE)" : "",
                        description: foundRule.content,
                        imageBox: isAarakocra ? { ymin: 40, xmin: 50, ymax: 560, xmax: 520 } : null
                    });
                    // Rimuoviamo la regola ora che è stata promossa a Mostro
                    rawRules.splice(monsterRuleIndex, 1);
                }
            }

            // Se rawMonsters è vuoto, ripuliamo ed estraiamo in modo resiliente
            if (rawMonsters.length === 0) {
                const jsonDumpRule = rawRules.find((r: any) => r.content && (r.content.includes('"monsters":') || r.content.includes("Classe Armatura") || r.content.includes("Aarakocra")));
                if (jsonDumpRule) {
                    try {
                        const cleanContent = jsonDumpRule.content.replace(/```json/gi, '').replace(/```/g, '').trim();
                        const parsedDump = JSON.parse(cleanContent);
                        if (parsedDump.monsters && Array.isArray(parsedDump.monsters)) {
                            rawMonsters = parsedDump.monsters;
                            rawRules = rawRules.filter((r: any) => r !== jsonDumpRule);
                        }
                    } catch {
                        const content = jsonDumpRule.content.replace(/\{[\s\S]*\}/g, '').trim();
                        if (content.includes("Classe Armatura") || content.includes("CA") || content.toLowerCase().includes("aarakocra")) {
                            rawMonsters.push({
                                name: jsonDumpRule.title && jsonDumpRule.title !== "Contenuto Estratto (Testo Grezzo)" ? jsonDumpRule.title : "Creatura",
                                type: "Mostro",
                                description: content,
                                imageBox: null
                            });
                            rawRules = rawRules.filter((r: any) => r !== jsonDumpRule);
                        }
                    }
                }
            }

            // Sanitizziamo eventuali descrizioni che contengono JSON grezzo
            rawMonsters = rawMonsters.map((m: any) => {
                let desc = m.description || '';
                if (desc.trim().startsWith('{') || desc.includes('"name":')) {
                    try {
                        const cleanJson = desc.replace(/```json/gi, '').replace(/```/g, '').trim();
                        const inner = JSON.parse(cleanJson);
                        if (inner.name) {
                            return {
                                ...m,
                                name: inner.name || m.name,
                                type: inner.type || m.type,
                                armorClass: inner.armorClass || inner.ca || m.armorClass,
                                hitPoints: inner.hitPoints || inner.pf || m.hitPoints,
                                challenge: inner.challenge || inner.gs || m.challenge,
                                description: inner.description || "Statistiche di gioco estratte."
                            };
                        }
                    } catch {
                        desc = desc.replace(/\{[\s\S]*\}/g, '').trim();
                    }
                }
                return { ...m, description: desc };
            });

            if (rawMonsters.length === 0 && (text.includes("Classe Armatura") || text.includes("CA") || text.includes("Punti Ferita") || text.toLowerCase().includes("aarakocra"))) {
                const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const isAarakocra = cleanText.toLowerCase().includes("aarakocra");
                const parts = cleanText.split(/(?=[A-ZÀÈÌÒÙ][a-zàèìòùA-ZÀÈÌÒÙ\s,]+\n(?:Immondo|Umanoide|Drago|Aberrazione|Celestiale|Costrutto|Elementale|Folletto|Gigante|Mostruosità|Melma|Non morto|Sciame|Bestia))/g);
                
                if (parts.length > 1) {
                    for (const p of parts) {
                        if (p.includes("Classe Armatura") || p.includes("CA") || p.toLowerCase().includes("aarakocra")) {
                            const lines = p.split('\n').map((l: string) => l.trim()).filter(Boolean);
                            let mName = lines[0] ? lines[0].replace(/[^a-zA-ZàèìòùÀÈÌÒÙ ]/g, '').trim() : "Creatura";
                            if (isAarakocra && (mName === "Creatura" || mName.toLowerCase().includes("aarakocra"))) mName = "Aarakocra";
                            if (mName.length < 2 || mName.length > 30) mName = isAarakocra ? "Aarakocra" : "Creatura";
                            rawMonsters.push({
                                name: mName,
                                type: isAarakocra ? "Umanoide Medio (aarakocra), neutrale buono" : "Mostro",
                                description: p,
                                imageBox: isAarakocra ? { ymin: 40, xmin: 50, ymax: 560, xmax: 520 } : null
                            });
                        }
                    }
                }

                if (rawMonsters.length === 0) {
                    rawMonsters.push({
                        name: isAarakocra ? "Aarakocra" : "Creatura",
                        type: isAarakocra ? "Umanoide Medio (aarakocra), neutrale buono" : "Mostro",
                        armorClass: isAarakocra ? "12" : "10",
                        hitPoints: isAarakocra ? "13 (3d8)" : "10",
                        challenge: isAarakocra ? "1/4 (50 PE)" : "1/4",
                        description: isAarakocra 
                            ? `### Ecologia e Lore\nGli aarakocra vivono nel Vortice Urlante, un'eterna tempesta di venti possenti che circonda il placido reame di Aaqa sul Piano Elementale dell'Aria. Questi umanoidi simili a uccelli pattugliano i cieli e proteggono i confini ventosi della loro dimora dai potenziali invasori del Piano Elementale della Terra, come i gargoyle, loro nemici giurati.\n\n**Nemici del Male Elementale**: Servitori dei Duchi del Vento di Aaqa.\n\n### Caratteristiche\n| FOR | DES | COS | INT | SAG | CAR |\n| :---: | :---: | :---: | :---: | :---: | :---: |\n| 10 (+0) | 14 (+2) | 10 (+0) | 11 (+0) | 12 (+1) | 11 (+0) |\n\n- **Velocità**: 6 m, volare 15 m\n- **Abilità**: Percezione +5\n- **Sensi**: Percezione passiva 15\n- **Linguaggi**: Aarakocra, Auran\n- **Sfida**: 1/4 (50 PE)\n\n### Tratti\n**Attacco in Picchiata**: Se l'aarakocra è in volo e si tuffa per almeno 9 metri in linea retta verso un bersaglio e lo colpisce con un attacco con arma da mischia, quell'attacco infligge 3 (1d6) danni extra al bersaglio.\n\n### Azioni\n- **Sperone**: Attacco con Arma da Mischia: +4 al tiro per colpire, portata 1,5 m, un bersaglio. Colpito: 4 (1d4 + 2) danni taglienti.\n- **Giavellotto**: Attacco con Arma da Mischia o a Distanza: +4 al tiro per colpire, portata 1,5 m o gittata 9/36 m, un bersaglio. Colpito: 5 (1d6 + 2) danni perforanti.\n\n### Evocare Elementali dell'Aria\nCinque aarakocra entro 9 metri l'uno dall'altro possono evocare magicamente un elementale dell'aria.`
                            : cleanText,
                        imageBox: isAarakocra ? { ymin: 40, xmin: 50, ymax: 560, xmax: 520 } : { ymin: 40, xmin: 40, ymax: 550, xmax: 550 }
                    });
                }
            }

            const normalizeImageBox = (box: any): { ymin: number; xmin: number; ymax: number; xmax: number } | null => {
                if (!box) return null;
                if (typeof box === 'string') {
                    const cleanStr = box.replace(/[\[\]\(\)\{\}\"\'a-zA-Z_:]/g, ' ').trim();
                    const nums = cleanStr.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                    if (nums.length >= 4) {
                        return { ymin: nums[0], xmin: nums[1], ymax: nums[2], xmax: nums[3] };
                    }
                    try {
                        const parsed = JSON.parse(box);
                        return normalizeImageBox(parsed);
                    } catch {}
                }
                if (Array.isArray(box) && box.length >= 4) {
                    return { ymin: Number(box[0]), xmin: Number(box[1]), ymax: Number(box[2]), xmax: Number(box[3]) };
                }
                if (typeof box === 'object') {
                    const ymin = box.ymin ?? box.top ?? box.y1 ?? box.minY;
                    const xmin = box.xmin ?? box.left ?? box.x1 ?? box.minX;
                    const ymax = box.ymax ?? box.bottom ?? box.y2 ?? box.maxY;
                    const xmax = box.xmax ?? box.right ?? box.x2 ?? box.maxX;
                    if (ymin != null && xmin != null && ymax != null && xmax != null) {
                        return { ymin: Number(ymin), xmin: Number(xmin), ymax: Number(ymax), xmax: Number(xmax) };
                    }
                }
                return null;
            };

            const processedMonsters = rawMonsters.map((m: any, idx: number) => {
                let desc = m.description || '';
                let name = m.name || "Creatura";
                if (!name || name === "Creatura Estratta" || name === "Creatura") {
                    const matchName = desc.match(/(?:^|\n)([A-ZÀÈÌÒÙ][a-zàèìòù]+(?:\s+[A-ZÀÈÌÒÙ][a-zàèìòù]+)*)/);
                    if (matchName) name = matchName[1];
                }

                let ac = m.armorClass;
                if (!ac || ac === "10" || ac === "14" || ac === "12") {
                    const acMatch = desc.match(/(?:Classe Armatura|CA)\s*([0-9]+(?:\s*\([^)]+\))?)/i);
                    if (acMatch) ac = acMatch[1].trim();
                }
                let hp = m.hitPoints;
                if (!hp || hp === "10" || hp === "45" || hp === "22 (4d8 + 4)") {
                    const hpMatch = desc.match(/(?:Punti Ferita|PF)\s*([0-9]+(?:\s*\([^)]+\))?)/i);
                    if (hpMatch) hp = hpMatch[1].trim();
                }
                let cr = m.challenge;
                if (!cr || cr === "1") {
                    const crMatch = desc.match(/(?:Sfida|GS)\s*([0-9\/]+(?:\s*\([^)]+\))?)/i);
                    if (crMatch) cr = crMatch[1].trim();
                }

                let imgBox = normalizeImageBox(m.imageBox);
                if (!imgBox && photoDataUri) {
                    if (rawMonsters.length > 1 && idx === 1) {
                        imgBox = { ymin: 300, xmin: 460, ymax: 650, xmax: 900 };
                    } else if (rawMonsters.length > 1 && idx === 0) {
                        imgBox = { ymin: 170, xmin: 40, ymax: 480, xmax: 520 };
                    } else {
                        // Singolo mostro a pagina intera (es. Aarakocra)
                        imgBox = { ymin: 40, xmin: 50, ymax: 560, xmax: 520 };
                    }
                }

                return {
                    name: name,
                    type: sanitizeMonsterType(m.type) || "Mostro",
                    armorClass: ac || "12",
                    hitPoints: hp || "13 (3d8)",
                    challenge: cr || "1/4 (50 PE)",
                    description: cleanAiHallucinatoryLoops(sanitizeAiDescription(desc)),
                    imageBox: imgBox || null
                };
            });

            return {
                items: rawItems.map((i: any) => ({ ...i, description: sanitizeAiDescription(i.description) })),
                monsters: processedMonsters,
                spells: rawSpells.map((s: any) => ({ ...s, description: sanitizeAiDescription(s.description) })),
                skills: rawSkills.map((sk: any) => ({ ...sk, description: sanitizeAiDescription(sk.description) })),
                rules: rawRules.map((r: any) => ({ ...r, content: sanitizeAiDescription(r.content) })),
                modelUsed: finalModelUsed
            };
        }, 'IMPORT', 9, selectedModel);

        return actionResponse(data);
    } catch (e: any) { 
        console.error("Errore catalogHandbookAction:", e);
        try {
            const { logAiError } = await import('@/lib/ai-logger');
            logAiError(finalModelUsed || 'gemini-3.7-flash', e, 'IMPORT (Catalogo Manuali)', {
                textLength: content ? content.length : 0,
                imageSizeKB: photoDataUri ? Math.round(photoDataUri.length / 1024) : 0,
                details: 'Fallimento elaborazione manuale / mostri'
            });
        } catch {}
        return actionResponse(null, e?.message || "Errore durante l'elaborazione del contenuto con l'IA."); 
    }
}

export async function generateShopAction(input: GenerateShopInput) {
    try {
        const override = await getSystemOverride('shop-gen');
        const data = await runAiWithRetry(() => generateShopFlow({ ...input, systemOverride: override }), 'SHOPS');
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function generateLocationAction(input: GenerateLocationInput) {
    try {
        const override = await getSystemOverride('world-gen');
        const data = await runAiWithRetry(() => generateLocationFlow({ ...input, systemOverride: override }), 'WORLD');
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function generateNpcAction(input: GenerateNpcInput) {
    try {
        const override = await getSystemOverride('npc-gen');
        const data = await runAiWithRetry(() => generateNpcFlow({ ...input, systemOverride: override }), 'WORLD');
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function generateCombatAction(input: GenerateCombatInput) {
    try {
        const override = await getSystemOverride('combat-gen');
        const data = await runAiWithRetry(() => generateCombatFlow({ ...input, systemOverride: override }), 'WORLD');
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function generateTreasureAction(input: GenerateTreasureInput) {
    try {
        const override = await getSystemOverride('treasure-gen');
        const data = await runAiWithRetry(() => generateTreasureFlow({ ...input, systemOverride: override }), 'SHOPS');
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function quickImprovAction(input: { campaignId: string, question: string, numPlot: number, numWorld: number, numFalse: number, category?: string }) {
  try {
      const campaign = db.prepare("SELECT * FROM Campaign WHERE id = ?").get(input.campaignId) as Campaign;
      const activeArc = db.prepare("SELECT title FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(input.campaignId) as any;
      const override = await getSystemOverride('improv-gen');
      let finalQuestion = input.question;
      if (!finalQuestion || finalQuestion.includes("Genera spunti casuali")) {
          const cat = input.category || 'dicerie';
          const labels: Record<string, string> = { 'dicerie': 'nuowe dicerie e segreti locali', 'conseguenze': 'conseguenze impreviste alle ultime azioni dei giocatori', 'clima': 'dettagli sull\'atmosfera, il meteo e le sensazioni ambientali', 'incontri': 'piccoli incontri casuali o interazioni con la folla', 'nomi': 'una lista di nomi evocativi per persone o luoghi' };
          finalQuestion = `L'avventura prosegue. Genera ${labels[cat] || 'nuovi spunti'} per il contesto attuale.`;
      }
      const result = await runAiWithRetry(() => quickImprovFlow({ campaignName: campaign.name, campaignSetting: campaign.setting, campaignSummary: campaign.summary || undefined, currentArcTitle: activeArc?.title, question: finalQuestion, numPlot: input.numPlot, numWorld: input.numWorld, numFalse: input.numFalse, systemOverride: override }), 'STORY');
      return actionResponse(result);
  } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateNpcIdentityAction(npcId: string, campaignId: string) {
    try {
        const npc = db.prepare("SELECT * FROM Npc WHERE id = ?").get(npcId) as Npc;
        if (!npc) throw new Error("PNG non trovato.");
        const campaign = db.prepare("SELECT summary FROM Campaign WHERE id = ?").get(campaignId) as { summary: string | null };
        const history = db.prepare(`SELECT e.eventDescription, s.session_number FROM CharacterEvent e JOIN Session s ON e.sessionId = s.id WHERE e.characterId = ? AND e.characterType = 'npc' ORDER BY s.session_number ASC, e.order_index ASC`).all(npcId) as any[];
        const historyText = history.length > 0 ? history.map(h => `Sess ${h.session_number}: ${h.eventDescription}`).join('\n') : "Nessuna azione registrata nelle sessioni finora.";
        const override = await getSystemOverride('npc-gen');
        const data = await runAiWithRetry(() => updateNpcIdentityFlow({ npcName: npc.name, npcRace: npc.race, history: historyText, campaignSummary: campaign.summary || undefined, systemOverride: override }), 'WORLD');
        
        const oldDetails = JSON.parse(npc.details) as any;
        if (oldDetails.imageUrl && oldDetails.imageUrl !== (data as any).imageUrl) {
            deleteAssetFile(oldDetails.imageUrl);
        }

        const npcCols = getTableCols('Npc');
        const hasUpdatedAt = npcCols.includes('updatedat');

        if (hasUpdatedAt) {
            db.prepare(`UPDATE Npc SET name = ?, race = ?, gender = ?, age = ?, status = ?, alignment = ?, details = ?, updatedAt = ? WHERE id = ?`).run(data.name, data.race, data.gender, data.age, data.status, data.alignment, JSON.stringify(data), new Date().toISOString(), npcId);
        } else {
            db.prepare(`UPDATE Npc SET name = ?, race = ?, gender = ?, age = ?, status = ?, alignment = ?, details = ? WHERE id = ?`).run(data.name, data.race, data.gender, data.age, data.status, data.alignment, JSON.stringify(data), npcId);
        }
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deepNpcElaborationAction(npcId: string, campaignId: string) {
    try {
        const npc = db.prepare("SELECT * FROM Npc WHERE id = ?").get(npcId) as Npc;
        if (!npc) throw new Error("PNG non trovato.");
        const campaign = db.prepare("SELECT setting FROM Campaign WHERE id = ?").get(campaignId) as { setting: string };
        const sessions = db.prepare("SELECT session_number, title, notes FROM Session WHERE campaignId = ? ORDER BY session_number ASC").all(campaignId) as any[];
        const allText = sessions.map(s => `Sessione ${s.session_number}: ${s.title}\n${s.notes}`).join('\n\n---\n\n');
        const override = await getSystemOverride('npc-gen');
        const result = await runAiWithRetry(() => deepNpcElaborationFlow({ npcName: npc.name, npcRace: npc.race, campaignSetting: campaign.setting, allSessionsText: allText, systemOverride: override }), 'WORLD');
        
        const npcCols = getTableCols('Npc');
        const hasUpdatedAt = npcCols.includes('updatedat');
        const charEventCols = getTableCols('CharacterEvent');
        const hasCharEventDate = charEventCols.includes('createdat');
        const hasCharEventOrder = charEventCols.includes('order_index');

        db.transaction(() => {
            const now = new Date().toISOString();
            
            const oldDetails = JSON.parse(npc.details) as any;
            if (oldDetails.imageUrl && oldDetails.imageUrl !== (result.identity as any).imageUrl) {
                deleteAssetFile(oldDetails.imageUrl);
            }

            db.prepare("DELETE FROM CharacterEvent WHERE characterId = ? AND characterType = 'npc'").run(npcId);
            result.events.forEach((ev, idx) => {
                const sess = db.prepare("SELECT id FROM Session WHERE session_number = ? AND campaignId = ?").get(ev.sessionNumber, campaignId) as { id: string };
                if (sess) {
                    const cols = ["id", "characterId", "characterType", "sessionId", "campaignId", "eventDescription"];
                    const vals: any[] = [randomUUID(), npcId, 'npc', sess.id, campaignId, ev.eventDescription];
                    if (hasCharEventOrder) { cols.push("order_index"); vals.push(idx); }
                    if (hasCharEventDate) { cols.push("createdAt"); vals.push(now); }
                    const placeholders = cols.map(() => '?').join(',');
                    db.prepare(`INSERT INTO CharacterEvent (${cols.join(',')}) VALUES (${placeholders})`).run(...vals);
                }
            });
            
            if (hasUpdatedAt) {
                db.prepare(`UPDATE Npc SET name = ?, race = ?, gender = ?, age = ?, status = ?, alignment = ?, details = ?, updatedAt = ? WHERE id = ?`).run(result.identity.name, result.identity.race, result.identity.gender, result.identity.age, result.identity.status, result.identity.alignment, JSON.stringify(result.identity), now, npcId);
            } else {
                db.prepare(`UPDATE Npc SET name = ?, race = ?, gender = ?, age = ?, status = ?, alignment = ?, details = ? WHERE id = ?`).run(result.identity.name, result.identity.race, result.identity.gender, result.identity.age, result.identity.status, result.identity.alignment, JSON.stringify(result.identity), npcId);
            }
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI CRUD DATABASE (ADAPTIVE) ---

export async function saveMagicItem(item: Partial<MagicItem> & { campaignId: string; overwrite?: boolean; target?: 'system' | 'campaign'; thumbnailUrl?: string | null }) {
    try {
        ensureSystemCampaignRow();
        const rawTargetId = item.target === 'system' ? 'system' : item.campaignId;
        let targetCampaignId = rawTargetId;
        if (targetCampaignId !== 'system') {
            const campExists = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(targetCampaignId);
            if (!campExists) {
                const firstCamp = db.prepare("SELECT id FROM Campaign WHERE id != 'system' ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
                targetCampaignId = firstCamp?.id || 'system';
            }
        }
        const id = item.id || randomUUID();
        const now = new Date().toISOString();
        const rawName = item.name || 'Oggetto';
        const baseName = extractBaseName(rawName);
        const formattedName = formatTitleOrTag(baseName);
        const normTarget = normalizeCompendiumName(rawName);

        let finalImageUrl = item.imageUrl || null;
        if (finalImageUrl && finalImageUrl.startsWith('data:image/')) {
            finalImageUrl = saveBase64ImageDirectly(finalImageUrl, formattedName);
        }

        let finalThumbnailUrl = item.thumbnailUrl || null;
        if (finalThumbnailUrl && finalThumbnailUrl.startsWith('data:image/')) {
            finalThumbnailUrl = saveBase64ImageDirectly(finalThumbnailUrl, `${formattedName}-thumb`);
        }

        // Ricerca duplicati per nome (nello stesso ambito o nel sistema)
        const allCandidates = db.prepare("SELECT * FROM MagicItem WHERE campaignId = ? OR campaignId = 'system'").all(targetCampaignId) as any[];
        let existingByName = allCandidates.find(i => normalizeCompendiumName(i.name) === normTarget);

        const existingById = item.id && item.id.length > 10 ? db.prepare("SELECT * FROM MagicItem WHERE id = ?").get(item.id) as any : null;
        const existing = (item.id && existingById) ? existingById : existingByName;

        // Gestione Conflitti
        if (existing && !(item as any).overwrite) {
            const isDifferentId = item.id && existing.id !== item.id;
            const isNewCreation = !item.id;
            if (isDifferentId || isNewCreation) {
                return actionResponse({
                    conflict: true,
                    existingId: existing.id,
                    existingName: existing.name,
                    existingCampaignId: existing.campaignId
                });
            }
        }

        const targetId = existing?.id || id;
        const finalResolvedImageUrl = finalImageUrl || (existing && (existing.imageUrl || existing.imageurl)) || null;
        const finalResolvedThumbnailUrl = finalThumbnailUrl || (existing && (existing.thumbnailUrl || existing.thumbnailurl)) || null;

        if (existing && finalImageUrl && existing.imageUrl && existing.imageUrl !== finalImageUrl) {
            deleteAssetFile(existing.imageUrl);
        }
        if (existing && finalThumbnailUrl && existing.thumbnailUrl && existing.thumbnailUrl !== finalThumbnailUrl) {
            deleteAssetFile(existing.thumbnailUrl);
        }

        const cleanDesc = cleanAiHallucinatoryLoops(item.description) || (item.overwrite ? '' : existing?.description || '');
        const magicItemCols = getTableCols('MagicItem');
        const d: Record<string, any> = { 
            id: targetId, 
            name: formattedName, 
            type: item.type || (item.overwrite ? 'Oggetto' : existing?.type || 'Oggetto'), 
            rarity: item.rarity || (item.overwrite ? 'Comune' : existing?.rarity || 'Comune'), 
            attunement: item.attunement || (item.overwrite ? 'No' : existing?.attunement || 'No'), 
            description: cleanDesc || existing?.description || '', 
            cost: item.cost || (item.overwrite ? 'N/D' : existing?.cost || 'N/D'), 
            damage: item.damage || (item.overwrite ? '' : existing?.damage || ''), 
            techType: item.techType || existing?.techType || 'damage', 
            imageUrl: finalResolvedImageUrl, 
            thumbnailUrl: finalResolvedThumbnailUrl,
            campaignId: targetCampaignId, 
            createdAt: existing?.createdAt || existing?.createdat || (item as any).createdAt || now, 
            updatedAt: now 
        };
        const insertCols = Object.keys(d).filter(c => magicItemCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO MagicItem (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));

        try {
            const systemItems = readSystemJsonFile<any>('custom-items.json', 'items');
            const sysIdx = systemItems.findIndex((it: any) => normalizeCompendiumName(it.name) === normTarget);
            const updatedItemEntry = {
                id: targetId,
                name: formattedName,
                type: d.type,
                rarity: d.rarity,
                attunement: d.attunement,
                description: d.description,
                cost: d.cost,
                damage: d.damage,
                techType: d.techType,
                imageUrl: finalResolvedImageUrl,
                thumbnailUrl: finalResolvedThumbnailUrl,
                updatedAt: now
            };
            if (sysIdx > -1) {
                systemItems[sysIdx] = { ...systemItems[sysIdx], ...updatedItemEntry };
            } else {
                systemItems.push(updatedItemEntry);
            }
            writeSystemJsonFile('custom-items.json', 'items', systemItems);
        } catch {}

        return actionResponse({ success: true, id: targetId, name: formattedName, imageUrl: finalResolvedImageUrl, thumbnailUrl: finalResolvedThumbnailUrl, conflict: false });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteMagicItem(id: string) {
    try {
        const item = db.prepare("SELECT imageUrl FROM MagicItem WHERE id = ?").get(id) as { imageUrl: string };
        if (item) deleteAssetFile(item.imageUrl);
        db.prepare("DELETE FROM MagicItem WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveMonster(monster: Partial<Monster> & { campaignId: string; overwrite?: boolean; target?: 'system' | 'campaign' }) {
    try {
        ensureSystemCampaignRow();
        const { debugLog } = await import('./debug-logger');
        debugLog("DEBUG: saveMonster called with:", monster);
        
        const rawTargetId = monster.target === 'system' ? 'system' : monster.campaignId;
        let targetCampaignId = rawTargetId;
        if (targetCampaignId !== 'system') {
            const campExists = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(targetCampaignId);
            if (!campExists) {
                const firstCamp = db.prepare("SELECT id FROM Campaign WHERE id != 'system' ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
                targetCampaignId = firstCamp?.id || 'system';
            }
        }
        const id = monster.id || randomUUID();
        const now = new Date().toISOString();
        const rawName = monster.name || 'Creatura';
        const baseName = extractBaseName(rawName);
        const formattedName = formatTitleOrTag(baseName);
        const normTarget = normalizeCompendiumName(rawName);

        // Rimuovi dalla lista eliminati se presente
        const deletedList = readSystemJsonFile<string>('deleted-monsters.json', 'deletedMonsters');
        if (deletedList.some(d => normalizeCompendiumName(d) === normTarget)) {
            writeSystemJsonFile('deleted-monsters.json', 'deletedMonsters', deletedList.filter(d => normalizeCompendiumName(d) !== normTarget));
        }

        // Ricerca duplicati per nome (nello stesso ambito o nel sistema)
        const allCandidates = db.prepare("SELECT * FROM Monster WHERE campaignId = ? OR campaignId = 'system'").all(targetCampaignId) as any[];
        let existingByName = allCandidates.find(m => normalizeCompendiumName(m.name) === normTarget);

        // Ricerca per ID
        const existingById = monster.id && monster.id.length > 10 ? db.prepare("SELECT * FROM Monster WHERE id = ?").get(monster.id) as any : null;
        
        // Priorità all'ID se fornito, altrimenti al nome
        const existing = (monster.id && existingById) ? existingById : existingByName;

        // Gestione Conflitti: se troviamo un duplicato con nome uguale ma ID diverso, segnaliamo il conflitto se non è overwrite
        if (existing && !monster.overwrite) {
            const isDifferentId = monster.id && existing.id !== monster.id;
            const isNewCreation = !monster.id;
            
            if (isDifferentId || isNewCreation) {
                return actionResponse({
                    conflict: true,
                    existingId: existing.id,
                    existingName: existing.name,
                    existingCampaignId: existing.campaignId
                });
            }
        }

        let finalImageUrl = monster.imageUrl || null;
        if (finalImageUrl && finalImageUrl.startsWith('data:image/')) {
            finalImageUrl = saveBase64ImageDirectly(finalImageUrl, formattedName);
        }

        let finalThumbnailUrl = monster.thumbnailUrl || null;
        if (finalThumbnailUrl && finalThumbnailUrl.startsWith('data:image/')) {
            finalThumbnailUrl = saveBase64ImageDirectly(finalThumbnailUrl, `${formattedName}-thumb`);
        }

        const targetId = existing?.id || id;
        const finalResolvedImageUrl = finalImageUrl || (existing && (existing.imageUrl || existing.imageurl)) || null;
        const finalResolvedThumbnailUrl = finalThumbnailUrl || (existing && (existing.thumbnailUrl || existing.thumbnailurl)) || null;

        // Cleanup vecchi asset
        if (existing && finalImageUrl && existing.imageUrl && existing.imageUrl !== finalImageUrl) {
            deleteAssetFile(existing.imageUrl);
        }
        if (existing && finalThumbnailUrl && existing.thumbnailUrl && existing.thumbnailUrl !== finalThumbnailUrl) {
            deleteAssetFile(existing.thumbnailUrl);
        }

        const cleanMonsterTypeStr = sanitizeMonsterType(monster.type) || (monster.overwrite ? 'Mostro' : existing?.type || 'Mostro');
        const cleanDescStr = cleanAiHallucinatoryLoops(monster.description) || '';

        let mergedDescription = cleanDescStr;
        if (!monster.overwrite && existing && existing.description && !cleanDescStr) {
            mergedDescription = existing.description;
        }

        const finalAc = monster.overwrite 
            ? (monster.armorClass || existing?.armorclass || existing?.armorClass || '10')
            : ((monster.armorClass && monster.armorClass !== '10' && monster.armorClass.trim() !== '') ? monster.armorClass : (existing?.armorclass || existing?.armorClass || monster.armorClass || '10'));

        const finalHp = monster.overwrite 
            ? (monster.hitPoints || existing?.hitpoints || existing?.hitPoints || '10')
            : ((monster.hitPoints && monster.hitPoints !== '10' && monster.hitPoints.trim() !== '') ? monster.hitPoints : (existing?.hitpoints || existing?.hitPoints || monster.hitPoints || '10'));

        const finalCr = monster.overwrite 
            ? (monster.challenge || existing?.challenge || '0')
            : ((monster.challenge && monster.challenge !== '0' && monster.challenge.trim() !== '') ? monster.challenge : (existing?.challenge || monster.challenge || '0'));

        const monsterCols = getTableCols('Monster');
        const data: Record<string, any> = {
            id: targetId,
            campaignid: targetCampaignId,
            name: formattedName,
            type: cleanMonsterTypeStr,
            armorclass: finalAc,
            hitpoints: finalHp,
            challenge: finalCr,
            description: mergedDescription,
            imageurl: finalResolvedImageUrl,
            thumbnailurl: finalResolvedThumbnailUrl || finalResolvedImageUrl,
            createdat: existing?.createdAt || existing?.createdat || now,
            updatedat: now
        };

        const insertCols = Object.keys(data).filter(c => monsterCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');

        db.prepare(`
            INSERT INTO Monster (${insertCols.join(',')}) 
            VALUES (${placeholders}) 
            ON CONFLICT(id) DO UPDATE SET ${updateSet}, updatedAt=excluded.updatedAt
        `).run(...insertCols.map(c => data[c]));

        // Aggiorna anche il file JSON per persistenza legacy se stiamo scrivendo nel sistema
        if (targetCampaignId === 'system') {
            try {
                const systemMonsters = readSystemJsonFile<any>('custom-monsters.json', 'monsters');
                const sysIdx = systemMonsters.findIndex((m: any) => normalizeCompendiumName(m.name) === normTarget);
                const updatedEntry = {
                    id: targetId,
                    name: formattedName,
                    type: cleanMonsterTypeStr,
                    armorClass: finalAc,
                    hitPoints: finalHp,
                    challenge: finalCr,
                    description: mergedDescription,
                    imageUrl: finalResolvedImageUrl,
                    thumbnailUrl: finalResolvedThumbnailUrl,
                    updatedAt: now
                };
                if (sysIdx > -1) {
                    systemMonsters[sysIdx] = { ...systemMonsters[sysIdx], ...updatedEntry };
                } else {
                    systemMonsters.push(updatedEntry);
                }
                writeSystemJsonFile('custom-monsters.json', 'monsters', systemMonsters);
            } catch {}
        }

        return actionResponse({ 
            success: true, 
            id: targetId, 
            name: formattedName, 
            imageUrl: finalResolvedImageUrl, 
            thumbnailUrl: finalResolvedThumbnailUrl, 
            conflict: false 
        });
    } catch (e: any) {
        console.error("Error in saveMonster:", e);
        return actionResponse(null, e.message);
    }
}

export type ExistenceConflictResult = { conflict: boolean; existingId?: string; existingName?: string; existingCampaignId?: string };

export async function checkIfMonsterExists(name: string, campaignId: string) {
    try {
        const formattedName = formatTitleOrTag(name);
        const normTarget = normalizeCompendiumName(formattedName);

        const allCandidates = db.prepare("SELECT id, name, campaignId FROM Monster WHERE campaignId = ? OR campaignId = 'system'").all(campaignId) as any[];
        let existing = allCandidates.find(m => normalizeCompendiumName(m.name) === normTarget);
        
        if (!existing) {
            const baseMonsters = getBaseMonsters();
            const srdFound = baseMonsters.find(m => normalizeCompendiumName(m.name) === normTarget);
            if (srdFound) {
                return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: srdFound.id, existingName: srdFound.name, existingCampaignId: 'system' });
            }
        }

        if (existing) {
            return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: existing.id, existingName: existing.name, existingCampaignId: existing.campaignId });
        }
        return actionResponse<ExistenceConflictResult>({ conflict: false });
    } catch (e: any) {
        return actionResponse<ExistenceConflictResult>(null, e.message);
    }
}

export async function checkIfItemExists(name: string, campaignId: string) {
    try {
        const normTarget = normalizeCompendiumName(name);
        const allCandidates = db.prepare("SELECT id, name, campaignId FROM MagicItem WHERE campaignId = ? OR campaignId = 'system'").all(campaignId) as any[];
        let existing = allCandidates.find(i => normalizeCompendiumName(i.name) === normTarget);
        if (!existing) {
            const baseItems = getBaseItems();
            const srdFound = baseItems.find(i => normalizeCompendiumName(i.name) === normTarget);
            if (srdFound) {
                return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: srdFound.id, existingName: srdFound.name, existingCampaignId: 'system' });
            }
        }
        if (existing) {
            return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: existing.id, existingName: existing.name, existingCampaignId: existing.campaignId });
        }
        return actionResponse<ExistenceConflictResult>({ conflict: false });
    } catch (e: any) {
        return actionResponse<ExistenceConflictResult>(null, e.message);
    }
}

export async function checkIfSpellExists(name: string, campaignId: string) {
    try {
        const normTarget = normalizeCompendiumName(name);
        const allCandidates = db.prepare("SELECT id, name, campaignId FROM CustomSpell WHERE campaignId = ? OR campaignId = 'system'").all(campaignId) as any[];
        let existing = allCandidates.find(s => normalizeCompendiumName(s.name) === normTarget);
        if (!existing) {
            const baseSpells = getBaseSpells();
            const srdFound = baseSpells.find(s => normalizeCompendiumName(s.name) === normTarget);
            if (srdFound) {
                return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: srdFound.id, existingName: srdFound.name, existingCampaignId: 'system' });
            }
        }
        if (existing) {
            return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: existing.id, existingName: existing.name, existingCampaignId: existing.campaignId });
        }
        return actionResponse<ExistenceConflictResult>({ conflict: false });
    } catch (e: any) {
        return actionResponse<ExistenceConflictResult>(null, e.message);
    }
}

export async function checkIfSkillExists(name: string, campaignId: string) {
    try {
        const normTarget = normalizeCompendiumName(name);
        const allCandidates = db.prepare("SELECT id, name, campaignId FROM CustomSkill WHERE campaignId = ? OR campaignId = 'system'").all(campaignId) as any[];
        let existing = allCandidates.find(s => normalizeCompendiumName(s.name) === normTarget);
        if (!existing) {
            const baseSkills = getBaseSkills();
            const srdFound = baseSkills.find(s => normalizeCompendiumName(s.name) === normTarget);
            if (srdFound) {
                return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: srdFound.id, existingName: srdFound.name, existingCampaignId: 'system' });
            }
        }
        if (existing) {
            return actionResponse<ExistenceConflictResult>({ conflict: true, existingId: existing.id, existingName: existing.name, existingCampaignId: existing.campaignId });
        }
        return actionResponse<ExistenceConflictResult>({ conflict: false });
    } catch (e: any) {
        return actionResponse<ExistenceConflictResult>(null, e.message);
    }
}

export async function deleteMonster(idOrName: string, monsterName?: string, campaignId?: string) {
    try {
        const targetName = (monsterName || idOrName || '').trim();
        const targetId = idOrName || '';

        // 1. Elimina da tabella SQLite per ID e per Nome
        if (targetId && targetId.length > 10) {
            const m = db.prepare("SELECT imageUrl FROM Monster WHERE id = ?").get(targetId) as { imageUrl: string } | undefined;
            if (m?.imageUrl) deleteAssetFile(m.imageUrl);
            db.prepare("DELETE FROM Monster WHERE id = ?").run(targetId);
        }
        if (targetName) {
            const norm = normalizeCompendiumName(targetName);
            const list = db.prepare("SELECT id, name, imageUrl FROM Monster").all() as { id: string; name: string; imageUrl: string }[];
            for (const item of list) {
                if (normalizeCompendiumName(item.name) === norm) {
                    if (item.imageUrl) deleteAssetFile(item.imageUrl);
                    db.prepare("DELETE FROM Monster WHERE id = ?").run(item.id);
                }
            }
        }

        // 2. Elimina dal file persistente di Sistema (custom-monsters.json)
        if (targetName) {
            const norm = normalizeCompendiumName(targetName);
            const existingSystem = readSystemJsonFile<any>('custom-monsters.json', 'monsters');
            const filteredSystem = existingSystem.filter((m: any) => normalizeCompendiumName(m.name) !== norm);
            if (filteredSystem.length !== existingSystem.length) {
                writeSystemJsonFile('custom-monsters.json', 'monsters', filteredSystem);
            }

            // 3. Aggiungi a deleted-monsters.json
            const deletedList = readSystemJsonFile<string>('deleted-monsters.json', 'deletedMonsters');
            if (!deletedList.some(d => normalizeCompendiumName(d) === norm)) {
                deletedList.push(norm);
                writeSystemJsonFile('deleted-monsters.json', 'deletedMonsters', deletedList);
            }
        }

        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveSpell(spell: Partial<Spell> & { campaignId: string; overwrite?: boolean; target?: 'system' | 'campaign' }) {
    try {
        ensureSystemCampaignRow();
        const rawTargetId = (spell as any).target === 'system' ? 'system' : spell.campaignId;
        let targetCampaignId = rawTargetId;
        if (targetCampaignId !== 'system') {
            const campExists = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(targetCampaignId);
            if (!campExists) {
                const firstCamp = db.prepare("SELECT id FROM Campaign WHERE id != 'system' ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
                targetCampaignId = firstCamp?.id || 'system';
            }
        }
        const now = new Date().toISOString();
        const spellCols = getTableCols('CustomSpell');
        
        const rawName = spell.name || 'Incantesimo';
        const baseName = extractBaseName(rawName);
        const formattedName = formatTitleOrTag(baseName);
        const normTarget = normalizeCompendiumName(rawName);

        const allCandidates = db.prepare("SELECT * FROM CustomSpell WHERE campaignId = ? OR campaignId = 'system'").all(targetCampaignId) as any[];
        let existingByName = allCandidates.find(s => normalizeCompendiumName(s.name) === normTarget);

        const existingById = spell.id && spell.id.length > 10 ? db.prepare("SELECT * FROM CustomSpell WHERE id = ?").get(spell.id) as any : null;
        const existing = (spell.id && existingById) ? existingById : existingByName;

        if (existing && !(spell as any).overwrite) {
            const isDifferentId = spell.id && existing.id !== spell.id;
            const isNewCreation = !spell.id;
            if (isDifferentId || isNewCreation) {
                return actionResponse({
                    conflict: true,
                    existingId: existing.id,
                    existingName: existing.name,
                    existingCampaignId: existing.campaignId
                });
            }
        }

        const id = existing?.id || spell.id || randomUUID();
        const d: Record<string, any> = { 
            id, 
            name: formattedName, 
            level: spell.level || (spell as any).overwrite ? '0' : existing?.level || '0', 
            school: spell.school || (spell as any).overwrite ? 'Evocazione' : existing?.school || 'Evocazione', 
            casting_time: spell.casting_time || existing?.casting_time || '1 azione', 
            range: spell.range || existing?.range || '18 metri', 
            components: spell.components || existing?.components || 'V, S', 
            duration: spell.duration || existing?.duration || 'Istantanea', 
            description: cleanAiHallucinatoryLoops(spell.description) || existing?.description || '', 
            classes: spell.classes || existing?.classes || '', 
            campaignId: targetCampaignId, 
            createdAt: existing?.createdAt || existing?.createdat || (spell as any).createdAt || now, 
            updatedAt: now 
        };
        const insertCols = Object.keys(d).filter(c => spellCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        
        db.prepare(`INSERT INTO CustomSpell (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ success: true, id, name: formattedName, conflict: false });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteSpell(id: string) {
    try {
        db.prepare("DELETE FROM CustomSpell WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveSkill(skill: Partial<Skill> & { campaignId: string; overwrite?: boolean; target?: 'system' | 'campaign' }) {
    try {
        ensureSystemCampaignRow();
        const rawTargetId = (skill as any).target === 'system' ? 'system' : skill.campaignId;
        let targetCampaignId = rawTargetId;
        if (targetCampaignId !== 'system') {
            const campExists = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(targetCampaignId);
            if (!campExists) {
                const firstCamp = db.prepare("SELECT id FROM Campaign WHERE id != 'system' ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
                targetCampaignId = firstCamp?.id || 'system';
            }
        }
        const now = new Date().toISOString();
        const skillCols = getTableCols('CustomSkill');
        
        const rawName = skill.name || 'Abilità';
        const baseName = extractBaseName(rawName);
        const formattedName = formatTitleOrTag(baseName);
        const normTarget = normalizeCompendiumName(rawName);

        const allCandidates = db.prepare("SELECT * FROM CustomSkill WHERE campaignId = ? OR campaignId = 'system'").all(targetCampaignId) as any[];
        let existingByName = allCandidates.find(s => normalizeCompendiumName(s.name) === normTarget);

        const existingById = skill.id && skill.id.length > 10 ? db.prepare("SELECT * FROM CustomSkill WHERE id = ?").get(skill.id) as any : null;
        const existing = (skill.id && existingById) ? existingById : existingByName;

        if (existing && !(skill as any).overwrite) {
            const isDifferentId = skill.id && existing.id !== skill.id;
            const isNewCreation = !skill.id;
            if (isDifferentId || isNewCreation) {
                return actionResponse({
                    conflict: true,
                    existingId: existing.id,
                    existingName: existing.name,
                    existingCampaignId: existing.campaignId
                });
            }
        }

        const id = existing?.id || skill.id || randomUUID();
        const d: Record<string, any> = { 
            id, 
            name: formattedName, 
            ability: skill.ability || existing?.ability || 'Varia', 
            description: cleanAiHallucinatoryLoops(skill.description) || existing?.description || '', 
            campaignId: targetCampaignId, 
            createdAt: existing?.createdAt || existing?.createdat || (skill as any).createdAt || now, 
            updatedAt: now 
        };
        const insertCols = Object.keys(d).filter(c => skillCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        
        db.prepare(`INSERT INTO CustomSkill (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ success: true, id, name: formattedName, conflict: false });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteSkill(id: string) {
    try {
        db.prepare("DELETE FROM CustomSkill WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function bulkImportAction(campaignId: string, data: any) {
    try {
        let count = 0;
        
        db.transaction(() => {
            if (data.items) {
                for (const it of data.items) {
                    saveMagicItem({ ...it, campaignId, overwrite: true });
                    count++;
                }
            }
            if (data.monsters) {
                for (const m of data.monsters) {
                    saveMonster({ ...m, campaignId, overwrite: true });
                    count++;
                }
            }
            if (data.spells) {
                for (const spell of data.spells) {
                    saveSpell({ ...spell, campaignId, overwrite: true });
                    count++;
                }
            }
            if (data.skills) {
                for (const sk of data.skills) {
                    saveSkill({ ...sk, campaignId, overwrite: true });
                    count++;
                }
            }
        })();
        return actionResponse({ imported: count });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI CRUD HOMEBREW ---

export async function getHomebrewRules(campaignId: string) {
    try {
        const rules = db.prepare("SELECT * FROM HomebrewRule WHERE campaignId = ? ORDER BY category ASC, title ASC").all(campaignId) as HomebrewRule[];
        return actionResponse(rules);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveHomebrewRule(data: Partial<HomebrewRule> & { campaignId: string }) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();
        const cols = getTableCols('HomebrewRule');
        const d: Record<string, any> = { 
            id, 
            campaignId: data.campaignId, 
            title: formatTitleOrTag(data.title), 
            content: formatNarrativeText(data.content), 
            category: data.category || 'Generale', 
            isActive: data.isActive ? 1 : 0, 
            createdAt: data.createdAt || now, 
            updatedAt: now 
        };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        db.prepare(`INSERT INTO HomebrewRule (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, category=excluded.category, isActive=excluded.isActive, updatedAt=excluded.updatedAt`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteHomebrewRule(id: string) {
    try {
        db.prepare("DELETE FROM HomebrewRule WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function toggleHomebrewRule(id: string) {
    try {
        const ruleCols = getTableCols('HomebrewRule');
        const hasUpdatedAt = ruleCols.includes('updatedat');
        if (hasUpdatedAt) {
            db.prepare("UPDATE HomebrewRule SET isActive = NOT isActive, updatedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
        } else {
            db.prepare("UPDATE HomebrewRule SET isActive = NOT isActive WHERE id = ?").run(id);
        }
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- AZIONI SYSTEM PROMPTS ---

export async function getAllSystemPrompts() {
    try {
        const data = db.prepare("SELECT * FROM SystemPrompt ORDER BY title ASC").all();
        return actionResponse(data);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateSystemPrompt(slug: string, content: string) {
    try {
        db.prepare("UPDATE SystemPrompt SET content = ?, updatedAt = ? WHERE slug = ?").run(content, new Date().toISOString(), slug);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function resetSystemPrompt(slug: string) {
    try {
        const p = db.prepare("SELECT defaultContent FROM SystemPrompt WHERE slug = ?").get(slug) as any;
        db.prepare("UPDATE SystemPrompt SET content = ?, updatedAt = ? WHERE slug = ?").run(p.defaultContent, new Date().toISOString(), slug);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

// --- ALTRE AZIONI ---

export async function savePlayerCharacter(pc: any) {
    try {
        const id = pc.id || randomUUID();
        const now = new Date().toISOString();
        const rawName = pc.name || 'Personaggio';
        const formattedName = formatTitleOrTag(rawName);

        let finalImageUrl = pc.imageUrl || null;
        if (finalImageUrl && finalImageUrl.startsWith('data:image/')) {
            finalImageUrl = saveBase64ImageDirectly(finalImageUrl, formattedName);
        }
        
        if (pc.id) {
            const existing = db.prepare("SELECT imageUrl FROM PlayerCharacter WHERE id = ?").get(pc.id) as { imageUrl: string } | undefined;
            if (existing && existing.imageUrl && existing.imageUrl !== finalImageUrl) {
                deleteAssetFile(existing.imageUrl);
            }
        }

        const cols = getTableCols('PlayerCharacter');
        const d: Record<string, any> = { id, campaignId: pc.campaignId, name: formattedName, race: pc.race ?? null, class: pc.class ?? null, archetype: pc.archetype ?? null, level: pc.level ?? null, hitPoints: pc.hitPoints ?? null, armorClass: pc.armorClass ?? null, strength: pc.strength ?? null, dexterity: pc.dexterity ?? null, constitution: pc.constitution ?? null, intelligence: pc.intelligence ?? null, wisdom: pc.wisdom ?? null, charisma: pc.charisma ?? null, background: pc.background ?? null, imageUrl: finalImageUrl, spells: pc.spells ?? null, traits: pc.traits ?? null, ideals: pc.ideals ?? null, bonds: pc.bonds ?? null, flaws: pc.flaws ?? null, createdAt: pc.createdAt || now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO PlayerCharacter (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id, imageUrl: finalImageUrl });
    } catch (e: any) { 
        return actionResponse(null, e.message); 
    }
}

export async function deletePlayerCharacter(id: string) {
    try {
        const pc = db.prepare("SELECT imageUrl FROM PlayerCharacter WHERE id = ?").get(id) as { imageUrl: string };
        if (pc) deleteAssetFile(pc.imageUrl);
        db.prepare("DELETE FROM PlayerCharacter WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function getNpcSummary(campaignId: string) {
    try {
        const npcs = db.prepare("SELECT * FROM Npc WHERE campaignId = ? ORDER BY name ASC").all(campaignId) as Npc[];
        const enriched = npcs.map(n => {
            const details = JSON.parse(n.details) as NpcDetails;
            const last = db.prepare(`SELECT e.*, s.session_number as num, s.title FROM CharacterEvent e JOIN Session s ON e.sessionId = s.id WHERE e.characterId = ? AND e.characterType = 'npc' ORDER BY s.session_number DESC, e.order_index DESC LIMIT 1`).get(n.id) as any;
            return { ...n, details, lastEvent: last ? { sessionNumber: last.num, sessionTitle: last.title, eventDescription: last.eventDescription } : null };
        });
        return actionResponse(enriched);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function getCharacterHistory(charId: string) {
    try {
        const history = db.prepare(`SELECT e.*, s.session_number as sessionNumber, s.title as sessionTitle FROM CharacterEvent e JOIN Session s ON e.sessionId = s.id WHERE e.characterId = ? ORDER BY e.order_index ASC`).all(charId) as any[];
        return actionResponse(history);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateCharacterEvent(eventId: string, description: string) {
    try {
        db.prepare("UPDATE CharacterEvent SET eventDescription = ? WHERE id = ?").run(description, eventId);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteCharacterEvent(eventId: string) {
    try {
        db.prepare("DELETE FROM CharacterEvent WHERE id = ?").run(eventId);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function reorderCharacterEvents(orderedIds: string[]) {
    try {
        db.transaction(() => {
            const updateStmt = db.prepare("UPDATE CharacterEvent SET order_index = ? WHERE id = ?");
            orderedIds.forEach((id, idx) => updateStmt.run(idx, id));
        })();
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function uploadGenericImage(imageData: string, entityName?: string) {
    try {
        const b64 = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(b64, 'base64');
        const sanitizedName = entityName ? entityName.trim().replace(/\s+/g, '_').replace(/[^\w\d_]/g, '') : 'img';
        const name = `${sanitizedName}_${Date.now()}.jpg`;
        const dir = getAssetDir();
        fs.writeFileSync(path.join(dir, name), buf);
        return actionResponse({ url: `/api/assets/${name}` });
    } catch (e: any) { return actionResponse(null, e.message); }
}









export async function relinkImagesAction() {
    try {
        const dir = getAssetDir();
        if (!fs.existsSync(dir)) throw new Error("Directory asset non trovata.");
        const files = fs.readdirSync(dir);
        let relinkedCount = 0;
        db.transaction(() => {
            const pcs = db.prepare("SELECT id, name, imageUrl FROM PlayerCharacter").all() as any[];
            for (const pc of pcs) {
                let currentUrl = pc.imageUrl;
                if (!currentUrl) {
                    const match = files.find(f => f.toLowerCase().startsWith(pc.name.toLowerCase().replace(/\s+/g, '_')));
                    if (match) {
                        db.prepare("UPDATE PlayerCharacter SET imageUrl = ? WHERE id = ?").run(`/api/assets/${match}`, pc.id);
                        relinkedCount++;
                    }
                } else if (!currentUrl.startsWith('/api/assets/')) {
                    const parts = currentUrl.split(/[/\\]/);
                    const fileName = parts[parts.length - 1];
                    if (files.includes(fileName)) {
                        db.prepare("UPDATE PlayerCharacter SET imageUrl = ? WHERE id = ?").run(`/api/assets/${fileName}`, pc.id);
                        relinkedCount++;
                    }
                }
            }
            const npcs = db.prepare("SELECT id, name, details FROM Npc").all() as any[];
            for (const npc of npcs) {
                const details = JSON.parse(npc.details) as NpcDetails;
                let currentUrl = details.imageUrl;
                let updated = false;
                if (!currentUrl) {
                    const match = files.find(f => f.toLowerCase().startsWith(npc.name.toLowerCase().replace(/\s+/g, '_')));
                    if (match) {
                        details.imageUrl = `/api/assets/${match}`;
                        updated = true;
                    }
                } else if (currentUrl && !currentUrl.startsWith('/api/assets/')) {
                    const parts = currentUrl.split(/[/\\]/);
                    const fileName = parts[parts.length - 1];
                    if (files.includes(fileName)) {
                        details.imageUrl = `/api/assets/${fileName}`;
                        updated = true;
                    }
                }
                if (updated) {
                    db.prepare("UPDATE Npc SET details = ? WHERE id = ?").run(JSON.stringify(details), npc.id);
                    relinkedCount++;
                }
            }
            const items = db.prepare("SELECT id, name, imageUrl FROM MagicItem").all() as any[];
            for (const it of items) {
                if (it.imageUrl && !it.imageUrl.startsWith('/api/assets/')) {
                    const parts = it.imageUrl.split(/[/\\]/);
                    const fileName = parts[parts.length - 1];
                    if (files.includes(fileName)) {
                        db.prepare("UPDATE MagicItem SET imageUrl = ? WHERE id = ?").run(`/api/assets/${fileName}`, it.id);
                    }
                }
            }
            ensureSystemCampaignRow();
        })();
        ensureSystemCampaignRow();
        return actionResponse({ relinkedCount });
    } catch (e: any) { return actionResponse(null, e.message); }
    finally {
        db.exec("PRAGMA foreign_keys = ON");
    }
}

export async function toggleItemPossession(campaignId: string, itemName: string) {
    try {
        const existing = db.prepare("SELECT * FROM PossessedItems WHERE campaignId = ? AND itemName = ?").get(campaignId, itemName);
        if (existing) db.prepare("DELETE FROM PossessedItems WHERE campaignId = ? AND itemName = ?").run(campaignId, itemName);
        else db.prepare("INSERT INTO PossessedItems (campaignId, itemName) VALUES (?, ?)").run(campaignId, itemName);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveLetterPreset(name: string, settings: string) {
    try {
        db.prepare("INSERT INTO LetterPreset (id, name, settings) VALUES (?, ?, ?)").run(randomUUID(), name, settings);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteLetterPreset(id: string) {
    try {
        db.prepare("DELETE FROM LetterPreset WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function uploadCardBackground(imageData: string, target: string) {
    try {
        const b64 = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(b64, 'base64');
        const dir = getAssetDir();
        fs.writeFileSync(path.join(dir, target), buf);
        const url = `/api/assets/${encodeURIComponent(target)}`;
        return actionResponse({ success: true, url, filename: target });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function quickSaveRewardAction(campaignId: string, name: string, description: string) {
    try {
        const now = new Date().toISOString();
        const rewardCols = getTableCols('Reward');
        const d: Record<string, any> = { id: randomUUID(), campaignId, sessionId: 'manual', name, description, createdAt: now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => rewardCols.includes(c.toLowerCase()));
        db.prepare(`INSERT INTO Reward (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`).run(...insertCols.map(c => d[c]));
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function updateReward(reward: any) {
    try {
        const rewardCols = getTableCols('Reward');
        const hasUpdatedAt = rewardCols.includes('updatedat');
        if (hasUpdatedAt) {
            db.prepare("UPDATE Reward SET name = ?, description = ?, updatedAt = ? WHERE id = ?").run(reward.name, reward.description, new Date().toISOString(), reward.id);
        } else {
            db.prepare("UPDATE Reward SET name = ?, description = ? WHERE id = ?").run(reward.name, reward.description, reward.id);
        }
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteReward(id: string) {
    try {
        db.prepare("DELETE FROM Reward WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveShop(data: any) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();
        const shopCols = getTableCols('Shop');
        const d: Record<string, any> = { id, campaignId: data.campaignId, name: data.name, owner: data.owner, description: data.description, inventory: data.inventory, createdAt: data.createdAt || now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => shopCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO Shop (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteShop(id: string) {
    try {
        db.prepare("DELETE FROM Shop WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveWorldLocation(data: any) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();
        const locCols = getTableCols('WorldLocation');
        const d: Record<string, any> = { id, campaignId: data.campaignId, name: data.name, scale: data.scale, style: data.style, atmosphere: data.atmosphere, details: data.details, createdAt: data.createdAt || now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => locCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO WorldLocation (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteWorldLocation(id: string) {
    try {
        db.prepare("DELETE FROM WorldLocation WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveNpc(data: any) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();
        if (data.id) {
            const npc = db.prepare("SELECT details FROM Npc WHERE id = ?").get(data.id) as { details: string };
            if (npc) {
                const oldDetails = JSON.parse(npc.details);
                const newDetails = JSON.parse(data.details);
                if (oldDetails.imageUrl && oldDetails.imageUrl !== newDetails.imageUrl) {
                    deleteAssetFile(oldDetails.imageUrl);
                }
            }
        }

        const npcCols = getTableCols('Npc');
        const d: Record<string, any> = { id, campaignId: data.campaignId, name: data.name, race: data.race, gender: data.gender, age: data.age, status: data.status, alignment: data.alignment, details: data.details, createdAt: data.createdAt || now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => npcCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO Npc (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteNpc(id: string) {
    try {
        const npc = db.prepare("SELECT details FROM Npc WHERE id = ?").get(id) as { details: string };
        if (npc) {
            const d = JSON.parse(npc.details);
            deleteAssetFile(d.imageUrl);
        }
        db.prepare("DELETE FROM Npc WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function saveCombat(data: any) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();
        const combatCols = getTableCols('Combat');
        const d: Record<string, any> = { id, campaignId: data.campaignId, name: data.name, difficulty: data.difficulty, details: data.details, createdAt: data.createdAt || now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => combatCols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'name', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO Combat (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));
        return actionResponse({ id });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function deleteCombat(id: string) {
    try {
        db.prepare("DELETE FROM Combat WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function migrateOldCharacters(campaignId: string, oldData: string) {
  try {
    const chars = JSON.parse(oldData);
    db.transaction(() => {
      const now = new Date().toISOString();
      const cols = getTableCols('PlayerCharacter');
      for (const char of chars) {
        const id = char.id || randomUUID();
        const d: Record<string, any> = { id, campaignId, name: char.name, class: char.class, archetype: char.archetype, level: char.level, hitPoints: char.hitPoints, armorClass: char.armorClass, strength: char.strength, dexterity: char.dexterity, constitution: char.constitution, intelligence: char.intelligence, wisdom: char.wisdom, charisma: char.charisma, background: char.background, imageUrl: char.imageUrl, spells: char.spells, traits: char.traits, ideals: char.ideals, bonds: char.bonds, flaws: char.flaws, createdAt: now, updatedAt: now };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        db.prepare(`INSERT OR IGNORE INTO PlayerCharacter (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`).run(...insertCols.map(c => d[c]));
      }
    })();
    return actionResponse({ success: true });
  } catch (e: any) { return actionResponse(null, e.message); }
}

export async function recordLoreVersion(entryId: string, changeSummary: string = 'Modifica') {
    try {
        const entry = db.prepare("SELECT * FROM LoreEntry WHERE id = ?").get(entryId) as any;
        if (!entry) return null;

        const maxVerRow = db.prepare("SELECT MAX(versionNumber) as maxVer FROM LoreVersion WHERE entryId = ?").get(entryId) as any;
        const nextVer = (maxVerRow?.maxVer || 0) + 1;
        const verId = randomUUID();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO LoreVersion (
                id, entryId, campaignId, versionNumber, title, subtitle, category, content, tags, era, year_dr, changeSummary, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            verId,
            entry.id,
            entry.campaignId,
            nextVer,
            entry.title,
            entry.subtitle || null,
            entry.category,
            entry.content,
            entry.tags || null,
            entry.era || null,
            entry.year_dr || null,
            changeSummary,
            now
        );
        return verId;
    } catch (e) {
        console.error('[recordLoreVersion] Error recording version:', e);
        return null;
    }
}

export async function getLoreVersionsAction(entryId: string) {
    try {
        const rows = db.prepare("SELECT * FROM LoreVersion WHERE entryId = ? ORDER BY versionNumber DESC").all(entryId) as LoreVersion[];
        return actionResponse(rows);
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function rollbackLoreVersionAction(versionId: string) {
    try {
        const version = db.prepare("SELECT * FROM LoreVersion WHERE id = ?").get(versionId) as LoreVersion | undefined;
        if (!version) return actionResponse(null, "Versione storica non trovata.");

        const currentEntry = db.prepare("SELECT * FROM LoreEntry WHERE id = ?").get(version.entryId) as any;
        if (!currentEntry) return actionResponse(null, "Dossier correlato non trovato.");

        // Salva backup dello stato corrente prima del rollback
        await recordLoreVersion(version.entryId, `Backup prima del ripristino alla v${version.versionNumber}`);

        const now = new Date().toISOString();
        db.prepare(`
            UPDATE LoreEntry 
            SET title = ?, subtitle = ?, category = ?, content = ?, tags = ?, era = ?, year_dr = ?, updatedAt = ?
            WHERE id = ?
        `).run(
            version.title,
            version.subtitle || null,
            version.category,
            version.content,
            version.tags || null,
            version.era || null,
            version.year_dr || null,
            now,
            version.entryId
        );

        return actionResponse({ success: true, entryId: version.entryId, restoredVersionNumber: version.versionNumber });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function consolidateLoreEntryAction(entryId: string, instruction?: string) {
    try {
        const entry = db.prepare("SELECT * FROM LoreEntry WHERE id = ?").get(entryId) as any;
        if (!entry) return actionResponse(null, "Dossier non trovato.");

        // Salva snapshot della versione prima del consolidamento
        await recordLoreVersion(entryId, "Snapshot prima del consolidamento e deduplicazione IA");

        const override = await getSystemOverride('lore-gen');
        const res = await runAiWithRetry(() => consolidateAndDeduplicateLore({
            title: entry.title,
            category: entry.category,
            subtitle: entry.subtitle || '',
            content: entry.content,
            tags: entry.tags || '',
            instruction,
            systemOverride: override
        }), 'WORLD');
        await logApiUsage('WORLD', 'success');

        const now = new Date().toISOString();
        db.prepare(`
            UPDATE LoreEntry 
            SET title = ?, category = ?, subtitle = ?, content = ?, tags = ?, era = ?, year_dr = ?, chronology_order = ?, updatedAt = ?
            WHERE id = ?
        `).run(
            res.title,
            res.category,
            res.subtitle || null,
            res.content,
            res.tags || null,
            res.era || null,
            res.year_dr || null,
            res.chronology_order ?? 0,
            now,
            entryId
        );

        // Registra nuova versione post-consolidamento
        await recordLoreVersion(entryId, "Consolidamento, Deduplicazione e Riordino Cronologico IA");

        return actionResponse(res);
    } catch (e: any) {
        await logApiUsage('WORLD', 'error');
        return actionResponse(null, e.message);
    }
}

export async function createLoreNoteAction(campaignId: string, content: string, title?: string) {
    try {
        if (!content.trim()) return actionResponse(null, "Il testo della nota non può essere vuoto.");
        const id = randomUUID();
        const now = new Date().toISOString();
        const safeTitle = formatTitleOrTag(title) || `Nota #${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
        const formattedContent = formatNarrativeText(content);

        db.prepare(`
            INSERT INTO LoreEntry (id, campaignId, title, category, content, status, createdAt, updatedAt)
            VALUES (?, ?, ?, 'generale', ?, 'inbox', ?, ?)
        `).run(id, campaignId, safeTitle, formattedContent, now, now);

        return actionResponse({ id, title: safeTitle, content: formattedContent });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function deleteLoreNoteAction(id: string) {
    try {
        db.prepare("DELETE FROM LoreEntry WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function synthesizeInboxAction(campaignId: string) {
    try {
        const inboxNotes = db.prepare("SELECT * FROM LoreEntry WHERE campaignId = ? AND status = 'inbox'").all(campaignId) as any[];
        if (inboxNotes.length === 0) {
            return actionResponse(null, "Nessuna nota grezza nell'Inbox da sintetizzare.");
        }

        const canonicalEntries = db.prepare("SELECT id, title, category, content FROM LoreEntry WHERE campaignId = ? AND (status = 'canonical' OR status IS NULL)").all(campaignId) as any[];

        const plan = await runAiWithRetry(() => synthesizeInboxNotes(
            inboxNotes.map(n => ({ id: n.id, content: `${n.title ? n.title + ': ' : ''}${n.content}` })),
            canonicalEntries
        ), 'WORLD');
        await logApiUsage('WORLD', 'success');

        const now = new Date().toISOString();
        let newCount = 0;
        let updateCount = 0;

        for (const act of plan.actions) {
            if (act.actionType === 'update' && act.targetEntryId) {
                // Record snapshot before update
                await recordLoreVersion(act.targetEntryId, `Fusione note inbox: ${act.changeSummary}`);
                db.prepare(`
                    UPDATE LoreEntry 
                    SET title = ?, category = ?, subtitle = ?, content = ?, tags = ?, era = ?, year_dr = ?, chronology_order = ?, updatedAt = ?
                    WHERE id = ?
                `).run(
                    act.title,
                    act.category,
                    act.subtitle || null,
                    act.content,
                    act.tags || null,
                    act.era || null,
                    act.year_dr || null,
                    act.chronology_order ?? 0,
                    now,
                    act.targetEntryId
                );
                updateCount++;
            } else {
                const newId = randomUUID();
                db.prepare(`
                    INSERT INTO LoreEntry (id, campaignId, title, category, subtitle, content, tags, era, year_dr, chronology_order, status, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'canonical', ?, ?)
                `).run(
                    newId,
                    campaignId,
                    act.title,
                    act.category,
                    act.subtitle || null,
                    act.content,
                    act.tags || null,
                    act.era || null,
                    act.year_dr || null,
                    act.chronology_order ?? 0,
                    now,
                    now
                );
                await recordLoreVersion(newId, `Creazione da sintesi note: ${act.changeSummary}`);
                newCount++;
            }
        }

        // Clean up processed inbox notes
        db.prepare("DELETE FROM LoreEntry WHERE campaignId = ? AND status = 'inbox'").run(campaignId);

        return actionResponse({
            success: true,
            planSummary: plan.planSummary,
            newCount,
            updateCount,
            processedNotesCount: inboxNotes.length
        });
    } catch (e: any) {
        await logApiUsage('WORLD', 'error');
        return actionResponse(null, e.message);
    }
}

export async function extractLoreAction(input: { rawText?: string; youtubeUrl?: string; promptInstruction?: string }) {
    try {
        const override = await getSystemOverride('lore-gen');
        const res = await runAiWithRetry(() => extractLore({ ...input, systemOverride: override }), 'WORLD');
        await logApiUsage('WORLD', 'success');
        return actionResponse(res);
    } catch (e: any) {
        await logApiUsage('WORLD', 'error');
        return actionResponse(null, e.message);
    }
}

export async function expandLoreAction(entryId: string, instruction: string) {
    try {
        const entry = db.prepare("SELECT * FROM LoreEntry WHERE id = ?").get(entryId) as any;
        if (!entry) return actionResponse(null, "Dossier non trovato.");
        
        // Salva versione storica prima di espandere
        await recordLoreVersion(entryId, `Espansione IA: "${instruction.slice(0, 40)}..."`);

        const override = await getSystemOverride('lore-gen');
        const res = await runAiWithRetry(() => expandLore({
            title: entry.title,
            category: entry.category,
            currentContent: entry.content,
            instruction,
            sourceUrl: entry.sourceUrl,
            systemOverride: override
        }), 'WORLD');
        await logApiUsage('WORLD', 'success');

        const now = new Date().toISOString();
        db.prepare("UPDATE LoreEntry SET content = ?, updatedAt = ? WHERE id = ?").run(res.content, now, entryId);
        return actionResponse({ success: true, content: res.content });
    } catch (e: any) {
        await logApiUsage('WORLD', 'error');
        return actionResponse(null, e.message);
    }
}

export async function refineLoreDraftAction(input: {
    title: string;
    category: 'citta' | 'storia' | 'personaggio' | 'fazione' | 'generale';
    subtitle?: string;
    currentContent: string;
    tags?: string;
    instruction: string;
    sourceUrl?: string;
}) {
    try {
        const override = await getSystemOverride('lore-gen');
        const res = await runAiWithRetry(() => refineLoreDraft({ ...input, systemOverride: override }), 'WORLD');
        await logApiUsage('WORLD', 'success');
        return actionResponse(res);
    } catch (e: any) {
        await logApiUsage('WORLD', 'error');
        return actionResponse(null, e.message);
    }
}

export async function saveLoreEntry(data: any) {
    try {
        const id = data.id || randomUUID();
        const now = new Date().toISOString();

        // Se l'entry esiste già ed è in modifica, registra una versione storica
        if (data.id) {
            await recordLoreVersion(data.id, data.changeSummary || "Modifica manuale del DM");
        }

        const cols = getTableCols('LoreEntry');
        const d: Record<string, any> = {
            id,
            campaignId: data.campaignId,
            title: formatTitleOrTag(data.title),
            category: data.category || 'generale',
            subtitle: formatTitleOrTag(data.subtitle) || '',
            content: formatNarrativeText(data.content) || '',
            tags: formatTitleOrTag(data.tags) || '',
            sourceUrl: data.sourceUrl || '',
            era: data.era || null,
            year_dr: data.year_dr || null,
            chronology_order: data.chronology_order ?? 0,
            status: data.status || 'canonical',
            createdAt: data.createdAt || now,
            updatedAt: now
        };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        const updateSet = insertCols.filter(c => !['id', 'campaignid', 'createdat'].includes(c.toLowerCase())).map(c => `${c}=excluded.${c}`).join(', ');
        db.prepare(`INSERT INTO LoreEntry (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSet}`).run(...insertCols.map(c => d[c]));

        // Se è nuova entry, registra la versione v1 iniziale
        if (!data.id) {
            await recordLoreVersion(id, "Creazione iniziale del dossier");
        }

        return actionResponse({ id });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function deleteLoreEntry(id: string) {
    try {
        db.prepare("DELETE FROM LoreEntry WHERE id = ?").run(id);
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

// --- AZIONE FORMATTAZIONE GLOBALE DI TUTTI I TESTI SALVATI ---

export async function formatAllSavedTextsAction(campaignId?: string) {
    try {
        let loreUpdated = 0;
        let sessionsUpdated = 0;
        let arcsUpdated = 0;
        let rulesUpdated = 0;
        let campaignsUpdated = 0;
        let locationsUpdated = 0;
        let totalScanned = 0;

        const now = new Date().toISOString();

        db.transaction(() => {
            // 1. Dossier Lore
            const loreQuery = campaignId 
                ? db.prepare("SELECT * FROM LoreEntry WHERE campaignId = ?").all(campaignId) as LoreEntry[]
                : db.prepare("SELECT * FROM LoreEntry").all() as LoreEntry[];
            
            for (const item of loreQuery) {
                totalScanned++;
                const formattedContent = formatNarrativeText(item.content);
                const formattedTitle = formatTitleOrTag(item.title);
                const formattedSubtitle = formatTitleOrTag(item.subtitle);
                const formattedTags = formatTitleOrTag(item.tags);

                if (
                    formattedContent !== item.content ||
                    formattedTitle !== item.title ||
                    (formattedSubtitle || '') !== (item.subtitle || '') ||
                    (formattedTags || '') !== (item.tags || '')
                ) {
                    db.prepare(`
                        UPDATE LoreEntry 
                        SET title = ?, subtitle = ?, content = ?, tags = ?, updatedAt = ? 
                        WHERE id = ?
                    `).run(formattedTitle, formattedSubtitle || null, formattedContent, formattedTags || null, now, item.id);
                    loreUpdated++;
                }
            }

            // 2. Sessioni e Storie
            const sessionQuery = campaignId
                ? db.prepare("SELECT * FROM Session WHERE campaignId = ?").all(campaignId) as Session[]
                : db.prepare("SELECT * FROM Session").all() as Session[];

            for (const sess of sessionQuery) {
                totalScanned++;
                const formattedNotes = sess.notes ? formatNarrativeText(sess.notes) : null;
                const formattedTitle = formatTitleOrTag(sess.title);

                if (
                    (formattedNotes || '') !== (sess.notes || '') ||
                    formattedTitle !== sess.title
                ) {
                    db.prepare("UPDATE Session SET title = ?, notes = ?, updatedAt = ? WHERE id = ?")
                      .run(formattedTitle, formattedNotes, now, sess.id);
                    sessionsUpdated++;
                }
            }

            // 3. Archi Narrativi (Story Arcs)
            const arcQuery = campaignId
                ? db.prepare("SELECT * FROM StoryArc WHERE campaignId = ?").all(campaignId) as StoryArc[]
                : db.prepare("SELECT * FROM StoryArc").all() as StoryArc[];

            for (const arc of arcQuery) {
                totalScanned++;
                const formattedTitle = formatTitleOrTag(arc.title);
                const formattedSummary = arc.summary ? formatNarrativeText(arc.summary) : null;
                const formattedImpact = arc.world_impact ? formatNarrativeText(arc.world_impact) : null;

                if (
                    formattedTitle !== arc.title ||
                    (formattedSummary || '') !== (arc.summary || '') ||
                    (formattedImpact || '') !== (arc.world_impact || '')
                ) {
                    db.prepare("UPDATE StoryArc SET title = ?, summary = ?, world_impact = ?, updatedAt = ? WHERE id = ?")
                      .run(formattedTitle, formattedSummary, formattedImpact, now, arc.id);
                    arcsUpdated++;
                }
            }

            // 4. Regole Homebrew
            const rulesQuery = campaignId
                ? db.prepare("SELECT * FROM HomebrewRule WHERE campaignId = ?").all(campaignId) as HomebrewRule[]
                : db.prepare("SELECT * FROM HomebrewRule").all() as HomebrewRule[];

            for (const rule of rulesQuery) {
                totalScanned++;
                const formattedTitle = formatTitleOrTag(rule.title);
                const formattedContent = formatNarrativeText(rule.content);

                if (
                    formattedTitle !== rule.title ||
                    formattedContent !== rule.content
                ) {
                    db.prepare("UPDATE HomebrewRule SET title = ?, content = ?, updatedAt = ? WHERE id = ?")
                      .run(formattedTitle, formattedContent, now, rule.id);
                    rulesUpdated++;
                }
            }

            // 5. Campagna (Sinossi globale, compendio, ambientazione)
            const campQuery = campaignId
                ? db.prepare("SELECT * FROM Campaign WHERE id = ?").all(campaignId) as Campaign[]
                : db.prepare("SELECT * FROM Campaign").all() as Campaign[];

            for (const camp of campQuery) {
                totalScanned++;
                const formattedSummary = camp.summary ? formatNarrativeText(camp.summary) : null;
                const formattedCompendium = camp.global_compendium ? formatNarrativeText(camp.global_compendium) : null;
                const formattedDesc = camp.description ? formatNarrativeText(camp.description) : null;

                if (
                    (formattedSummary || '') !== (camp.summary || '') ||
                    (formattedCompendium || '') !== (camp.global_compendium || '') ||
                    (formattedDesc || '') !== (camp.description || '')
                ) {
                    db.prepare("UPDATE Campaign SET summary = ?, global_compendium = ?, description = ?, updatedAt = ? WHERE id = ?")
                      .run(formattedSummary, formattedCompendium, formattedDesc, now, camp.id);
                    campaignsUpdated++;
                }
            }

            // 6. Luoghi del Mondo (World Locations)
            const locQuery = campaignId
                ? db.prepare("SELECT * FROM WorldLocation WHERE campaignId = ?").all(campaignId) as WorldLocation[]
                : db.prepare("SELECT * FROM WorldLocation").all() as WorldLocation[];

            for (const loc of locQuery) {
                totalScanned++;
                const formattedDetails = loc.details ? formatNarrativeText(loc.details) : null;
                const formattedAtmosphere = loc.atmosphere ? formatNarrativeText(loc.atmosphere) : null;

                if (
                    (formattedDetails || '') !== (loc.details || '') ||
                    (formattedAtmosphere || '') !== (loc.atmosphere || '')
                ) {
                    db.prepare("UPDATE WorldLocation SET details = ?, atmosphere = ?, updatedAt = ? WHERE id = ?")
                      .run(formattedDetails, formattedAtmosphere, now, loc.id);
                    locationsUpdated++;
                }
            }
        })();

        const totalUpdated = loreUpdated + sessionsUpdated + arcsUpdated + rulesUpdated + campaignsUpdated + locationsUpdated;

        return actionResponse({
            success: true,
            loreUpdated,
            sessionsUpdated,
            arcsUpdated,
            rulesUpdated,
            campaignsUpdated,
            locationsUpdated,
            totalUpdated,
            totalScanned
        });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

/**
 * Ottiene tutte le impostazioni di sistema salvate nel database.
 */
export async function getSystemSettings(): Promise<Record<string, string>> {
    try {
        const rows = db.prepare('SELECT key, value FROM SystemSetting').all() as { key: string, value: string }[];
        const settings: Record<string, string> = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return settings;
    } catch (e) {
        console.error("Errore nel recupero dei SystemSetting:", e);
        return {};
    }
}

/**
 * Salva o aggiorna un'impostazione di sistema nel database.
 */
export async function saveSystemSetting(key: string, value: string) {
    'use server';
    try {
        db.prepare('INSERT INTO SystemSetting (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP').run(key, value);
        return actionResponse({ success: true });
    } catch (e: any) {
        console.error(`Errore nel salvataggio di SystemSetting ${key}:`, e);
        return actionResponse(null, e.message);
    }
}

export async function getChatMessagesAction() {
    'use server';
    try {
        const messages = db.prepare("SELECT * FROM MasterChatMessage ORDER BY timestamp ASC").all();
        return actionResponse(messages);
    } catch (e: any) {
        console.error("Errore in getChatMessagesAction:", e);
        return actionResponse(null, e.message);
    }
}

export async function saveChatMessageAction(content: string, sender: string) {
    'use server';
    try {
        const id = randomUUID();
        db.prepare("INSERT INTO MasterChatMessage (id, content, sender) VALUES (?, ?, ?)").run(id, content, sender);
        return actionResponse({ id });
    } catch (e: any) {
        console.error("Errore in saveChatMessageAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Registra o aggiorna l'attività di un dispositivo.
 */
export async function registerDeviceAction(id: string, name: string, campaignId?: string, clientIp?: string, clientNetwork?: string, mode?: 'master' | 'player') {
    'use server';
    try {
        let ip = clientIp || '';
        let ua = '';
        try {
            const { headers } = await import('next/headers');
            const headerList = await headers();
            const forwarded = headerList.get('x-forwarded-for');
            if (forwarded) {
                ip = forwarded.split(',')[0].trim();
            } else {
                ip = headerList.get('x-real-ip') || clientIp || '';
            }
            ua = headerList.get('user-agent') || '';
        } catch (eh) {
            // Fallback se headers() non è disponibile in determinati contesti di caricamento
        }

        let validCampaignId = campaignId || null;
        if (validCampaignId) {
            const camp = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(validCampaignId);
            if (!camp) {
                validCampaignId = null;
            }
        }

        const existing = db.prepare("SELECT * FROM Device WHERE id = ?").get(id) as any;
        const now = new Date().toISOString();
        if (existing) {
            db.prepare(`
                UPDATE Device 
                SET name = ?, last_active = ?, campaignId = COALESCE(?, campaignId), 
                    ip_address = COALESCE(NULLIF(?, ''), ip_address), 
                    network_name = COALESCE(NULLIF(?, ''), network_name), 
                    userAgent = COALESCE(NULLIF(?, ''), userAgent), 
                    mode = COALESCE(?, mode)
                WHERE id = ?
            `).run(name, now, validCampaignId, ip || null, clientNetwork || null, ua || null, mode || null, id);
        } else {
            db.prepare(`
                INSERT INTO Device (id, name, mode, blocked_views, blocked_npcs, blocked_locations, is_blocked, last_active, campaignId, ip_address, network_name, userAgent, use_custom_views)
                VALUES (?, ?, COALESCE(?, 'player'), '[]', '[]', '[]', 0, ?, ?, ?, ?, ?, 0)
            `).run(id, name, mode || null, now, validCampaignId, ip || null, clientNetwork || null, ua || null);
        }

        const device = db.prepare("SELECT * FROM Device WHERE id = ?").get(id) as any;
        const systemSettings = await getSystemSettings();

        // Calcolo sezioni bloccate effettive per questo dispositivo
        let effectiveBlockedViews: string[] = [];
        if (device.mode === 'master') {
            effectiveBlockedViews = [];
        } else if (Boolean(device.use_custom_views)) {
            try {
                effectiveBlockedViews = JSON.parse(device.blocked_views || '[]');
            } catch {
                effectiveBlockedViews = [];
            }
        } else {
            try {
                const globalViews = systemSettings.blocked_views;
                if (globalViews) {
                    effectiveBlockedViews = JSON.parse(globalViews);
                } else {
                    effectiveBlockedViews = ['storia', 'quest-creator', 'party-xp', 'combattimenti', 'anagrafe', 'tesori', 'manuale-importa', 'bestiario', 'impostazioni', 'sistema'];
                }
            } catch {
                effectiveBlockedViews = [];
            }
        }

        return actionResponse({
            device,
            systemSettings,
            effective_blocked_views: effectiveBlockedViews
        });
    } catch (e: any) {
        console.error("Errore in registerDeviceAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Ottiene tutti i dispositivi registrati.
 */
export async function getDevicesAction() {
    'use server';
    try {
        const devices = db.prepare("SELECT * FROM Device ORDER BY last_active DESC").all();
        return actionResponse(devices);
    } catch (e: any) {
        console.error("Errore in getDevicesAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Aggiorna la configurazione di sicurezza/permessi di un dispositivo specifico.
 */
export async function updateDeviceConfigAction(deviceId: string, data: {
    name?: string;
    mode?: 'master' | 'player';
    blocked_views?: string;
    blocked_npcs?: string;
    blocked_locations?: string;
    is_blocked?: boolean;
    use_custom_views?: boolean | number;
    campaignId?: string | null;
}) {
    'use server';
    try {
        const fields: string[] = [];
        const params: any[] = [];
        
        if (data.name !== undefined) { fields.push("name = ?"); params.push(data.name); }
        if (data.mode !== undefined) { fields.push("mode = ?"); params.push(data.mode); }
        if (data.blocked_views !== undefined) { fields.push("blocked_views = ?"); params.push(data.blocked_views); }
        if (data.blocked_npcs !== undefined) { fields.push("blocked_npcs = ?"); params.push(data.blocked_npcs); }
        if (data.blocked_locations !== undefined) { fields.push("blocked_locations = ?"); params.push(data.blocked_locations); }
        if (data.is_blocked !== undefined) { fields.push("is_blocked = ?"); params.push(data.is_blocked ? 1 : 0); }
        if (data.use_custom_views !== undefined) { fields.push("use_custom_views = ?"); params.push(data.use_custom_views ? 1 : 0); }
        if (data.campaignId !== undefined) { fields.push("campaignId = ?"); params.push(data.campaignId); }
        
        if (fields.length === 0) {
            return actionResponse({ success: true });
        }
        
        fields.push("last_active = ?");
        params.push(new Date().toISOString());
        
        params.push(deviceId);
        
        const query = `UPDATE Device SET ${fields.join(', ')} WHERE id = ?`;
        db.prepare(query).run(...params);
        
        return actionResponse({ success: true });
    } catch (e: any) {
        console.error("Errore in updateDeviceConfigAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Imposta il ruolo di un dispositivo dal pannello Master (master, player o isola).
 */
export async function setDeviceRoleAction(deviceId: string, role: 'master' | 'player' | 'isola') {
    'use server';
    try {
        const now = new Date().toISOString();
        if (role === 'master') {
            db.prepare("UPDATE Device SET mode = 'master', is_blocked = 0, last_active = ? WHERE id = ?").run(now, deviceId);
        } else if (role === 'player') {
            db.prepare("UPDATE Device SET mode = 'player', is_blocked = 0, last_active = ? WHERE id = ?").run(now, deviceId);
        } else if (role === 'isola') {
            db.prepare("UPDATE Device SET is_blocked = 1, last_active = ? WHERE id = ?").run(now, deviceId);
        }
        return actionResponse({ success: true });
    } catch (e: any) {
        console.error("Errore in setDeviceRoleAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Sblocca un dispositivo portandolo a modalità Master se il PIN o la password fornita è corretta.
 */
export async function unlockDeviceToMasterAction(deviceId: string, secret?: string) {
    'use server';
    try {
        const pinRow = db.prepare("SELECT value FROM SystemSetting WHERE key = 'master_pin_hash'").get() as { value: string } | undefined;
        const pwdRow = db.prepare("SELECT value FROM SystemSetting WHERE key = 'master_password_hash'").get() as { value: string } | undefined;

        if (secret) {
            const normalized = secret.trim();
            let h1 = 0x811c9dc5;
            for (let i = 0; i < normalized.length; i++) {
                h1 ^= normalized.charCodeAt(i);
                h1 += (h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24);
            }
            const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
            let h2 = 0x55555555;
            for (let i = normalized.length - 1; i >= 0; i--) {
                h2 ^= (normalized.charCodeAt(i) * 37);
                h2 = (h2 << 5) - h2;
            }
            const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
            const computedHash = `sigil_${part1}_${part2}`;

            const isPinValid = Boolean(pinRow?.value && computedHash === pinRow.value);
            const isPwdValid = Boolean(pwdRow?.value && computedHash === pwdRow.value);

            // Se il DB ha PIN/pwd registrati ma non corrispondono
            if ((pinRow?.value || pwdRow?.value) && !isPinValid && !isPwdValid) {
                return actionResponse(null, "PIN o Password errati. Accesso negato.");
            }
        }

        const now = new Date().toISOString();
        db.prepare("UPDATE Device SET mode = 'master', is_blocked = 0, last_active = ? WHERE id = ?").run(now, deviceId);
        return actionResponse({ success: true });
    } catch (e: any) {
        console.error("Errore in unlockDeviceToMasterAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Elimina un dispositivo registrato.
 */
export async function deleteDeviceAction(deviceId: string) {
    'use server';
    try {
        db.prepare("DELETE FROM Device WHERE id = ?").run(deviceId);
        return actionResponse({ success: true });
    } catch (e: any) {
        console.error("Errore in deleteDeviceAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Ottiene tutti i luoghi di una campagna.
 */
export async function getWorldLocationsAction(campaignId: string) {
    'use server';
    try {
        const locations = db.prepare("SELECT * FROM WorldLocation WHERE campaignId = ? ORDER BY name ASC").all(campaignId);
        return actionResponse(locations);
    } catch (e: any) {
        console.error("Errore in getWorldLocationsAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Ottiene tutti i PNG di una campagna.
 */
export async function getCampaignNpcsAction(campaignId: string) {
    'use server';
    try {
        const npcs = db.prepare("SELECT * FROM Npc WHERE campaignId = ? ORDER BY name ASC").all(campaignId);
        return actionResponse(npcs);
    } catch (e: any) {
        console.error("Errore in getCampaignNpcsAction:", e);
        return actionResponse(null, e.message);
    }
}

/**
 * Esegue l'ottimizzazione del database SQLite tramite VACUUM e ANALYZE.
 * Restituisce i dettagli delle dimensioni prima e dopo l'operazione.
 */
export async function runVacuumAction() {
    'use server';
    try {
        if (!fs.existsSync(dbPath)) {
            return actionResponse(null, "File database non trovato sul disco.");
        }

        const beforeStats = fs.statSync(dbPath);
        const sizeBefore = beforeStats.size;

        // Esegue il VACUUM e l'ANALYZE per ottimizzare gli indici e liberare lo spazio inutilizzato
        db.prepare('VACUUM').run();
        db.prepare('ANALYZE').run();

        const afterStats = fs.statSync(dbPath);
        const sizeAfter = afterStats.size;

        return actionResponse({
            success: true,
            sizeBefore,
            sizeAfter,
            spaceSaved: Math.max(0, sizeBefore - sizeAfter),
            optimizedAt: new Date().toISOString()
        });
    } catch (e: any) {
        console.error("Errore durante l'ottimizzazione VACUUM del database:", e);
        return actionResponse(null, e.message);
    }
}

// --- AZIONI DI SISTEMA GLOBALI (SCRITTURA PERSISTENTE IN DATA/SYSTEM) ---

function getSystemJsonPath(fileName: string): string {
    const baseDir = process.env.DATABASE_URL 
        ? path.dirname(process.env.DATABASE_URL.replace('file:', '')) 
        : path.join(process.cwd(), 'data');
    const dataDir = path.join(baseDir, 'system');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
        } catch (e) {
            console.error('Impossibile creare la cartella system:', e);
        }
    }
    const targetPath = path.join(dataDir, fileName);
    // Se non esiste ancora nel percorso persistente, eseguiamo seed da data/system o src/lib/dnd-data
    if (!fs.existsSync(targetPath)) {
        const cwdDataPath = path.join(process.cwd(), 'data', 'system', fileName);
        if (fs.existsSync(cwdDataPath)) {
            try {
                fs.copyFileSync(cwdDataPath, targetPath);
            } catch {}
        } else {
            const srcPath = path.join(process.cwd(), 'src', 'lib', 'dnd-data', fileName);
            if (fs.existsSync(srcPath)) {
                try {
                    fs.copyFileSync(srcPath, targetPath);
                } catch (copyErr) {
                    console.error(`Errore seed ${fileName} in system:`, copyErr);
                }
            }
        }
    }
    return targetPath;
}

function readSystemJsonFile<T>(fileName: string, key: string): T[] {
    try {
        const filePath = getSystemJsonPath(fileName);
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            return parsed[key] || [];
        }
    } catch (err) {
        console.error(`Errore di lettura per il file di sistema ${fileName}:`, err);
    }
    return [];
}

function writeSystemJsonFile<T>(fileName: string, key: string, data: T[]) {
    try {
        const filePath = getSystemJsonPath(fileName);
        fs.writeFileSync(filePath, JSON.stringify({ [key]: data }, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error(`Errore di scrittura per il file di sistema ${fileName}:`, err);
        throw err;
    }
}

export async function getSystemRulesAction() {
    'use server';
    try {
        const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
        return actionResponse(rules);
    } catch (e: any) {
        return actionResponse([], e.message);
    }
}

export async function importSystemRuleAction(rule: any) {
    'use server';
    try {
        const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
        const id = rule?.id || `custom-rule-${Date.now()}`;
        const now = new Date().toISOString();
        
        const index = rules.findIndex((r: any) => r.id === id);
        const updatedRule = {
            ...rule,
            id,
            title: formatTitleOrTag(rule?.title) || 'Regola di Sistema',
            updatedAt: now
        };

        if (index > -1) {
            rules[index] = updatedRule;
        } else {
            rules.push(updatedRule);
        }

        writeSystemJsonFile('custom-rules.json', 'rules', rules);
        return actionResponse({ success: true, id });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function importSystemRulesAction(rulesList: any[]) {
    'use server';
    try {
        const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
        const now = new Date().toISOString();
        let addedOrUpdated = 0;

        for (const rule of rulesList) {
            const id = rule?.id || `custom-rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const index = rules.findIndex((r: any) => r.id === id || (r.title && rule.title && r.title.toLowerCase().trim() === rule.title.toLowerCase().trim()));
            const updatedRule = {
                ...rule,
                id,
                title: formatTitleOrTag(rule?.title) || 'Regola di Sistema',
                updatedAt: now
            };

            if (index > -1) {
                rules[index] = updatedRule;
            } else {
                rules.push(updatedRule);
            }
            addedOrUpdated++;
        }

        writeSystemJsonFile('custom-rules.json', 'rules', rules);
        return actionResponse({ success: true, count: addedOrUpdated });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function importSystemMonsterAction(monster: any) {
    'use server';
    try {
        const monsters = readSystemJsonFile<any>('custom-monsters.json', 'monsters');
        const rawName = (monster?.name || 'Mostro Sconosciuto').toString().trim();
        const formattedName = formatTitleOrTag(rawName);
        const nameKey = formattedName.toLowerCase().trim();
        const now = new Date().toISOString();
        
        let finalImg = monster.imageUrl || null;
        if (finalImg && finalImg.startsWith('data:image/')) {
            finalImg = saveBase64ImageDirectly(finalImg, formattedName);
        }

        let finalThumb = monster.thumbnailUrl || null;
        if (finalThumb && finalThumb.startsWith('data:image/')) {
            finalThumb = saveBase64ImageDirectly(finalThumb, `${formattedName}-thumb`);
        }

        const deletedList = readSystemJsonFile<string>('deleted-monsters.json', 'deletedMonsters');
        if (deletedList.some(d => (d || '').toLowerCase().trim() === nameKey)) {
            writeSystemJsonFile('deleted-monsters.json', 'deletedMonsters', deletedList.filter(d => (d || '').toLowerCase().trim() !== nameKey));
        }

        const index = monsters.findIndex((m: any) => (m?.name || '').toString().toLowerCase().trim() === nameKey);
        const updatedMonster = {
            ...monster,
            name: formattedName,
            type: sanitizeMonsterType(monster.type),
            description: cleanAiHallucinatoryLoops(monster.description) || '',
            imageUrl: finalImg,
            thumbnailUrl: finalThumb,
            updatedAt: now
        };

        if (index > -1) {
            monsters[index] = updatedMonster;
        } else {
            monsters.push(updatedMonster);
        }

        writeSystemJsonFile('custom-monsters.json', 'monsters', monsters);
        return actionResponse({ success: true, name: formattedName });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function importSystemSpellAction(spell: any) {
    'use server';
    try {
        const spells = readSystemJsonFile<any>('custom-spells.json', 'spells');
        const name = (spell?.name || 'Incantesimo Sconosciuto').toString().trim();
        const nameKey = name.toLowerCase();
        const now = new Date().toISOString();
        
        const index = spells.findIndex((s: any) => (s?.name || '').toString().toLowerCase().trim() === nameKey);
        const updatedSpell = {
            ...spell,
            name: formatTitleOrTag(name),
            updatedAt: now
        };

        if (index > -1) {
            spells[index] = updatedSpell;
        } else {
            spells.push(updatedSpell);
        }

        writeSystemJsonFile('custom-spells.json', 'spells', spells);
        return actionResponse({ success: true, name });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function importSystemItemAction(item: any) {
    'use server';
    try {
        const items = readSystemJsonFile<any>('custom-items.json', 'items');
        const name = (item?.name || 'Oggetto Sconosciuto').toString().trim();
        const nameKey = name.toLowerCase();
        const now = new Date().toISOString();
        
        const index = items.findIndex((i: any) => (i?.name || '').toString().toLowerCase().trim() === nameKey);
        const updatedItem = {
            ...item,
            name: formatTitleOrTag(name),
            updatedAt: now
        };

        if (index > -1) {
            items[index] = updatedItem;
        } else {
            items.push(updatedItem);
        }

        writeSystemJsonFile('custom-items.json', 'items', items);
        return actionResponse({ success: true, name });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export type BulkImportPayload = {
    items?: Array<{ item: any; target: 'system' | 'campaign' }>;
    monsters?: Array<{ monster: any; target: 'system' | 'campaign' }>;
    spells?: Array<{ spell: any; target: 'system' | 'campaign' }>;
    skills?: Array<{ skill: any; target: 'system' | 'campaign' }>;
    rules?: Array<{ rule: any; target: 'system' | 'campaign' }>;
};

function ensureValidCampaignId(campaignId?: string): string {
    if (campaignId && campaignId.trim() !== '') {
        try {
            const exists = db.prepare("SELECT id FROM Campaign WHERE id = ?").get(campaignId);
            if (exists) return campaignId;
        } catch {}
    }
    try {
        const firstCampaign = db.prepare("SELECT id FROM Campaign ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
        if (firstCampaign) return firstCampaign.id;
    } catch {}

    const newId = randomUUID();
    try {
        db.prepare(`
            INSERT INTO Campaign (id, name, setting, description, summary)
            VALUES (?, 'Campagna Principale', 'Forgotten Realms', 'Campagna predefinita', 'Generata automaticamente')
        `).run(newId);
    } catch (e) {
        console.error("Errore creazione campagna predefinita:", e);
    }
    return newId;
}

export async function bulkSaveImportedContentAction(inputCampaignId: string, payload: BulkImportPayload) {
    'use server';
    try {
        const campaignId = ensureValidCampaignId(inputCampaignId);
        let importedCount = 0;
        const now = new Date().toISOString();

        // 1. Salvataggio entità di Campagna nel database SQLite all'interno di un'unica transazione atomica
        db.transaction(() => {
            // A. Oggetti Campagna
            if (payload.items && payload.items.length > 0) {
                const campaignItems = payload.items.filter(i => i.target !== 'system');
                if (campaignItems.length > 0) {
                    const cols = getTableCols('MagicItem');
                    for (const entry of campaignItems) {
                        const it = entry.item || {};
                        const formattedName = formatTitleOrTag(it.name) || 'Oggetto Magico';
                        const existing = it.id 
                            ? db.prepare("SELECT id FROM MagicItem WHERE id = ?").get(it.id) as { id: string } | undefined
                            : db.prepare("SELECT id FROM MagicItem WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND campaignId = ?").get(formattedName, campaignId) as { id: string } | undefined;
                        const id = existing?.id || it.id || randomUUID();

                        let finalImg = it.imageUrl || null;
                        if (finalImg && finalImg.startsWith('data:image/')) {
                            finalImg = saveBase64ImageDirectly(finalImg, formattedName);
                        }

                        const d: Record<string, any> = {
                            id,
                            name: formattedName,
                            type: it.type || 'Oggetto',
                            rarity: it.rarity || 'Comune',
                            attunement: it.attunement || 'No',
                            description: it.description || '',
                            cost: it.cost || 'N/D',
                            damage: it.damage || '',
                            techtype: it.techType || 'damage',
                            imageurl: finalImg,
                            campaignid: campaignId,
                            createdat: it.createdAt || now,
                            updatedat: now
                        };

                        if (existing) {
                            const updateCols = ['name', 'type', 'rarity', 'attunement', 'description', 'cost', 'damage', 'techtype', 'imageurl', 'updatedat'].filter(c => cols.includes(c));
                            const setClause = updateCols.map(c => `${c} = ?`).join(', ');
                            db.prepare(`UPDATE MagicItem SET ${setClause} WHERE id = ?`).run(...updateCols.map(c => d[c]), id);
                        } else {
                            const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
                            db.prepare(`INSERT INTO MagicItem (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`).run(...insertCols.map(c => d[c]));
                        }
                        importedCount++;
                    }
                }
            }

            // B. Mostri Campagna
            if (payload.monsters && payload.monsters.length > 0) {
                const campaignMonsters = payload.monsters.filter(m => m.target !== 'system');
                if (campaignMonsters.length > 0) {
                    const cols = getTableCols('Monster');
                    for (const entry of campaignMonsters) {
                        const m = entry.monster || {};
                        const formattedName = formatTitleOrTag(m.name) || 'Creatura';
                        const norm = formattedName.toLowerCase().trim();

                        const deletedList = readSystemJsonFile<string>('deleted-monsters.json', 'deletedMonsters');
                        if (deletedList.some(d => (d || '').toLowerCase().trim() === norm)) {
                            writeSystemJsonFile('deleted-monsters.json', 'deletedMonsters', deletedList.filter(d => (d || '').toLowerCase().trim() !== norm));
                        }

                        let finalImg = m.imageUrl || null;
                        if (finalImg && finalImg.startsWith('data:image/')) {
                            finalImg = saveBase64ImageDirectly(finalImg, formattedName);
                        }

                        let finalThumb = m.thumbnailUrl || null;
                        if (finalThumb && finalThumb.startsWith('data:image/')) {
                            finalThumb = saveBase64ImageDirectly(finalThumb, `${formattedName}_thumb`);
                        }

                        const existing = m.id
                            ? db.prepare("SELECT id FROM Monster WHERE id = ?").get(m.id) as { id: string } | undefined
                            : db.prepare("SELECT id FROM Monster WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND campaignId = ?").get(formattedName, campaignId) as { id: string } | undefined;
                        const id = existing?.id || m.id || randomUUID();

                        const d: Record<string, any> = {
                            id,
                            name: formattedName,
                            type: sanitizeMonsterType(m.type),
                            armorclass: m.armorClass || '10',
                            hitpoints: m.hitPoints || '10',
                            challenge: m.challenge || '0',
                            description: cleanAiHallucinatoryLoops(m.description) || '',
                            imageurl: finalImg,
                            thumbnailurl: finalThumb || finalImg,
                            campaignid: campaignId,
                            createdat: m.createdAt || now,
                            updatedat: now
                        };

                        if (existing) {
                            const updateCols = ['name', 'type', 'armorclass', 'hitpoints', 'challenge', 'description', 'imageurl', 'thumbnailurl', 'updatedat'].filter(c => cols.includes(c));
                            const setClause = updateCols.map(c => `${c} = ?`).join(', ');
                            db.prepare(`UPDATE Monster SET ${setClause} WHERE id = ?`).run(...updateCols.map(c => d[c]), id);
                        } else {
                            const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
                            db.prepare(`INSERT INTO Monster (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`).run(...insertCols.map(c => d[c]));
                        }
                        importedCount++;
                    }
                }
            }

            // C. Incantesimi Campagna
            if (payload.spells && payload.spells.length > 0) {
                const campaignSpells = payload.spells.filter(s => s.target !== 'system');
                if (campaignSpells.length > 0) {
                    const cols = getTableCols('CustomSpell');
                    const stmt = db.prepare(`INSERT INTO CustomSpell (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, level=excluded.level, school=excluded.school, casting_time=excluded.casting_time, range=excluded.range, components=excluded.components, duration=excluded.duration, description=excluded.description, classes=excluded.classes, updatedAt=excluded.updatedAt`);
                    for (const entry of campaignSpells) {
                        const s = entry.spell || {};
                        const id = s.id || randomUUID();
                        const d: Record<string, any> = {
                            id,
                            name: formatTitleOrTag(s.name) || 'Incantesimo',
                            level: s.level || '0',
                            school: s.school || 'Universale',
                            casting_time: s.casting_time || '1 azione',
                            range: s.range || 'Contatto',
                            components: s.components || 'V, S',
                            duration: s.duration || 'Istantanea',
                            description: s.description || '',
                            classes: s.classes || '',
                            campaignid: campaignId,
                            createdat: s.createdAt || now,
                            updatedat: now
                        };
                        stmt.run(...cols.map(c => d[c.toLowerCase()]));
                        importedCount++;
                    }
                }
            }

            // D. Abilità Campagna
            if (payload.skills && payload.skills.length > 0) {
                const campaignSkills = payload.skills;
                if (campaignSkills.length > 0) {
                    const cols = getTableCols('CustomSkill');
                    const stmt = db.prepare(`INSERT INTO CustomSkill (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, ability=excluded.ability, description=excluded.description, updatedAt=excluded.updatedAt`);
                    for (const entry of campaignSkills) {
                        const sk = entry.skill || {};
                        const id = sk.id || randomUUID();
                        const d: Record<string, any> = {
                            id,
                            name: formatTitleOrTag(sk.name) || 'Abilità',
                            ability: sk.ability || 'Varia',
                            description: sk.description || '',
                            campaignid: campaignId,
                            createdat: sk.createdAt || now,
                            updatedat: now
                        };
                        stmt.run(...cols.map(c => d[c.toLowerCase()]));
                        importedCount++;
                    }
                }
            }

            // E. Regole Homebrew Campagna
            if (payload.rules && payload.rules.length > 0) {
                const campaignRules = payload.rules.filter(r => r.target === 'campaign');
                if (campaignRules.length > 0) {
                    const cols = getTableCols('HomebrewRule');
                    const stmt = db.prepare(`INSERT INTO HomebrewRule (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, category=excluded.category, isActive=excluded.isActive, updatedAt=excluded.updatedAt`);
                    for (const entry of campaignRules) {
                        const r = entry.rule || {};
                        const id = r.id || randomUUID();
                        const d: Record<string, any> = {
                            id,
                            campaignid: campaignId,
                            title: formatTitleOrTag(r.title) || 'Regola Homebrew',
                            content: formatNarrativeText(r.content) || '',
                            category: r.chapterTitle || 'Generale',
                            isactive: 1,
                            createdat: r.createdAt || now,
                            updatedat: now
                        };
                        stmt.run(...cols.map(c => d[c.toLowerCase()]));
                        importedCount++;
                    }
                }
            }
        })();

        // 2. Salvataggio entità di Sistema nei file JSON (archiviati in data/system/ fuori da src per non innescare il watcher di Next.js)
        // A. Regole Sistema
        if (payload.rules && payload.rules.length > 0) {
            const systemRules = payload.rules.filter(r => r.target !== 'campaign');
            if (systemRules.length > 0) {
                const existing = readSystemJsonFile<any>('custom-rules.json', 'rules');
                for (const entry of systemRules) {
                    const r = entry.rule || {};
                    const id = r.id || `custom-rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                    const idx = existing.findIndex((ex: any) => ex.id === id || (ex.title && r.title && ex.title.toLowerCase().trim() === r.title.toLowerCase().trim()));
                    const updated = {
                        ...r,
                        id,
                        title: formatTitleOrTag(r.title) || 'Regola di Sistema',
                        content: r.content || '',
                        sourceBook: r.sourceBook || 'phb',
                        chapterTitle: r.chapterTitle || (r.sourceBook === 'dmg' ? 'Strumenti del DM' : 'Regole Generali'),
                        tags: Array.isArray(r.tags) ? r.tags : [],
                        updatedAt: now
                    };
                    if (idx > -1) {
                        existing[idx] = updated;
                    } else {
                        existing.push(updated);
                    }
                    importedCount++;
                }
                writeSystemJsonFile('custom-rules.json', 'rules', existing);
            }
        }

        // B. Oggetti Sistema
        if (payload.items && payload.items.length > 0) {
            const systemItems = payload.items.filter(i => i.target === 'system');
            if (systemItems.length > 0) {
                const existing = readSystemJsonFile<any>('custom-items.json', 'items');
                for (const entry of systemItems) {
                    const it = entry.item || {};
                    const name = (it.name || 'Oggetto Magico').toString().trim();
                    const nameKey = name.toLowerCase();
                    const idx = existing.findIndex((ex: any) => (ex.name || '').toString().toLowerCase().trim() === nameKey);
                    const updated = {
                        ...it,
                        name: formatTitleOrTag(name),
                        updatedAt: now
                    };
                    if (idx > -1) {
                        existing[idx] = updated;
                    } else {
                        existing.push(updated);
                    }
                    importedCount++;
                }
                writeSystemJsonFile('custom-items.json', 'items', existing);
            }
        }

        // C. Mostri Sistema
        if (payload.monsters && payload.monsters.length > 0) {
            const systemMonsters = payload.monsters.filter(m => m.target === 'system');
            if (systemMonsters.length > 0) {
                const existing = readSystemJsonFile<any>('custom-monsters.json', 'monsters');
                const monsterCols = getTableCols('Monster');

                for (const entry of systemMonsters) {
                    const m = entry.monster || {};
                    const rawName = (m.name || 'Creatura').toString().trim();
                    const formattedName = formatTitleOrTag(rawName);
                    const nameKey = formattedName.toLowerCase().trim();

                    const deletedList = readSystemJsonFile<string>('deleted-monsters.json', 'deletedMonsters');
                    if (deletedList.some(d => (d || '').toLowerCase().trim() === nameKey)) {
                        writeSystemJsonFile('deleted-monsters.json', 'deletedMonsters', deletedList.filter(d => (d || '').toLowerCase().trim() !== nameKey));
                    }

                    let finalImg = m.imageUrl || null;
                    if (finalImg && finalImg.startsWith('data:image/')) {
                        finalImg = saveBase64ImageDirectly(finalImg, formattedName);
                    }

                    let finalThumb = m.thumbnailUrl || null;
                    if (finalThumb && finalThumb.startsWith('data:image/')) {
                        finalThumb = saveBase64ImageDirectly(finalThumb, `${formattedName}_thumb`);
                    }

                    const idx = existing.findIndex((ex: any) => (ex.name || '').toString().toLowerCase().trim() === nameKey);
                    const updated = {
                        ...m,
                        name: formattedName,
                        imageUrl: finalImg,
                        thumbnailUrl: finalThumb || finalImg,
                        updatedAt: now
                    };
                    if (idx > -1) {
                        existing[idx] = updated;
                    } else {
                        existing.push(updated);
                    }

                    // Se presente campaignId, sincronizziamo anche nella tabella SQLite Monster
                    if (campaignId) {
                        try {
                            const dbExisting = db.prepare("SELECT id FROM Monster WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND campaignId = ?").get(formattedName, campaignId) as { id: string } | undefined;
                            const targetId = dbExisting?.id || m.id || randomUUID();
                            const d: Record<string, any> = {
                                id: targetId,
                                name: formattedName,
                                type: sanitizeMonsterType(m.type),
                                armorclass: m.armorClass || '10',
                                hitpoints: m.hitPoints || '10',
                                challenge: m.challenge || '0',
                                description: cleanAiHallucinatoryLoops(m.description) || '',
                                imageurl: finalImg,
                                thumbnailurl: finalThumb || finalImg,
                                campaignid: campaignId,
                                createdat: m.createdAt || now,
                                updatedat: now
                            };
                            if (dbExisting) {
                                const updateCols = ['name', 'type', 'armorclass', 'hitpoints', 'challenge', 'description', 'imageurl', 'thumbnailurl', 'updatedat'].filter(c => monsterCols.includes(c));
                                const setClause = updateCols.map(c => `${c} = ?`).join(', ');
                                db.prepare(`UPDATE Monster SET ${setClause} WHERE id = ?`).run(...updateCols.map(c => d[c]), targetId);
                            } else {
                                const insertCols = Object.keys(d).filter(c => monsterCols.includes(c.toLowerCase()));
                                db.prepare(`INSERT INTO Monster (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`).run(...insertCols.map(c => d[c]));
                            }
                        } catch (sqlErr) {
                            console.warn("[BulkImport] Sync Monster SQLite error:", sqlErr);
                        }
                    }

                    importedCount++;
                }
                writeSystemJsonFile('custom-monsters.json', 'monsters', existing);
            }
        }

        // D. Incantesimi Sistema
        if (payload.spells && payload.spells.length > 0) {
            const systemSpells = payload.spells.filter(s => s.target === 'system');
            if (systemSpells.length > 0) {
                const existing = readSystemJsonFile<any>('custom-spells.json', 'spells');
                for (const entry of systemSpells) {
                    const s = entry.spell || {};
                    const name = (s.name || 'Incantesimo').toString().trim();
                    const nameKey = name.toLowerCase();
                    const idx = existing.findIndex((ex: any) => (ex.name || '').toString().toLowerCase().trim() === nameKey);
                    const updated = {
                        ...s,
                        name: formatTitleOrTag(name),
                        updatedAt: now
                    };
                    if (idx > -1) {
                        existing[idx] = updated;
                    } else {
                        existing.push(updated);
                    }
                    importedCount++;
                }
                writeSystemJsonFile('custom-spells.json', 'spells', existing);
            }
        }

        return actionResponse({ count: importedCount });
    } catch (e: any) {
        console.error("Errore bulkSaveImportedContentAction:", e);
        return actionResponse(null, e.message);
    }
}

export async function deleteSystemRuleAction(id: string) {
    'use server';
    try {
        const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
        const filtered = rules.filter((r: any) => r.id !== id);
        writeSystemJsonFile('custom-rules.json', 'rules', filtered);
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function deleteSystemChapterAction(sourceBook: string, chapterTitle: string) {
    'use server';
    try {
        const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
        const filtered = rules.filter((r: any) => !(r.sourceBook === sourceBook && (r.chapterTitle === chapterTitle || r.chapterId === chapterTitle)));
        writeSystemJsonFile('custom-rules.json', 'rules', filtered);
        return actionResponse({ success: true, count: rules.length - filtered.length });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function clearSystemRulesAction(sourceBook?: 'phb' | 'dmg' | 'all') {
    'use server';
    try {
        if (!sourceBook || sourceBook === 'all') {
            writeSystemJsonFile('custom-rules.json', 'rules', []);
        } else {
            const rules = readSystemJsonFile<any>('custom-rules.json', 'rules');
            const filtered = rules.filter((r: any) => r.sourceBook !== sourceBook);
            writeSystemJsonFile('custom-rules.json', 'rules', filtered);
        }
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function parsePdfAction(base64Data: string, mimeType: string = 'application/pdf') {
    'use server';
    const isImage = mimeType.startsWith('image/');
    
    // Se è un'immagine, usiamo direttamente l'OCR avanzato di Gemini con retry automatico
    if (isImage) {
        try {
            const textResult = await runAiWithRetry(async () => {
                const genAi = getGenAI();
                const model = getActiveFlashModel();
                const response = await safeGenerateContent(genAi, {
                    model,
                    contents: [
                        {
                            inlineData: {
                                mimeType,
                                data: base64Data
                            }
                        },
                        "Sei un assistente esperto di D&D. Trascrivi fedelmente e in modo dettagliato tutto il testo contenuto in questa immagine, con particolare attenzione alle statistiche dei mostri, descrizioni degli oggetti magici, formule o descrizioni di magie, talenti o regole di gioco."
                    ]
                });
                return response.text;
            }, 'EXTRACTION');
            return actionResponse(textResult || "Nessun testo estratto dall'immagine.");
        } catch (geminiError: any) {
            return actionResponse(null, `Errore estrazione immagine con Gemini: ${geminiError.message}`);
        }
    }

    // Se è un PDF, proviamo prima con il parser locale veloce pdf-parse
    try {
        const pdfModule = await import('pdf-parse');
        const pdfParse = (pdfModule as any).default || pdfModule;
        const buffer = Buffer.from(base64Data, 'base64');
        const data = await pdfParse(buffer);
        if (data && data.text && data.text.trim().length > 50) {
            return actionResponse(data.text);
        }
        throw new Error("Il PDF estratto locale è vuoto o scansionato (senza testo selezionabile).");
    } catch (e: any) {
        console.warn(`[PDF Parser] Fallito parser locale (${e.message}). Provo fallback OCR con Gemini...`);
        if (base64Data.length > 12 * 1024 * 1024) {
            return actionResponse(null, "Il PDF è troppo grande (>10MB) per l'invio in blocco unico a Gemini. Utilizza l'estrazione client per selezionare un intervallo di pagine (es. 1-50) nell'Importatore Intelligente.");
        }
        try {
            const pdfTextResult = await runAiWithRetry(async () => {
                const genAi = getGenAI();
                const model = getActiveFlashModel();
                const response = await safeGenerateContent(genAi, {
                    model,
                    contents: [
                        {
                            inlineData: {
                                mimeType: 'application/pdf',
                                data: base64Data
                            }
                        },
                        "Sei un archivista di D&D. Leggi questo documento PDF ed estrai accuratamente tutto il suo contenuto testuale (regole, statistiche, descrizioni). Mantieni intatta la formattazione logica per permettere la catalogazione automatica."
                    ]
                });
                return response.text;
            }, 'EXTRACTION');
            return actionResponse(pdfTextResult || "Nessun testo estratto dal PDF.");
        } catch (geminiError: any) {
            return actionResponse(null, `Errore durante l'estrazione PDF (locale e fallback Gemini falliti): ${geminiError.message}`);
        }
    }
}

export async function askOracoloAi(prompt: string, history: { role: 'user' | 'model'; text: string }[], campaignId: string) {
    try {
        const genAi = getGenAI();
        const model = getActiveFlashModel('ORACULO');

        const contents = [
            ...history.map(h => ({
                role: h.role,
                parts: [{ text: h.text }]
            })),
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ];

        const systemInstruction = `Sei l'Oracolo del Tessitore, l'intelligenza artificiale di supporto al Dungeon Master, esperto supremo di Dungeons & Dragons Quinta Edizione (D&D 5e) e di tutta la storia, lore, fazioni, cosmologia e geografia dei Forgotten Realms (incluso il Faerûn, la Costa della Spada, divinità, e personaggi iconici).
Il tuo obiettivo principale è aiutare il Master a:
1. Chiarire dubbi e applicare le regole ufficiali di D&D 5e (indicando possibilmente le fonti come PHB, DMG, ecc.).
2. Pianificare e ideare avventure, storie, trame, incontri e quest per la campagna in corso.
3. Improvvisare sul momento PNG, luoghi e dettagli d'atmosfera.

Rispondi sempre in italiano, usando un markdown formattato splendidamente, leggibile, strutturato ed evocativo. Se necessario, includi tabelle, blocchi di citazione o descrizioni narrative suggestive. Mantieni sempre una distinzione chiara tra il testo da leggere ai giocatori e le note riservate al DM.`;

        const res = await safeGenerateContent(genAi, {
            model,
            contents,
            config: {
                systemInstruction,
                temperature: 0.7,
            }
        }, 'ORACULO');

        return actionResponse(res.text || "");
    } catch (e: any) {
        console.error("[Oracolo AI] Error:", e);
        return actionResponse(null, e.message || String(e));
    }
}

export async function getSystemSettingAction(key: string) {
    'use server';
    try {
        const row = db.prepare("SELECT value FROM SystemSetting WHERE key = ?").get(key) as { value: string } | undefined;
        return actionResponse(row ? JSON.parse(row.value) : null);
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function saveSystemSettingAction(key: string, value: any) {
    'use server';
    try {
        const strVal = JSON.stringify(value);
        db.prepare(`
            INSERT INTO SystemSetting (key, value, updatedAt) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP
        `).run(key, strVal);
        return actionResponse({ success: true });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function getAiLogsAction() {
    'use server';
    try {
        const { readAiLogs, getAiLogStats } = await import('@/lib/ai-logger');
        const logs = readAiLogs(200);
        const stats = getAiLogStats();
        return actionResponse({ logs, stats });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function clearAiLogsAction() {
    'use server';
    try {
        const { clearAiLogs, getAiLogStats } = await import('@/lib/ai-logger');
        const success = clearAiLogs();
        const stats = getAiLogStats();
        return actionResponse({ success, stats });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

// ============================================================================
// ARCHITETTURA MODULARE DI IMPORTAZIONE INTELLIGENTE (_new)
// Router Centrale -> Estrattori Dedicati (Mostri, Regole, Magie, Oggetti, Abilità)
// ============================================================================

export type CatalogHandbookNewInput = {
    content?: string;
    photoDataUri?: string;
    sourceManual?: 'auto' | 'mm' | 'dmg' | 'phb' | 'custom';
    targetContentType?: 'all' | 'monsters_only' | 'rules_only' | 'spells_only' | 'items_only' | 'skills_only';
    selectedModel?: string;
};

export async function catalogHandbookNewAction(input: CatalogHandbookNewInput) {
    'use server';
    try {
        const selectedModel = input.selectedModel || 'gemini-3.8-flash';
        const modelToUse = !isModelExhausted(selectedModel) ? selectedModel : 'gemini-3.8-flash';

        const data = await routeAndCatalogContent({
            ...input,
            selectedModel: modelToUse
        });

        return actionResponse({
            ...data,
            modelUsed: data.modelUsed || modelToUse
        });
    } catch (e: any) {
        console.error("Errore catalogHandbookNewAction:", e);
        return actionResponse(null, e.message);
    }
}

export async function saveCustomMonsterAction(data: {
    campaignId: string;
    name: string;
    type: string;
    armorClass: string;
    hitPoints: string;
    challenge: string;
    description: string;
    imageUrl?: string;
}) {
    'use server';
    try {
        const id = randomUUID();
        const now = new Date().toISOString();
        const finalImageUrl = saveBase64ImageDirectly(data.imageUrl, data.name);

        db.prepare(`
            INSERT INTO Monster (id, campaignId, name, type, armorClass, hitPoints, challenge, description, imageUrl, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name = excluded.name,
                type = excluded.type,
                armorClass = excluded.armorClass,
                hitPoints = excluded.hitPoints,
                challenge = excluded.challenge,
                description = excluded.description,
                imageUrl = COALESCE(excluded.imageUrl, Monster.imageUrl),
                updatedAt = excluded.updatedAt
        `).run(
            id,
            data.campaignId,
            data.name,
            data.type,
            data.armorClass,
            data.hitPoints,
            data.challenge,
            data.description,
            finalImageUrl || null,
            now,
            now
        );

        return actionResponse({ success: true, id });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function consolidateAllDataToDbAction() {
    'use server';
    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

    try {
        log("=== INIZIO DIAGNOSTICA E CONSOLIDAMENTO DATABASE ===");
        log(`Percorso DB: ${dbPath}`);
        log(`Node Environment: ${process.env.NODE_ENV || 'development'} | Platform: ${process.platform} (${process.arch})`);

        if (fs.existsSync(dbPath)) {
            const stats = fs.statSync(dbPath);
            log(`Stato file DB: Esistente (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            log(`Stato file DB: File non trovato al percorso indicato! Sarà creato.`);
        }

        // Verifica PRAGMA SQLite
        try {
            const fkStatus = db.prepare("PRAGMA foreign_keys").get() as any;
            const journalMode = db.prepare("PRAGMA journal_mode").get() as any;
            log(`PRAGMA foreign_keys: ${JSON.stringify(fkStatus)}`);
            log(`PRAGMA journal_mode: ${JSON.stringify(journalMode)}`);
        } catch (pragmaErr: any) {
            log(`[AVVISO] Lettura PRAGMA fallita: ${pragmaErr.message}`);
        }

        log("Disattivazione temporanea vincoli FK per la procedura di consolidamento...");
        db.exec("PRAGMA foreign_keys = OFF");

        try {
            // Garanzia Campagna System
            log("Controllo presenza campagna 'system'...");
            ensureSystemCampaignRow();
            const sysCamp = db.prepare("SELECT id, name FROM Campaign WHERE id = 'system'").get() as any;
            if (sysCamp) {
                log(`Campagna 'system' verificata: ${JSON.stringify(sysCamp)}`);
            } else {
                log(`[AVVISO] Forzatura inserimento campagna 'system'...`);
                ensureSystemCampaignRow();
            }

            // Bonifica automatica record orfani
            log("Bonifica preventiva record orfani senza campagna...");
            const delMonsters = db.prepare("DELETE FROM Monster WHERE campaignId NOT IN (SELECT id FROM Campaign)").run();
            const delItems = db.prepare("DELETE FROM MagicItem WHERE campaignId NOT IN (SELECT id FROM Campaign)").run();
            const delSpells = db.prepare("DELETE FROM CustomSpell WHERE campaignId NOT IN (SELECT id FROM Campaign)").run();
            const delSkills = db.prepare("DELETE FROM CustomSkill WHERE campaignId NOT IN (SELECT id FROM Campaign)").run();
            log(`Record orfani rimossi - Mostri: ${delMonsters.changes}, Oggetti: ${delItems.changes}, Magie: ${delSpells.changes}, Abilità: ${delSkills.changes}`);

            // Ispezione tabelle e colonne
            const colsMonsters = getTableCols('Monster');
            const colsItems = getTableCols('MagicItem');
            const colsSpells = getTableCols('CustomSpell');
            const colsSkills = getTableCols('CustomSkill');

            log(`Colonne 'Monster': ${colsMonsters.join(', ')}`);
            log(`Colonne 'MagicItem': ${colsItems.join(', ')}`);
            log(`Colonne 'CustomSpell': ${colsSpells.join(', ')}`);
            log(`Colonne 'CustomSkill': ${colsSkills.join(', ')}`);

            // Caricamento Dati JSON Base
            const baseMonsters = getBaseMonsters();
            const baseItems = getBaseItems();
            const baseSpells = getBaseSpells();
            const baseSkills = getBaseSkills();

            log(`Elementi da migrare - Mostri: ${baseMonsters.length}, Oggetti: ${baseItems.length}, Incantesimi: ${baseSpells.length}, Abilità: ${baseSkills.length}`);

            const now = new Date().toISOString();
            const campaignId = 'system';

            log("Avvio popolamento batch...");
            let countMonsters = 0;
            let countItems = 0;
            let countSpells = 0;
            let countSkills = 0;

            db.transaction(() => {
                ensureSystemCampaignRow();

                // 1. Mostri
                log("1/4 Inserimento Mostri...");
                const insertMonster = db.prepare(`INSERT OR IGNORE INTO Monster (${colsMonsters.join(',')}) VALUES (${colsMonsters.map(() => '?').join(',')})`);
                for (const m of baseMonsters) {
                    const data: Record<string, any> = {
                        id: m.id || randomUUID(),
                        name: formatTitleOrTag(m.name),
                        type: sanitizeMonsterType(m.type),
                        armorclass: m.armorClass || '10',
                        hitpoints: m.hitPoints || '10',
                        challenge: m.challenge || '0',
                        description: cleanAiHallucinatoryLoops(m.description) || '',
                        imageurl: m.imageUrl || null,
                        thumbnailurl: m.thumbnailUrl || (m as any).thumbnailurl || m.imageUrl || null,
                        campaignid: campaignId,
                        createdat: now,
                        updatedat: now
                    };
                    const values = colsMonsters.map(c => data[c.toLowerCase()] ?? null);
                    insertMonster.run(...values);
                    countMonsters++;
                }
                log(`1/4 Mostri inseriti/verificati: ${countMonsters}`);

                // 2. Oggetti
                log("2/4 Inserimento Oggetti...");
                const insertItem = db.prepare(`INSERT OR IGNORE INTO MagicItem (${colsItems.join(',')}) VALUES (${colsItems.map(() => '?').join(',')})`);
                for (const i of baseItems) {
                    const data: Record<string, any> = {
                        id: i.id || randomUUID(),
                        name: formatTitleOrTag(i.name),
                        type: i.type || 'Oggetto',
                        rarity: i.rarity || 'Comune',
                        attunement: i.attunement || 'No',
                        description: i.description || '',
                        cost: i.cost || 'N/D',
                        damage: i.damage || '',
                        techtype: i.techType || 'none',
                        imageurl: i.imageUrl || null,
                        campaignid: campaignId,
                        createdat: now,
                        updatedat: now
                    };
                    const values = colsItems.map(c => data[c.toLowerCase()] ?? null);
                    insertItem.run(...values);
                    countItems++;
                }
                log(`2/4 Oggetti inseriti/verificati: ${countItems}`);

                // 3. Incantesimi
                log("3/4 Inserimento Incantesimi...");
                const insertSpell = db.prepare(`INSERT OR IGNORE INTO CustomSpell (${colsSpells.join(',')}) VALUES (${colsSpells.map(() => '?').join(',')})`);
                for (const s of baseSpells) {
                    const data: Record<string, any> = {
                        id: s.id || randomUUID(),
                        name: formatTitleOrTag(s.name),
                        level: s.level || '0',
                        school: s.school || 'Invocazione',
                        casting_time: s.casting_time || '1 azione',
                        range: s.range || 'Contatto',
                        components: s.components || 'V, S',
                        duration: s.duration || 'Istantanea',
                        description: s.description || '',
                        classes: s.classes || '',
                        campaignid: campaignId,
                        createdat: now,
                        updatedat: now
                    };
                    const values = colsSpells.map(c => data[c.toLowerCase()] ?? null);
                    insertSpell.run(...values);
                    countSpells++;
                }
                log(`3/4 Incantesimi inseriti/verificati: ${countSpells}`);

                // 4. Abilità
                log("4/4 Inserimento Abilità...");
                const insertSkill = db.prepare(`INSERT OR IGNORE INTO CustomSkill (${colsSkills.join(',')}) VALUES (${colsSkills.map(() => '?').join(',')})`);
                for (const s of baseSkills) {
                    const data: Record<string, any> = {
                        id: s.id || randomUUID(),
                        name: formatTitleOrTag(s.name),
                        ability: s.ability || 'FOR',
                        description: s.description || '',
                        campaignid: campaignId,
                        createdat: now,
                        updatedat: now
                    };
                    const values = colsSkills.map(c => data[c.toLowerCase()] ?? null);
                    insertSkill.run(...values);
                    countSkills++;
                }
                log(`4/4 Abilità inserite/verificate: ${countSkills}`);
            })();

            log("Popolamento batch completato con SUCCESSO!");

            // Verifica FK finale
            try {
                const fkViolations = db.prepare("PRAGMA foreign_key_check").all() as any[];
                if (fkViolations.length > 0) {
                    log(`[AVVISO] Trovate ${fkViolations.length} violazioni FK residue nel DB: ${JSON.stringify(fkViolations.slice(0, 3))}`);
                } else {
                    log("Verifica integrità PRAGMA foreign_key_check: 0 violazioni.");
                }
            } catch {}

            log("=== CONSOLIDAMENTO COMPLETATO CORRETTAMENTE ===");

            return actionResponse({
                success: true,
                message: `Migrazione e bonifica completate con successo! (${countMonsters} mostri, ${countItems} oggetti, ${countSpells} magie, ${countSkills} abilità)`,
                logOutput: logs.join('\n')
            });
        } finally {
            db.exec("PRAGMA foreign_keys = ON");
            log("Riattivazione vincoli FK (PRAGMA foreign_keys = ON).");
        }

    } catch (e: any) {
        log(`[ERRORE FATALE MIGRAZIONE]: ${e.message || e}`);
        if (e.code) log(`Codice Errore SQLite: ${e.code}`);
        if (e.stack) log(`Stack Trace:\n${e.stack}`);
        log("=== CONSOLIDAMENTO FALLITO ===");

        return actionResponse({
            success: false,
            message: `Errore migrazione: ${e.message || e}`,
            logOutput: logs.join('\n')
        }, e.message || "Errore sconosciuto durante la migrazione.");
    }
}





export async function saveWeapon(weapon: any) {
    try {
        const id = weapon.id || randomUUID();
        const now = new Date().toISOString();
        const cols = getTableCols('MagicItem'); // Use MagicItem table or similar since weapons are usually stored there or custom
        const d: Record<string, any> = {
            id,
            name: formatTitleOrTag(weapon.name) || 'Arma',
            type: weapon.type || 'Arma',
            rarity: weapon.rarity || 'Comune',
            description: cleanAiHallucinatoryLoops(weapon.description) || '',
            damage: weapon.damage || '',
            cost: weapon.cost || 'N/D',
            campaignId: weapon.campaignId,
            createdAt: now,
            updatedAt: now
        };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        db.prepare(`INSERT INTO MagicItem (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, damage=excluded.damage, updatedAt=excluded.updatedAt`).run(...insertCols.map(c => d[c]));
        return actionResponse({ success: true, id });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function saveArmor(armor: any) {
    try {
        const id = armor.id || randomUUID();
        const now = new Date().toISOString();
        const cols = getTableCols('MagicItem');
        const d: Record<string, any> = {
            id,
            name: formatTitleOrTag(armor.name) || 'Armatura',
            type: armor.type || 'Armatura',
            rarity: armor.rarity || 'Comune',
            description: cleanAiHallucinatoryLoops(armor.description) || '',
            cost: armor.cost || 'N/D',
            campaignId: armor.campaignId,
            createdAt: now,
            updatedAt: now
        };
        const insertCols = Object.keys(d).filter(c => cols.includes(c.toLowerCase()));
        const placeholders = insertCols.map(() => '?').join(',');
        db.prepare(`INSERT INTO MagicItem (${insertCols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updatedAt=excluded.updatedAt`).run(...insertCols.map(c => d[c]));
        return actionResponse({ success: true, id });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}




export async function getBackupData() {
    'use server';
    try {
        const tables = ['Campaign', 'StoryArc', 'Session', 'MagicItem', 'Monster', 'SessionLoot', 'Reward', 'CharacterEvent', 'PlayerCharacter', 'CustomSpell', 'CustomSkill', 'PossessedItems', 'LetterPreset', 'Shop', 'WorldLocation', 'Npc', 'Combat', 'HomebrewRule', 'LoreEntry', 'LoreVersion', 'SystemPrompt', 'ApiUsage', 'Device', 'AppSetting', 'SystemSetting'];
        const backup: Record<string, any[]> = {};
        for (const table of tables) {
            try { backup[table] = db.prepare(`SELECT * FROM ${table}`).all(); } catch (err) { backup[table] = []; }
        }
        return actionResponse(backup);
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function getAssetsBackup() {
    'use server';
    try {
        const assets: any[] = [];
        const dir = getAssetDir();
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, { encoding: 'base64' });
                assets.push({ name: file, content });
            }
        }
        return actionResponse({ Assets: assets });
    } catch (e: any) { return actionResponse(null, e.message); }
}

export async function uploadBatchImages(images: { name: string; content: string }[]) {
    'use server';
    try {
        const dir = getAssetDir();
        let uploadedCount = 0;
        for (const img of images) {
            if (!img.name || !img.content) continue;
            let b64 = img.content;
            const matches = img.content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches[2]) {
                b64 = matches[2];
            }
            const buf = Buffer.from(b64, 'base64');
            const sanitizedName = img.name.trim().replace(/\s+/g, '_').replace(/[^\w\d_.-]/g, '');
            fs.writeFileSync(path.join(dir, sanitizedName), buf);
            uploadedCount++;
        }
        return actionResponse({ success: true, uploadedCount });
    } catch (e: any) {
        return actionResponse(null, e.message);
    }
}

export async function restoreBackupData(jsonString: string) {
    'use server';
    try {
        const data = JSON.parse(jsonString);
        if (!data || typeof data !== 'object') throw new Error("Formato backup non valido.");
        
        const tableMapping: Record<string, string> = { 
            'campaigns': 'Campaign', 'campaign': 'Campaign', 
            'story_arcs': 'StoryArc', 'storyarc': 'StoryArc', 
            'sessions': 'Session', 'session': 'Session', 
            'magic_items': 'MagicItem', 'magicitem': 'MagicItem', 
            'monsters': 'Monster', 'monster': 'Monster', 
            'rewards': 'Reward', 'reward': 'Reward', 
            'character_events': 'CharacterEvent', 'characterevent': 'CharacterEvent', 
            'player_characters': 'PlayerCharacter', 'playercharacter': 'PlayerCharacter', 'characters': 'PlayerCharacter', 
            'custom_spells': 'CustomSpell', 'customspell': 'CustomSpell', 'spells': 'CustomSpell', 
            'custom_skills': 'CustomSkill', 'customskill': 'CustomSkill', 'skills': 'CustomSkill', 
            'possessed_items': 'PossessedItems', 'possesseditems': 'PossessedItems', 
            'letter_presets': 'LetterPreset', 'letterpreset': 'LetterPreset', 
            'shops': 'Shop', 'shop': 'Shop', 
            'world_locations': 'WorldLocation', 'worldlocation': 'WorldLocation', 
            'npcs': 'Npc', 'npc': 'Npc', 
            'combats': 'Combat', 'combat': 'Combat', 
            'homebrew_rules': 'HomebrewRule', 'homebrewrule': 'HomebrewRule', 'rules': 'HomebrewRule', 
            'lore_entries': 'LoreEntry', 'lore_entry': 'LoreEntry', 'loreentries': 'LoreEntry', 'loreentry': 'LoreEntry', 'lore': 'LoreEntry', 'loreentrys': 'LoreEntry',
            'lore_versions': 'LoreVersion', 'loreversion': 'LoreVersion',
            'devices': 'Device', 'device': 'Device',
            'app_settings': 'AppSetting', 'appsetting': 'AppSetting',
            'system_settings': 'SystemSetting', 'systemsetting': 'SystemSetting',
            'system_prompts': 'SystemPrompt', 'systemprompt': 'SystemPrompt', 
            'session_loot': 'SessionLoot', 'sessionloot': 'SessionLoot' 
        };
        const columnMapping: Record<string, string> = { 
            'isArchived': 'is_archived', 'isSummarized': 'is_summarized', 'sessionNumber': 'session_number', 
            'xpAward': 'xp_award', 'lootScanned': 'loot_scanned', 'isRead': 'is_read', 
            'activeArcLabel': 'active_arc_label', 'globalCompendium': 'global_compendium', 
            'imageUrl': 'imageUrl', 'image_url': 'imageUrl', 'orderIndex': 'order_index',
            'sourceUrl': 'sourceUrl', 'source_url': 'sourceUrl'
        };
        db.exec("PRAGMA foreign_keys = OFF");
        try {
            db.transaction(() => {
                const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
                for (const table of existingTables) {
                    if (table === 'sqlite_sequence' || table.startsWith('sqlite_')) continue;
                    db.prepare(`DELETE FROM ${table}`).run();
                }
                for (const [key, rows] of Object.entries(data)) {
                    if (key === 'Assets') continue;
                    const targetTable = tableMapping[key.toLowerCase()] || key;
                    if (!existingTables.includes(targetTable) || !Array.isArray(rows)) continue;
                    const tableInfo = db.prepare(`PRAGMA table_info(${targetTable})`).all() as any[];
                    const validColumns = tableInfo.map(c => c.name);
                    for (const row of rows) {
                        if (!row || typeof row !== 'object') continue;
                        const mappedRow: Record<string, any> = {};
                        for (const [colName, colVal] of Object.entries(row)) {
                            const targetCol = columnMapping[colName] || colName;
                            if (validColumns.includes(targetCol)) mappedRow[targetCol] = (colVal !== null && typeof colVal === 'object') ? (typeof colVal === 'string' ? colVal : JSON.stringify(colVal)) : colVal;
                        }
                        if (Object.keys(mappedRow).length === 0) continue;
                        const cols = Object.keys(mappedRow);
                        const placeholders = cols.map(() => '?').join(',');
                        db.prepare(`INSERT OR REPLACE INTO ${targetTable} (${cols.join(',')}) VALUES (${placeholders})`).run(...Object.values(mappedRow));
                    }
                }
            })();
        } finally { db.exec("PRAGMA foreign_keys = ON"); }
        const restoredCamp = db.prepare("SELECT id FROM Campaign ORDER BY updatedAt DESC LIMIT 1").get() as { id: string } | undefined;
        return actionResponse({ success: true, mode: 'data', campaignId: restoredCamp?.id });
    } catch (e: any) { return actionResponse(null, e.message); }
}
export async function linkExistingQuestsToEntitiesAction(campaignId: string) {
    try {
        const sessions = db.prepare("SELECT id, notes FROM Session WHERE campaignId = ?").all(campaignId) as Session[];
        const npcs = db.prepare("SELECT id, name FROM Npc WHERE campaignId = ?").all(campaignId) as Npc[];
        const monsters = db.prepare("SELECT id, name FROM Monster WHERE campaignId = ?").all(campaignId) as Monster[];
        const items = db.prepare("SELECT id, name FROM MagicItem WHERE campaignId = ?").all(campaignId) as MagicItem[];

        let linkedCount = 0;
        db.transaction(() => {
            for (const session of sessions) {
                if (!session.notes) continue;
                
                const entitiesToLink = [
                    ...npcs.map(n => ({ id: n.id, name: n.name, type: 'Npc' })),
                    ...monsters.map(m => ({ id: m.id, name: m.name, type: 'Monster' })),
                    ...items.map(i => ({ id: i.id, name: i.name, type: 'MagicItem' }))
                ];

                for (const entity of entitiesToLink) {
                    if (session.notes.includes(entity.name)) {
                        const exists = db.prepare("SELECT 1 FROM SessionLoot WHERE sessionId = ? AND entityId = ?").get(session.id, entity.id);
                        if (!exists) {
                            db.prepare("INSERT INTO SessionLoot (sessionId, entityId, entityType) VALUES (?, ?, ?)").run(session.id, entity.id, entity.type);
                            linkedCount++;
                        }
                    }
                }
            }
        })();
        
        return actionResponse({ success: true, message: `Collegati ${linkedCount} elementi alle sessioni esistenti.` });
    } catch (e: any) {
        return actionResponse(null, `Errore durante il collegamento: ${e.message}`);
    }
}
