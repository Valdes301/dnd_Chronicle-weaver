'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Campaign, CampaignWithRelations, Session, MagicItem, Monster, Spell, Skill, PlayerCharacter, Weapon, Armor, LetterPreset, Shop, WorldLocation, Npc, Combat } from '@/lib/types';
import { CampaignHub } from '@/components/campaign-hub';
import { 
    createCampaign, 
    updateCampaignInfo, 
    importSession, 
    summarizeCampaign, 
    updateSessionTitle, 
    updateSessionNumber, 
    updateSessionNotes, 
    deleteSession, 
    reorderSessions, 
    updateSessionXp, 
    toggleSessionReadStatus, 
    clearSessionLoot, 
    savePlayerCharacter, 
    deletePlayerCharacter, 
    saveSkill, 
    deleteSkill, 
    toggleItemPossession, 
    saveMagicItem, 
    deleteMagicItem, 
    saveMonster, 
    deleteMonster, 
    saveSpell, 
    deleteSpell,
    restoreBackupData, 
    uploadBatchImages, 
    getBackupData, 
    getAssetsBackup 
} from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { getResolvedCompendia } from '@/lib/compendium-data';
import { 
    Check, 
    Loader2, 
    Beer, 
    LibraryBig, 
    Hammer, 
    Library, 
    BrainCircuit, 
    Shield, 
    Sparkles, 
    Skull, 
    Wand, 
    Map, 
    Mail, 
    Store, 
    MapPin, 
    UserCircle, 
    Sword, 
    LayoutGrid,
    Palette,
    Settings,
    Pencil,
    ChevronsUpDown,
    Users,
    BookMarked,
    BookOpen,
    Compass,
    Trophy,
    ArrowLeft,
    Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarProvider, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { SidebarNav } from './sidebar-nav';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Icons } from './icons';
import { QuickLockButton } from './quick-lock-button';
import { PlayerModeToggle } from './player-mode-toggle';
import { 
  getBackgroundSettings, 
  DEFAULT_BACKGROUND_SETTINGS,
  resolveBackgroundStyle, 
  BackgroundConfig 
} from '@/lib/background-storage';
import { BlockedViewShield } from './blocked-view-shield';
import { getIsLocked, touchActivity, checkAutoLockExpiry, isPlayerMode, getBlockedViews, isPinConfigured, DEFAULT_BLOCKED_VIEWS } from '@/lib/pin-storage';
import { DeviceSyncProvider } from './device-sync-provider';
import { SystemPanel } from './system-panel';

const ToolLoadingFallback = () => (
  <div className="p-8 flex flex-col items-center justify-center min-h-[220px] gap-2.5 text-muted-foreground animate-in fade-in duration-150">
    <Loader2 className="h-6 w-6 animate-spin text-amber-500/80" />
    <span className="text-xs uppercase tracking-wider font-mono text-stone-400">Caricamento...</span>
  </div>
);

async function safeImport<T>(importFn: () => Promise<T>, retries = 3, delay = 400): Promise<T> {
  try {
    return await importFn();
  } catch (err: any) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return safeImport(importFn, retries - 1, delay * 1.5);
    }
    // If it's a chunk load error after retries, trigger a reload to fetch the latest bundles
    if (typeof window !== 'undefined' && (err?.name === 'ChunkLoadError' || err?.message?.includes('Loading chunk') || err?.message?.includes('Unexpected token'))) {
      const reloadKey = 'dnd_chunk_reload_attempt';
      const lastAttempt = sessionStorage.getItem(reloadKey);
      if (!lastAttempt || Date.now() - Number(lastAttempt) > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
      }
    }
    throw err;
  }
}

