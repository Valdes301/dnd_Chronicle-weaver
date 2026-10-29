import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getAppSetting } from '@/lib/db';
import { safeGenerateContent } from './genai-client';

export { z };

/**
 * @fileOverview Configurazione centralizzata Genkit e Google GenAI con Multi-Key Pooling.
 * Distribuisce il carico su diverse chiavi API per massimizzare le quote gratuite.
 */

export const getValidKey = (specificKeyEnv?: string): string | undefined => {
    const keys = [
        specificKeyEnv ? process.env[specificKeyEnv] : undefined,
        process.env.GEMINI_API_KEY,
        process.env.GOOGLE_GENAI_API_KEY,
        process.env.GOOGLE_API_KEY,
        process.env.NEXT_PUBLIC_GEMINI_API_KEY
    ];

    for (const k of keys) {
        if (!k) continue;
        const clean = k.trim();
        
        const invalid = [
            '', 
            'tua_chiave_qui', 
            'undefined', 
            'null', 
            'your_key_here', 
            '<your_key_here>',
            'insert_key_here'
        ];
        
        if (clean && !invalid.includes(clean.toLowerCase()) && !clean.startsWith('YOUR_')) {
            // Keep environment variables synced
            if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = clean;
            if (!process.env.GOOGLE_GENAI_API_KEY) process.env.GOOGLE_GENAI_API_KEY = clean;
            return clean;
        }
    }
    return undefined;
};

/**
 * Risolve dinamicamente il modello configurato dall'utente per Genkit.
 */
export const getActiveGenkitModel = (serviceName?: string): string => {
  let modelName = 'gemini-3.8-flash';
  if (serviceName) {
    try {
      const sectionSaved = getAppSetting(`model_service_${serviceName}`);
      if (sectionSaved && sectionSaved.trim() && sectionSaved.trim() !== 'default') {
        modelName = sectionSaved.trim();
        return modelName.startsWith('googleai/') ? modelName : `googleai/${modelName}`;
      }
    } catch {}
  }
  try {
    const saved = getAppSetting('active_ai_model');
    if (saved && saved.trim()) {
      modelName = saved.trim();
    } else if (process.env.GEMINI_FLASH_MODEL) {
      modelName = process.env.GEMINI_FLASH_MODEL;
    }
  } catch {}
  return modelName.startsWith('googleai/') ? modelName : `googleai/${modelName}`;
};

export const DEFAULT_GENKIT_FLASH_MODEL = getActiveGenkitModel();

function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[p];
  }
  return curr;
}

