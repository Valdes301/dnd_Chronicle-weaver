import fs from 'fs';
import path from 'path';

export const MAX_LOG_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getLogDir(): string {
    const baseDir = process.env.DATABASE_URL 
        ? path.dirname(process.env.DATABASE_URL.replace('file:', '')) 
        : path.join(process.cwd(), 'data');
    if (!fs.existsSync(baseDir)) {
        try {
            fs.mkdirSync(baseDir, { recursive: true });
        } catch {}
    }
    return baseDir;
}

export function getLogFilePath(): string {
    return path.join(getLogDir(), 'ai_debug.log');
}

/**
 * Ruota il file se supera i 10MB conservando la metà più recente dei log.
 */
function rotateLogIfNeeded(filePath: string) {
    try {
        if (!fs.existsSync(filePath)) return;
        const stats = fs.statSync(filePath);
        if (stats.size >= MAX_LOG_FILE_SIZE_BYTES) {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            // Mantieni gli ultimi 50% delle righe
            const preservedLines = lines.slice(Math.floor(lines.length / 2));
            const header = `[${new Date().toISOString()}] [SYSTEM] [Log Rotation] File superava 10MB. Log storici archiviati.\n--------------------------------------------------\n`;
            fs.writeFileSync(filePath, header + preservedLines.join('\n'), 'utf8');
        }
    } catch (e) {
        console.error("[AiLogger] Errore rotazione log:", e);
    }
}

export interface LogErrorMetadata {
    imageSizeKB?: number;
    textLength?: number;
    durationMs?: number;
    details?: string;
    action?: string;
    endpoint?: string;
    campaignId?: string;
    httpStatus?: number;
}

export function logAiError(
    model: string, 
    error: any, 
    service: string = 'catalog', 
    metadata?: LogErrorMetadata
) {
    try {
        const filePath = getLogFilePath();
        rotateLogIfNeeded(filePath);

        const timestamp = new Date().toISOString();
        const errorMessage = typeof error === 'object' 
            ? (error?.message || JSON.stringify(error)) 
            : String(error);
        const stack = error?.stack ? `\nStack: ${error.stack.split('\n').slice(0, 4).join('\n')}` : '';
        
        // Categorizzazione diagnostica intelligente
        const errLower = errorMessage.toLowerCase();
        let errorCategory = 'GENERIC_ERROR';
        if (errLower.includes('429') || errLower.includes('quota') || errLower.includes('resource_exhausted') || errLower.includes('too many requests')) {
            errorCategory = 'QUOTA_LIMIT_429 (Token/Richieste Esaurite)';
        } else if (errLower.includes('503') || errLower.includes('high demand') || errLower.includes('unavailable') || errLower.includes('overloaded')) {
            errorCategory = 'SERVER_OVERLOAD_503 (Server Temporaneamente Occupato)';
        } else if (errLower.includes('payload') || errLower.includes('entity too large') || (metadata?.imageSizeKB && metadata.imageSizeKB > 4000)) {
            errorCategory = 'PAYLOAD_TOO_LARGE (Immagine/Documento troppo pesante)';
        } else if (errLower.includes('json') || errLower.includes('schema') || errLower.includes('parse')) {
            errorCategory = 'JSON_PARSING_ERROR (Formato risposta non conforme)';
        } else if (errLower.includes('timeout') || errLower.includes('deadline')) {
            errorCategory = 'TIMEOUT (Tempo limite richiesta superato)';
        }

        const metaStr = metadata ? ` | Metadata: ${JSON.stringify(metadata)}` : '';
        
        const logEntry = `[${timestamp}] [CATEGORIA: ${errorCategory}] [SERVIZIO: ${service}] [MODELLO: ${model}]${metaStr}\nDETTAGLIO ERRORE: ${errorMessage}${stack}\n--------------------------------------------------\n`;
        
        fs.appendFileSync(filePath, logEntry, 'utf8');
        console.error(`[AI Log Intercettato] [${service}] [${errorCategory}] Modello: ${model} | Errore: ${errorMessage.substring(0, 120)}`);
    } catch (e) {
        console.error("[AiLogger] Impossibile scrivere il log:", e);
    }
}

export function readAiLogs(maxEntries = 200): string {
    try {
        const filePath = getLogFilePath();
        if (!fs.existsSync(filePath)) {
            return "Nessun errore registrato nel log. Il sistema opera correttamente!";
        }
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) {
            return "Nessun errore registrato nel log. Il sistema opera correttamente!";
        }
        const entries = content.split('--------------------------------------------------\n');
        const recentEntries = entries.slice(-maxEntries).filter(e => e.trim().length > 0);
        return recentEntries.join('--------------------------------------------------\n') + (recentEntries.length > 0 ? '--------------------------------------------------\n' : '');
    } catch (e: any) {
        return `Errore durante la lettura del file di log: ${e.message}`;
    }
}

export function getAiLogStats() {
    try {
        const filePath = getLogFilePath();
        if (!fs.existsSync(filePath)) {
            return {
                exists: false,
                sizeBytes: 0,
                sizeFormatted: '0 KB',
                maxSizeBytes: MAX_LOG_FILE_SIZE_BYTES,
                maxSizeFormatted: '10 MB',
                percentUsed: 0,
                totalEntries: 0,
                lastModified: null,
                filePath,
            };
        }
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const entries = content.split('--------------------------------------------------\n').filter(e => e.trim().length > 0);
        
        const sizeKB = (stats.size / 1024).toFixed(1);
        const sizeFormatted = stats.size >= 1024 * 1024 
            ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB` 
            : `${sizeKB} KB`;

        const percentUsed = Math.min(100, Number(((stats.size / MAX_LOG_FILE_SIZE_BYTES) * 100).toFixed(1)));

        return {
            exists: true,
            sizeBytes: stats.size,
            sizeFormatted,
            maxSizeBytes: MAX_LOG_FILE_SIZE_BYTES,
            maxSizeFormatted: '10 MB',
            percentUsed,
            totalEntries: entries.length,
            lastModified: stats.mtime.toISOString(),
            filePath,
        };
    } catch (e) {
        return {
            exists: false,
            sizeBytes: 0,
            sizeFormatted: '0 KB',
            maxSizeBytes: MAX_LOG_FILE_SIZE_BYTES,
            maxSizeFormatted: '10 MB',
            percentUsed: 0,
            totalEntries: 0,
            lastModified: null,
            filePath: getLogFilePath(),
        };
    }
}

export function clearAiLogs(): boolean {
    try {
        const filePath = getLogFilePath();
        if (fs.existsSync(filePath)) {
            const resetHeader = `[${new Date().toISOString()}] [SYSTEM] File di log azzerato manualmente dall'utente.\n--------------------------------------------------\n`;
            fs.writeFileSync(filePath, resetHeader, 'utf8');
        }
        return true;
    } catch (e) {
        console.error("[AiLogger] Errore azzeramento log:", e);
        return false;
    }
}