// Standard dynamic imports with safe fallback
const EquipmentDb = dynamic(() => safeImport(() => import('./equipment-db')).then(m => m.EquipmentDb), { ssr: false, loading: ToolLoadingFallback });
const MonstersDb = dynamic(() => safeImport(() => import('./monsters-db')).then(m => m.MonstersDb), { ssr: false, loading: ToolLoadingFallback });
const SpellsDb = dynamic(() => safeImport(() => import('./spells-db')).then(m => m.SpellsDb), { ssr: false, loading: ToolLoadingFallback });
const SkillsDb = dynamic(() => safeImport(() => import('./skills-db')).then(m => m.SkillsDb), { ssr: false, loading: ToolLoadingFallback });
const MapGenerator = dynamic(() => safeImport(() => import('./map-generator')).then(m => m.MapGenerator), { ssr: false, loading: ToolLoadingFallback });
const ContentImporterNew = dynamic(() => safeImport(() => import('./content-importer-new')).then(m => m.ContentImporterNew), { ssr: false, loading: ToolLoadingFallback });
const ManualeDb = dynamic(() => safeImport(() => import('./manuale-db')).then(m => m.ManualeDb), { ssr: false, loading: ToolLoadingFallback });
const UnifiedCardGenerator = dynamic(() => safeImport(() => import('./unified-card-generator')).then(m => m.UnifiedCardGenerator), { ssr: false, loading: ToolLoadingFallback });
const ExperimentalCardGenerator = dynamic(() => safeImport(() => import('./experimental-card-generator')).then(m => m.ExperimentalCardGenerator), { ssr: false, loading: ToolLoadingFallback });
const CardBackgroundUploader = dynamic(() => safeImport(() => import('./card-background-uploader')).then(m => m.CardBackgroundUploader), { ssr: false, loading: ToolLoadingFallback });
const LetterGenerator = dynamic(() => safeImport(() => import('./letter-generator')).then(m => m.LetterGenerator), { ssr: false, loading: ToolLoadingFallback });
const ShopManager = dynamic(() => safeImport(() => import('./shop-manager')).then(m => m.ShopManager), { ssr: false, loading: ToolLoadingFallback });
const WorldArchitect = dynamic(() => safeImport(() => import('./world-architect')).then(m => m.WorldArchitect), { ssr: false, loading: ToolLoadingFallback });
const NpcGenerator = dynamic(() => safeImport(() => import('./npc-generator')).then(m => m.NpcGenerator), { ssr: false, loading: ToolLoadingFallback });
const CombatGenerator = dynamic(() => safeImport(() => import('./combat-generator')).then(m => m.CombatGenerator), { ssr: false, loading: ToolLoadingFallback });
const TreasureGenerator = dynamic(() => safeImport(() => import('./treasure-generator')).then(m => m.TreasureGenerator), { ssr: false, loading: ToolLoadingFallback });
const NpcSummary = dynamic(() => safeImport(() => import('./npc-summary')).then(m => m.NpcSummary), { ssr: false, loading: ToolLoadingFallback });
const PlayerCharactersDb = dynamic(() => safeImport(() => import('./player-characters-db')).then(m => m.PlayerCharactersDb), { ssr: false, loading: ToolLoadingFallback });
const ArchiveView = dynamic(() => safeImport(() => import('./archive-view')).then(m => m.ArchiveView), { ssr: false, loading: ToolLoadingFallback });
const SettingsView = dynamic(() => safeImport(() => import('./settings-view')).then(m => m.SettingsView), { ssr: false, loading: ToolLoadingFallback });
const HomebrewCompendium = dynamic(() => safeImport(() => import('./homebrew-compendium')).then(m => m.HomebrewCompendium), { ssr: false, loading: ToolLoadingFallback });
const QuickImprovWidget = dynamic(() => safeImport(() => import('./quick-improv-widget')).then(m => m.QuickImprovWidget), { ssr: false, loading: ToolLoadingFallback });
const LoreView = dynamic(() => safeImport(() => import('./lore-view')).then(m => m.LoreView), { ssr: false, loading: ToolLoadingFallback });
const GranularQuestCreator = dynamic(() => safeImport(() => import('./dnd/granular-quest-creator')).then(m => m.GranularQuestCreator), { ssr: false, loading: ToolLoadingFallback });
const PartyXpManager = dynamic(() => safeImport(() => import('./dnd/party-xp-manager')).then(m => m.PartyXpManager), { ssr: false, loading: ToolLoadingFallback });
const OracoloAi = dynamic(() => safeImport(() => import('./oracolo-ai')).then(m => m.OracoloAi), { ssr: false, loading: ToolLoadingFallback });
const CampaignInitializer = dynamic(() => safeImport(() => import('@/components/campaign-initializer')).then(m => m.CampaignInitializer), { 
  ssr: false, 
  loading: () => <div className="p-12 flex justify-center items-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div> 
});
const CampaignDashboard = dynamic(() => safeImport(() => import('@/components/campaign-dashboard')).then(m => m.CampaignDashboard), { 
  ssr: false, 
  loading: () => <div className="p-12 flex justify-center items-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div> 
});
const LockOverlay = dynamic(() => safeImport(() => import('./lock-overlay')).then(m => m.LockOverlay), { ssr: false });
const PinConfigDialog = dynamic(() => safeImport(() => import('./pin-config-dialog')).then(m => m.PinConfigDialog), { ssr: false });

type CampaignManagerProps = {
  campaigns: Campaign[];
  activeCampaign: CampaignWithRelations | null;
  initialView?: string;
  sessions: Session[];
  dbMagicItems?: MagicItem[];
  dbMonsters?: Monster[];
  dbSpells?: Spell[];
  allArmor?: Armor[];
  allWeapons?: Weapon[];
  magicArmor?: MagicItem[];
  magicWeapons?: MagicItem[];
  skills?: Skill[];
  possessedItems: string[];
  allItems?: MagicItem[];
  letterPresets: LetterPreset[];
  shops: Shop[];
  worldLocations: WorldLocation[];
  npcs: Npc[];
  combats: Combat[];
  customSpells?: Spell[];
  customSkills?: Skill[];
  dbSettings?: Record<string, string>;
};

