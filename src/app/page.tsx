import { CampaignManager } from '@/components/campaign-manager';
import db, { dbPath, getAppSetting, setAppSetting } from '@/lib/db';
import { getSystemSettings } from '@/lib/actions';
import { getResolvedCompendia } from '@/lib/compendium-data';
import type { MagicItem, Monster, Spell, Skill, CampaignWithRelations, Session, Campaign, PlayerCharacter, LetterPreset, Shop, WorldLocation, Npc, Combat, StoryArc, LoreEntry, HomebrewRule } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getCampaignsData(activeCampaignId?: string): Promise<{ 
    campaigns: Campaign[], 
    activeCampaign: Campaign | null,
    activeArc: StoryArc | null,
    sessions: Session[], 
    magicItems: MagicItem[], 
    monsters: Monster[], 
    playerCharacters: PlayerCharacter[], 
    customSpells: Spell[], 
    customSkills: Skill[],
    possessedItems: string[],
    letterPresets: LetterPreset[],
    shops: Shop[],
    worldLocations: WorldLocation[],
    npcs: Npc[],
    combats: Combat[],
    loreEntries: LoreEntry[],
    homebrewRules: HomebrewRule[]
}> {
    let attempts = 0;
    while (attempts < 3) {
        attempts++;
        try {
            const allCampaigns = db.prepare('SELECT * FROM Campaign ORDER BY updatedAt DESC').all() as Campaign[];
            const campaigns = allCampaigns.filter(c => c.id !== 'system');
            const letterPresets = db.prepare('SELECT * FROM LetterPreset ORDER BY createdAt DESC').all() as LetterPreset[];
            
            if (!campaigns || campaigns.length === 0) {
                return { campaigns: [], activeCampaign: null, activeArc: null, sessions: [], magicItems: [], monsters: [], playerCharacters: [], customSpells: [], customSkills: [], possessedItems: [], letterPresets, shops: [], worldLocations: [], npcs: [], combats: [], loreEntries: [], homebrewRules: [] };
            }

            let activeCampaignData: Campaign | undefined;
            if (activeCampaignId) {
                activeCampaignData = campaigns.find(c => c.id === activeCampaignId);
            }
            
            if (!activeCampaignData && campaigns.length > 0) {
                activeCampaignData = campaigns[0];
            }

            let activeArc: StoryArc | null = null;
            if (activeCampaignData) {
                try {
                    activeArc = db.prepare("SELECT * FROM StoryArc WHERE campaignId = ? AND status = 'active'").get(activeCampaignData.id) as StoryArc || null;
                    if (!activeArc) {
                        activeArc = db.prepare("SELECT * FROM StoryArc WHERE campaignId = ? ORDER BY createdAt DESC LIMIT 1").get(activeCampaignData.id) as StoryArc || null;
                    }
                } catch (arcErr) {
                    console.warn("[DB] Errore recupero StoryArc, fallback a null:", arcErr);
                    activeArc = null;
                }
            }

            // Recupero sessioni Dashboard: diamo priorità all'arco attivo, ma se vuoto recuperiamo tutte le non archiviate della campagna
            let sessions: Session[] = [];
            if (activeCampaignData) {
                try {
                    if (activeArc) {
                        sessions = db.prepare('SELECT * FROM Session WHERE campaignId = ? AND arcId = ? AND is_archived = 0 ORDER BY session_number ASC').all(activeCampaignData.id, activeArc.id) as Session[];
                    }
                    if (sessions.length === 0) {
                        sessions = db.prepare('SELECT * FROM Session WHERE campaignId = ? AND is_archived = 0 ORDER BY session_number ASC').all(activeCampaignData.id) as Session[];
                    }
                } catch (sessErr) {
                    console.warn("[DB] Errore recupero Sessioni:", sessErr);
                    sessions = [];
                }
            }

            const magicItems = activeCampaignData ? db.prepare("SELECT * FROM MagicItem WHERE campaignId = ? OR campaignId = 'system' OR campaignId IS NULL").all(activeCampaignData.id) as MagicItem[] : [];
            const monsters = activeCampaignData ? db.prepare("SELECT * FROM Monster WHERE campaignId = ? OR campaignId = 'system' OR campaignId IS NULL").all(activeCampaignData.id) as Monster[] : [];
            const playerCharacters = activeCampaignData ? db.prepare('SELECT * FROM PlayerCharacter WHERE campaignId = ? ORDER BY name ASC').all(activeCampaignData.id) as PlayerCharacter[] : [];
            const customSpells = activeCampaignData ? db.prepare("SELECT * FROM CustomSpell WHERE campaignId = ? OR campaignId = 'system' OR campaignId IS NULL").all(activeCampaignData.id) as Spell[] : [];
            const customSkills = activeCampaignData ? db.prepare("SELECT * FROM CustomSkill WHERE campaignId = ? OR campaignId = 'system' OR campaignId IS NULL").all(activeCampaignData.id) as Skill[] : [];
            const possessedItems = activeCampaignData ? db.prepare('SELECT itemName FROM PossessedItems WHERE campaignId = ?').all(activeCampaignData.id) as { itemName: string }[] : [];
            const shops = activeCampaignData ? db.prepare('SELECT * FROM Shop WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as Shop[] : [];
            const worldLocations = activeCampaignData ? db.prepare('SELECT * FROM WorldLocation WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as WorldLocation[] : [];
            const npcs = activeCampaignData ? db.prepare('SELECT * FROM Npc WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as Npc[] : [];
            const combats = activeCampaignData ? db.prepare('SELECT * FROM Combat WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as Combat[] : [];
            const loreEntries = activeCampaignData ? db.prepare('SELECT * FROM LoreEntry WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as LoreEntry[] : [];
            let homebrewRules: HomebrewRule[] = [];
            if (activeCampaignData) {
                try {
                    homebrewRules = db.prepare('SELECT * FROM HomebrewRule WHERE campaignId = ? ORDER BY updatedAt DESC').all(activeCampaignData.id) as HomebrewRule[];
                } catch {
                    homebrewRules = [];
                }
            }
            
            return { campaigns, activeCampaign: activeCampaignData || null, activeArc: activeArc || null, sessions, magicItems, monsters, playerCharacters, customSpells, customSkills, possessedItems: possessedItems.map(i => i.itemName), letterPresets, shops, worldLocations, npcs, combats, loreEntries, homebrewRules };

        } catch (error) {
            console.error(`[DB getCampaignsData] Tentativo ${attempts}/3 fallito:`, error);
            if (attempts < 3) {
                await new Promise(r => setTimeout(r, 120 * attempts));
            } else {
                return { campaigns: [], activeCampaign: null, activeArc: null, sessions: [], magicItems: [], monsters: [], playerCharacters: [], customSpells: [], customSkills: [], possessedItems: [], letterPresets: [], shops: [], worldLocations: [], npcs: [], combats: [], loreEntries: [], homebrewRules: [] };
            }
        }
    }
    return { campaigns: [], activeCampaign: null, activeArc: null, sessions: [], magicItems: [], monsters: [], playerCharacters: [], customSpells: [], customSkills: [], possessedItems: [], letterPresets: [], shops: [], worldLocations: [], npcs: [], combats: [], loreEntries: [], homebrewRules: [] };
}

export default async function Page(props: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  
  const campaignId = typeof searchParams?.campaignId === 'string' ? searchParams.campaignId : undefined;
  const initialView = typeof searchParams?.view === 'string' ? searchParams.view : undefined;

  const { campaigns, activeCampaign, activeArc, sessions, magicItems: createdMagicItems, monsters: createdMonsters, playerCharacters, customSpells, customSkills, possessedItems, letterPresets, shops, worldLocations, npcs, combats, loreEntries, homebrewRules } = await getCampaignsData(campaignId);
  const dbSettings = await getSystemSettings();

  const compendia = getResolvedCompendia({
    createdItems: createdMagicItems,
    createdMonsters: createdMonsters,
    customSpells: customSpells || [],
    customSkills: customSkills || [],
  });

  const activeCampaignWithRelations: CampaignWithRelations | null = activeCampaign ? {
    ...activeCampaign,
    activeArc,
    sessions,
    magicItems: createdMagicItems,
    monsters: createdMonsters,
    playerCharacters,
    worldLocations,
    npcs,
    combats,
    loreEntries,
    homebrewRules
  } : null;

  return (
    <CampaignManager
      campaigns={campaigns}
      activeCampaign={activeCampaignWithRelations}
      initialView={initialView}
      sessions={sessions ?? []}
      possessedItems={possessedItems}
      letterPresets={letterPresets}
      shops={shops}
      worldLocations={worldLocations}
      npcs={npcs}
      combats={combats}
      customSpells={customSpells}
      customSkills={customSkills}
      dbSettings={dbSettings}
      dbMagicItems={compendia.dbMagicItems}
      dbMonsters={compendia.dbMonsters}
      dbSpells={compendia.dbSpells}
      allArmor={compendia.allArmor}
      allWeapons={compendia.allWeapons}
      magicArmor={compendia.magicArmor}
      magicWeapons={compendia.magicWeapons}
      skills={compendia.skills}
      allItems={compendia.allItems}
    />
  );
}
