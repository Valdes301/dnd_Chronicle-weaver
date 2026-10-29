import equipmentData from '@/lib/dnd-data/equipment.json';
import magicItemData from '@/lib/dnd-data/magic-items.json';
import commonItemData from '@/lib/dnd-data/common-items.json';
import monsterData from '@/lib/dnd-data/monsters.json';
import spellData from '@/lib/dnd-data/spells.json';
import skillsData from '@/lib/dnd-data/skills.json';
import type { MagicItem, Monster, Spell, Weapon, Armor, Skill } from '@/lib/types';

export function getLiveCustomSystemData<T>(fileName: string, key: string): T[] {
  if (typeof window === 'undefined') {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const baseDir = process.env.DATABASE_URL 
        ? path.dirname(process.env.DATABASE_URL.replace('file:', '')) 
        : path.join(process.cwd(), 'data');

      const persistentPath = path.join(baseDir, 'system', fileName);
      if (fs.existsSync(persistentPath)) {
        const raw = fs.readFileSync(persistentPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }

      const cwdDataPath = path.join(process.cwd(), 'data', 'system', fileName);
      if (fs.existsSync(cwdDataPath)) {
        const raw = fs.readFileSync(cwdDataPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }
      
      const fallbackPath = path.join(process.cwd(), 'src', 'lib', 'dnd-data', fileName);
      if (fs.existsSync(fallbackPath)) {
        const raw = fs.readFileSync(fallbackPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }
    } catch (err) {
      console.error(`[Compendium Helper] Errore lettura file di sistema ${fileName}:`, err);
    }
  }
  return [];
}

export const getBaseSpells = (): Spell[] => {
  const map = new Map<string, Spell>();

  // 1. Try DB first (Consolidated data)
  if (typeof window === 'undefined') {
    try {
      const db = require('./db').default;
      const dbSpells = db.prepare("SELECT * FROM CustomSpell WHERE campaignId = 'system'").all() as any[];
      if (dbSpells.length > 0) {
        dbSpells.forEach(s => {
          map.set(s.name.toLowerCase().trim(), { ...s, source: 'base' as const });
        });
        return Array.from(map.values());
      }
    } catch (e) {}
  }

  // 2. Fallback to JSON
  for (const s of (spellData.spells as any[])) {
    if (s && s.name) {
      map.set(s.name.toLowerCase().trim(), { ...s, source: 'base' as const });
    }
  }
  for (const s of getLiveCustomSystemData<Spell>('custom-spells.json', 'spells')) {
    if (s && s.name) {
      map.set(s.name.toLowerCase().trim(), { ...s, source: 'base' as const });
    }
  }
  return Array.from(map.values());
};

export const allArmor: Armor[] = equipmentData.armor as Armor[];
export const allWeapons: Weapon[] = equipmentData.weapons as Weapon[];

export const getBaseSkills = (): Skill[] => {
  // Try DB first
  if (typeof window === 'undefined') {
    try {
      const db = require('./db').default;
      const dbSkills = db.prepare("SELECT * FROM CustomSkill WHERE campaignId = 'system'").all() as any[];
      if (dbSkills.length > 0) {
        return dbSkills.map(s => ({ ...s, source: 'base' as const }));
      }
    } catch (e) {}
  }
  return (skillsData.skills as any[]).map(s => ({ ...s, source: 'base' as const }));
};

export const getBaseItems = (): MagicItem[] => {
  const map = new Map<string, MagicItem>();

  // 1. Try DB first
  if (typeof window === 'undefined') {
    try {
      const db = require('./db').default;
      const dbItems = db.prepare("SELECT * FROM MagicItem WHERE campaignId = 'system'").all() as any[];
      if (dbItems.length > 0) {
        dbItems.forEach(i => {
          map.set(i.name.toLowerCase().trim(), { ...i, source: 'base' as const });
        });
        return Array.from(map.values());
      }
    } catch (e) {}
  }

  const rawBase = [
    ...(commonItemData.commonItems as MagicItem[]),
    ...magicItemData.magicItems,
    ...((equipmentData as any).magicArmor || []),
    ...((equipmentData as any).magicWeapons || []),
  ];
  for (const i of rawBase) {
    if (i && i.name) {
      map.set(i.name.toLowerCase().trim(), { ...i, source: 'base' as const });
    }
  }
  for (const i of getLiveCustomSystemData<MagicItem>('custom-items.json', 'items')) {
    if (i && i.name) {
      map.set(i.name.toLowerCase().trim(), { ...i, source: 'base' as const });
    }
  }
  return Array.from(map.values());
};

export function getDeletedMonsters(): string[] {
  return getLiveCustomSystemData<string>('deleted-monsters.json', 'deletedMonsters').map(s => (s || '').toLowerCase().trim());
}

export const getBaseMonsters = (): Monster[] => {
  const deleted = getDeletedMonsters();
  const map = new Map<string, Monster>();

  // 1. Try DB first
  if (typeof window === 'undefined') {
    try {
      const db = require('./db').default;
      const dbMonsters = db.prepare("SELECT * FROM Monster WHERE campaignId = 'system'").all() as any[];
      if (dbMonsters.length > 0) {
        dbMonsters.forEach(m => {
          map.set(m.name.toLowerCase().trim(), { ...m, source: 'base' as const });
        });
        return Array.from(map.values()).filter(m => m && m.name && !deleted.includes(m.name.toLowerCase().trim()));
      }
    } catch (e) {}
  }
  
  for (const m of (monsterData.monsters as unknown as Monster[])) {
    if (m && m.name) {
      map.set(m.name.toLowerCase().trim(), { ...m, source: 'base' as const });
    }
  }
  for (const m of getLiveCustomSystemData<Monster>('custom-monsters.json', 'monsters')) {
    if (m && m.name) {
      map.set(m.name.toLowerCase().trim(), { ...m, source: 'base' as const });
    }
  }
  return Array.from(map.values()).filter(m => m && m.name && !deleted.includes(m.name.toLowerCase().trim()));
};

export const baseSpells: Spell[] = getBaseSpells();
export const baseSkills: Skill[] = getBaseSkills();
export const baseItems: MagicItem[] = getBaseItems();
export const baseMonsters: Monster[] = getBaseMonsters();

export const uniqueByName = <T extends { name: string; source?: 'base' | 'created' }>(baseItems: T[], createdItems: T[]): T[] => {
  const map = new Map<string, T>();
  for (const item of createdItems) {
    if (item && item.name) {
      map.set(item.name.toLowerCase().trim(), { ...item, source: 'created' as const });
    }
  }
  for (const item of baseItems) {
    if (item && item.name) {
      const key = item.name.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { ...item, source: 'base' as const });
      }
    }
  }
  return Array.from(map.values());
};