const VIEW_METADATA: Record<string, { title: string, desc: string, icon: any }> = {
    'quest-creator': { title: 'Crea Nuova Quest (Granulare)', desc: 'Generatore avanzato per storie, PG, PNG e agganci.', icon: Compass },
    'oracolo-ai': { title: 'Oracolo', desc: 'Chiedi consigli sulle regole 5e, storia dei Forgotten Realms e pianifica le tue quest.', icon: BrainCircuit },
    'party-xp': { title: 'Assegnazione PX Party (5e)', desc: 'Calcolo e distribuzione ufficiale dei Punti Esperienza.', icon: Trophy },
    'lore': { title: 'Lore & Ambientazione', desc: 'Dossier canonici, fazioni, città e cronologie.', icon: BookMarked },
    'personaggi': { title: 'Personaggi Giocanti', desc: 'Gestisci gli eroi della tua storia.', icon: Users },
    'taverna': { title: 'Taverna', desc: "L'Oste serve risposte e sussurra segreti...", icon: Beer },
    'biblioteca': { title: 'Biblioteca delle Cronache', desc: 'Ogni volume racchiude un\'era di gesta.', icon: LibraryBig },
    'riepilogo-png': { title: 'Anagrafe dei PNG', desc: 'Directory centrale dei personaggi incontrati.', icon: UserCircle },
    'homebrew': { title: 'Compendio Homebrew', desc: 'Regole della tua ambientazione e logiche IA.', icon: Hammer },
    'manuale': { title: 'Manuale di Gioco', desc: 'Consulta le regole del PHB, DMG e del Tesserato.', icon: BookOpen },
    'manuale-importa': { title: 'Importazione Intelligente', desc: 'Estrai dati tecnici dai tuoi manuali con scansione visiva e ritaglio token.', icon: Sparkles },
    'abilità': { title: 'Abilità', desc: 'Consulta il compendio delle capacità 5e.', icon: BrainCircuit },
    'equipaggiamento': { title: 'Armeria', desc: 'Armi, armature e strumenti d\'assedio (magici e non).', icon: Sword },
    'oggetti': { title: 'Oggetti', desc: 'Reliquie, pozioni, oggetti meravigliosi e attrezzatura varia.', icon: Package },
    'bestiario': { title: 'Bestiario', desc: 'Statistiche e illustrazioni delle creature.', icon: Skull },
    'magie': { title: 'Incantesimi', desc: 'Il grimorio arcano della campagna.', icon: Wand },
    'mappe': { title: 'Mappe', desc: 'Cartografia vettoriale generata dall\'IA.', icon: Map },
    'lettere': { title: 'Ordini e Lettere', desc: 'Crea pergamene e decreti realistici.', icon: Mail },
    'botteghe': { title: 'Botteghe ed Empori', desc: 'Mercanti unici e inventari speciali.', icon: Store },
    'architetto': { title: 'Architetto di Mondi', desc: 'Plasmare luoghi, atmosfere e segreti.', icon: MapPin },
    'anagrafe': { title: 'Emporio dei Volti', desc: 'Generare identità e psicologie profonde.', icon: UserCircle },
    'combattimenti': { title: 'Arena del Destino', desc: 'Configura scontri tattici bilanciati.', icon: Sword },
    'tesori': { title: 'Generatore di Tesori', desc: 'Crea bottini coerenti e memorabili.', icon: Sparkles },
    'layout-sperimentale': { title: 'Genera Carte Complete', icon: LayoutGrid, desc: 'Handout professionali per la stampa.' },
    'crea-carte': { title: 'Crea Carte', desc: 'Handout fisici per oggetti e magie.', icon: Hammer },
    'personalizza': { title: 'Personalizza Sfondi', desc: 'Gestisci le texture delle tue carte.', icon: Palette },
    'impostazioni': { title: 'Stato Sistema', desc: 'Verifica configurazione e chiavi API.', icon: Settings },
    'sistema': { title: 'Pannello di Sistema', desc: 'Sicurezza, backup, configurazione API e regole della campagna.', icon: Settings },
};

