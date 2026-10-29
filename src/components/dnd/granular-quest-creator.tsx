'use client';

import React, { useState, useMemo, useRef } from 'react';
import { 
  CampaignWithRelations, 
  Session, 
  PlayerCharacter, 
  Npc, 
  MagicItem, 
  WorldLocation,
  GranularQuestConfig, 
  SelectedPcConfig, 
  SelectedNpcConfig, 
  SelectedItemConfig, 
  SelectedSpellConfig, 
  SelectedSkillConfig, 
  SelectedLocationConfig, 
  SelectedPreviousQuestLink,
  NpcQuestRole,
  ItemQuestRole
} from '@/lib/types';
import { generateGranularQuestAction, createSession, saveNpc, saveMagicItem, saveMonster, saveLoreEntry } from '@/lib/actions';
import { PartyXpManager } from '@/components/dnd/party-xp-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { 
  Sparkles, 
  Wand2, 
  Scroll, 
  Users, 
  UserCheck, 
  Shield, 
  MapPin, 
  BookOpen, 
  Link2, 
  Trophy, 
  CheckCircle, 
  AlertCircle, 
  Zap, 
  Save, 
  Sliders, 
  Edit3, 
  X,
  Send,
  ArrowLeft,
  Check,
  Settings2,
  Bot,
  RefreshCw,
  Download,
  Skull
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

export function getDefaultRoleForNpc(npc: Npc): NpcQuestRole {
  try {
    const parsed = typeof npc.details === 'string' ? JSON.parse(npc.details || '{}') : (npc.details || {});
    const fullText = [
      npc.name,
      npc.alignment,
      npc.status,
      parsed.role,
      parsed.relationship,
      parsed.disposition,
      parsed.attitude,
      parsed.occupation,
      parsed.personality,
      parsed.mannerism,
      parsed.secret,
      parsed.encounterHook,
      parsed.alignment,
      parsed.faction,
      parsed.history
    ].filter(Boolean).join(' ').toLowerCase();

    if (fullText.match(/doppiogioch|doppio gi|traditor|spia|ingann|infiltrat/i)) {
      return 'doppiogiochista';
    }

    if (fullText.match(/compagno|spalla|guardia del corpo|seguace|membro del party/i)) {
      return 'compagno_party';
    }

    if (
      fullText.match(/nemico|ostile|antagonista|rivale|boss|malvagio|bandito|assassino|mostro|minaccia|avversario|criminale/i) ||
      (npc.alignment && npc.alignment.toLowerCase().includes('malvagio')) ||
      (parsed.alignment && parsed.alignment.toLowerCase().includes('malvagio'))
    ) {
      return 'nemico';
    }

    if (
      fullText.match(/amico|alleato|guida|committente|sostenitore|protettore|benefattore|re|duca|taverniere|mercat/i) ||
      (npc.alignment && npc.alignment.toLowerCase().includes('buono')) ||
      (parsed.alignment && parsed.alignment.toLowerCase().includes('buono'))
    ) {
      return 'amico';
    }
  } catch {
    // fallback
  }

  return 'amico';
}