function renderTemplate(template: string, data: Record<string, any>): string {
  if (!template) return '';
  let result = template;

  // Handle {{#if key}}thenBlock{{else}}elseBlock{{/if}}
  result = result.replace(
    /\{\{#if\s+([\w\.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, key, thenBlock, elseBlock) => {
      const val = getNestedValue(data, key);
      const isTruthy = Array.isArray(val) ? val.length > 0 : Boolean(val);
      return isTruthy ? thenBlock : (elseBlock || '');
    }
  );

  // Handle {{{key}}} or {{key}}
  result = result.replace(/\{\{\{?([\w\.]+)\}?\}\}/g, (_, key) => {
    const val = getNestedValue(data, key);
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });

  return result;
}

export class GenkitAdapter {
  private serviceName: string;
  private envVar: string;
  public options: any;

  constructor(serviceNameOrConfig?: any, envVar?: string) {
    if (typeof serviceNameOrConfig === 'string') {
      this.serviceName = serviceNameOrConfig;
      this.envVar = envVar || 'GEMINI_API_KEY';
    } else {
      this.serviceName = 'DEFAULT';
      this.envVar = 'GEMINI_API_KEY';
    }
    this.options = { model: getActiveGenkitModel(this.serviceName) };
  }

  definePrompt(options: {
    name?: string;
    input?: { schema?: z.ZodTypeAny };
    output?: { schema?: z.ZodTypeAny };
    config?: any;
    prompt: string | ((input: any) => string);
  }) {
    const self = this;
    return async function promptCallable(input: any) {
      const apiKey = getValidKey(self.envVar);
      const ai = new GoogleGenAI({ apiKey });
      let rawModel = (input && input.selectedModel) || self.options?.model || getActiveGenkitModel(self.serviceName);
      const model = rawModel.replace(/^googleai\//, '') || 'gemini-3.8-flash';

      const promptText = typeof options.prompt === 'function' ? options.prompt(input) : renderTemplate(options.prompt, input || {});

      const reqConfig: any = {
        model,
        contents: promptText,
      };

      if (options.output?.schema) {
        reqConfig.config = {
          responseMimeType: 'application/json',
        };
      }

      const res = await safeGenerateContent(ai, reqConfig, self.serviceName);
      const responseText = res.text || '';

      let parsedOutput: any = null;
      if (options.output?.schema) {
        try {
          const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const json = JSON.parse(cleanedText);
          parsedOutput = options.output.schema.parse(json);
        } catch {
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
              const json = JSON.parse(jsonMatch[0]);
              parsedOutput = options.output.schema.parse(json);
            } else {
              parsedOutput = responseText;
            }
          } catch {
            parsedOutput = responseText;
          }
        }
      } else {
        parsedOutput = responseText;
      }

      return {
        text: responseText,
        output: parsedOutput,
      };
    };
  }

  defineFlow(
    config: { name: string; inputSchema?: z.ZodTypeAny; outputSchema?: z.ZodTypeAny },
    fn: (input: any) => Promise<any>
  ) {
    return async function flowCallable(input: any) {
      if (config.inputSchema) {
        try {
          input = config.inputSchema.parse(input);
        } catch {
          // Keep raw input if schema parse fails
        }
      }
      const result = await fn(input);
      if (config.outputSchema && result) {
        try {
          return config.outputSchema.parse(result);
        } catch {
          return result;
        }
      }
      return result;
    };
  }

  async generate(options: {
    prompt: string | any[];
    model?: string;
    config?: any;
  }) {
    const apiKey = getValidKey(this.envVar);
    const ai = new GoogleGenAI({ apiKey });
    let model = options.model || this.options?.model || getActiveGenkitModel(this.serviceName);
    model = model.replace(/^googleai\//, '') || 'gemini-3.8-flash';

    const reqConfig: any = {
      model,
      contents: Array.isArray(options.prompt) ? options.prompt : [{ text: options.prompt }],
    };

    if (options.config) {
      reqConfig.config = options.config;
    }

    const res = await safeGenerateContent(ai, reqConfig, this.serviceName);
    return {
      text: res.text || '',
    };
  }
}

export function googleAI(config?: any) {
  return config;
}

export function genkit(config?: any) {
  return new GenkitAdapter(config);
}

const createAiInstance = (serviceName: string, envVar: string) => {
    return new GenkitAdapter(serviceName, envVar);
};

// Istanze separate per pooling di quote (RPM/RPD)
export const storyAi = createAiInstance('STORY', 'GEMINI_API_KEY_STORY');
export const summaryAi = createAiInstance('SUMMARY', 'GEMINI_API_KEY_SUMMARY');
export const shopAi = createAiInstance('SHOPS', 'GEMINI_API_KEY_SHOPS');
export const worldAi = createAiInstance('WORLD', 'GEMINI_API_KEY_WORLD');
export const extractionAi = createAiInstance('EXTRACTION', 'GEMINI_API_KEY_EXTRACTION');
export const catalogAi = createAiInstance('IMPORT', 'GEMINI_API_KEY_IMPORT');

export function updateGenkitActiveModel(modelName: string) {
  const formatted = modelName.startsWith('googleai/') ? modelName : `googleai/${modelName}`;
  const instances = [storyAi, summaryAi, shopAi, worldAi, extractionAi, catalogAi];
  for (const inst of instances) {
    if (inst && (inst as any).options) {
      (inst as any).options.model = formatted;
    }
  }
}

// Istanza predefinita per compatibilità
export const ai = storyAi;