function ManagerContent(props: CampaignManagerProps & { initialView?: string; onOpenPinConfig?: () => void; onRequestNewCampaign?: () => void }) {
  const { 
    campaigns, activeCampaign, sessions, dbMagicItems, dbMonsters, dbSpells, 
    allArmor, allWeapons, magicArmor, magicWeapons, skills, possessedItems, 
    allItems, letterPresets, shops, worldLocations, npcs, combats, initialView, 
    onOpenPinConfig, onRequestNewCampaign, customSpells, customSkills, dbSettings 
  } = props;

  const router = useRouter();
  const { toast } = useToast();
  const { toggleSidebar } = useSidebar();

  const compendia = useMemo(() => {
    if (dbMagicItems && dbMonsters && dbSpells && allItems && skills) {
      return {
        dbMagicItems,
        dbMonsters,
        dbSpells,
        allArmor: allArmor || [],
        allWeapons: allWeapons || [],
        magicArmor: magicArmor || [],
        magicWeapons: magicWeapons || [],
        skills,
        allItems,
      };
    }
    return getResolvedCompendia({
      createdItems: activeCampaign?.magicItems,
      createdMonsters: activeCampaign?.monsters,
      customSpells: customSpells || [],
      customSkills: customSkills || [],
    });
  }, [
    dbMagicItems, dbMonsters, dbSpells, allItems, skills,
    allArmor, allWeapons, magicArmor, magicWeapons,
    activeCampaign?.magicItems, activeCampaign?.monsters, customSpells, customSkills
  ]);

  const [overlayView, setOverlayView] = useState<string | null>(
    initialView && initialView !== 'bacheca' && initialView !== 'nuova' ? initialView : null
  );
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);
  const [tempName, setTempName] = useState(activeCampaign?.name || '');
  const [tempSetting, setTempSetting] = useState(activeCampaign?.setting || '');
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [playerModeActive, setPlayerModeActive] = useState<boolean>(true);
  const [blockedViewsList, setBlockedViewsList] = useState<string[]>(DEFAULT_BLOCKED_VIEWS);
  const [mainBgConfig, setMainBgConfig] = useState<BackgroundConfig>(DEFAULT_BACKGROUND_SETTINGS.main);

  useEffect(() => {
    setMainBgConfig(getBackgroundSettings().main);
    setPlayerModeActive(isPlayerMode());
    setBlockedViewsList(getBlockedViews());

    if (typeof window !== 'undefined' && window.location.search.includes('view=nuova')) {
      const cleanUrl = window.location.pathname + (activeCampaign ? `?campaignId=${activeCampaign.id}` : '');
      window.history.replaceState({}, '', cleanUrl);
    }

    const handlePlayerModeChange = (e: any) => {
      setPlayerModeActive(Boolean(e.detail?.isPlayerMode));
    };
    const handleBlockedViewsChange = (e: any) => {
      setBlockedViewsList(e.detail?.blockedViews || []);
    };
    const handleBgChange = (e: any) => {
      if (e.detail?.main) {
        setMainBgConfig(e.detail.main);
      }
    };

    const handleDataUpdated = () => {
      router.refresh();
    };

    window.addEventListener('dnd-player-mode-changed', handlePlayerModeChange);
    window.addEventListener('dnd-blocked-views-changed', handleBlockedViewsChange);
    window.addEventListener('dnd-backgrounds-changed', handleBgChange);
    window.addEventListener('dnd-data-updated', handleDataUpdated);

    return () => {
      window.removeEventListener('dnd-player-mode-changed', handlePlayerModeChange);
      window.removeEventListener('dnd-blocked-views-changed', handleBlockedViewsChange);
      window.removeEventListener('dnd-backgrounds-changed', handleBgChange);
      window.removeEventListener('dnd-data-updated', handleDataUpdated);
    };
  }, [activeCampaign, router]);

  const isCurrentViewBlocked = (view: string) => {
    if (!playerModeActive) return false;
    return blockedViewsList.includes(view);
  };

  const handleUpdateCampaign = async () => {
      if (!activeCampaign) return;
      setIsSavingCampaign(true);
      try {
          const res = await updateCampaignInfo(activeCampaign.id, tempName, tempSetting);
          if (res.success) {
              toast({ title: "Dati Campagna Aggiornati!" });
              setIsEditingCampaign(false);
              router.refresh(); 
          } else throw new Error(res.error || "Errore");
      } catch (e: any) {
          toast({ variant: 'destructive', title: "Errore", description: e.message });
      } finally {
          setIsSavingCampaign(false);
      }
  };

  const wrapReload = useCallback((action: (...args: any[]) => Promise<any>) => async (...args: any[]) => {
      const res = await action(...args);
      if (res.success) router.refresh();
      else toast({ variant: 'destructive', title: 'Errore', description: res.error });
  }, [router, toast]);

  const handleViewChange = useCallback((v: string | null) => {
    setOverlayView(v);
  }, []);

  const handleNewCampaign = useCallback(() => {
    if (onRequestNewCampaign) {
      onRequestNewCampaign();
    } else {
      router.push(`/?campaignId=${activeCampaign?.id || ''}&view=nuova`);
    }
  }, [onRequestNewCampaign, router, activeCampaign?.id]);

  const handleBackupData = useCallback(async () => {
    const res = await getBackupData();
    if (res.success && res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      a.download = `dnd_backup-${dateStr}_${timeStr}.json`;
      a.click();
    }
  }, []);

  const renderToolContent = (view: string) => {
    if (!activeCampaign) return null;
    switch (view) {
        case 'quest-creator': 
          return (
            <GranularQuestCreator
              campaign={activeCampaign}
              onBackToStories={() => setOverlayView('storia')}
              onQuestSaved={() => {
                setOverlayView('storia');
                router.refresh();
              }}
              onPcsUpdated={() => {
                router.refresh();
              }}
            />
          );
        case 'oracolo-ai':
          return (
            <OracoloAi
              campaignId={activeCampaign.id}
              dbSpells={compendia.dbSpells}
              dbMonsters={compendia.dbMonsters}
              dbMagicItems={compendia.dbMagicItems}
              skills={compendia.skills}
              worldLocations={worldLocations}
              npcs={npcs}
            />
          );
        case 'party-xp':
          return (
            <PartyXpManager
              campaignId={activeCampaign.id}
              playerCharacters={activeCampaign.playerCharacters || []}
              onClose={() => setOverlayView(null)}
              onPcsUpdated={() => {
                router.refresh();
              }}
            />
          );
        case 'personaggi': return <PlayerCharactersDb campaignId={activeCampaign.id} initialCharacters={activeCampaign.playerCharacters} oldData={null} skills={compendia.skills} onSave={savePlayerCharacter} onDelete={deletePlayerCharacter} />;
        case 'biblioteca': return <ArchiveView campaignId={activeCampaign.id} />;
        case 'homebrew': return <HomebrewCompendium campaign={activeCampaign} />;
        case 'riepilogo-png': return <NpcSummary campaignId={activeCampaign.id} npcs={npcs} />;
        case 'abilità': return <SkillsDb skills={compendia.skills} campaignId={activeCampaign.id} onSave={saveSkill} onDelete={deleteSkill} possessedItems={possessedItems} onTogglePossession={(itemName: string) => toggleItemPossession(activeCampaign.id, itemName)} />;
        case 'oggetti': return <EquipmentDb mode="magic" campaignId={activeCampaign.id} armor={compendia.allArmor} weapons={compendia.allWeapons} magicArmor={compendia.magicArmor} magicWeapons={compendia.magicWeapons} allItems={compendia.allItems} onSaveItem={saveMagicItem} onDeleteItem={deleteMagicItem} possessedItems={possessedItems} onTogglePossession={(itemName: string) => toggleItemPossession(activeCampaign.id, itemName)} />;
        case 'equipaggiamento': return <EquipmentDb mode="armory" campaignId={activeCampaign.id} armor={compendia.allArmor} weapons={compendia.allWeapons} magicArmor={compendia.magicArmor} magicWeapons={compendia.magicWeapons} allItems={compendia.allItems} onSaveItem={saveMagicItem} onDeleteItem={deleteMagicItem} possessedItems={possessedItems} onTogglePossession={(itemName: string) => toggleItemPossession(activeCampaign.id, itemName)} />;
        case 'bestiario': return <MonstersDb monsters={compendia.dbMonsters} campaignId={activeCampaign.id} onSave={wrapReload(saveMonster)} onDelete={(idOrName: string, name?: string) => wrapReload(deleteMonster)(idOrName, name, activeCampaign.id)} possessedItems={possessedItems} onTogglePossession={(itemName: string) => toggleItemPossession(activeCampaign.id, itemName)} />;
        case 'magie': return <SpellsDb spells={compendia.dbSpells} campaignId={activeCampaign.id} onSave={saveSpell} onDelete={deleteSpell} possessedItems={possessedItems} onTogglePossession={(itemName: string) => toggleItemPossession(activeCampaign.id, itemName)} />;
        case 'mappe': return <MapGenerator />;
        case 'lettere': return <LetterGenerator presets={letterPresets} />;
        case 'botteghe': return <ShopManager campaign={activeCampaign} dbItems={compendia.allItems} savedShops={shops} />;
        case 'architetto': return <WorldArchitect campaign={activeCampaign} savedLocations={worldLocations} />;
        case 'anagrafe': return <NpcGenerator campaign={activeCampaign} savedNpcs={npcs} />;
        case 'combattimenti': return <CombatGenerator campaign={activeCampaign} savedCombats={combats} />;
        case 'tesori': return <TreasureGenerator campaign={activeCampaign} />;
        case 'manuale': return <ManualeDb campaignId={activeCampaign.id} />;
        case 'manuale-importa':
        case 'manuale-importa-new':
          return <ContentImporterNew campaignId={activeCampaign.id} />;
        case 'layout-sperimentale': return <ExperimentalCardGenerator allItems={compendia.allItems} dbSpells={compendia.dbSpells} />;
        case 'crea-carte': return <UnifiedCardGenerator allItems={compendia.allItems} dbSpells={compendia.dbSpells} />;
        case 'personalizza': return <CardBackgroundUploader />;
        case 'impostazioni': return <SettingsView campaignId={activeCampaign.id} />;
        case 'taverna': return <QuickImprovWidget campaignId={activeCampaign.id} inline />;
        case 'lore': return <LoreView campaign={activeCampaign} />;
        case 'sistema':
          return (
            <SystemPanel
              campaign={activeCampaign}
              onOpenPinConfig={() => {
                if (onOpenPinConfig) onOpenPinConfig();
              }}
              onBackupData={async () => {
                const res = await getBackupData();
                if (res.success && res.data) {
                  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const now = new Date();
                  const dateStr = now.toISOString().slice(0, 10);
                  const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
                  a.download = `dnd_backup-${dateStr}_${timeStr}.json`;
                  a.click();
                  toast({ title: "Backup Dati Scaricato" });
                } else {
                  toast({ variant: 'destructive', title: "Errore", description: res.error || "Impossibile scaricare il backup." });
                }
              }}
              onBackupImages={async () => {
                toast({ title: "Preparazione backup immagini..." });
                const res = await getAssetsBackup();
                if (res.success && res.data) {
                  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const now = new Date();
                  const dateStr = now.toISOString().slice(0, 10);
                  a.download = `dnd_backup-immagini-${dateStr}.json`;
                  a.click();
                  toast({ title: "Backup Immagini Scaricato" });
                } else {
                  toast({ variant: 'destructive', title: "Errore", description: res.error || "Impossibile scaricare le immagini." });
                }
              }}
              onNewCampaign={() => {
                if (onRequestNewCampaign) {
                  onRequestNewCampaign();
                } else {
                  router.push(`/?campaignId=${activeCampaign?.id || ''}&view=nuova`);
                }
              }}
            />
          );
        default: return null;
    }
  };

  const mainBgStyle = resolveBackgroundStyle('main', mainBgConfig);

  return (
    <DeviceSyncProvider campaignId={activeCampaign?.id || undefined}>
        <SidebarNav 
          activeView={overlayView || "bacheca"} 
          onViewChange={handleViewChange} 
          onNewCampaign={handleNewCampaign} 
          onBackup={handleBackupData} 
          onOpenPinConfig={onOpenPinConfig} 
        />
        
        <SidebarInset className="relative overflow-x-hidden min-h-screen !bg-transparent">
            {/* Sfondo Personalizzabile Dinamico per l'intera app */}
            <div 
              suppressHydrationWarning
              className="fixed inset-0 pointer-events-none bg-cover bg-center transition-all duration-300 -z-10"
              style={{
                backgroundImage: mainBgStyle.backgroundImage
                  ? `${mainBgStyle.backgroundImage}, url('/hero-dnd-bg.jpg'), url('/api/assets/hero-dnd-bg.jpg')`
                  : "url('/hero-dnd-bg.jpg'), url('/api/assets/hero-dnd-bg.jpg')",
                opacity: mainBgStyle.opacity ?? 0.35,
                filter: mainBgStyle.filter,
              }}
            />
            {/* Overlay di oscuramento protettivo per il contrasto */}
            <div 
              className="fixed inset-0 pointer-events-none transition-all duration-300 -z-10"
              style={{
                backgroundColor: `rgba(12, 10, 9, ${mainBgConfig.overlayDarkness})`
              }}
            />

            <main className="w-full p-0 relative z-0">
                {(overlayView && overlayView !== 'bacheca') && (
                    <header className="flex flex-col items-center justify-center text-center gap-2 border-b pb-6 mb-8 relative group w-full px-4 sm:px-6 lg:px-8 pt-6">
                        {/* Isola dei comandi in alto a sinistra per aprire/chiudere la sidebar su Mobile, Tablet e PC */}
                        <div className="absolute left-0 top-0 flex flex-col md:flex-row items-center gap-1 z-20">
                            <Button 
                                type="button"
                                variant="ghost" 
                                size="icon" 
                                id="sidebar-toggle-btn"
                                data-sidebar="trigger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSidebar();
                                }}
                                className="h-10 w-10 text-primary hover:bg-amber-500/10 touch-manipulation cursor-pointer active:scale-95 transition-transform flex items-center justify-center"
                                aria-label="Menu"
                                title="Apri/Chiudi Menu di Navigazione"
                            >
                                <Icons.logo className="h-6 w-6 pointer-events-none" />
                            </Button>
                            <div className="flex md:hidden flex-col items-center gap-1">
                                <PlayerModeToggle variant="ghost" iconOnly />
                                <QuickLockButton variant="ghost" onOpenConfig={onOpenPinConfig} />
                            </div>
                        </div>

                        {/* Su Tablet e Desktop (md+): Badge posizionati in alto a destra */}
                        <div className="hidden md:flex absolute right-0 -top-2 sm:top-0 items-center gap-2 z-10">
                            <PlayerModeToggle />
                            <QuickLockButton onOpenConfig={onOpenPinConfig} />
                        </div>

                        <div className="flex flex-col items-center gap-1 w-full max-w-4xl px-12 md:px-10">
                            <div className="relative flex items-center justify-center w-full">
                                <h1 className="font-headline text-3xl md:text-5xl font-bold text-primary leading-tight text-center px-2">
                                    {activeCampaign?.name}
                                </h1>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!playerModeActive && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 shrink-0" onClick={() => setIsEditingCampaign(true)}>
                                            <Pencil className="h-4 w-4 sm:h-5 sm:w-5" />
                                        </Button>
                                    )}
                                    {campaigns.length > 1 && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 shrink-0">
                                                    <ChevronsUpDown className="h-4 w-4 sm:h-5 sm:w-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Cambia Campagna</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {campaigns.map((c) => (
                                                    <DropdownMenuItem key={c.id} onSelect={() => router.push(`/?campaignId=${c.id}&view=storia`)}>
                                                        {c.name}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            </div>
                            <p className="text-[10px] md:text-base text-muted-foreground tracking-[0.2em] uppercase font-light italic mt-2">
                                {activeCampaign?.setting}
                            </p>
                        </div>
                    </header>
                )}
                
                <Dialog open={isEditingCampaign} onOpenChange={setIsEditingCampaign}>
                    <DialogContent className="sm:max-w-[425px] w-[95vw]">
                        <DialogHeader>
                            <DialogTitle>Modifica Campagna</DialogTitle>
                            <DialogDescription>Aggiorna le informazioni di base della tua cronaca.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Nome Campagna</Label>
                                <Input value={tempName} onChange={(e) => setTempName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Ambientazione</Label>
                                <Input value={tempSetting} onChange={(e) => setTempSetting(e.target.value)} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setIsEditingCampaign(false)}>Annulla</Button>
                            <Button onClick={handleUpdateCampaign} disabled={isSavingCampaign}>
                                {isSavingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4"/>}
                                Salva
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="w-full pt-0 mt-0">
                    {activeCampaign && (
                        (!overlayView || overlayView === 'bacheca') ? (
                            <CampaignHub 
                                campaign={activeCampaign}
                                sessions={sessions}
                                onNavigateTo={(v) => {
                                    if (v === 'bacheca') setOverlayView(null);
                                    else setOverlayView(v);
                                }}
                                onEditCampaign={() => setIsEditingCampaign(true)}
                                campaigns={campaigns}
                                onSelectCampaign={(id) => router.push(`/?campaignId=${id}`)}
                                onToggleSidebar={() => toggleSidebar()}
                                onOpenPinConfig={onOpenPinConfig}
                            />
                        ) : overlayView === 'storia' ? (
                            isCurrentViewBlocked('storia') ? (
                                <BlockedViewShield
                                    viewName="Storia & Cronache"
                                    onGoBack={() => setOverlayView(null)}
                                    isNotConfigured={!isPinConfigured()}
                                />
                            ) : (
                                <div className="space-y-6 px-3 sm:px-6 py-4">
                                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider text-center sm:text-left">
                                            Cronache & Trama del DM
                                        </div>
                                    </div>
                                    <CampaignDashboard 
                                        campaign={activeCampaign} 
                                        sessions={sessions} 
                                        onImportSession={async (n, t) => { const r = await importSession(n, t, activeCampaign.id, sessions.length + 1); if (r.success) router.refresh(); else toast({ variant: 'destructive', title: 'Errore', description: r.error }); }} 
                                        onSummarizeCampaign={async () => { setIsSummarizing(true); const r = await summarizeCampaign(activeCampaign.id); if (r.success) router.refresh(); setIsSummarizing(false); }} 
                                        isSummarizing={isSummarizing} 
                                        onUpdateSessionTitle={wrapReload(updateSessionTitle)} 
                                        onUpdateSessionNumber={wrapReload(updateSessionNumber)} 
                                        onUpdateSessionNotes={wrapReload(updateSessionNotes)} 
                                        onDeleteSession={wrapReload(deleteSession)} 
                                        onReorderSessions={wrapReload(reorderSessions)} 
                                        onUpdateSessionXp={wrapReload(updateSessionXp)} 
                                        onToggleSessionRead={wrapReload(toggleSessionReadStatus)} 
                                        onClearSessionLoot={wrapReload(clearSessionLoot)} 
                                        onFocusSession={(id: string) => { const s = sessions.find(x => x.id === id); if (s) router.push(`/?campaignId=${activeCampaign.id}&view=storia&focus=${id}`); }}
                                        onNavigateToQuestCreator={() => setOverlayView('quest-creator')}
                                    />
                                </div>
                            )
                        ) : (
                            isCurrentViewBlocked(overlayView) ? (
                                <div className="p-4 sm:p-6">
                                    <BlockedViewShield
                                        viewName={VIEW_METADATA[overlayView]?.title || overlayView}
                                        onGoBack={() => setOverlayView(null)}
                                        isNotConfigured={!isPinConfigured()}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-6 px-3 sm:px-6 py-4 animate-in fade-in duration-200">
                                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                                        <div className="flex items-center gap-2">
                                            {VIEW_METADATA[overlayView]?.icon && 
                                                (() => {
                                                    const Icon = VIEW_METADATA[overlayView].icon;
                                                    return <Icon className="h-4 w-4 text-primary shrink-0" />;
                                                })()
                                            }
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                {VIEW_METADATA[overlayView]?.title || overlayView}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        {renderToolContent(overlayView)}
                                    </div>
                                </div>
                            )
                        )
                    )}
                </div>
            </main>
        </SidebarInset>
    </DeviceSyncProvider>
  );
}

