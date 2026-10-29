import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const actionResponse = <T>(data: T | null, error?: string) => {
  if (error) return { success: false, data: null, error };
  return { success: true, data, error: null };
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// --- HELPER COMPENDIO E NORMALIZZAZIONE ---

export function extractBaseName(name: string): string {
  if (!name) return '';
  // Rimuove prefissi del tipo "Demone: Mane" -> "Mane", "Spada: Spada di Fuoco" -> "Spada di Fuoco"
  const cleaned = name.replace(/^[^:]+:\s*/, '').trim();
  return cleaned || name.trim();
}

export function normalizeCompendiumName(name: string): string {
  if (!name) return '';
  let cleaned = extractBaseName(name);

  const knownFuzzyMap: Record<string, string> = {
    'herozu': 'hezrou',
    'herzrou': 'hezrou',
    'hezerou': 'hezrou',
    'vrock': 'vrock',
    'glabrezu': 'glabrezu',
    'marilith': 'marilith',
    'nalfeshnee': 'nalfeshnee',
    'goristro': 'goristro',
    'chasme': 'chasme',
    'dretch': 'dretch',
    'barlgura': 'barlgura',
    'shadow demon': 'demone delle ombre',
    'quasit': 'quasit',
    'succubus': 'succube',
    'incubus': 'incube'
  };

  const lower = cleaned.toLowerCase().trim();
  if (knownFuzzyMap[lower]) {
    cleaned = knownFuzzyMap[lower];
  }

  return cleaned
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ck/g, 'k')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