const roleBadgeLabels: Record<NpcQuestRole, { label: string; colorClass: string }> = {
  amico: { label: 'Amico', colorClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  nemico: { label: 'Nemico', colorClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  doppiogiochista: { label: 'Doppiogiochista', colorClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  da_amico_a_nemico: { label: 'Traditore', colorClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  da_nemico_a_amico: { label: 'Redento', colorClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  compagno_party: { label: 'Spalla', colorClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' }
};

const AVAILABLE_AI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Principale / Consigliato)', isRecommended: true },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

interface GranularQuestCreatorProps {
  campaign: CampaignWithRelations;
  onQuestSaved?: (newSession: Session) => void;
  onBackToStories?: () => void;
  onPcsUpdated?: (updatedPcs: PlayerCharacter[]) => void;
}

export function GranularQuestCreator({
  campaign,
  onQuestSaved,
  onBackToStories,
  onPcsUpdated,
}: GranularQuestCreatorProps) {
  const { toast } = useToast();
  const outputRef = useRef<HTMLDivElement>(null);

  // Model Selection Dropdown State
  const [selectedAiModel, setSelectedAiModel] = useState<string>('gemini-3.8-flash');
  const [actualModelUsed, setActualModelUsed] = useState<string | null>(null);

  // Drawer Open/Close State for Context & Database customization
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'pcs' | 'npcs' | 'items' | 'locations' | 'links' | 'params' | 'sources'>('pcs');

  // Prompt and Core Directives
  const [customPrompt, setCustomPrompt] = useState('');
  const [questTitleProposal, setQuestTitleProposal] = useState('');
  const [narrativeTone, setNarrativeTone] = useState<GranularQuestConfig['narrativeTone']>('Epico ed Eroico');
  const [primaryEncounterType, setPrimaryEncounterType] = useState<GranularQuestConfig['primaryEncounterType']>('Bilanciato (Combattimento + Sociale + Esplorazione)');
  const [targetDifficulty, setTargetDifficulty] = useState<GranularQuestConfig['targetDifficulty']>('Medio');
  const [pacingSpeed, setPacingSpeed] = useState<GranularQuestConfig['pacingSpeed']>('Regolare');
  const [plotTwistLikelihood, setPlotTwistLikelihood] = useState<GranularQuestConfig['plotTwistLikelihood']>('Colpo di Scena Moderato');
  const [specificThreatsOrMonsters, setSpecificThreatsOrMonsters] = useState('');

  // Memory & Context Switches
  const [includeCampaignSummary, setIncludeCampaignSummary] = useState(true);
  const [includeRecentSessionsSummary, setIncludeRecentSessionsSummary] = useState(true);
  const [includeGlobalLore, setIncludeGlobalLore] = useState(true);
  const [includeHomebrewRules, setIncludeHomebrewRules] = useState(true);

  // Selected PCs - DEFAULT: All campaign PCs selected by default
  const [selectedPcs, setSelectedPcs] = useState<SelectedPcConfig[]>(() => {
    return (campaign.playerCharacters || []).map(pc => ({
      pcId: pc.id,
      name: pc.name,
      includeIdeals: true,
      includeBonds: true,
      includeFlaws: true,
      includeStats: true,
      includeSpellsAndSkills: true,
      customFocus: '',
    }));
  });

  // Selected NPCs (Optional)
  const [selectedNpcs, setSelectedNpcs] = useState<SelectedNpcConfig[]>([]);

  // Selected Items (Optional)
  const [selectedItems, setSelectedItems] = useState<SelectedItemConfig[]>([]);

  // Selected Spells & Skills
  const [selectedSpells] = useState<SelectedSpellConfig[]>([]);
  const [selectedSkills] = useState<SelectedSkillConfig[]>([]);

  // Selected Locations (Optional)
  const [selectedLocations, setSelectedLocations] = useState<SelectedLocationConfig[]>([]);

  // Previous Quest Links (Optional)
  const [previousQuestLinks, setPreviousQuestLinks] = useState<SelectedPreviousQuestLink[]>([]);

  // Item Source Filter for Drawer
  const [itemSourceFilter, setItemSourceFilter] = useState<'all' | 'base' | 'created'>('all');

  // Generation & AI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedStory, setGeneratedStory] = useState('');
  const [generatedXp, setGeneratedXp] = useState(0);
  const [xpDetails, setXpDetails] = useState<any>(null);
  const [modificationRequest, setModificationRequest] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [showXpManager, setShowXpManager] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showLogsConsole, setShowLogsConsole] = useState(false);
  const [generatedEntities, setGeneratedEntities] = useState<Array<{ name: string; type: string; description: string; stats?: any }>>([]);
  const [importedEntityKeys, setImportedEntityKeys] = useState<Set<string>>(new Set());
  const [isImportingAll, setIsImportingAll] = useState(false);

  // Helper counts
  const pcsCount = selectedPcs.length;
  const npcsCount = selectedNpcs.length;
  const itemsCount = selectedItems.length;
  const locationsCount = selectedLocations.length;
  const linksCount = previousQuestLinks.length;

  const filteredMagicItems = useMemo(() => {
    const items = campaign.magicItems || [];
    if (itemSourceFilter === 'base') {
      return items.filter(i => i.source === 'base' || (!i.source && !i.campaignId));
    }
    if (itemSourceFilter === 'created') {
      return items.filter(i => i.source === 'created' || !!i.campaignId);
    }
    return items;
  }, [campaign.magicItems, itemSourceFilter]);

  // Handlers for PC selection
  const handleTogglePc = (pc: PlayerCharacter) => {
    setSelectedPcs(prev => {
      const exists = prev.some(p => p.pcId === pc.id);
      if (exists) {
        return prev.filter(p => p.pcId !== pc.id);
      } else {
        return [
          ...prev,
          {
            pcId: pc.id,
            name: pc.name,
            includeIdeals: true,
            includeBonds: true,
            includeFlaws: true,
            includeStats: true,
            includeSpellsAndSkills: true,
            customFocus: '',
          },
        ];
      }
    });
  };

  const handleSelectAllPcs = () => {
    setSelectedPcs(
      (campaign.playerCharacters || []).map(pc => ({
        pcId: pc.id,
        name: pc.name,
        includeIdeals: true,
        includeBonds: true,
        includeFlaws: true,
        includeStats: true,
        includeSpellsAndSkills: true,
        customFocus: '',
      }))
    );
  };

  const handleDeselectAllPcs = () => {
    setSelectedPcs([]);
  };

  const handleUpdatePcConfig = (pcId: string, updates: Partial<SelectedPcConfig>) => {
    setSelectedPcs(prev => prev.map(p => (p.pcId === pcId ? { ...p, ...updates } : p)));
  };

  // Handlers for NPC selection
  const handleToggleNpc = (npc: Npc) => {
    const parsed = typeof npc.details === 'string' ? JSON.parse(npc.details || '{}') : npc.details;
    const name = parsed?.name || npc.name || 'PNG Senza Nome';
    const defaultRole = getDefaultRoleForNpc(npc);
    setSelectedNpcs(prev => {
      const exists = prev.some(n => n.npcId === npc.id);
      if (exists) {
        return prev.filter(n => n.npcId !== npc.id);
      } else {
        return [
          ...prev,
          {
            npcId: npc.id,
            name,
            role: defaultRole,
            customGoal: '',
          },
        ];
      }
    });
  };

  const handleSelectAllNpcs = () => {
    setSelectedNpcs(
      (campaign.npcs || []).map(npc => {
        const parsed = typeof npc.details === 'string' ? JSON.parse(npc.details || '{}') : npc.details;
        const defaultRole = getDefaultRoleForNpc(npc);
        return {
          npcId: npc.id,
          name: parsed?.name || npc.name || 'PNG Senza Nome',
          role: defaultRole,
          customGoal: '',
        };
      })
    );
  };

  const handleDeselectAllNpcs = () => {
    setSelectedNpcs([]);
  };

  const handleUpdateNpcRole = (npcId: string, role: NpcQuestRole, customGoal?: string) => {
    setSelectedNpcs(prev =>
      prev.map(n => (n.npcId === npcId ? { ...n, role, customGoal: customGoal !== undefined ? customGoal : n.customGoal } : n))
    );
  };

  // Handlers for Item selection
  const handleToggleItem = (item: MagicItem) => {
    setSelectedItems(prev => {
      const itemId = item.id || item.name;
      const exists = prev.some(i => i.itemId === itemId);
      if (exists) {
        return prev.filter(i => i.itemId !== itemId);
      } else {
        return [
          ...prev,
          {
            itemId: itemId,
            name: item.name,
            role: 'trovato',
            notes: '',
          },
        ];
      }
    });
  };

  const handleSelectAllItems = () => {
    setSelectedItems(
      filteredMagicItems.map(item => ({
        itemId: item.id || item.name,
        name: item.name,
        role: 'trovato',
        notes: '',
      }))
    );
  };

  const handleDeselectAllItems = () => {
    setSelectedItems([]);
  };

  const handleUpdateItemRole = (itemId: string, role: ItemQuestRole, notes?: string) => {
    setSelectedItems(prev =>
      prev.map(i => (i.itemId === itemId ? { ...i, role, notes: notes !== undefined ? notes : i.notes } : i))
    );
  };

  // Handlers for Location selection
  const handleToggleLocation = (loc: WorldLocation) => {
    setSelectedLocations(prev => {
      const exists = prev.some(l => l.locationId === loc.id);
      if (exists) {
        return prev.filter(l => l.locationId !== loc.id);
      } else {
        return [
          ...prev,
          {
            locationId: loc.id,
            name: loc.name,
            role: 'destinazione',
            atmosphere: loc.atmosphere || '',
          },
        ];
      }
    });
  };

  const handleSelectAllLocations = () => {
    setSelectedLocations(
      (campaign.worldLocations || []).map(loc => ({
        locationId: loc.id,
        name: loc.name,
        role: 'destinazione',
        atmosphere: loc.atmosphere || '',
      }))
    );
  };

  const handleDeselectAllLocations = () => {
    setSelectedLocations([]);
  };

  // Handlers for Session Links
  const handleToggleSessionLink = (session: Session) => {
    setPreviousQuestLinks(prev => {
      const exists = prev.some(l => l.sessionId === session.id);
      if (exists) {
        return prev.filter(l => l.sessionId !== session.id);
      } else {
        return [
          ...prev,
          {
            sessionId: session.id,
            sessionNumber: session.session_number,
            title: session.title,
            linkType: 'conseguenza_diretta',
            customHookNote: '',
          },
        ];
      }
    });
  };

  // Apply Quick Preset Templates
  const handleApplyPresetTemplate = (preset: {
    title: string;
    prompt: string;
    tone: GranularQuestConfig['narrativeTone'];
    encounterType: GranularQuestConfig['primaryEncounterType'];
    difficulty: GranularQuestConfig['targetDifficulty'];
    pacing: GranularQuestConfig['pacingSpeed'];
    plotTwist: GranularQuestConfig['plotTwistLikelihood'];
  }) => {
    setQuestTitleProposal(preset.title);
    setCustomPrompt(preset.prompt);
    setNarrativeTone(preset.tone);
    setPrimaryEncounterType(preset.encounterType);
    setTargetDifficulty(preset.difficulty);
    setPacingSpeed(preset.pacing);
    setPlotTwistLikelihood(preset.plotTwist);
    toast({ title: `Preset "${preset.title}" applicato!` });
  };

  // Build Payload
  const buildConfig = (): GranularQuestConfig => {
    return {
      campaignId: campaign.id,
      customPrompt: customPrompt.trim() || '',
      questTitleProposal: questTitleProposal.trim() || undefined,
      narrativeTone,
      primaryEncounterType,
      targetDifficulty,
      pacingSpeed,
      plotTwistLikelihood,
      specificThreatsOrMonsters: specificThreatsOrMonsters.trim() || undefined,
      includeCampaignSummary,
      includeRecentSessionsSummary,
      includeGlobalLore,
      includeHomebrewRules,
      selectedPcs,
      selectedNpcs,
      selectedItems,
      selectedSpells,
      selectedSkills,
      selectedLocations,
      previousQuestLinks,
      selectedModel: selectedAiModel,
    };
  };

  // Helper to copy generation logs to clipboard
  const handleCopyLogs = () => {
    const text = [
      `=== LOG DI GENERAZIONE QUEST (${new Date().toLocaleString('it-IT')}) ===`,
      `Modello Richiesto: ${selectedAiModel}`,
      `Modello Usato Effettivo: ${actualModelUsed || 'N/D'}`,
      `Stato Errore: ${generationError || 'Nessun errore'}`,
      `--------------------------------------------------`,
      ...generationLogs
    ].join('\n');

    navigator.clipboard.writeText(text);
    toast({ title: 'Log copiato negli appunti!', description: 'Incollalo nella chat per la diagnosi dell\'errore.' });
  };

  // Generate Quest
  const handleGenerateQuest = async () => {
    if (!customPrompt.trim()) {
      toast({ variant: 'destructive', title: "Errore", description: 'Inserisci prima uno spunto o prompt libero per la quest.' });
      return;
    }
    
    // Inizializza log con timestamp per la nuova sessione di generazione
    const startTimestamp = new Date().toLocaleTimeString('it-IT');
    const initialLogs = [
      `[${startTimestamp}] 🚀 Avvio generazione quest con modello: ${selectedAiModel}...`,
      `[${startTimestamp}] 📡 Invio parametri, contesto di campagna e direttive granulari all'API...`
    ];
    setGenerationLogs(initialLogs);
    setGenerationError(null);
    setShowLogsConsole(true); // Console aperta di default così l'utente vede l'avanzamento
    setIsGenerating(true);
    setActualModelUsed(null);

    try {
      const config = buildConfig();
      const response = await fetch('/api/generate-quest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });

      const res = await response.json();
      const serverLogs = (res as any)?.data?.logs || (res as any)?.logs || [];
      const mergedLogs = Array.from(new Set([...initialLogs, ...serverLogs]));
      setGenerationLogs(mergedLogs);

      if (response.ok && res.success && res.data?.sessionOutline) {
        setGeneratedTitle(res.data.titleProposal || questTitleProposal || 'Nuova Quest');
        setGeneratedStory(res.data.sessionOutline || '');
        setGeneratedXp(res.data.xpAward || 300);
        setXpDetails(res.data.xpDetails || null);
        setGeneratedEntities(Array.isArray(res.data.entities) ? res.data.entities : []);
        setImportedEntityKeys(new Set());
        
        // Traccia il modello effettivo usato dai fallback server-side
        const used = (res.data as any).modelUsed || selectedAiModel;
        setActualModelUsed(used);
        setGenerationError(null);

        // Scroll morbido alla sezione della quest generata
        setTimeout(() => {
          outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);

        if (used !== selectedAiModel) {
          toast({
            title: 'Generazione completata con Fallback!',
            description: `Il modello richiesto (${selectedAiModel}) ha riscontrato quota/timeout ed è stato scalato a ${used}.`,
          });
        } else {
          toast({ title: 'Quest generata con successo!' });
        }
      } else {
        const errText = res?.error || `Errore HTTP ${response.status}: Impossibile generare la quest.`;
        setGenerationError(errText);
        setShowLogsConsole(true);
        setGenerationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString('it-IT')}] ❌ Errore durante la generazione: ${errText}`
        ]);
        toast({ variant: 'destructive', title: "Errore durante la generazione", description: errText });
      }
    } catch (e: any) {
      const errText = e?.message || 'Errore di connessione durante la generazione della quest.';
      setGenerationError(errText);
      setShowLogsConsole(true);
      setGenerationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString('it-IT')}] ❌ Eccezione client / rete: ${errText}`
      ]);
      toast({ variant: 'destructive', title: "Errore", description: errText });
    } finally {
      setIsGenerating(false);
    }
  };

  // Refine / Modify with AI
  const handleModifyQuest = async () => {
    if (!modificationRequest.trim() || !generatedStory) return;
    setIsModifying(true);
    try {
      const config = buildConfig();
      const response = await fetch('/api/generate-quest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          modification: {
            storyToModify: generatedStory,
            request: modificationRequest,
          }
        })
      });

      const res = await response.json();
      if (response.ok && res.success && res.data) {
        setGeneratedTitle(res.data.titleProposal || generatedTitle);
        setGeneratedStory(res.data.sessionOutline || generatedStory);
        if (res.data.xpAward) setGeneratedXp(res.data.xpAward);
        if (res.data.xpDetails) setXpDetails(res.data.xpDetails);
        if (res.data.entities && Array.isArray(res.data.entities) && res.data.entities.length > 0) {
          setGeneratedEntities(res.data.entities);
        }

        const used = (res.data as any).modelUsed || selectedAiModel;
        setActualModelUsed(used);

        setModificationRequest('');
        toast({ title: 'Bozza della quest aggiornata!' });
      } else {
        throw new Error(res?.error || 'Errore nella modifica della quest');
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore", description: e.message });
    } finally {
      setIsModifying(false);
    }
  };

  // Import Single Entity (NPC, Item, Monster, Lore) into Campaign DB
  const handleImportEntity = async (entity: { name: string; type: string; description: string; stats?: any }, entityKey: string) => {
    try {
      const rawType = (entity.type || '').toUpperCase();
      if (rawType.includes('NPC') || rawType === 'PNG') {
        const stats = entity.stats || {};
        const npcData = {
          campaignId: campaign.id,
          name: entity.name,
          race: stats.race || 'Umanoide',
          gender: stats.gender || 'Non specificato',
          age: stats.age || 'Adulto',
          status: 'Vivo',
          alignment: stats.alignment || 'Neutrale',
          details: JSON.stringify({
            role: stats.role || 'PNG Quest',
            appearance: entity.description,
            personality: stats.personality || '',
            secret: stats.secret || '',
            alignment: stats.alignment || '',
            cr: stats.cr || '1',
            armorClass: stats.armorClass || stats.ac || '12',
            hitPoints: stats.hitPoints || stats.hp || '20',
            speed: stats.speed || '9 m',
            attributes: stats.attributes || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            skills: stats.skills || '',
            traits: stats.traits || '',
            actions: stats.actions || '',
            history: entity.description,
          })
        };
        const res = await saveNpc(npcData);
        if (res?.data || res?.success) {
          setImportedEntityKeys(prev => new Set([...prev, entityKey]));
          toast({ title: `PNG "${entity.name}" importato con successo!`, description: "Aggiunto alla sezione Personaggi Non Giocanti." });
          return true;
        }
      } else if (rawType.includes('ITEM') || rawType.includes('OGGETTO') || rawType.includes('MAGIC')) {
        const stats = entity.stats || {};
        const itemData = {
          campaignId: campaign.id,
          name: entity.name,
          type: stats.itemType || 'Oggetto Meraviglioso',
          rarity: stats.rarity || 'Non Comune',
          attunement: stats.attunement || 'No',
          description: `${entity.description}\n\n**Proprietà Meccaniche:**\n${stats.properties || stats.mechanics || 'Nessuna proprietà speciale.'}`,
          cost: stats.cost || '100 mo',
          damage: stats.damage || '',
          techType: 'none' as const
        };
        const res = await saveMagicItem(itemData);
        if (res?.data || res?.success) {
          setImportedEntityKeys(prev => new Set([...prev, entityKey]));
          toast({ title: `Oggetto "${entity.name}" importato!`, description: "Aggiunto al compendio degli Oggetti Magici." });
          return true;
        }
      } else if (rawType.includes('MONSTER') || rawType.includes('MOSTRO')) {
        const stats = entity.stats || {};
        const monsterData = {
          campaignId: campaign.id,
          name: entity.name,
          type: stats.type || 'Mostro',
          armorClass: stats.armorClass || stats.ac || '13',
          hitPoints: stats.hitPoints || stats.hp || '35',
          challenge: stats.challenge || stats.cr || '1',
          description: `${entity.description}\n\n**Tratti:** ${stats.traits || 'Nessuno'}\n**Azioni:** ${stats.actions || 'Attacco base'}`
        };
        const res = await saveMonster(monsterData);
        if (res?.data || res?.success) {
          setImportedEntityKeys(prev => new Set([...prev, entityKey]));
          toast({ title: `Mostro "${entity.name}" salvato!`, description: "Aggiunto al Bestiario della campagna." });
          return true;
        }
      } else {
        // Fallback: save as Lore Entry
        const loreData = {
          campaignId: campaign.id,
          title: entity.name,
          category: 'avventura',
          subtitle: `Entità emersa da ${generatedTitle}`,
          content: `${entity.description}\n\n${typeof entity.stats === 'object' ? JSON.stringify(entity.stats, null, 2) : ''}`,
          tags: 'quest, entità'
        };
        const res = await saveLoreEntry(loreData);
        if (res?.data || res?.success) {
          setImportedEntityKeys(prev => new Set([...prev, entityKey]));
          toast({ title: `Dossier "${entity.name}" salvato!`, description: "Aggiunto alle Cronache & Lore." });
          return true;
        }
      }
      return false;
    } catch (err: any) {
      toast({ variant: 'destructive', title: "Errore durante l'importazione", description: err?.message || String(err) });
      return false;
    }
  };

  // Import All Entities in One Click
  const handleImportAllEntities = async () => {
    if (!generatedEntities || generatedEntities.length === 0) return;
    setIsImportingAll(true);
    let count = 0;
    for (let i = 0; i < generatedEntities.length; i++) {
      const ent = generatedEntities[i];
      const key = `${ent.name}_${i}`;
      if (!importedEntityKeys.has(key)) {
        const ok = await handleImportEntity(ent, key);
        if (ok) count++;
      }
    }
    setIsImportingAll(false);
    if (count > 0) {
      toast({ title: `Tutte le schede importate (${count})!`, description: "I PNG e gli Oggetti Magici sono stati inseriti nelle rispettive sezioni della campagna." });
    }
  };

  // Save Session into Campaign
  const handleSaveAsSession = async () => {
    if (!generatedStory) return;
    setIsSavingSession(true);
    try {
      const highestNum = (campaign.sessions || []).reduce((max, s) => Math.max(max, s.session_number || 0), 0);
      const sessionData: Partial<Session> = {
        campaignId: campaign.id,
        session_number: highestNum + 1,
        title: generatedTitle || `Sessione ${highestNum + 1}`,
        notes: generatedStory,
        xp_award: generatedXp || 300,
        source: 'generated',
        is_read: false,
        is_archived: false,
      };

      const res = await createSession(sessionData);
      if (res.data) {
        toast({ title: 'Quest salvata ufficialmente nelle Cronache della campagna!' });
        if (onQuestSaved) onQuestSaved(res.data as Session);
      } else {
        throw new Error(res.error || 'Impossibile salvare la sessione');
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore", description: e.message });
    } finally {
      setIsSavingSession(false);
    }
  };

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      {/* Header Card - Standardized Application Style */}
      <div className="bg-card border border-border/80 rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3 mb-4">
          {onBackToStories ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onBackToStories}
              className="bg-background border-border hover:bg-muted text-foreground text-xs h-8 px-2.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Torna a Storie
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowXpManager(true)}
              variant="outline"
              size="sm"
              className="bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 font-semibold text-xs h-8 px-2.5"
            >
              <Trophy className="w-3.5 h-3.5 mr-1.5 text-primary" />
              Gestione PX Party
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black font-headline text-foreground tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              Generatore Quest D&D 5e
            </h1>
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
              D&D 5e Story Engine
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
            Inserisci il tuo spunto libero per la storia. I personaggi giocanti sono inclusi di default, mentre tutte le altre opzioni e database sono liberamente personalizzabili nel pannello laterale.
          </p>
        </div>
      </div>

      {/* Main Streamlined Prompt Screen */}
      <div className="bg-card border border-border/80 rounded-xl p-4 sm:p-6 shadow-md space-y-5">
        {/* Top Controls: Prompt Title + Model Selector Dropdown */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <Label className="text-sm font-bold text-foreground flex items-center gap-2 font-headline">
              <Edit3 className="w-4 h-4 text-primary" />
              Incipit / Prompt del Dungeon Master
            </Label>

            {/* AI Model Selector Dropdown & Options */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full bg-background/80 p-2 rounded-lg border border-border/80 overflow-hidden">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-semibold text-foreground">Modello IA:</span>
              </div>
              <select
                id="select-quest-ai-model"
                value={selectedAiModel}
                onChange={e => setSelectedAiModel(e.target.value)}
                className="h-8 w-full sm:w-auto max-w-full truncate bg-card border border-input text-foreground text-xs px-2 font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {AVAILABLE_AI_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    ⚡ {m.label}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDrawerOpen(true)}
                className="bg-background border-primary/40 text-primary hover:bg-muted text-xs h-8 px-2.5 w-full sm:w-auto font-semibold shrink-0"
              >
                <Settings2 className="w-3.5 h-3.5 mr-1 text-primary" />
                ⚙️ Opzioni & Contesto
              </Button>
            </div>
          </div>

          <Textarea
            rows={5}
            placeholder="Descrivi l'incipit dell'avventura, l'obiettivo principale, la minaccia imminente o la sfida che i giocatori si troveranno ad affrontare..."
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            className={`bg-background border text-foreground placeholder:text-muted-foreground text-xs sm:text-sm leading-relaxed transition-all ${
              !customPrompt.trim() ? 'border-primary/40 focus:border-primary' : 'border-emerald-500/40 focus:border-emerald-500'
            }`}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs w-full overflow-hidden">
            {!customPrompt.trim() ? (
              <span className="text-amber-500 flex items-center gap-1.5 font-medium text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Inserisci uno spunto libero per abilitare la generazione.
              </span>
            ) : (
              <span className="text-emerald-500 flex items-center gap-1.5 font-medium text-xs">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                Prompt pronto ({customPrompt.trim().length} caratteri)
              </span>
            )}

            {/* Optional Title input */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto">
              <span className="text-muted-foreground text-xs shrink-0">Titolo (opzionale):</span>
              <Input
                type="text"
                placeholder="Es. Il Segreto della Torre"
                value={questTitleProposal}
                onChange={e => setQuestTitleProposal(e.target.value)}
                className="bg-background border-input text-foreground text-xs h-8 w-full sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-1">
          <Button
            onClick={handleGenerateQuest}
            disabled={isGenerating || !customPrompt.trim()}
            className={`w-full font-bold text-xs sm:text-sm h-11 shadow-lg transition-all max-w-full overflow-hidden ${
              !customPrompt.trim()
                ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60 shadow-none'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer font-semibold shadow-md'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center truncate max-w-full">
                <Wand2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
                <span className="truncate">Composizione in corso <span className="hidden sm:inline">({selectedAiModel})</span>...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center truncate max-w-full">
                <Wand2 className="w-4 h-4 mr-1.5 shrink-0" />
                <span className="truncate">✨ Genera Quest Ora <span className="hidden sm:inline">({selectedAiModel})</span></span>
              </span>
            )}
          </Button>
        </div>

        {/* Context Status Overview Badges */}
        <div className="p-3 rounded-xl bg-background/80 border border-border/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              Contesto e Elementi Collegati alla Generazione:
            </span>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Modifica Opzioni &rarr;
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={`text-xs px-2.5 py-1 ${pcsCount > 0 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border-border'}`}>
              👥 PG Party: {pcsCount} / {campaign.playerCharacters?.length || 0}
            </Badge>

            <Badge variant="outline" className={`text-xs px-2.5 py-1 ${npcsCount > 0 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border-border'}`}>
              🎭 PNG: {npcsCount}
            </Badge>

            <Badge variant="outline" className={`text-xs px-2.5 py-1 ${itemsCount > 0 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border-border'}`}>
              🗡️ Oggetti: {itemsCount}
            </Badge>

            <Badge variant="outline" className={`text-xs px-2.5 py-1 ${locationsCount > 0 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border-border'}`}>
              🗺️ Luoghi: {locationsCount}
            </Badge>

            <Badge variant="outline" className={`text-xs px-2.5 py-1 ${linksCount > 0 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border-border'}`}>
              🔗 Agganci: {linksCount}
            </Badge>

            <Badge variant="outline" className="text-xs px-2.5 py-1 bg-background text-foreground border-border font-mono">
              ⚡ {selectedAiModel}
            </Badge>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div className="pt-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground">
              Template Rapidi per Master (1 tap per caricare):
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleApplyPresetTemplate({
                  title: "L'Infiltrazione alla Fortezza di Roccanera",
                  prompt: "Il party deve infiltrarsi silenziosamente durante la festa del plenilunio per recuperare una reliquia prima che venga sacrificata una prigioniera innocente.",
                  tone: 'Investigativo & Mistero',
                  encounterType: 'Furtivo & Infiltrazione',
                  difficulty: 'Difficile',
                  pacing: 'Veloce & Incalzante',
                  plotTwist: 'Colpo di Scena Moderato',
                })
              }
              className="bg-background border-border hover:bg-muted text-foreground text-xs whitespace-nowrap h-7 shrink-0"
            >
              🏰 Infiltrazione Notturna
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleApplyPresetTemplate({
                  title: 'Il Risveglio della Cripta Sommersa',
                  prompt: "Esplorazione di un tempio allagato celato nelle profondità della palude, protetto da enigmi arcanici legati all'acqua e guardiani non-morti.",
                  tone: 'Cupo & Horror',
                  encounterType: 'Dungeon Crawl & Enigmi',
                  difficulty: 'Medio',
                  pacing: 'Disteso & Esplorativo',
                  plotTwist: 'Rivelazione Sconvolgente',
                })
              }
              className="bg-background border-border hover:bg-muted text-foreground text-xs whitespace-nowrap h-7 shrink-0"
            >
              🌊 Cripta & Enigmi
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleApplyPresetTemplate({
                  title: 'La Congiura dei Mercanti di Sangue',
                  prompt: "Durante il banchetto del Gran Consiglio cittadino, un misterioso veleno colpisce uno dei diplomatici e il party è sospettato se non smaschera il vero colpevole prima dell'alba.",
                  tone: 'Politico & Intrigo',
                  encounterType: 'Investigativo & Sociale',
                  difficulty: 'Medio',
                  pacing: 'Veloce & Incalzante',
                  plotTwist: 'Rivelazione Sconvolgente',
                })
              }
              className="bg-background border-border hover:bg-muted text-foreground text-xs whitespace-nowrap h-7 shrink-0"
            >
              👑 Intrigo a Corte
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleApplyPresetTemplate({
                  title: "L'Ultima Difesa del Valico Innevato",
                  prompt: "Il party deve difendere un convoglio di profughi attraverso una gola ghiacciata assediata da un branco di giganti o lupi dell'inverno affamati.",
                  tone: 'Survival & Tattico',
                  encounterType: 'Prevalentemente Combattimento',
                  difficulty: 'Mortale',
                  pacing: 'Veloce & Incalzante',
                  plotTwist: 'Nessun Colpo di Scena',
                })
              }
              className="bg-background border-border hover:bg-muted text-foreground text-xs whitespace-nowrap h-7 shrink-0"
            >
              ❄️ Survival & Battaglia
            </Button>
          </div>
        </div>
      </div>

      {/* Output & Generated Story Section */}
      <div ref={outputRef} className="space-y-4">
        {isGenerating ? (
          <div className="bg-card border border-border/80 rounded-xl p-6 sm:p-10 text-center space-y-4 shadow-md">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto text-primary animate-pulse">
              <Wand2 className="w-7 h-7 animate-spin" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-headline text-foreground">Generazione della Quest in corso con {selectedAiModel}...</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                L&apos;IA sta componendo la storia integrando il tuo prompt, le regole homebrew e calcolando i PX D&D 5e.
              </p>
            </div>

            {/* Toggle Logs Button during loading */}
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLogsConsole(!showLogsConsole)}
                className="text-xs gap-1.5 bg-background border-border text-foreground hover:bg-muted font-medium"
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span>{showLogsConsole ? 'Nascondi Log Tecnico' : `📋 Mostra Log di Generazione in Tempo Reale (${generationLogs.length})`}</span>
              </Button>
            </div>

            {/* Live Logs Console */}
            {showLogsConsole && (
              <div className="mt-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2 max-w-2xl mx-auto shadow-inner">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400 font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                    Registro Eventi e Modellazione IA
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyLogs}
                    className="h-6 px-2 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono"
                  >
                    📋 Copia Log
                  </Button>
                </div>
                <div className="font-mono text-[11px] leading-relaxed text-zinc-300 max-h-48 overflow-y-auto space-y-1 p-1 whitespace-pre-wrap select-text">
                  {generationLogs.length > 0 ? (
                    generationLogs.map((line, idx) => (
                      <div key={idx} className={line.includes('❌') || line.includes('⚠️') ? 'text-amber-400 font-medium' : line.includes('✅') ? 'text-emerald-400 font-medium' : 'text-zinc-300'}>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-zinc-500 italic">Inizializzazione della chiamata IA in corso...</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : generationError ? (
          <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-6 sm:p-8 space-y-4 shadow-sm text-center">
            <div className="w-12 h-12 rounded-xl bg-destructive/20 border border-destructive/40 flex items-center justify-center mx-auto text-destructive">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold font-headline text-destructive">Errore durante la Generazione della Quest</h3>
              <p className="text-xs text-foreground/90 max-w-lg mx-auto mt-2 font-mono bg-background/80 p-2.5 rounded-lg border border-border text-left">
                {generationError}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                onClick={handleGenerateQuest}
                className="text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                🔄 Riprova Generazione
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLogsConsole(!showLogsConsole)}
                className="text-xs gap-1.5 bg-background border-border text-foreground hover:bg-muted"
              >
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span>{showLogsConsole ? 'Nascondi Log' : `📋 Mostra Log Tecnico (${generationLogs.length})`}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleCopyLogs}
                className="text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                📋 Copia Log per Assistenza
              </Button>
            </div>

            {/* Error Logs Console */}
            {showLogsConsole && (
              <div className="mt-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2 max-w-2xl mx-auto shadow-inner">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400 font-mono">
                  <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    Dettaglio Tecnico dell&apos;Errore
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyLogs}
                    className="h-6 px-2 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono"
                  >
                    📋 Copia Log
                  </Button>
                </div>
                <div className="font-mono text-[11px] leading-relaxed text-zinc-300 max-h-60 overflow-y-auto space-y-1 p-1 whitespace-pre-wrap select-text">
                  {generationLogs.length > 0 ? (
                    generationLogs.map((line, idx) => (
                      <div key={idx} className={line.includes('❌') || line.includes('⚠️') ? 'text-rose-400 font-semibold' : line.includes('✅') ? 'text-emerald-400' : 'text-zinc-300'}>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-zinc-500 italic">Nessun dettaglio di log registrato.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : !generatedStory ? (
          <div className="bg-card border border-border/80 rounded-xl p-6 sm:p-8 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mx-auto text-muted-foreground">
              <Scroll className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-headline text-foreground">In attesa della prima generazione</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                Inserisci uno spunto nel box sopra e clicca su &quot;✨ Genera Quest Ora&quot; per comporre l&apos;avventura.
              </p>
            </div>
            {generationLogs.length > 0 && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogsConsole(!showLogsConsole)}
                  className="text-xs gap-1.5 font-mono"
                >
                  <Bot className="w-3.5 h-3.5 text-primary" />
                  <span>{showLogsConsole ? 'Nascondi Ultimi Log' : `📋 Mostra Ultimi Log (${generationLogs.length})`}</span>
                </Button>
                {showLogsConsole && (
                  <div className="mt-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2 max-w-2xl mx-auto shadow-inner">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400 font-mono">
                      <span>Registro Log Sessione Precedente</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyLogs}
                        className="h-6 px-2 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono"
                      >
                        📋 Copia Log
                      </Button>
                    </div>
                    <div className="font-mono text-[11px] leading-relaxed text-zinc-300 max-h-48 overflow-y-auto space-y-1 p-1 whitespace-pre-wrap select-text">
                      {generationLogs.map((line, idx) => (
                        <div key={idx} className={line.includes('❌') || line.includes('⚠️') ? 'text-amber-400' : 'text-zinc-300'}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border/80 rounded-xl p-4 sm:p-6 shadow-md space-y-5">
            {/* Header with Title & Model Used Badge */}
            <div className="flex flex-col gap-3 border-b border-border/60 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      Bozza Quest Pronta
                    </Badge>

                    {/* Model Used Badge showing actual model or fallback status */}
                    {actualModelUsed && (
                      <Badge
                        variant={actualModelUsed === selectedAiModel ? 'outline' : 'destructive'}
                        className={`text-[10px] font-mono flex items-center gap-1 ${
                          actualModelUsed === selectedAiModel
                            ? 'bg-primary/10 text-primary border-primary/40'
                            : 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                        }`}
                      >
                        {actualModelUsed === selectedAiModel ? (
                          <>
                            <Zap className="w-3 h-3 text-primary shrink-0" />
                            <span>Modello: {actualModelUsed}</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>Scalato a: {actualModelUsed} (Fallback da {selectedAiModel})</span>
                          </>
                        )}
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black font-headline text-foreground tracking-tight">
                    {generatedTitle}
                  </h2>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="p-2 rounded-lg bg-background border border-border text-right">
                    <span className="text-[10px] text-muted-foreground block uppercase tracking-wider font-semibold">PX D&D 5e</span>
                    <span className="text-base sm:text-lg font-bold text-primary">{generatedXp.toLocaleString()} PX</span>
                  </div>
                </div>
              </div>

              {/* Primary Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  onClick={() => setShowXpManager(true)}
                  variant="outline"
                  size="sm"
                  className="bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 font-semibold text-xs h-9"
                >
                  <Trophy className="w-3.5 h-3.5 mr-1.5 text-primary" />
                  Assegna PX ai PG
                </Button>

                <Button
                  onClick={() => setIsManualEditing(!isManualEditing)}
                  variant="outline"
                  size="sm"
                  className="bg-background border-border text-foreground hover:bg-muted text-xs h-9"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1.5 text-primary" />
                  {isManualEditing ? 'Visualizza Formattato' : 'Modifica Testo a Mano'}
                </Button>

                {generationLogs.length > 0 && (
                  <Button
                    onClick={() => setShowLogsConsole(!showLogsConsole)}
                    variant="outline"
                    size="sm"
                    className="bg-background border-border text-foreground hover:bg-muted text-xs h-9"
                  >
                    <Bot className="w-3.5 h-3.5 mr-1.5 text-primary" />
                    {showLogsConsole ? 'Nascondi Log' : `📋 Log Generazione (${generationLogs.length})`}
                  </Button>
                )}

                <Button
                  onClick={handleSaveAsSession}
                  disabled={isSavingSession}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 shadow-md shadow-emerald-900/30 ml-auto"
                >
                  {isSavingSession ? (
                    'Salvataggio...'
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Salva come Nuova Sessione
                    </>
                  )}
                </Button>
              </div>

              {/* Optional Log Console View when story is ready */}
              {showLogsConsole && generationLogs.length > 0 && (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-left space-y-2 shadow-inner mt-2">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-400 font-mono">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-emerald-500" />
                      Registro Passaggi della Generazione
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyLogs}
                      className="h-6 px-2 text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono"
                    >
                      📋 Copia Log
                    </Button>
                  </div>
                  <div className="font-mono text-[11px] leading-relaxed text-zinc-300 max-h-48 overflow-y-auto space-y-1 p-1 whitespace-pre-wrap select-text">
                    {generationLogs.map((line, idx) => (
                      <div key={idx} className={line.includes('❌') || line.includes('⚠️') ? 'text-amber-400 font-medium' : line.includes('✅') ? 'text-emerald-400' : 'text-zinc-300'}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* XP Breakdown Grid */}
            {xpDetails && (
              <div className="p-3 rounded-xl bg-background/80 border border-border/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-card border border-border text-center">
                  <span className="text-muted-foreground block text-[9px]">Combattimento</span>
                  <span className="font-bold text-rose-500 text-xs sm:text-sm">+{xpDetails.combatXp || xpDetails.combat_xp || 0} PX</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border text-center">
                  <span className="text-muted-foreground block text-[9px]">Traguardi Quest</span>
                  <span className="font-bold text-amber-500 text-xs sm:text-sm">+{xpDetails.questMilestoneXp || xpDetails.quest_milestone_xp || 0} PX</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border text-center">
                  <span className="text-muted-foreground block text-[9px]">Esplorazione & Segreti</span>
                  <span className="font-bold text-cyan-500 text-xs sm:text-sm">+{xpDetails.explorationXp || xpDetails.exploration_xp || 0} PX</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border text-center">
                  <span className="text-muted-foreground block text-[9px]">Roleplay & Scelte</span>
                  <span className="font-bold text-emerald-500 text-xs sm:text-sm">+{xpDetails.roleplayDilemmaXp || xpDetails.roleplay_dilemma_xp || 0} PX</span>
                </div>
              </div>
            )}

            {/* Story Narrative Output or Manual Editor */}
            {isManualEditing ? (
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-foreground">
                  Modifica Manuale del Testo della Quest:
                </Label>
                <Textarea
                  rows={14}
                  value={generatedStory}
                  onChange={e => setGeneratedStory(e.target.value)}
                  className="bg-background border-input text-foreground text-xs sm:text-sm leading-relaxed font-mono"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsManualEditing(false);
                      toast({ title: 'Modifiche manuali applicate!' });
                    }}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Fatto
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 sm:p-6 rounded-xl bg-background border border-border text-foreground text-xs sm:text-sm leading-relaxed overflow-x-auto">
                <MarkdownRenderer content={generatedStory} />
              </div>
            )}

            {/* Generated Entities: Dedicated NPC and Magic Items Sheets with One-Click Import */}
            {generatedEntities && generatedEntities.length > 0 && (
              <div className="p-4 sm:p-5 rounded-xl bg-card border border-border/90 shadow-md space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="text-base font-bold font-headline text-foreground flex items-center gap-2">
                        Schede Dedicate PNG & Oggetti Magici Generati
                      </h3>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-mono">
                        {generatedEntities.length} {generatedEntities.length === 1 ? 'Entità' : 'Entità'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      L&apos;IA ha generato automaticamente le statistiche di gioco D&amp;D 5e complete. Clicca su &quot;Importa&quot; per archiviarle direttamente nelle sezioni dedicate della campagna.
                    </p>
                  </div>

                  <Button
                    onClick={handleImportAllEntities}
                    disabled={isImportingAll || generatedEntities.every((_, i) => importedEntityKeys.has(`${generatedEntities[i].name}_${i}`))}
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8 px-3 shrink-0 shadow-sm"
                  >
                    {isImportingAll ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Importazione in corso...
                      </>
                    ) : generatedEntities.every((_, i) => importedEntityKeys.has(`${generatedEntities[i].name}_${i}`)) ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                        Tutte le Schede Importate
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        📥 Importa Tutte nella Campagna
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {generatedEntities.map((ent, idx) => {
                    const key = `${ent.name}_${idx}`;
                    const isImported = importedEntityKeys.has(key);
                    const rawType = (ent.type || 'NPC').toUpperCase();
                    const isNpc = rawType.includes('NPC') || rawType === 'PNG';
                    const isItem = rawType.includes('ITEM') || rawType.includes('OGGETTO') || rawType.includes('MAGIC');
                    const isMonster = rawType.includes('MONSTER') || rawType.includes('MOSTRO');
                    const stats = ent.stats || {};

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-4 transition-all flex flex-col justify-between ${
                          isImported 
                            ? 'bg-muted/30 border-emerald-500/40 opacity-90' 
                            : 'bg-background/90 border-border/80 hover:border-primary/50 shadow-sm'
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Card Header Badge and Type */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-black font-headline text-foreground tracking-tight">
                              {ent.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isNpc && (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <Users className="w-3 h-3" /> PNG 5e
                                </Badge>
                              )}
                              {isItem && (
                                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" /> Oggetto Magico
                                </Badge>
                              )}
                              {isMonster && (
                                <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <Skull className="w-3 h-3" /> Mostro / Boss
                                </Badge>
                              )}
                              {!isNpc && !isItem && !isMonster && (
                                <Badge className="bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" /> Dossier Lore
                                </Badge>
                              )}
                              {isImported && (
                                <Badge className="bg-emerald-500 text-emerald-950 font-bold text-[10px]">
                                  Salvato ✅
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Specific D&D 5e Stat Block Rendering */}
                          {isNpc && (
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 text-muted-foreground flex-wrap text-[11px]">
                                {stats.race && <span className="font-medium text-foreground">{stats.race}</span>}
                                {stats.role && <span>• {stats.role}</span>}
                                {stats.alignment && <span className="italic">• {stats.alignment}</span>}
                                {stats.cr && <Badge variant="outline" className="text-[10px] py-0">{stats.cr}</Badge>}
                              </div>

                              {(stats.armorClass || stats.hitPoints || stats.speed) && (
                                <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-lg bg-muted/40 text-center text-[10px] font-semibold">
                                  <div>CA: <span className="text-primary font-bold">{stats.armorClass || stats.ac || '10'}</span></div>
                                  <div>PF: <span className="text-rose-400 font-bold">{stats.hitPoints || stats.hp || '10'}</span></div>
                                  <div>Velocità: <span className="text-foreground">{stats.speed || '9 m'}</span></div>
                                </div>
                              )}

                              {stats.attributes && typeof stats.attributes === 'object' && (
                                <div className="grid grid-cols-6 gap-1 p-1 rounded-lg bg-background border border-border/60 text-center text-[9px] font-mono">
                                  <div><span className="text-muted-foreground block">FOR</span><span className="font-bold">{stats.attributes.str ?? 10}</span></div>
                                  <div><span className="text-muted-foreground block">DES</span><span className="font-bold">{stats.attributes.dex ?? 10}</span></div>
                                  <div><span className="text-muted-foreground block">COS</span><span className="font-bold">{stats.attributes.con ?? 10}</span></div>
                                  <div><span className="text-muted-foreground block">INT</span><span className="font-bold">{stats.attributes.int ?? 10}</span></div>
                                  <div><span className="text-muted-foreground block">SAG</span><span className="font-bold">{stats.attributes.wis ?? 10}</span></div>
                                  <div><span className="text-muted-foreground block">CAR</span><span className="font-bold">{stats.attributes.cha ?? 10}</span></div>
                                </div>
                              )}

                              {stats.actions && (
                                <div className="text-[11px] bg-muted/20 p-2 rounded border border-border/50">
                                  <strong className="text-foreground">Azioni: </strong>
                                  <span className="text-muted-foreground">{stats.actions}</span>
                                </div>
                              )}

                              {stats.personality && (
                                <div className="text-[11px] text-muted-foreground italic">
                                  &quot;{stats.personality}&quot;
                                </div>
                              )}
                            </div>
                          )}

                          {isItem && (
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                {stats.rarity && (
                                  <Badge variant="outline" className={`text-[10px] py-0 ${
                                    stats.rarity.toLowerCase().includes('leggendar') ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' :
                                    stats.rarity.toLowerCase().includes('molto') ? 'text-purple-400 border-purple-500/40 bg-purple-500/10' :
                                    stats.rarity.toLowerCase().includes('rara') ? 'text-sky-400 border-sky-500/40 bg-sky-500/10' :
                                    'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                                  }`}>
                                    {stats.rarity}
                                  </Badge>
                                )}
                                {stats.itemType && <span className="font-medium text-foreground">{stats.itemType}</span>}
                                {stats.attunement && <span className="text-muted-foreground text-[10px]">({stats.attunement})</span>}
                                {stats.cost && <span className="text-amber-400 font-mono text-[10px] ml-auto">{stats.cost}</span>}
                              </div>

                              {stats.properties && (
                                <div className="text-[11px] bg-muted/20 p-2 rounded border border-border/50">
                                  <strong className="text-foreground">Proprietà: </strong>
                                  <span className="text-muted-foreground">{stats.properties}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {isMonster && (
                            <div className="space-y-2 text-xs">
                              <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                                {stats.type && <span className="font-medium text-foreground">{stats.type}</span>}
                                {stats.challenge && <Badge variant="outline" className="text-[10px] py-0 text-rose-400 border-rose-500/30">GS {stats.challenge}</Badge>}
                              </div>
                              {(stats.armorClass || stats.hitPoints) && (
                                <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-lg bg-muted/40 text-center text-[10px] font-semibold">
                                  <div>CA: <span className="text-primary font-bold">{stats.armorClass || stats.ac || '10'}</span></div>
                                  <div>PF: <span className="text-rose-400 font-bold">{stats.hitPoints || stats.hp || '10'}</span></div>
                                </div>
                              )}
                              {stats.actions && (
                                <div className="text-[11px] bg-muted/20 p-2 rounded border border-border/50">
                                  <strong className="text-foreground">Azioni: </strong>
                                  <span className="text-muted-foreground">{stats.actions}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Description text */}
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                            {ent.description}
                          </p>
                        </div>

                        {/* Card Import Button */}
                        <div className="pt-3 mt-2 border-t border-border/50 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isImported}
                            onClick={() => handleImportEntity(ent, key)}
                            className={`text-xs h-7 px-3 font-semibold ${
                              isImported
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                                : 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/40'
                            }`}
                          >
                            {isImported ? (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                                Importato
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5 mr-1" />
                                {isNpc ? 'Importa nei PNG' : isItem ? 'Importa negli Oggetti' : isMonster ? 'Importa nel Bestiario' : 'Importa nella Lore'}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Post-Creation AI Refinement Bar */}
            <div className="p-3.5 rounded-xl bg-background border border-border space-y-2.5">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5 font-headline">
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                Raffina o Modifica con IA ({selectedAiModel})
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  placeholder="Es. Rendi l'inseguimento più teso, oppure aggiungi un dialogo con il PNG..."
                  value={modificationRequest}
                  onChange={e => setModificationRequest(e.target.value)}
                  className="bg-card border-input text-xs text-foreground h-9"
                />
                <Button
                  onClick={handleModifyQuest}
                  disabled={isModifying || !modificationRequest.trim()}
                  className="bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs shrink-0 h-9 px-4 font-semibold"
                >
                  {isModifying ? (
                    'Revisione in corso...'
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Applica Modifiche
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Side Slide-Over Sheet Drawer for Customization */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="right" className="bg-card border-l border-border text-foreground sm:max-w-xl w-full p-0 flex flex-col h-full overflow-hidden">
          <SheetHeader className="p-4 border-b border-border bg-muted/40 shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-bold font-headline text-foreground flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                Personalizza Contesto & Database Quest
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Seleziona liberamente quali elementi e modelli includere per la prossima storia.
            </SheetDescription>
          </SheetHeader>

          {/* Drawer Inner Navigation Tabs */}
          <div className="flex items-center gap-1 p-2 bg-muted/60 border-b border-border overflow-x-auto text-xs shrink-0 no-scrollbar">
            <button
              onClick={() => setDrawerTab('pcs')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'pcs' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              👥 PG ({pcsCount})
            </button>
            <button
              onClick={() => setDrawerTab('npcs')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'npcs' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              🎭 PNG ({npcsCount})
            </button>
            <button
              onClick={() => setDrawerTab('items')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'items' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              🗡️ Oggetti ({itemsCount})
            </button>
            <button
              onClick={() => setDrawerTab('locations')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'locations' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              🗺️ Luoghi ({locationsCount})
            </button>
            <button
              onClick={() => setDrawerTab('links')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'links' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              🔗 Agganci ({linksCount})
            </button>
            <button
              onClick={() => setDrawerTab('params')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'params' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              🎯 Stile & Sfida
            </button>
            <button
              onClick={() => setDrawerTab('sources')}
              className={`px-2.5 py-1.5 rounded-md font-medium shrink-0 transition-all ${
                drawerTab === 'sources' ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              📚 Fonti Memoria
            </button>
          </div>

          {/* Drawer Tab Content Body */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
            {/* Drawer Tab 1: Personaggi Giocanti (PG) */}
            {drawerTab === 'pcs' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-foreground">PG del Party (Inclusi di default)</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSelectAllPcs} className="text-primary hover:underline">Tutti</button>
                    <span className="text-muted-foreground">•</span>
                    <button type="button" onClick={handleDeselectAllPcs} className="text-muted-foreground hover:underline">Nessuno</button>
                  </div>
                </div>

                {(!campaign.playerCharacters || campaign.playerCharacters.length === 0) ? (
                  <p className="text-muted-foreground py-4 text-center">Nessun PG registrato nella campagna.</p>
                ) : (
                  campaign.playerCharacters.map(pc => {
                    const config = selectedPcs.find(p => p.pcId === pc.id);
                    const isSelected = !!config;

                    return (
                      <div
                        key={pc.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected ? 'bg-background border-primary/40' : 'bg-background/40 border-border opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label htmlFor={`drawer-pc-${pc.id}`} className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
                            <input
                              type="checkbox"
                              id={`drawer-pc-${pc.id}`}
                              checked={isSelected}
                              onChange={() => handleTogglePc(pc)}
                              className="rounded text-primary bg-background border-input"
                            />
                            <span>{pc.name}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">({pc.class} Liv. {pc.level || 1})</span>
                          </label>
                        </div>

                        {isSelected && config && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.includeIdeals}
                                  onChange={e => handleUpdatePcConfig(pc.id, { includeIdeals: e.target.checked })}
                                  className="rounded text-primary bg-background"
                                />
                                Ideali & Legami
                              </label>
                              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.includeFlaws}
                                  onChange={e => handleUpdatePcConfig(pc.id, { includeFlaws: e.target.checked })}
                                  className="rounded text-primary bg-background"
                                />
                                Difetti
                              </label>
                            </div>
                            <Input
                              type="text"
                              placeholder="Focus per questo PG nella quest (opzionale)..."
                              value={config.customFocus || ''}
                              onChange={e => handleUpdatePcConfig(pc.id, { customFocus: e.target.value })}
                              className="h-7 bg-background border-input text-xs text-foreground"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drawer Tab 2: PNG */}
            {drawerTab === 'npcs' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-foreground">PNG Registrati nella Campagna</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSelectAllNpcs} className="text-primary hover:underline">Tutti</button>
                    <span className="text-muted-foreground">•</span>
                    <button type="button" onClick={handleDeselectAllNpcs} className="text-muted-foreground hover:underline">Nessuno</button>
                  </div>
                </div>

                {(!campaign.npcs || campaign.npcs.length === 0) ? (
                  <p className="text-muted-foreground py-4 text-center">Nessun PNG salvato nella campagna.</p>
                ) : (
                  campaign.npcs.map(npc => {
                    const parsed = typeof npc.details === 'string' ? JSON.parse(npc.details || '{}') : npc.details;
                    const name = parsed?.name || npc.name || 'PNG Senza Nome';
                    const selected = selectedNpcs.find(n => n.npcId === npc.id);
                    const isSelected = !!selected;

                    return (
                      <div
                        key={npc.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected ? 'bg-background border-primary/40' : 'bg-background/40 border-border opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label htmlFor={`drawer-npc-${npc.id}`} className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
                            <input
                              type="checkbox"
                              id={`drawer-npc-${npc.id}`}
                              checked={isSelected}
                              onChange={() => handleToggleNpc(npc)}
                              className="rounded text-primary bg-background"
                            />
                            <span>{name}</span>
                          </label>
                        </div>

                        {isSelected && selected && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <select
                              value={selected.role}
                              onChange={e => handleUpdateNpcRole(npc.id, e.target.value as any)}
                              className="w-full h-7 rounded bg-background border border-input text-foreground text-xs px-2"
                            >
                              <option value="amico">🟢 Amico / Alleato sincero</option>
                              <option value="nemico">🔴 Antagonista / Nemico</option>
                              <option value="doppiogiochista">🟣 Doppiogiochista (Traditore)</option>
                              <option value="da_amico_a_nemico">🟠 Da Amico a Nemico</option>
                              <option value="da_nemico_a_amico">🔵 Redento</option>
                              <option value="compagno_party">🟡 Spalla del Party</option>
                            </select>
                            <Input
                              type="text"
                              placeholder="Note sul PNG per la storia..."
                              value={selected.customGoal || ''}
                              onChange={e => handleUpdateNpcRole(npc.id, selected.role, e.target.value)}
                              className="h-7 bg-background border-input text-xs text-foreground"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drawer Tab 3: Oggetti */}
            {drawerTab === 'items' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-foreground">Oggetti Magici & Armi</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSelectAllItems} className="text-primary hover:underline">Tutti</button>
                    <span className="text-muted-foreground">•</span>
                    <button type="button" onClick={handleDeselectAllItems} className="text-muted-foreground hover:underline">Nessuno</button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pb-1">
                  <button
                    type="button"
                    onClick={() => setItemSourceFilter('all')}
                    className={`px-2 py-0.5 rounded text-[10px] ${itemSourceFilter === 'all' ? 'bg-primary/20 text-primary font-bold border border-primary/40' : 'bg-background text-muted-foreground'}`}
                  >
                    Tutti ({campaign.magicItems?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemSourceFilter('base')}
                    className={`px-2 py-0.5 rounded text-[10px] ${itemSourceFilter === 'base' ? 'bg-primary/20 text-primary font-bold border border-primary/40' : 'bg-background text-muted-foreground'}`}
                  >
                    🛡️ SRD Base
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemSourceFilter('created')}
                    className={`px-2 py-0.5 rounded text-[10px] ${itemSourceFilter === 'created' ? 'bg-primary/20 text-primary font-bold border border-primary/40' : 'bg-background text-muted-foreground'}`}
                  >
                    ✨ Custom
                  </button>
                </div>

                {(filteredMagicItems.length === 0) ? (
                  <p className="text-muted-foreground py-4 text-center">Nessun oggetto corrispondente al filtro.</p>
                ) : (
                  filteredMagicItems.map(item => {
                    const selected = selectedItems.find(i => i.itemId === item.id);
                    const isSelected = !!selected;

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected ? 'bg-background border-primary/40' : 'bg-background/40 border-border opacity-60'
                        }`}
                      >
                        <label htmlFor={`drawer-item-${item.id}`} className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
                          <input
                            type="checkbox"
                            id={`drawer-item-${item.id}`}
                            checked={isSelected}
                            onChange={() => handleToggleItem(item)}
                            className="rounded text-primary bg-background"
                          />
                          <span>{item.name}</span>
                        </label>

                        {isSelected && selected && (
                          <div className="space-y-2 pt-2 border-t border-border mt-2">
                            <select
                              value={selected.role}
                              onChange={e => handleUpdateItemRole(item.id!, e.target.value as any)}
                              className="w-full h-7 rounded bg-background border border-input text-foreground text-xs px-2"
                            >
                              <option value="necessario">🔑 Chiave / Necessario</option>
                              <option value="trovato">🎁 Ricompensa / Trovato</option>
                              <option value="rubato">🗡️ Rubato / Da recuperare</option>
                              <option value="in_possesso">🛡️ In possesso del party</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drawer Tab 4: Luoghi */}
            {drawerTab === 'locations' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-foreground">Luoghi del Mondo</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSelectAllLocations} className="text-primary hover:underline">Tutti</button>
                    <span className="text-muted-foreground">•</span>
                    <button type="button" onClick={handleDeselectAllLocations} className="text-muted-foreground hover:underline">Nessuno</button>
                  </div>
                </div>

                {(!campaign.worldLocations || campaign.worldLocations.length === 0) ? (
                  <p className="text-muted-foreground py-4 text-center">Nessun luogo registrato nella mappa.</p>
                ) : (
                  campaign.worldLocations.map(loc => {
                    const isSelected = selectedLocations.some(l => l.locationId === loc.id);

                    return (
                      <div
                        key={loc.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected ? 'bg-background border-primary/40' : 'bg-background/40 border-border opacity-60'
                        }`}
                      >
                        <label htmlFor={`drawer-loc-${loc.id}`} className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
                          <input
                            type="checkbox"
                            id={`drawer-loc-${loc.id}`}
                            checked={isSelected}
                            onChange={() => handleToggleLocation(loc)}
                            className="rounded text-primary bg-background"
                          />
                          <span>{loc.name}</span>
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drawer Tab 5: Agganci */}
            {drawerTab === 'links' && (
              <div className="space-y-3">
                <div className="border-b border-border pb-2">
                  <span className="font-bold text-foreground">Agganci alle Sessioni Precedenti</span>
                </div>

                {(!campaign.sessions || campaign.sessions.length === 0) ? (
                  <p className="text-muted-foreground py-4 text-center">Nessuna sessione passata registrata.</p>
                ) : (
                  campaign.sessions.map(sess => {
                    const isLinked = previousQuestLinks.some(l => l.sessionId === sess.id);

                    return (
                      <div
                        key={sess.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isLinked ? 'bg-background border-primary/40' : 'bg-background/40 border-border opacity-60'
                        }`}
                      >
                        <label htmlFor={`drawer-link-${sess.id}`} className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
                          <input
                            type="checkbox"
                            id={`drawer-link-${sess.id}`}
                            checked={isLinked}
                            onChange={() => handleToggleSessionLink(sess)}
                            className="rounded text-primary bg-background"
                          />
                          <span>Sess. {sess.session_number}: {sess.title}</span>
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Drawer Tab 6: Parametri & Stile */}
            {drawerTab === 'params' && (
              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <span className="font-bold text-foreground">Parametri Narrativi e Sfida</span>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Tono Narrativo</Label>
                  <select
                    value={narrativeTone}
                    onChange={e => setNarrativeTone(e.target.value as any)}
                    className="w-full h-8 rounded bg-background border border-input text-foreground text-xs px-2.5"
                  >
                    <option value="Epico ed Eroico">Epico ed Eroico</option>
                    <option value="Cupo & Horror">Cupo & Horror</option>
                    <option value="Investigativo & Mistero">Investigativo & Mistero</option>
                    <option value="Survival & Tattico">Survival & Tattico</option>
                    <option value="Divertente & Leggero">Divertente & Leggero</option>
                    <option value="Politico & Intrigo">Politico & Intrigo</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Tipologia Incontro</Label>
                  <select
                    value={primaryEncounterType}
                    onChange={e => setPrimaryEncounterType(e.target.value as any)}
                    className="w-full h-8 rounded bg-background border border-input text-foreground text-xs px-2.5"
                  >
                    <option value="Bilanciato (Combattimento + Sociale + Esplorazione)">Bilanciato</option>
                    <option value="Prevalentemente Combattimento">Prevalentemente Combattimento</option>
                    <option value="Investigativo & Sociale">Investigativo & Sociale</option>
                    <option value="Dungeon Crawl & Enigmi">Dungeon Crawl & Enigmi</option>
                    <option value="Furtivo & Infiltrazione">Furtivo & Infiltrazione</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Grado di Difficoltà D&D 5e</Label>
                  <select
                    value={targetDifficulty}
                    onChange={e => setTargetDifficulty(e.target.value as any)}
                    className="w-full h-8 rounded bg-background border border-input text-foreground text-xs px-2.5"
                  >
                    <option value="Facile">Facile</option>
                    <option value="Medio">Medio</option>
                    <option value="Difficile">Difficile</option>
                    <option value="Mortale">Mortale</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground block mb-1">Minacce o Mostri Specifici (opzionale)</Label>
                  <Input
                    type="text"
                    placeholder="Es. 1 Lich, 2 Golem di Pietra..."
                    value={specificThreatsOrMonsters}
                    onChange={e => setSpecificThreatsOrMonsters(e.target.value)}
                    className="h-8 bg-background border-input text-xs text-foreground"
                  />
                </div>
              </div>
            )}

            {/* Drawer Tab 7: Memory Sources */}
            {drawerTab === 'sources' && (
              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <span className="font-bold text-foreground">Fonti di Memoria Attive</span>
                </div>

                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">Riassunto Arco / Trama Generale</span>
                    <span className="text-muted-foreground text-[11px]">Mantiene la coerenza a lungo termine della campagna.</span>
                  </div>
                  <Switch checked={includeCampaignSummary} onCheckedChange={setIncludeCampaignSummary} />
                </div>

                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">Ultime 2-3 Sessioni Recenti</span>
                    <span className="text-muted-foreground text-[11px]">Aggancia la storia direttamente agli ultimi avvenimenti.</span>
                  </div>
                  <Switch checked={includeRecentSessionsSummary} onCheckedChange={setIncludeRecentSessionsSummary} />
                </div>

                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">Almanacco Lore & Mondo</span>
                    <span className="text-muted-foreground text-[11px]">Inietta informazioni generali su luoghi e fazioni.</span>
                  </div>
                  <Switch checked={includeGlobalLore} onCheckedChange={setIncludeGlobalLore} />
                </div>

                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">Regole Homebrew Attive</span>
                    <span className="text-muted-foreground text-[11px]">Inietta le regole personalizzate della campagna.</span>
                  </div>
                  <Switch checked={includeHomebrewRules} onCheckedChange={setIncludeHomebrewRules} />
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-border bg-muted/40 shrink-0 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {pcsCount} PG • {npcsCount} PNG • {itemsCount} Oggetti
            </span>
            <Button
              onClick={() => setIsDrawerOpen(false)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 font-semibold"
            >
              <Check className="w-4 h-4 mr-1.5" />
              ✓ Applica Opzioni
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Modal Party XP Manager */}
      {showXpManager && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            <PartyXpManager
              campaignId={campaign.id}
              playerCharacters={campaign.playerCharacters || []}
              initialBaseXp={generatedXp || 300}
              initialReason={generatedTitle ? `Quest: ${generatedTitle}` : 'Completamento Quest'}
              onPcsUpdated={pcs => {
                if (onPcsUpdated) onPcsUpdated(pcs);
              }}
              onClose={() => setShowXpManager(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