export function CampaignManager(props: CampaignManagerProps) {
  const { campaigns, activeCampaign, initialView } = props;
  const LAST_CAMPAIGN_KEY = 'dnd_last_active_campaign_id';

  // Se esistono campagne nel database, non forzare MAI la schermata di creazione come predefinita
  const [isCreating, setIsCreating] = useState<boolean>(() => {
    if (campaigns && campaigns.length > 0) return false;
    return !activeCampaign;
  });
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLockedState] = useState<boolean>(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState<boolean>(false);
  const { toast } = useToast();

  // Memorizza l'ultima campagna attiva in localStorage
  useEffect(() => {
    if (activeCampaign?.id && typeof window !== 'undefined') {
      try {
        localStorage.setItem(LAST_CAMPAIGN_KEY, activeCampaign.id);
      } catch {}
    }
  }, [activeCampaign?.id]);

  useEffect(() => {
    setIsLockedState(getIsLocked());

    const handleLock = (e: any) => {
      setIsLockedState(Boolean(e.detail?.isLocked));
    };
    window.addEventListener('dnd-lock-state-changed', handleLock);

    const handleOpenPinConfig = () => {
      setIsPinDialogOpen(true);
    };
    window.addEventListener('dnd-open-pin-config', handleOpenPinConfig);

    const recordActivity = () => {
      touchActivity();
    };
    window.addEventListener('mousemove', recordActivity, { passive: true });
    window.addEventListener('touchstart', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity, { passive: true });

    const interval = setInterval(() => {
      checkAutoLockExpiry();
    }, 20000);

    return () => {
      window.removeEventListener('dnd-lock-state-changed', handleLock);
      window.removeEventListener('dnd-open-pin-config', handleOpenPinConfig);
      window.removeEventListener('mousemove', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      clearInterval(interval);
    };
  }, []);

  // Se activeCampaign non è fornito ma esistono campagne, reindirizza all'ultima attiva salvata
  useEffect(() => {
    if (!activeCampaign && campaigns && campaigns.length > 0 && !isCreating) {
      let targetId = campaigns[0].id;
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem(LAST_CAMPAIGN_KEY);
          if (stored && campaigns.some(c => c.id === stored)) {
            targetId = stored;
          }
        } catch {}
      }
      window.location.replace(`/?campaignId=${targetId}`);
    }
  }, [activeCampaign, campaigns, isCreating]);

  const handleCreateCampaign = async (data: any) => {
    setLoading(true);
    try {
      const result = await createCampaign(data);
      if (result.success && result.data?.campaign) {
        toast({ title: "Campagna Creata!", description: result.data.progress });
        setIsCreating(false);
        window.location.href = `/?campaignId=${result.data.campaign.id}`;
      } else {
        throw new Error(result.error || "Errore nella creazione della campagna.");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Errore", description: error.message });
    } finally { 
      setLoading(false); 
    }
  };

  const handleRestoreFile = async (jsonText: string) => {
    setLoading(true);
    try {
      const data = JSON.parse(jsonText);
      if (!data || typeof data !== 'object') throw new Error("Formato backup non valido.");

      const assets = data.Assets || data.assets;
      const isFullBackup = Boolean(data.Campaign || data.campaigns);

      let targetCampaignId = activeCampaign?.id;

      if (assets && Array.isArray(assets) && assets.length > 0 && !isFullBackup) {
        // Images-only backup: upload in chunks to avoid server action body size limits
        const chunkSize = 3;
        for (let i = 0; i < assets.length; i += chunkSize) {
          const chunk = assets.slice(i, i + chunkSize);
          const upRes = await uploadBatchImages(chunk);
          if (!upRes.success) {
            console.warn("Avviso caricamento asset:", upRes.error);
          }
        }
        toast({ 
          title: "Backup Immagini Ripristinato!",
          description: "Tutti gli asset e ritratti sono stati ripristinati con successo."
        });
      } else {
        // Full backup or data-only backup
        if (assets && Array.isArray(assets) && assets.length > 0) {
          delete data.Assets;
          delete data.assets;
        }
        
        if (typeof restoreBackupData !== 'function') {
           throw new Error("Sistema di ripristino non pronto. Ricarica la pagina.");
        }

        const res = await restoreBackupData(JSON.stringify(data));
        if (!res.success) throw new Error(res.error || "Errore nel ripristino dati.");

        if (assets && assets.length > 0) {
          const chunkSize = 3;
          for (let i = 0; i < assets.length; i += chunkSize) {
            const chunk = assets.slice(i, i + chunkSize);
            const upRes = await uploadBatchImages(chunk);
            if (!upRes.success) {
              console.warn("Avviso caricamento asset:", upRes.error);
            }
          }
        }
        targetCampaignId = res.data?.campaignId || activeCampaign?.id;
        toast({ title: "Backup Ripristinato con Successo!" });
      }

      if (targetCampaignId) {
        window.location.href = `/?campaignId=${targetCampaignId}`;
      } else {
        window.location.href = '/';
      }
    } catch (err: any) {
      console.error("Errore critico ripristino:", err);
      toast({ 
        variant: 'destructive', 
        title: 'Errore Ripristino', 
        description: err.message || 'Impossibile completare il ripristino.' 
      });
      setLoading(false);
    }
  };

  return (
    <SidebarProvider>
      <input 
        id="restore-backup-input" 
        type="file" 
        onChange={(e) => { 
          const f = e.target.files?.[0]; 
          if (!f) return; 
          const r = new FileReader(); 
          r.onload = (ev) => { 
            const text = ev.target?.result as string;
            if (text) handleRestoreFile(text);
          }; 
          r.readAsText(f); 
          // Reset input to allow same file selection
          e.target.value = '';
        }} 
        className="hidden" 
        accept=".json" 
      />
      {isCreating ? (
        <CampaignInitializer 
          onCreateCampaign={handleCreateCampaign} 
          onCancel={campaigns && campaigns.length > 0 ? () => {
            setIsCreating(false);
            if (typeof window !== 'undefined' && window.location.search.includes('view=nuova')) {
              window.history.replaceState({}, '', `/?campaignId=${activeCampaign?.id || campaigns[0]?.id}`);
            }
          } : undefined} 
        />
      ) : activeCampaign ? (
        <ManagerContent 
            {...props}
            onRequestNewCampaign={() => setIsCreating(true)}
            onOpenPinConfig={() => {
              setIsPinDialogOpen(true);
            }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <span className="text-xs uppercase tracking-wider font-mono text-stone-400">Caricamento Campagna...</span>
        </div>
      )}

      {/* Overlay di Blocco Schermo con Sigillo Magico e Sfondo Sfocato */}
      {isLocked && (
        <LockOverlay 
          onUnlock={() => setIsLockedState(false)} 
          onOpenPinSettings={() => setIsPinDialogOpen(true)}
        />
      )}

      {/* Dialog di Configurazione PIN, Password e Timer */}
      <PinConfigDialog 
        open={isPinDialogOpen} 
        onOpenChange={setIsPinDialogOpen} 
      />
    </SidebarProvider>
  );
}