export function getResolvedCompendia(params: {
  createdItems?: MagicItem[];
  createdMonsters?: Monster[];
  customSpells?: Spell[];
  customSkills?: Skill[];
}) {
  const liveBaseItems = getBaseItems();
  const liveBaseMonsters = getBaseMonsters();
  const liveBaseSpells = getBaseSpells();
  const liveBaseSkills = getBaseSkills();
  const deleted = getDeletedMonsters();

  const mappedCreatedItems = (params.createdItems || []).map(i => ({
    ...i,
    type: i.type ?? 'Oggetto meraviglioso',
    rarity: i.rarity ?? 'Comune',
    attunement: i.attunement ?? 'No',
    description: i.description ?? '',
    cost: i.cost ?? 'N/D',
    damage: i.damage ?? '',
    techType: i.techType ?? 'damage',
    imageUrl: i.imageUrl || '',
    source: 'created' as const,
  }));

  const allItems = uniqueByName(liveBaseItems, mappedCreatedItems);
  const allMonsters = uniqueByName(
    liveBaseMonsters,
    (params.createdMonsters || []).map(m => ({
      ...m,
      type: m.type ?? '',
      armorClass: m.armorClass ?? '',
      hitPoints: m.hitPoints ?? '',
      challenge: m.challenge ?? '',
      description: m.description ?? '',
      imageUrl: m.imageUrl || '',
      thumbnailUrl: (m as any).thumbnailUrl || (m as any).thumbnailurl || m.imageUrl || '',
      source: 'created' as const,
    }))
  ).filter(m => m && m.name && !deleted.includes(m.name.toLowerCase().trim()));
  const allSpells = uniqueByName(
    liveBaseSpells,
    (params.customSpells || []).map(s => ({
      ...s,
      level: s.level ?? '',
      school: s.school ?? '',
      casting_time: s.casting_time ?? '',
      range: s.range ?? '',
      components: s.components ?? '',
      duration: s.duration ?? '',
      description: s.description ?? '',
      classes: s.classes ?? '',
      source: 'created' as const,
    }))
  );
  const allSkills = uniqueByName(
    liveBaseSkills,
    (params.customSkills || []).map(s => ({
      ...s,
      ability: s.ability ?? '',
      description: s.description ?? '',
      source: 'created' as const,
    }))
  );

  const itemsForDb = allItems.filter(
    i => !['Armatura', 'Arma', 'Scudo'].some(type => (i.type || '').toLowerCase().includes(type.toLowerCase()))
  );
  const magicArmor = allItems.filter(
    i => (i.type || '').toLowerCase().includes('armatura') || (i.type || '').toLowerCase().includes('scudo')
  );
  const magicWeapons = allItems.filter(i => (i.type || '').toLowerCase().includes('arma'));

  return {
    allItems,
    dbMagicItems: itemsForDb,
    dbMonsters: allMonsters,
    dbSpells: allSpells,
    allArmor,
    allWeapons,
    magicArmor,
    magicWeapons,
    skills: allSkills,
  };
}
