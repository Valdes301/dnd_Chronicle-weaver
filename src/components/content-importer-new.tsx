'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import * as actions from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Sparkles,
  BookOpen,
  FileUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Save,
  Trash2,
  ExternalLink,
  HelpCircle,
  Eye,
  Layers,
  ArrowRight,
  ArrowRightLeft,
  Shield,
  Zap,
  Tag,
  Crosshair,
  Crop,
  Maximize2,
  BookmarkPlus,
  RefreshCw,
  FolderPlus,
  Compass,
  FileText,
  X,
  Plus,
  Check,
  Copy,
  Search,
  Sword,
  Gem,
  BrainCircuit,
  SlidersHorizontal,
  Cpu,
  Pencil,
  ChevronDown,
  ChevronUp,
  Clock,
  Activity,
  Terminal,
  Timer,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeMonsterType, sanitizeMonsterName, cleanAiHallucinatoryLoops } from '@/lib/formatter';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageCropperModal } from './image-cropper-modal';
import { ThumbnailFramerModal } from './thumbnail-framer-modal';
import AiLogMonitor from './AiLogMonitor';
import { DiagnosticModal } from './diagnostic-modal';

interface ContentImporterNewProps {
  campaignId: string;
}

export type ManualSource = 'auto' | 'mm' | 'dmg' | 'phb';
export type TargetFilter = 'all' | 'monsters_only' | 'rules_only' | 'spells_only' | 'items_only' | 'skills_only';

export interface ExtractedMonsterCard {
  id: string;
  name: string;
  type?: string;
  armorClass?: string;
  hitPoints?: string;
  challenge?: string;
  description: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  rawPageImage?: string | null;
  pageImages?: string[];
  imageBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number } | null;
  tokenBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number } | null;
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

export interface ExtractedEquipmentCard {
  id: string;
  name: string;
  category: 'Armeria';
  type: string;
  cost?: string;
  weight?: string;
  damage?: string;
  armorClass?: string;
  properties?: string;
  description: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  rawPageImage?: string | null;
  pageImages?: string[];
  imageBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number } | null;
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

export interface ExtractedMagicItemCard {
  id: string;
  name: string;
  category: 'Oggetti';
  type: string;
  rarity: string;
  attunement: string;
  cost?: string;
  weight?: string;
  damage?: string;
  armorClass?: string;
  properties?: string;
  abilityCheck?: string;
  description: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  rawPageImage?: string | null;
  pageImages?: string[];
  imageBox?: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number } | null;
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

export interface ExtractedSpellCard {
  id: string;
  name: string;
  level: string;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  classes?: string;
  description: string;
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

export interface ExtractedSkillCard {
  id: string;
  name: string;
  type?: string;
  level?: string;
  actionType?: string;
  resourceCost?: string;
  ability?: string;
  description: string;
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

export interface ExtractedRuleCard {
  id: string;
  title: string;
  content: string;
  sourceBook: 'phb' | 'dmg' | 'mm' | 'custom';
  chapterTitle?: string;
  tags?: string[];
  savedCampaign?: boolean;
  savedGlobal?: boolean;
  isSaving?: boolean;
}

interface QueueItem {
  id: string;
  file?: File;
  name: string;
  size: number;
  previewUrl?: string;
  type: 'image' | 'pdf' | 'text';
  pdfDoc?: any;
  totalPages?: number;
  startPage?: number | string;
  endPage?: number | string;
  currentPage?: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  extractedMonstersCount?: number;
  extractedEquipmentCount?: number;
  extractedItemsCount?: number;
  extractedSpellsCount?: number;
  extractedSkillsCount?: number;
  extractedRulesCount?: number;
  extractedNames?: string[];
}

// Version: 20261026-v2 - Standarized models list
const RECOMMENDED_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', badge: '3.8 Flash', desc: 'Modello principale Flash ad alte prestazioni' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', badge: '3.6 Flash', desc: 'Modello bilanciato per analisi multimodali' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', badge: '3.5 Lite', desc: 'Versione ultra-veloce a bassa latenza' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', badge: '3.1 Lite', desc: 'Ottimizzato per efficienza e scansioni rapide' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Preview', badge: '3 Preview', desc: 'Anteprima tecnologica di nuova generazione' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: '2.5 Flash', desc: 'Modello legacy affidabile per compatibilità' },
];

const SESSION_PERSISTENCE_KEY = 'dnd_importer_scan_checkpoints_v1';

const getFileFingerprint = (file: File) => `${file.name}-${file.size}`;

const saveCheckpoint = (fileFingerprint: string, data: any) => {
  try {
    const raw = localStorage.getItem(SESSION_PERSISTENCE_KEY);
    const sessions = raw ? JSON.parse(raw) : {};
    sessions[fileFingerprint] = {
      ...data,
      timestamp: Date.now()
    };
    localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn("Impossibile salvare il checkpoint di scansione:", e);
  }
};

const getCheckpoint = (fileFingerprint: string) => {
  try {
    const raw = localStorage.getItem(SESSION_PERSISTENCE_KEY);
    if (!raw) return null;
    const sessions = JSON.parse(raw);
    return sessions[fileFingerprint] || null;
  } catch (e) {
    return null;
  }
};

const clearCheckpoint = (fileFingerprint: string) => {
  try {
    const raw = localStorage.getItem(SESSION_PERSISTENCE_KEY);
    if (!raw) return;
    const sessions = JSON.parse(raw);
    delete sessions[fileFingerprint];
    localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(sessions));
  } catch (e) {}
};

export function ContentImporterNew({ campaignId }: ContentImporterNewProps) {
  const { toast } = useToast();
  const router = useRouter();

  const triggerGlobalSync = () => {
    try {
      router.refresh();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dnd-data-updated'));
      }
    } catch {}
  };
  
  // Opzioni di Scansione
  const [sourceManual, setSourceManual] = useState<ManualSource>('auto');
  const [targetContentType, setTargetContentType] = useState<TargetFilter>('all');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  
  // Coda e Stato di Elaborazione
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number | null>(null);
  const [currentProgressText, setCurrentProgressText] = useState<string>('');
  const [activeModelInUse, setActiveModelInUse] = useState<string>('gemini-3.8-flash');
  const [pageProgressPercent, setPageProgressPercent] = useState<number>(0);
  const [pageProgressDetails, setPageProgressDetails] = useState<{ current: number; total: number; fileName: string } | null>(null);

  // Gestione Ripristino Sessione
  const [resumeDialog, setResumeDialog] = useState<{
    isOpen: boolean;
    file: File;
    checkpoint: any;
  } | null>(null);

  // Metriche e Monitoraggio Attività in Tempo Reale
  const [elapsedTotalSeconds, setElapsedTotalSeconds] = useState<number>(0);
  const [currentPageSeconds, setCurrentPageSeconds] = useState<number>(0);
  const [averagePageDuration, setAveragePageDuration] = useState<number | null>(null);
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' | 'speed' }>>([]);
  const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(false);

  // Ispezione Log di Debug Temporaneo (data/last_scan_debug.json)
  const [showDebugModal, setShowDebugModal] = useState<boolean>(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState<boolean>(true);
  const conflictResolverRef = useRef<((choice: 'overwrite' | 'skip') => void) | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    isOpen: boolean;
    type: 'monster' | 'equipment' | 'item' | 'spell' | 'skill';
    item: any;
    existingName: string;
    existingId: string;
    bulkIndex?: number;
    bulkTotal?: number;
  } | null>(null);
  const [savingAllProgress, setSavingAllProgress] = useState<{
    isActive: boolean;
    current: number;
    total: number;
    currentName: string;
    category: string;
    saved: number;
    overwritten: number;
    skipped: number;
    errors: number;
    isPausedForConflict: boolean;
  } | null>(null);
  const [debugLogData, setDebugLogData] = useState<any>(null);
  const [isLoadingDebugLog, setIsLoadingDebugLog] = useState<boolean>(false);
  const [copiedLog, setCopiedLog] = useState<boolean>(false);

  const fetchDebugLog = async () => {
    setIsLoadingDebugLog(true);
    try {
      const res = await fetch('/api/catalog-new', { method: 'GET' });
      const json = await res.json();
      if (json.exists && json.log) {
        setDebugLogData(json.log);
      } else {
        setDebugLogData(null);
      }
    } catch (err: any) {
      console.warn("Impossibile caricare il log di debug:", err);
      setDebugLogData({ error: "Errore durante il recupero del file di log." });
    } finally {
      setIsLoadingDebugLog(false);
    }
  };

  // Timer live per monitorare i secondi trascorsi
  useEffect(() => {
    let interval: any = null;
    if (isProcessing) {
      interval = setInterval(() => {
        setElapsedTotalSeconds(s => s + 1);
        setCurrentPageSeconds(s => s + 1);
      }, 1000);
    } else {
      setCurrentPageSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing]);

  const addActivityLog = (text: string, type: 'info' | 'success' | 'warn' | 'speed' = 'info') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setActivityLogs(prev => [
      { id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, time: timeStr, text, type },
      ...prev.slice(0, 49) // conserva gli ultimi 50 log
    ]);
  };
  
  // Risultati Estratti per Categoria
  const [monsters, setMonsters] = useState<ExtractedMonsterCard[]>([]);
  const [equipment, setEquipment] = useState<ExtractedEquipmentCard[]>([]);
  const [magicItems, setMagicItems] = useState<ExtractedMagicItemCard[]>([]);
  const [spells, setSpells] = useState<ExtractedSpellCard[]>([]);
  const [skills, setSkills] = useState<ExtractedSkillCard[]>([]);
  const [rules, setRules] = useState<ExtractedRuleCard[]>([]);

  const [activeTab, setActiveTab] = useState<'all' | 'monsters' | 'equipment' | 'items' | 'spells' | 'skills' | 'rules'>('all');
  
  // Modali Ritaglio Immagine & Miniatura
  const [framerModal, setFramerModal] = useState<{
    isOpen: boolean;
    targetId: string;
    targetType: 'monster' | 'equipment' | 'item';
    imageSrc: string;
    name: string;
    availablePages?: string[];
  }>({
    isOpen: false,
    targetId: '',
    targetType: 'monster',
    imageSrc: '',
    name: '',
  });

  const [cropperModal, setCropperModal] = useState<{
    isOpen: boolean;
    targetId: string;
    targetType: 'monster' | 'equipment' | 'item';
    imageSrc: string;
    name: string;
    availablePages?: string[];
  }>({
    isOpen: false,
    targetId: '',
    targetType: 'monster',
    imageSrc: '',
    name: '',
  });

  // Lightbox Immagine Ingrandita con Zoom
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);

  // Stato Espansione Schede
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const toggleExpandCard = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const allResultIds = [
    ...monsters.map(m => m.id),
    ...equipment.map(e => e.id),
    ...magicItems.map(i => i.id),
    ...spells.map(s => s.id),
    ...skills.map(sk => sk.id),
    ...rules.map(r => r.id),
  ];
  const areAllExpanded = allResultIds.length > 0 && allResultIds.every(id => Boolean(expandedCards[id]));
  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedCards({});
    } else {
      const next: Record<string, boolean> = {};
      allResultIds.forEach(id => { next[id] = true; });
      setExpandedCards(next);
    }
  };

  // Stato Modale di Modifica con Matita
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    category: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule';
    initialCategory: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule';
    entity: any;
  }>({
    isOpen: false,
    category: 'monster',
    initialCategory: 'monster',
    entity: null,
  });

  const handleOpenEditModal = (category: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule', entity: any) => {
    setEditModal({
      isOpen: true,
      category,
      initialCategory: category,
      entity: { ...entity }
    });
  };

  // Conversione e Spostamento Rapido tra Categorie (Mostri, Regole, Armeria, Oggetti, Magie, Abilità)
  const handleConvertCategory = (
    fromCategory: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule',
    toCategory: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule',
    entity: any
  ) => {
    if (fromCategory === toCategory || !entity) return;

    const id = entity.id || Math.random().toString(36).substring(2, 9);
    const name = entity.name || entity.title || 'Nuovo Elemento';
    const desc = entity.description || entity.content || '';
    const imageUrl = entity.imageUrl || null;
    const thumbnailUrl = entity.thumbnailUrl || null;
    const rawPageImage = entity.rawPageImage || null;
    const pageImages = entity.pageImages || [];
    const imageBox = entity.imageBox || null;
    const tokenBox = entity.tokenBox || null;

    // 1. Rimuovi dalla categoria di origine
    if (fromCategory === 'monster') setMonsters(prev => prev.filter(m => m.id !== entity.id));
    else if (fromCategory === 'equipment') setEquipment(prev => prev.filter(e => e.id !== entity.id));
    else if (fromCategory === 'item') setMagicItems(prev => prev.filter(i => i.id !== entity.id));
    else if (fromCategory === 'spell') setSpells(prev => prev.filter(s => s.id !== entity.id));
    else if (fromCategory === 'skill') setSkills(prev => prev.filter(sk => sk.id !== entity.id));
    else if (fromCategory === 'rule') setRules(prev => prev.filter(r => r.id !== entity.id));

    // 2. Crea nella categoria di destinazione
    if (toCategory === 'monster') {
      const newMonster: ExtractedMonsterCard = {
        id,
        name: sanitizeMonsterName(name),
        type: sanitizeMonsterType(entity.type || 'Creatura'),
        armorClass: entity.armorClass || '',
        hitPoints: entity.hitPoints || '',
        challenge: entity.challenge || entity.level || '',
        description: cleanAiHallucinatoryLoops(desc),
        imageUrl,
        thumbnailUrl,
        rawPageImage,
        pageImages,
        imageBox,
        tokenBox
      };
      setMonsters(prev => [newMonster, ...prev]);
      toast({ title: "Spostato nel Bestiario 🐉", description: `"${name}" è ora tra i mostri.` });
      setActiveTab('monsters');
    } else if (toCategory === 'equipment') {
      const newEq: ExtractedEquipmentCard = {
        id,
        name,
        category: 'Armeria',
        type: entity.type || 'Arma / Equipaggiamento',
        cost: entity.cost || '',
        weight: entity.weight || '',
        damage: entity.damage || '',
        armorClass: entity.armorClass || '',
        properties: entity.properties || '',
        description: desc,
        imageUrl,
        thumbnailUrl,
        rawPageImage,
        imageBox
      };
      setEquipment(prev => [newEq, ...prev]);
      toast({ title: "Spostato in Armeria ⚔️", description: `"${name}" è ora nell'armeria.` });
      setActiveTab('equipment');
    } else if (toCategory === 'item') {
      const newItem: ExtractedMagicItemCard = {
        id,
        name,
        category: 'Oggetti',
        type: entity.type || 'Oggetto Meraviglioso',
        rarity: entity.rarity || 'Comune',
        attunement: entity.attunement || 'No',
        cost: entity.cost || '',
        weight: entity.weight || '',
        damage: entity.damage || '',
        armorClass: entity.armorClass || '',
        properties: entity.properties || '',
        description: desc,
        imageUrl,
        thumbnailUrl,
        rawPageImage,
        imageBox
      };
      setMagicItems(prev => [newItem, ...prev]);
      toast({ title: "Spostato negli Oggetti 📦", description: `"${name}" è ora tra gli oggetti e tesori.` });
      setActiveTab('items');
    } else if (toCategory === 'spell') {
      const newSpell: ExtractedSpellCard = {
        id,
        name,
        level: entity.level || '1° Livello',
        school: entity.school || 'Universale',
        casting_time: entity.casting_time || '1 azione',
        range: entity.range || 'Personale',
        components: entity.components || 'V, S',
        duration: entity.duration || 'Istantanea',
        classes: entity.classes || '',
        description: desc
      };
      setSpells(prev => [newSpell, ...prev]);
      toast({ title: "Spostato negli Incantesimi ✨", description: `"${name}" è ora nel grimorio.` });
      setActiveTab('spells');
    } else if (toCategory === 'skill') {
      const newSkill: ExtractedSkillCard = {
        id,
        name,
        type: entity.type || 'Privilegio / Tratto',
        ability: entity.ability || '',
        description: desc
      };
      setSkills(prev => [newSkill, ...prev]);
      toast({ title: "Spostato nelle Abilità 🧠", description: `"${name}" è ora tra le abilità/tratti.` });
      setActiveTab('skills');
    } else if (toCategory === 'rule') {
      let sourceBook: 'phb' | 'dmg' | 'mm' | 'custom' = 'dmg';
      if (sourceManual === 'phb') sourceBook = 'phb';
      else if (sourceManual === 'mm') sourceBook = 'mm';
      else if (sourceManual === 'dmg') sourceBook = 'dmg';

      const newRule: ExtractedRuleCard = {
        id,
        title: name,
        content: desc,
        sourceBook,
        chapterTitle: entity.chapterTitle || entity.type || undefined,
        tags: entity.tags || (entity.challenge ? [`GS ${entity.challenge}`] : [])
      };
      setRules(prev => [newRule, ...prev]);
      toast({ title: "Spostato nelle Regole 📜", description: `"${name}" è ora tra le regole generali.` });
      setActiveTab('rules');
    }
  };

  const handleSaveEditModal = () => {
    if (!editModal.entity) return;
    const updated = editModal.entity;
    const cat = editModal.category;
    const initialCat = editModal.initialCategory || cat;

    // Se la categoria è stata cambiata durante la modifica:
    if (cat !== initialCat) {
      // Rimuovi dalla categoria iniziale
      if (initialCat === 'monster') setMonsters(prev => prev.filter(m => m.id !== updated.id));
      else if (initialCat === 'equipment') setEquipment(prev => prev.filter(e => e.id !== updated.id));
      else if (initialCat === 'item') setMagicItems(prev => prev.filter(i => i.id !== updated.id));
      else if (initialCat === 'spell') setSpells(prev => prev.filter(s => s.id !== updated.id));
      else if (initialCat === 'skill') setSkills(prev => prev.filter(sk => sk.id !== updated.id));
      else if (initialCat === 'rule') setRules(prev => prev.filter(r => r.id !== updated.id));

      // Aggiungi alla nuova categoria con campi sanitizzati
      const name = updated.name || updated.title || 'Nuovo Elemento';
      const desc = updated.description || updated.content || '';

      if (cat === 'monster') {
        setMonsters(prev => [{
          ...updated,
          id: updated.id,
          name: sanitizeMonsterName(name),
          type: sanitizeMonsterType(updated.type || 'Creatura'),
          description: cleanAiHallucinatoryLoops(desc)
        }, ...prev]);
        setActiveTab('monsters');
      } else if (cat === 'equipment') {
        setEquipment(prev => [{
          ...updated,
          id: updated.id,
          name,
          category: 'Armeria',
          type: updated.type || 'Arma / Equipaggiamento',
          description: desc
        }, ...prev]);
        setActiveTab('equipment');
      } else if (cat === 'item') {
        setMagicItems(prev => [{
          ...updated,
          id: updated.id,
          name,
          category: 'Oggetti',
          type: updated.type || 'Oggetto Meraviglioso',
          description: desc
        }, ...prev]);
        setActiveTab('items');
      } else if (cat === 'spell') {
        setSpells(prev => [{
          ...updated,
          id: updated.id,
          name,
          description: desc
        }, ...prev]);
        setActiveTab('spells');
      } else if (cat === 'skill') {
        setSkills(prev => [{
          ...updated,
          id: updated.id,
          name,
          description: desc
        }, ...prev]);
        setActiveTab('skills');
      } else if (cat === 'rule') {
        setRules(prev => [{
          ...updated,
          id: updated.id,
          title: name,
          content: desc,
          sourceBook: updated.sourceBook || 'dmg'
        }, ...prev]);
        setActiveTab('rules');
      }
      toast({ title: "Categoria Aggiornata!", description: `Scheda salvata nella nuova categoria scelta.` });
    } else {
      // Stessa categoria, aggiornamento diretto
      if (cat === 'monster') {
        const sanitized = {
          ...updated,
          type: sanitizeMonsterType(updated.type),
          description: cleanAiHallucinatoryLoops(updated.description)
        };
        setMonsters(prev => prev.map(m => m.id === updated.id ? { ...m, ...sanitized } : m));
      } else if (cat === 'equipment') {
        setEquipment(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
      } else if (cat === 'item') {
        setMagicItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
      } else if (cat === 'spell') {
        setSpells(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      } else if (cat === 'skill') {
        setSkills(prev => prev.map(sk => sk.id === updated.id ? { ...sk, ...updated } : sk));
      } else if (cat === 'rule') {
        setRules(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
      }
      toast({ title: "Modifiche Salvate!", description: "La scheda è stata aggiornata nell'anteprima." });
    }
    setEditModal({ isOpen: false, category: 'monster', initialCategory: 'monster', entity: null });
  };

  // Helper per il menu a tendina "Converti / Sposta in..."
  const renderCategorySwitchMenu = (
    fromCategory: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule',
    entity: any
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary hover:bg-primary/20 shrink-0"
          title="Sposta o Converti in altra Categoria"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-popover border-border text-popover-foreground text-xs shadow-xl min-w-[200px]">
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground">Sposta in Categoria</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {fromCategory !== 'rule' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'rule', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>📜</span> <span>Regola Generale (DMG/PHB)</span>
          </DropdownMenuItem>
        )}
        {fromCategory !== 'monster' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'monster', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>🐉</span> <span>Mostro / Bestiario</span>
          </DropdownMenuItem>
        )}
        {fromCategory !== 'equipment' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'equipment', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>⚔️</span> <span>Armeria (Arma / Armatura)</span>
          </DropdownMenuItem>
        )}
        {fromCategory !== 'item' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'item', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>📦</span> <span>Oggetto (Pozione, Attrezzo, Meraviglioso)</span>
          </DropdownMenuItem>
        )}
        {fromCategory !== 'spell' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'spell', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>✨</span> <span>Incantesimo</span>
          </DropdownMenuItem>
        )}
        {fromCategory !== 'skill' && (
          <DropdownMenuItem onClick={() => handleConvertCategory(fromCategory, 'skill', entity)} className="cursor-pointer gap-2 py-1.5">
            <span>🧠</span> <span>Abilità / Tratto</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Gestione Bozza Temporanea (Auto-Save & Ripristino Anti-Chiusura)
  const DRAFT_STORAGE_KEY = 'dnd_importer_draft_state_v3';
  const [hasSavedDraft, setHasSavedDraft] = useState<boolean>(false);
  const [savedDraftCount, setSavedDraftCount] = useState<{ total: number; summary: string }>({ total: 0, summary: '' });

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const isAbortedRef = useRef<boolean>(false);
  const currentAbortControllerRef = useRef<AbortController | null>(null);

  // Interruzione immediata di qualsiasi richiesta server residua allo smontaggio del componente
  useEffect(() => {
    return () => {
      isAbortedRef.current = true;
      if (currentAbortControllerRef.current) {
        try { currentAbortControllerRef.current.abort(); } catch {}
      }
      fetch('/api/catalog-new?action=abort', { method: 'POST' }).catch(() => {});
    };
  }, []);

  // Controllo bozza salvata all'avvio
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const count = (parsed.monsters?.length || 0) + (parsed.equipment?.length || 0) + (parsed.magicItems?.length || 0) + (parsed.spells?.length || 0) + (parsed.skills?.length || 0) + (parsed.rules?.length || 0);
        if (count > 0) {
          setHasSavedDraft(true);
          setSavedDraftCount({
            total: count,
            summary: `${parsed.monsters?.length || 0} Mostri, ${(parsed.equipment?.length || 0) + (parsed.magicItems?.length || 0)} Oggetti/Armi, ${parsed.spells?.length || 0} Incantesimi, ${parsed.rules?.length || 0} Regole`
          });
        }
      }
    } catch (e) {
      console.error("Errore lettura bozza:", e);
    }
  }, []);

  // Salvataggio automatico della bozza in tempo reale quando i risultati cambiano
  useEffect(() => {
    const totalCount = monsters.length + equipment.length + magicItems.length + spells.length + skills.length + rules.length;
    if (totalCount > 0) {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          monsters,
          equipment,
          magicItems,
          spells,
          skills,
          rules,
          updatedAt: Date.now()
        }));
      } catch (e) {
        console.warn("Salvataggio bozza temporaneo fallito:", e);
      }
    }
  }, [monsters, equipment, magicItems, spells, skills, rules]);

  const handleRestoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.monsters) {
          setMonsters(parsed.monsters.map((m: any) => ({
            ...m,
            type: sanitizeMonsterType(m.type),
            description: cleanAiHallucinatoryLoops(m.description)
          })));
        }
        if (parsed.equipment) setEquipment(parsed.equipment);
        if (parsed.magicItems) setMagicItems(parsed.magicItems);
        if (parsed.spells) setSpells(parsed.spells);
        if (parsed.skills) setSkills(parsed.skills);
        if (parsed.rules) setRules(parsed.rules);
        toast({
          title: "Bozza Ripristinata!",
          description: `Recuperati ${savedDraftCount.total} elementi salvati in precedenza.`,
        });
        setHasSavedDraft(false);
      }
    } catch (e) {
      toast({ variant: 'destructive', title: "Errore Ripristino", description: "Impossibile recuperare la bozza salvata." });
    }
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasSavedDraft(false);
      toast({ title: "Bozza Scartata" });
    } catch {}
  };

  // Fusione rapida per unificare schede dello stesso mostro ripartite su più pagine (es. Pagina Lore + Pagina Statblock)
  const handleAutoMergeDuplicateMonsters = () => {
    if (monsters.length <= 1) {
      toast({ title: "Nessun duplicato", description: "È presente un solo mostro o la lista è vuota." });
      return;
    }
    const merged: ExtractedMonsterCard[] = [];
    
    for (const m of monsters) {
      const cleanName = sanitizeMonsterName(m.name);
      const cleanLow = cleanName.toLowerCase().trim();
      const simple = cleanLow.replace(/^[^:]+:\s*/, '').trim();

      const existingIdx = merged.findIndex(ex => {
        const exClean = sanitizeMonsterName(ex.name);
        const exLow = exClean.toLowerCase().trim();
        const exSimple = exLow.replace(/^[^:]+:\s*/, '').trim();
        if (exLow === cleanLow) return true;
        if ((exLow === 'angelo' && simple === 'deva') || (cleanLow === 'angelo' && exSimple === 'deva')) return true;
        if (simple === exSimple && simple.length >= 3 && !['creatura', 'mostro', 'demone', 'drago', 'diavolo'].includes(simple)) return true;
        return false;
      });

      if (existingIdx > -1) {
        const ex = merged[existingIdx];
        let preferredName = ex.name;
        if (m.name.includes(':') && !ex.name.includes(':')) {
          preferredName = m.name;
        } else if (ex.name.toLowerCase() === 'angelo' && m.name.toLowerCase().includes('deva')) {
          preferredName = m.name;
        }
        preferredName = sanitizeMonsterName(preferredName);

        const ac = (m.armorClass && m.armorClass.trim().length > 0) ? m.armorClass : ex.armorClass;
        const hp = (m.hitPoints && m.hitPoints.trim().length > 0) ? m.hitPoints : ex.hitPoints;
        const cr = (m.challenge && m.challenge.trim().length > 0) ? m.challenge : ex.challenge;
        const rawType = (m.type && m.type !== 'Mostro') ? m.type : ex.type;
        const type = sanitizeMonsterType(rawType);
        const prevPages = ex.pageImages || (ex.rawPageImage ? [ex.rawPageImage] : []);
        const incomingPages = m.pageImages || (m.rawPageImage ? [m.rawPageImage] : []);
        const mergedPageImages = Array.from(new Set([...prevPages, ...incomingPages])).filter(Boolean);

        const hasExArt = !!(ex.imageUrl && ex.imageUrl.length > 50);
        const hasNewArt = !!(m.imageUrl && m.imageUrl.length > 50);

        let imageUrl = ex.imageUrl || m.imageUrl;
        let thumbnailUrl = ex.thumbnailUrl || m.thumbnailUrl;
        let imageBox = ex.imageBox || m.imageBox;
        let tokenBox = ex.tokenBox || m.tokenBox;
        let rawPageImage = ex.rawPageImage || m.rawPageImage;

        if (!hasExArt && hasNewArt) {
          imageUrl = m.imageUrl;
          thumbnailUrl = m.thumbnailUrl;
          imageBox = m.imageBox;
          tokenBox = m.tokenBox;
          rawPageImage = m.rawPageImage;
        } else if (hasExArt && !hasNewArt) {
          imageUrl = ex.imageUrl;
          thumbnailUrl = ex.thumbnailUrl;
          imageBox = ex.imageBox;
          tokenBox = ex.tokenBox;
          rawPageImage = ex.rawPageImage;
        }

        let combinedDesc = ex.description;
        if (m.description) {
          const snippet = m.description.slice(0, 45).trim();
          if (!ex.description.includes(snippet)) {
            if (ex.description.includes('Frammenti del Divino') || ex.description.includes('Gli aboleth') || !ex.armorClass) {
              combinedDesc = `${ex.description}\n\n${m.description}`.trim();
            } else {
              combinedDesc = `${m.description}\n\n${ex.description}`.trim();
            }
          }
        }
        combinedDesc = cleanAiHallucinatoryLoops(combinedDesc);

        merged[existingIdx] = {
          ...ex,
          name: preferredName,
          type,
          armorClass: ac,
          hitPoints: hp,
          challenge: cr,
          description: combinedDesc,
          imageUrl,
          thumbnailUrl,
          imageBox,
          tokenBox,
          rawPageImage,
          pageImages: mergedPageImages
        };
      } else {
        merged.push({ ...m, name: cleanName });
      }
    }

    const removedCount = monsters.length - merged.length;
    setMonsters(merged);
    if (removedCount > 0) {
      toast({
        title: "Schede Unificate con Successo!",
        description: `Uniti ${removedCount} duplicati multi-pagina in schede complete di lore, statistiche e miniature.`,
      });
    } else {
      toast({
        title: "Nessun duplicato rilevato",
        description: "Tutte le schede dei mostri sono già uniche.",
      });
    }
  };

  // Supporto Paste (Ctrl+V / Cmd+V) diretto
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) files.push(blob);
        }
      }
      if (files.length > 0) {
        addFilesToQueue(files);
        toast({ title: "Screenshot Incollato!", description: `Aggiunto 1 elemento alla coda.` });
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Utility Ritaglio Canvas da coordinate Normalizzate o Box
  const cropCanvasBox = (
    base64Image: string,
    box: [number, number, number, number] | { ymin: number; xmin: number; ymax: number; xmax: number },
    forceSquare: boolean = false
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (!box || typeof window === 'undefined') return resolve('');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;

        let ymin: any, xmin: any, ymax: any, xmax: any;

        if (Array.isArray(box)) {
          [ymin, xmin, ymax, xmax] = box;
        } else if (typeof box === 'object' && box !== null) {
          const b = box as any;
          ymin = b.ymin ?? b.top ?? b.y1 ?? b.box_2d?.[0] ?? 0;
          xmin = b.xmin ?? b.left ?? b.x1 ?? b.box_2d?.[1] ?? 0;
          ymax = b.ymax ?? b.bottom ?? b.y2 ?? b.box_2d?.[2] ?? 1000;
          xmax = b.xmax ?? b.right ?? b.x2 ?? b.box_2d?.[3] ?? 1000;
        } else {
          return resolve('');
        }

        let nYmin = Number(ymin);
        let nXmin = Number(xmin);
        let nYmax = Number(ymax);
        let nXmax = Number(xmax);

        if (isNaN(nYmin) || isNaN(nXmin) || isNaN(nYmax) || isNaN(nXmax)) return resolve('');

        let realYmin = Math.max(0, Math.min(nYmin, nYmax));
        let realYmax = Math.max(nYmin, nYmax);
        let realXmin = Math.max(0, Math.min(nXmin, nXmax));
        let realXmax = Math.max(nXmin, nXmax);

        // Se le coordinate sono in scala 0..1, converti a 0..1000
        if (Math.max(realYmax, realXmax) <= 1.05) {
          realYmin = Math.round(realYmin * 1000);
          realYmax = Math.round(realYmax * 1000);
          realXmin = Math.round(realXmin * 1000);
          realXmax = Math.round(realXmax * 1000);
        }

        let sx = Math.max(0, Math.floor((realXmin / 1000) * iw));
        let sy = Math.max(0, Math.floor((realYmin / 1000) * ih));
        let sw = Math.min(iw - sx, Math.floor(((realXmax - realXmin) / 1000) * iw));
        let sh = Math.min(ih - sy, Math.floor(((realYmax - realYmin) / 1000) * ih));

        if (sw <= 10 || sh <= 10) return resolve('');

        if (forceSquare) {
          const size = Math.min(sw, sh);
          sx = sx + Math.floor((sw - size) / 2);
          sy = sy + Math.floor((sh - size) / 2);
          sw = size;
          sh = size;
        }

        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/jpeg', 0.90));
      };
      img.onerror = () => resolve('');
      img.src = base64Image;
    });
  };

  // Compressione e ottimizzazione per IA Vision (alta risoluzione per OCR tabelle e creature)
  const prepareImageForAi = (base64Str: string, maxWidth = 1200, maxHeight = 1200): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(base64Str);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let iw = img.naturalWidth || img.width;
        let ih = img.naturalHeight || img.height;
        
        // Se l'immagine è già nelle dimensioni target, usala direttamente senza re-render
        if (iw <= maxWidth && ih <= maxHeight) {
          return resolve(base64Str);
        }

        const ratio = Math.min(1, maxWidth / iw, maxHeight / ih);
        iw = Math.round(iw * ratio);
        ih = Math.round(ih * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = iw;
        canvas.height = ih;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        ctx.drawImage(img, 0, 0, iw, ih);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  };

  // PDF.js loader e renderer
  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error("Ambiente server"));
      if ((window as any).pdfjsLib) return resolve((window as any).pdfjsLib);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const pdfjs = (window as any).pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(pdfjs);
      };
      script.onerror = () => reject(new Error("Impossibile caricare il visualizzatore PDF."));
      document.head.appendChild(script);
    });
  };

  const isCanvasBlank = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
    try {
      const sampleCols = 24;
      const sampleRows = 28;
      const stepX = Math.floor(width / (sampleCols + 1));
      const stepY = Math.floor(height / (sampleRows + 1));
      let darkPixelCount = 0;
      let minLum = 255;
      let maxLum = 0;

      for (let r = 1; r <= sampleRows; r++) {
        for (let c = 1; c <= sampleCols; c++) {
          const x = c * stepX;
          const y = r * stepY;
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          // Luminanza percepita (BT.601)
          const lum = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2];
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
          if (lum < 205) {
            darkPixelCount++;
          }
        }
      }
      // Se non ci sono pixel scuri e il contrasto tra chiaro e scuro è minimo, la pagina è vuota/bianca
      if (darkPixelCount < 3 && (maxLum - minLum) < 35) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const renderPdfPage = async (pdfDoc: any, pageNum: number, maxWidth = 1000): Promise<{ dataUrl: string; isBlank: boolean }> => {
    const page = await pdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    // Scala bilanciata per D&D OCR veloce ma nitido (~1000px per ottimizzare token visivi ed evitare overflow)
    const scale = Math.max(1.1, Math.min(1.8, maxWidth / unscaledViewport.width));
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Contesto Canvas non disponibile");
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    const isBlank = isCanvasBlank(ctx, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { dataUrl, isBlank };
  };

  // Aggiunta file alla coda
  const addFilesToQueue = async (filesList: File[]) => {
    const newItems: QueueItem[] = [];

    for (const file of filesList) {
      const id = `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Controllo checkpoint per ripresa scansione interrotta (solo PDF)
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const fingerprint = getFileFingerprint(file);
        const checkpoint = getCheckpoint(fingerprint);
        if (checkpoint) {
          setResumeDialog({ isOpen: true, file, checkpoint });
          continue;
        }
      }

      if (file.type.startsWith('image/')) {
        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id,
          file,
          name: file.name,
          size: file.size,
          previewUrl,
          type: 'image',
          status: 'queued',
        });
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        try {
          const pdfjs = await loadPdfJs();
          const buffer = await file.arrayBuffer();
          const pdfDoc = await pdfjs.getDocument({ data: buffer }).promise;
          const totalPages = pdfDoc.numPages;
          newItems.push({
            id,
            file,
            name: file.name,
            size: file.size,
            type: 'pdf',
            pdfDoc,
            totalPages,
            startPage: 1,
            endPage: totalPages,
            currentPage: 1,
            status: 'queued',
          });
        } catch (e: any) {
          newItems.push({
            id,
            file,
            name: file.name,
            size: file.size,
            type: 'pdf',
            status: 'error',
            errorMessage: "PDF protetto o non leggibile",
          });
        }
      }
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
    }
  };

  const handleResumeSession = async (file: File, checkpoint: any) => {
    setResumeDialog(null);
    const id = `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      const pdfjs = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: buffer }).promise;
      const totalPages = pdfDoc.numPages;
      
      // Imposta il range di pagine per riprendere da dove interrotto
      const resumeFrom = checkpoint.lastPage + 1;
      const startPage = Math.max(1, Math.min(resumeFrom, totalPages));
      
      setQueue(prev => [...prev, {
        id,
        file,
        name: file.name,
        size: file.size,
        type: 'pdf',
        pdfDoc,
        totalPages,
        startPage,
        endPage: totalPages,
        currentPage: checkpoint.lastPage,
        status: 'queued',
        extractedMonstersCount: checkpoint.monstersCount || 0,
        extractedEquipmentCount: checkpoint.equipmentCount || 0,
        extractedItemsCount: checkpoint.itemsCount || 0,
        extractedSpellsCount: checkpoint.spellsCount || 0,
        extractedSkillsCount: checkpoint.skillsCount || 0,
        extractedRulesCount: checkpoint.rulesCount || 0,
        extractedNames: checkpoint.names || []
      }]);
      
      toast({ 
        title: "Sessione Ripristinata!", 
        description: `Ripresa da pagina ${startPage}. Recuperati ${checkpoint.monstersCount || 0} mostri già estratti.` 
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Ripristino", description: "Impossibile riprendere la sessione." });
    }
  };

  const handleNewSession = async (file: File) => {
    setResumeDialog(null);
    clearCheckpoint(getFileFingerprint(file));
    const id = `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    try {
      const pdfjs = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: buffer }).promise;
      setQueue(prev => [...prev, {
        id,
        file,
        name: file.name,
        size: file.size,
        type: 'pdf',
        pdfDoc,
        totalPages: pdfDoc.numPages,
        startPage: 1,
        endPage: pdfDoc.numPages,
        currentPage: 1,
        status: 'queued',
      }]);
    } catch (e) {
      toast({ variant: 'destructive', title: "Errore Caricamento", description: "Impossibile avviare una nuova scansione." });
    }
  };

  // Modifica campo pagina singolo con digitazione fluida
  const updatePdfField = (itemId: string, field: 'startPage' | 'endPage', rawValue: string) => {
    const cleanValue = rawValue.replace(/\D/g, '');
    setQueue(prev => prev.map(q => {
      if (q.id === itemId) {
        return {
          ...q,
          [field]: cleanValue,
          status: 'queued'
        };
      }
      return q;
    }));
  };

  // Normalizza e valida l'intervallo su blur
  const finalizePdfPageRange = (itemId: string) => {
    setQueue(prev => prev.map(q => {
      if (q.id === itemId) {
        const total = q.totalPages || 1;
        let s = parseInt(String(q.startPage ?? '1'), 10);
        let e = parseInt(String(q.endPage ?? total), 10);
        if (isNaN(s) || s < 1) s = 1;
        if (s > total) s = total;
        if (isNaN(e) || e < 1) e = total;
        if (e > total) e = total;
        if (s > e) e = s;
        return {
          ...q,
          startPage: s,
          endPage: e,
        };
      }
      return q;
    }));
  };

  // Modifica intervallo pagine per PDF (pulsanti rapidi)
  const updatePdfPageRange = (itemId: string, start: number, end: number) => {
    setQueue(prev => prev.map(q => {
      if (q.id === itemId) {
        const total = q.totalPages || 1;
        const validStart = Math.max(1, Math.min(start, total));
        const validEnd = Math.max(validStart, Math.min(end, total));
        return { 
          ...q, 
          startPage: validStart, 
          endPage: validEnd,
          status: 'queued' // Resetta lo stato a 'queued' per consentire il re-scan immediato
        };
      }
      return q;
    }));
  };

  const FALLBACK_MODELS_ROTATION = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash',
    'gemini-2.5-flash',
  ];

  const callCatalogWithRetry = async (baseInput: actions.CatalogHandbookNewInput, stepLabel: string = '') => {
    let attempt = 0;
    const maxAttempts = 2; // Failover rapido per evitare attese
    const preferred = baseInput.selectedModel || selectedModel || 'gemini-3.8-flash';
    const modelSequence = [
      preferred,
      ...FALLBACK_MODELS_ROTATION.filter(m => m !== preferred)
    ];

    while (attempt < maxAttempts) {
      if (isAbortedRef.current) {
        return { success: false, data: null, error: "Scansione interrotta dall'utente." };
      }

      attempt++;
      const currentAttemptModel = modelSequence[(attempt - 1) % modelSequence.length];
      setActiveModelInUse(currentAttemptModel);
      const inputParams = { ...baseInput, selectedModel: currentAttemptModel };

      const reqStart = Date.now();
      try {
        if (attempt > 1) {
          const msg = `Rotazione modello a ${currentAttemptModel} (tentativo ${attempt}/${maxAttempts})...`;
          setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}${msg}`);
          addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}${msg}`, 'warn');
        } else {
          const msg = `Scansione IA con ${currentAttemptModel}...`;
          setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}${msg}`);
          addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Invio dati all'IA (${currentAttemptModel})...`, 'info');
        }

        const controller = new AbortController();
        currentAbortControllerRef.current = controller;

        const response = await fetch('/api/catalog-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inputParams),
          signal: controller.signal,
        });
        
        currentAbortControllerRef.current = null;

        if (isAbortedRef.current) {
          return { success: false, data: null, error: "Scansione interrotta dall'utente." };
        }

        const rawText = await response.text();
        let res: any = null;
        try {
          res = JSON.parse(rawText);
        } catch {
          res = { 
            success: false, 
            data: null, 
            error: `Servizio IA temporaneamente occupato (HTTP ${response.status}).` 
          };
        }

        const durationSec = ((Date.now() - reqStart) / 1000).toFixed(1);

        if (res.success && res.data) {
          if (res.data.modelUsed) {
            setActiveModelInUse(res.data.modelUsed);
          }
          addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Risposta IA ricevuta in ${durationSec}s da ${res.data.modelUsed || currentAttemptModel}!`, 'speed');
          return res;
        }
        
        addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Risposta non valida (${durationSec}s): ${res.error || 'Nessun dato'}`, 'warn');

        // 5. Smart 429 Backoff & Resume:
        const errText = String(res?.error || rawText || '');
        const isQuota429 = response.status === 429 || /429|quota|exhausted|rate.?limit|too many requests/i.test(errText);
        if (isQuota429 && !isAbortedRef.current) {
          addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Limite quota/RPM rilevato (429/Resource Exhausted). Pausa di sicurezza di 15s per rigenerare i token...`, 'warn');
          for (let sec = 15; sec > 0; sec--) {
            if (isAbortedRef.current) break;
            setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}Attesa anticollisione quota (429): ripresa tra ${sec}s...`);
            await new Promise(r => setTimeout(r, 1000));
          }
          if (!isAbortedRef.current) {
            addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Quota ripristinata! Nuovo tentativo per la pagina in corso...`, 'speed');
            continue;
          }
        }

        if (attempt < maxAttempts && !isAbortedRef.current) {
          setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}Passaggio a modello successivo tra 1s (${attempt + 1}/${maxAttempts})...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return {
          success: false,
          data: null,
          error: res.error || "Servizio IA temporaneamente occupato."
        };
      } catch (err: any) {
        currentAbortControllerRef.current = null;
        if (isAbortedRef.current || err?.name === 'AbortError') {
          return { success: false, data: null, error: "Scansione interrotta dall'utente." };
        }

        const durationSec = ((Date.now() - reqStart) / 1000).toFixed(1);
        const errMsg = String(err?.message || err || '');
        addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Disconnessione o timeout (${durationSec}s): ${errMsg}`, 'warn');

        const isQuota429 = /429|quota|exhausted|rate.?limit|too many requests/i.test(errMsg);
        if (isQuota429 && !isAbortedRef.current) {
          addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Limite quota/RPM rilevato (429/Resource Exhausted). Pausa di sicurezza di 15s per rigenerare i token...`, 'warn');
          for (let sec = 15; sec > 0; sec--) {
            if (isAbortedRef.current) break;
            setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}Attesa anticollisione quota (429): ripresa tra ${sec}s...`);
            await new Promise(r => setTimeout(r, 1000));
          }
          if (!isAbortedRef.current) {
            addActivityLog(`${stepLabel ? stepLabel + ': ' : ''}Quota ripristinata! Nuovo tentativo per la pagina in corso...`, 'speed');
            continue;
          }
        }
        if (attempt < maxAttempts && !isAbortedRef.current) {
          setCurrentProgressText(`${stepLabel ? stepLabel + ' — ' : ''}Re-invio con modello di riserva...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return { 
          success: false, 
          data: null, 
          error: errMsg || "Connessione temporaneamente interrotta." 
        };
      }
    }
    return { success: false, data: null, error: "Servizio IA temporaneamente occupato." };
  };

  // Elaborazione ed estrazione oggetti/mostri da una pagina
  const processPageData = async (aiData: any, base64Raw: string) => {
    const {
      monsters: extractedMonsters = [],
      items: extractedItems = [],
      spells: extractedSpells = [],
      skills: extractedSkills = [],
      rules: extractedRules = []
    } = aiData;

    // 1. Mostri & Miniature
    const processedMonsters: ExtractedMonsterCard[] = [];
    for (const m of extractedMonsters) {
      let finalName = sanitizeMonsterName(m.name);
      const lowName = finalName.toLowerCase();
      const typeLow = (m.type || '').toLowerCase();
      const descLow = (m.description || '').toLowerCase();

      // Standardizzazione universale famiglie (Demoni, Diavoli, Angeli)
      if ((typeLow.includes('demone') || descLow.includes('demone')) && !lowName.startsWith('demone:') && !lowName.startsWith('demone ')) {
        finalName = `Demone: ${finalName}`;
      } else if ((typeLow.includes('diavolo') || descLow.includes('diavolo')) && !lowName.startsWith('diavolo:') && !lowName.startsWith('diavolo ')) {
        finalName = `Diavolo: ${finalName}`;
      } else if ((typeLow.includes('celestiale') || typeLow.includes('angelo') || descLow.includes('angelo')) && (lowName.includes('deva') || lowName.includes('planetar') || lowName.includes('solar') || lowName === 'angelo')) {
        const sub = lowName.includes('planetar') ? 'Planetar' : (lowName.includes('solar') ? 'Solar' : 'Deva');
        finalName = `Angelo: ${sub}`;
      }

      let activeImageBox = m.imageBox;
      let activeTokenBox = m.tokenBox;

      // Calcolo automatico e universale del tokenBox se presente l'artwork
      if (!activeTokenBox && activeImageBox) {
        const boxW = Math.abs(activeImageBox.xmax - activeImageBox.xmin);
        const boxH = Math.abs(activeImageBox.ymax - activeImageBox.ymin);
        const size = Math.min(boxW, boxH * 0.7);
        const centerX = activeImageBox.xmin + boxW / 2;
        const topY = activeImageBox.ymin + (boxH * 0.1);
        activeTokenBox = {
          ymin: Math.max(0, Math.round(topY)),
          xmin: Math.max(0, Math.round(centerX - size / 2)),
          ymax: Math.min(1000, Math.round(topY + size)),
          xmax: Math.min(1000, Math.round(centerX + size / 2))
        };
      }

      let fullArtUrl: string | null = null;
      let tokenUrl: string | null = null;

      const [croppedArt, croppedTok] = await Promise.all([
        activeImageBox ? cropCanvasBox(base64Raw, activeImageBox, false) : Promise.resolve(''),
        activeTokenBox 
          ? cropCanvasBox(base64Raw, activeTokenBox, true) 
          : (activeImageBox ? cropCanvasBox(base64Raw, activeImageBox, true) : Promise.resolve(''))
      ]);
      fullArtUrl = croppedArt || null;
      tokenUrl = croppedTok || null;

      const cleanType = sanitizeMonsterType(m.type) || (finalName.includes('Angelo') ? 'Celestiale Medio, legale buono' : 'Mostro');
      const cleanDesc = cleanAiHallucinatoryLoops(m.description);

      processedMonsters.push({
        id: `monster-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: finalName,
        type: cleanType,
        armorClass: m.armorClass,
        hitPoints: m.hitPoints,
        challenge: m.challenge,
        description: cleanDesc,
        imageUrl: fullArtUrl || null,
        thumbnailUrl: tokenUrl || null,
        rawPageImage: base64Raw,
        pageImages: base64Raw ? [base64Raw] : [],
        imageBox: activeImageBox || m.imageBox,
        tokenBox: activeTokenBox || m.tokenBox,
      });
    }

    // 2. Armeria vs Oggetti
    const processedEquipment: ExtractedEquipmentCard[] = [];
    const processedMagicItems: ExtractedMagicItemCard[] = [];

    for (const item of extractedItems) {
      let fullArtUrl: string | null = null;
      let thumbUrl: string | null = null;

      if (item.imageBox) {
        fullArtUrl = await cropCanvasBox(base64Raw, item.imageBox, false);
        thumbUrl = await cropCanvasBox(base64Raw, item.imageBox, true);
      }

      if (item.category === 'Armeria') {
        processedEquipment.push({
          id: `equip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: item.name,
          category: 'Armeria',
          type: item.type || 'Arma / Equipaggiamento',
          cost: item.cost,
          weight: item.weight,
          damage: item.damage,
          armorClass: item.armorClass,
          properties: item.properties,
          description: item.description,
          imageUrl: fullArtUrl || null,
          thumbnailUrl: thumbUrl || null,
          rawPageImage: base64Raw,
          imageBox: item.imageBox,
        });
      } else {
        processedMagicItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: item.name,
          category: 'Oggetti',
          type: item.type || 'Oggetto Meraviglioso',
          rarity: item.rarity || 'Comune',
          attunement: item.attunement || 'No',
          cost: item.cost,
          weight: item.weight,
          damage: item.damage,
          armorClass: item.armorClass,
          properties: item.properties,
          abilityCheck: item.abilityCheck,
          description: item.description,
          imageUrl: fullArtUrl || null,
          thumbnailUrl: thumbUrl || null,
          rawPageImage: base64Raw,
          imageBox: item.imageBox,
        });
      }
    }

    // 3. Incantesimi
    const processedSpells: ExtractedSpellCard[] = extractedSpells.map((s: any) => ({
      id: `spell-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: s.name,
      level: s.level || '0',
      school: s.school || 'Universale',
      casting_time: s.casting_time || '1 azione',
      range: s.range || 'Personale',
      components: s.components || 'V, S',
      duration: s.duration || 'Istantanea',
      classes: s.classes,
      description: s.description,
    }));

    // 4. Abilità (con salvaguardia capacità di gruppo mostri)
    const rawSkillsList: ExtractedSkillCard[] = extractedSkills.map((sk: any) => ({
      id: `skill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: sk.name,
      type: sk.type,
      level: sk.level,
      actionType: sk.actionType,
      resourceCost: sk.resourceCost,
      ability: sk.ability,
      description: sk.description,
    }));

    // 5. Regole (con salvaguardia sezioni tana / lore mostri)
    const rawRulesList: ExtractedRuleCard[] = extractedRules
      .filter((r: any) => (r.content || r.contenuto || r.testo || r.description || r.text || '').trim().length > 5)
      .map((r: any) => ({
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: r.title,
        content: r.content || r.contenuto || r.testo || r.description || r.text,
        sourceBook: r.sourceBook || (sourceManual === 'dmg' ? 'dmg' : 'phb'),
        chapterTitle: r.chapterTitle,
        tags: r.tags || [],
      }));

    // Fusione di Abilità di Gruppo (es. Evocare Elementali dell'Aria) e Regole di Tana nella Scheda Mostro
    const processedSkills: ExtractedSkillCard[] = [];
    for (const sk of rawSkillsList) {
      const skTitleLow = (sk.name || '').toLowerCase();
      const skDescLow = (sk.description || '').toLowerCase();
      const isGroupAbility = skTitleLow.includes('evocare') || skTitleLow.includes('danza') || skTitleLow.includes('elementali');
      
      let matched = processedMonsters.find(m => {
        const mLow = m.name.toLowerCase();
        return (mLow.includes('aarakocra') && (isGroupAbility || skDescLow.includes('aarakocra'))) ||
               skTitleLow.includes(mLow) || skDescLow.includes(mLow);
      });

      if (matched) {
        matched.description = `${matched.description}\n\n### ${sk.name}\n${sk.description}`.trim();
      } else {
        processedSkills.push(sk);
      }
    }

    const processedRules: ExtractedRuleCard[] = [];
    for (const r of rawRulesList) {
      const rTitleLow = (r.title || '').toLowerCase();
      const rContentLow = (r.content || '').toLowerCase();
      
      let matched = processedMonsters.find(m => {
        const mLow = m.name.toLowerCase();
        return (mLow.includes('aarakocra') && (rTitleLow.includes('elementali') || rContentLow.includes('aarakocra'))) ||
               (mLow.includes('aboleth') && (rTitleLow.includes('tana') || rContentLow.includes('aboleth'))) ||
               (mLow.includes('angelo') && (rTitleLow.includes('deva') || rContentLow.includes('deva') || rTitleLow.includes('frammenti del divino'))) ||
               rTitleLow.includes(mLow) || rContentLow.includes(mLow);
      });

      if (matched) {
        matched.description = `${matched.description}\n\n### ${r.title}\n${r.content}`.trim();
      } else {
        processedRules.push(r);
      }
    }

    // Aggiornamento Incrementale dello Stato con Fusione Intelligente Multi-Pagina
    if (processedMonsters.length > 0) {
      setMonsters(prev => {
        const next = [...prev];
        for (const newM of processedMonsters) {
          const newCleanName = sanitizeMonsterName(newM.name);
          const newNameLow = newCleanName.toLowerCase().trim();
          const newSimple = newNameLow.replace(/^[^:]+:\s*/, '').trim();

          const existingIdx = next.findIndex(m => {
            const mClean = sanitizeMonsterName(m.name).toLowerCase().trim();
            const mSimple = mClean.replace(/^[^:]+:\s*/, '').trim();
            return mClean === newNameLow || mSimple === newSimple || (mSimple.length > 3 && newSimple.length > 3 && (mSimple.includes(newSimple) || newSimple.includes(mSimple)));
          });

          if (existingIdx > -1) {
            const existing = next[existingIdx];
            const mergedAc = (newM.armorClass && newM.armorClass !== '10' && newM.armorClass.trim() !== '') ? newM.armorClass : existing.armorClass;
            const mergedHp = (newM.hitPoints && newM.hitPoints !== '10' && newM.hitPoints.trim() !== '') ? newM.hitPoints : existing.hitPoints;
            const mergedCr = (newM.challenge && newM.challenge !== '0' && newM.challenge.trim() !== '') ? newM.challenge : existing.challenge;
            const mergedType = newM.type && newM.type !== 'Mostro' ? newM.type : existing.type;
            const mergedImg = newM.imageUrl || existing.imageUrl;
            const mergedThumb = newM.thumbnailUrl || existing.thumbnailUrl;
            const mergedImgBox = newM.imageBox || existing.imageBox;
            const mergedTokenBox = newM.tokenBox || existing.tokenBox;

            let mergedDesc = existing.description || '';
            const newDesc = newM.description || '';
            if (!mergedDesc) {
              mergedDesc = newDesc;
            } else if (newDesc && !mergedDesc.includes(newDesc.slice(0, 50)) && !newDesc.includes(mergedDesc.slice(0, 50))) {
              mergedDesc = `${mergedDesc}\n\n${newDesc}`.trim();
            }

            next[existingIdx] = {
              ...existing,
              name: existing.name || newCleanName,
              type: mergedType,
              armorClass: mergedAc,
              hitPoints: mergedHp,
              challenge: mergedCr,
              imageUrl: mergedImg,
              thumbnailUrl: mergedThumb,
              imageBox: mergedImgBox,
              tokenBox: mergedTokenBox,
              description: mergedDesc,
            };
          } else {
            next.push({ ...newM, name: newCleanName });
          }
        }
        return next;
      });
    }
    if (processedEquipment.length > 0) {
      setEquipment(prev => {
        const next = [...prev];
        for (const newE of processedEquipment) {
          const eClean = newE.name.toLowerCase().trim();
          const existingIdx = next.findIndex(e => e.name.toLowerCase().trim() === eClean);
          if (existingIdx > -1) {
            const ex = next[existingIdx];
            next[existingIdx] = {
              ...ex,
              cost: newE.cost || ex.cost,
              damage: newE.damage || ex.damage,
              armorClass: newE.armorClass || ex.armorClass,
              properties: newE.properties || ex.properties,
              imageUrl: newE.imageUrl || ex.imageUrl,
              thumbnailUrl: newE.thumbnailUrl || ex.thumbnailUrl,
              description: ex.description && newE.description && !ex.description.includes(newE.description.slice(0, 40)) ? `${ex.description}\n\n${newE.description}` : (newE.description || ex.description)
            };
          } else {
            next.push(newE);
          }
        }
        return next;
      });
    }
    if (processedMagicItems.length > 0) {
      setMagicItems(prev => {
        const next = [...prev];
        for (const newI of processedMagicItems) {
          const iClean = newI.name.toLowerCase().trim();
          const existingIdx = next.findIndex(i => i.name.toLowerCase().trim() === iClean);
          if (existingIdx > -1) {
            const ex = next[existingIdx];
            next[existingIdx] = {
              ...ex,
              cost: newI.cost || ex.cost,
              damage: newI.damage || ex.damage,
              rarity: newI.rarity || ex.rarity,
              attunement: newI.attunement || ex.attunement,
              imageUrl: newI.imageUrl || ex.imageUrl,
              thumbnailUrl: newI.thumbnailUrl || ex.thumbnailUrl,
              description: ex.description && newI.description && !ex.description.includes(newI.description.slice(0, 40)) ? `${ex.description}\n\n${newI.description}` : (newI.description || ex.description)
            };
          } else {
            next.push(newI);
          }
        }
        return next;
      });
    }
    if (processedSpells.length > 0) {
      setSpells(prev => {
        const existingNames = new Set(prev.map(s => s.name.toLowerCase().trim()));
        const unique = processedSpells.filter(s => !existingNames.has(s.name.toLowerCase().trim()));
        return [...prev, ...unique];
      });
    }
    if (processedSkills.length > 0) {
      setSkills(prev => {
        const existingNames = new Set(prev.map(sk => sk.name.toLowerCase().trim()));
        const unique = processedSkills.filter(sk => !existingNames.has(sk.name.toLowerCase().trim()));
        return [...prev, ...unique];
      });
    }
    if (processedRules.length > 0) {
      setRules(prev => {
        const existingTitles = new Set(prev.map(r => r.title.toLowerCase().trim()));
        const unique = processedRules.filter(r => !existingTitles.has(r.title.toLowerCase().trim()));
        return [...prev, ...unique];
      });
    }

    const names = [
      ...processedMonsters.map(m => m.name),
      ...processedEquipment.map(e => e.name),
      ...processedMagicItems.map(i => i.name),
      ...processedSpells.map(s => s.name),
      ...processedSkills.map(sk => sk.name),
      ...processedRules.map(r => r.title),
    ];

    return {
      monstersCount: processedMonsters.length,
      equipmentCount: processedEquipment.length,
      itemsCount: processedMagicItems.length,
      spellsCount: processedSpells.length,
      skillsCount: processedSkills.length,
      rulesCount: processedRules.length,
      names
    };
  };

  // Importazione diretta dal file di log diagnostico temporaneo (last_scan_debug.json) nella schermata di revisione
  const handleImportFromDebugLog = async () => {
    if (!debugLogData) return;
    try {
      const rawExtracted = debugLogData.extractedData;
      const monstersList = rawExtracted?.monsters || (debugLogData.summary?.monstersFound || []).map((m: any) => ({
        name: m.name,
        type: m.type || 'Creatura',
        armorClass: m.armorClass || '',
        hitPoints: m.hitPoints || '',
        challenge: m.challenge || '',
        description: m.description || `Tipo: ${m.type || 'Creatura'}\nCA: ${m.armorClass || '-'}\nPF: ${m.hitPoints || '-'}\nGS: ${m.challenge || '-'}`,
        imageBox: m.imageBox || null,
        tokenBox: m.tokenBox || null,
      }));

      const payload = {
        monsters: monstersList,
        items: rawExtracted?.items || [],
        spells: rawExtracted?.spells || [],
        skills: rawExtracted?.skills || [],
        rules: rawExtracted?.rules || [],
        pageAnalysis: debugLogData.summary?.pageAnalysis || null
      };

      // Se c'è un elemento in coda con anteprima, usalo per ritagliare token e artwork
      let pageImage = '';
      if (queue.length > 0 && queue[0].file) {
        try {
          const reader = new FileReader();
          pageImage = await new Promise<string>((res) => {
            reader.onload = (e) => res((e.target?.result as string) || '');
            reader.onerror = () => res('');
            reader.readAsDataURL(queue[0].file!);
          });
        } catch {}
      } else if (queue.length > 0 && queue[0].previewUrl) {
        pageImage = queue[0].previewUrl;
      }

      const resCounts = await processPageData(payload, pageImage);
      setShowDebugModal(false);
      setActiveTab('monsters');
      toast({
        title: "Importazione Riuscita! 🎉",
        description: `Caricati ${resCounts.monstersCount} mostri nella schermata di revisione!`,
      });

      // Aggiorna lo stato della coda
      setQueue(prev => prev.map(q => ({
        ...q,
        status: 'done' as const,
        extractedMonstersCount: resCounts.monstersCount,
      })));
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: "Errore Importazione",
        description: e?.message || "Impossibile importare le schede dal log.",
      });
    }
  };

  // Riavvio immediato di un elemento specifico (Riprova / Riscansiona)
  const handleRestartScanItem = (itemId: string) => {
    if (isProcessing) return;
    const updated = queue.map(q => q.id === itemId ? { ...q, status: 'queued' as const, errorMessage: undefined } : q);
    setQueue(updated);
    setTimeout(() => {
      processQueue(updated);
    }, 60);
  };

  // Gestione Processamento Coda (Supporto sia Immagini che PDF Multi-pagina 350+ pag.)
  const processQueue = async (overrideQueue?: QueueItem[]) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setIsConfigExpanded(false);
    isAbortedRef.current = false;
    setElapsedTotalSeconds(0);
    setCurrentPageSeconds(0);
    setAveragePageDuration(null);
    setActivityLogs([]);
    addActivityLog("Avvio sessione di scansione...", "info");

    const itemsToProcess = Array.isArray(overrideQueue) ? overrideQueue : queue;
    for (let i = 0; i < itemsToProcess.length; i++) {
      if (isAbortedRef.current) break;
      const item = itemsToProcess[i];
      if (item.status === 'done') continue;

      setCurrentProcessingIndex(i);
      setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'processing' } : q));

      try {
        if (item.type === 'image' && item.file) {
          const imgStart = Date.now();
          setCurrentPageSeconds(0);
          setPageProgressDetails({ current: 1, total: 1, fileName: item.name });
          setPageProgressPercent(20);
          setCurrentProgressText(`Preparazione immagine ${item.name}...`);
          addActivityLog(`Caricamento immagine "${item.name}"...`, 'info');
          
          const reader = new FileReader();
          const base64Raw = await new Promise<string>((res, rej) => {
            reader.onload = (e) => res(e.target?.result as string);
            reader.onerror = rej;
            reader.readAsDataURL(item.file!);
          });

          const preparedBase64 = await prepareImageForAi(base64Raw, 1200, 1200);
          setPageProgressPercent(45);
          addActivityLog(`Immagine pronta (${Math.round(preparedBase64.length / 1024)} KB). Analisi con ${selectedModel}...`, 'info');

          const aiResponse = await callCatalogWithRetry({
            photoDataUri: preparedBase64,
            sourceManual,
            targetContentType,
            selectedModel,
          }, `File "${item.name}"`);

          if (!aiResponse.success || !aiResponse.data) {
            throw new Error(aiResponse.error || "Nessun dato restituito dall'AI");
          }

          setPageProgressPercent(80);
          setCurrentProgressText(`Ritaglio illustrazioni e salvataggio elementi...`);
          addActivityLog(`Ritaglio artwork e miniature...`, 'info');
          const resCounts = await processPageData(aiResponse.data, base64Raw);

          const imgDurationSec = ((Date.now() - imgStart) / 1000).toFixed(1);
          addActivityLog(`Completato "${item.name}" in ${imgDurationSec}s! (Mostri: ${resCounts.monstersCount}, Oggetti: ${resCounts.itemsCount}, Regole: ${resCounts.rulesCount})`, 'success');

          setPageProgressPercent(100);
          setQueue(prev => prev.map((q, idx) => idx === i ? { 
            ...q, 
            status: 'done',
            extractedMonstersCount: resCounts.monstersCount,
            extractedEquipmentCount: resCounts.equipmentCount,
            extractedItemsCount: resCounts.itemsCount,
            extractedSpellsCount: resCounts.spellsCount,
            extractedSkillsCount: resCounts.skillsCount,
            extractedRulesCount: resCounts.rulesCount,
            extractedNames: resCounts.names
          } : q));

        } else if (item.type === 'pdf') {
          // GESTIONE COMPLETA PDF MULTI-PAGINA (es. Manuale dei Mostri)
          addActivityLog(`Inizializzazione documento PDF "${item.name}"...`, 'info');
          let doc = item.pdfDoc;
          if (!doc && item.file) {
            const pdfjs = await loadPdfJs();
            const buffer = await item.file.arrayBuffer();
            doc = await pdfjs.getDocument({ data: buffer }).promise;
          }

          if (!doc) throw new Error("Documento PDF non inizializzato");

          const docPages = doc.numPages || item.totalPages || 1;
          const parsedStart = parseInt(String(item.startPage ?? '1'), 10);
          const parsedEnd = parseInt(String(item.endPage ?? docPages), 10);
          const startPage = Math.max(1, Math.min(isNaN(parsedStart) ? 1 : parsedStart, docPages));
          const endPage = Math.max(startPage, Math.min(isNaN(parsedEnd) ? docPages : parsedEnd, docPages));
          const totalPagesToScan = endPage - startPage + 1;

          addActivityLog(`Pagine selezionate per la scansione: da pag. ${startPage} a pag. ${endPage} (${totalPagesToScan} pagine totali)`, 'info');

          let totalMonsters = 0;
          let totalEquipment = 0;
          let totalItems = 0;
          let totalSpells = 0;
          let totalSkills = 0;
          let totalRules = 0;
          const allNames: string[] = [];
          const pageDurations: number[] = [];

          for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            if (isAbortedRef.current) {
              addActivityLog("Scansione interrotta dall'utente.", "warn");
              break;
            }

            const pageStart = Date.now();
            setCurrentPageSeconds(0);
            const pageIndexInScan = pageNum - startPage + 1;
            const percent = Math.round((pageIndexInScan / totalPagesToScan) * 100);
            
            setPageProgressDetails({ current: pageNum, total: endPage, fileName: item.name });
            setPageProgressPercent(percent);
            
            setCurrentProgressText(`PDF "${item.name}" — Rendering Pagina ${pageNum}/${endPage}...`);
            addActivityLog(`[Pag. ${pageNum}/${endPage}] Inizio rendering canvas a 1000px...`, 'info');

            // Render pagina singola a passata diretta (1000px, ottimizzato per token minimi senza perdita OCR)
            let pageBase64Raw = '';
            let isPageBlank = false;
            try {
              const renderResult = await renderPdfPage(doc, pageNum, 1000);
              pageBase64Raw = renderResult.dataUrl;
              isPageBlank = renderResult.isBlank;
              const renderTime = ((Date.now() - pageStart) / 1000).toFixed(1);
              addActivityLog(`[Pag. ${pageNum}/${endPage}] Canvas renderizzato in ${renderTime}s (${Math.round(pageBase64Raw.length / 1024)} KB)`, 'speed');
            } catch (err: any) {
              console.warn(`Errore render pagina ${pageNum}:`, err);
              addActivityLog(`[Pag. ${pageNum}] Errore render: ${err?.message}`, 'warn');
              continue;
            }

            // 3. Pre-filtro locale pagine bianche (0 chiamate IA, 0 token consumati)
            if (isPageBlank) {
              addActivityLog(`[Pag. ${pageNum}/${endPage}] Pagina bianca o separatore rilevato localmente: saltata senza chiamate IA (0 token consumati).`, 'info');
              setQueue(prev => prev.map((q, idx) => idx === i ? {
                ...q,
                currentPage: pageNum,
              } : q));
              await new Promise(r => setTimeout(r, 60));
              continue;
            }

            // Scansione IA per la singola pagina
            const stepTitle = `Pagina ${pageNum}/${endPage}`;
            let aiResponse = await callCatalogWithRetry({
              photoDataUri: pageBase64Raw,
              sourceManual,
              targetContentType,
              selectedModel,
            }, stepTitle);

            if (aiResponse.success && aiResponse.data) {
              setCurrentProgressText(`${stepTitle}: ritaglio miniature e salvataggio schede...`);
              const resCounts = await processPageData(aiResponse.data, pageBase64Raw);
              totalMonsters += resCounts.monstersCount;
              totalEquipment += resCounts.equipmentCount;
              totalItems += resCounts.itemsCount;
              totalSpells += resCounts.spellsCount;
              totalSkills += resCounts.skillsCount;
              totalRules += resCounts.rulesCount;
              allNames.push(...resCounts.names);

              const pageTotalTime = (Date.now() - pageStart) / 1000;
              pageDurations.push(pageTotalTime);
              const avg = pageDurations.reduce((a, b) => a + b, 0) / pageDurations.length;
              setAveragePageDuration(avg);

              addActivityLog(`[Pag. ${pageNum}/${endPage}] Completata in ${pageTotalTime.toFixed(1)}s (Media: ${avg.toFixed(1)}s/pag) | Estratti: ${resCounts.monstersCount} mostri, ${resCounts.itemsCount} oggetti, ${resCounts.rulesCount} regole`, 'success');

              // Aggiorna contatori in tempo reale sull'elemento della coda
              setQueue(prev => prev.map((q, idx) => idx === i ? {
                ...q,
                currentPage: pageNum,
                extractedMonstersCount: totalMonsters,
                extractedEquipmentCount: totalEquipment,
                extractedItemsCount: totalItems,
                extractedSpellsCount: totalSpells,
                extractedSkillsCount: totalSkills,
                extractedRulesCount: totalRules,
                extractedNames: allNames
              } : q));

              // SALVATAGGIO CHECKPOINT DI SESSIONE (Persistence per ripresa scansione interrotta)
              if (item.file) {
                saveCheckpoint(getFileFingerprint(item.file), {
                  lastPage: pageNum,
                  startPage: startPage,
                  endPage: endPage,
                  monstersCount: totalMonsters,
                  equipmentCount: totalEquipment,
                  itemsCount: totalItems,
                  spellsCount: totalSpells,
                  skillsCount: totalSkills,
                  rulesCount: totalRules,
                  names: allNames
                });
              }
            } else if (!isAbortedRef.current) {
              addActivityLog(`[Pag. ${pageNum}] Errore elaborazione: ${aiResponse.error || 'Server non disponibile'}`, 'warn');
              toast({
                variant: 'destructive',
                title: `Pagina ${pageNum} non completata`,
                description: `L'IA era sovraccarica durante pag. ${pageNum}. Potrai riscansionarla reimpostando l'intervallo.`,
              });
            }

            // 1. Pacer Adattivo (Rate Limiter anti-429 per RPM limit):
            // Garantisce un intervallo minimo di 4.6 secondi tra inizio di pagine consecutive
            // per rimanere stabilmente a max ~13 RPM (sotto la soglia di 15 RPM del tier gratuito di Gemini).
            const elapsed = Date.now() - pageStart;
            const minInterval = 4600;
            const waitMs = Math.max(60, minInterval - elapsed);
            if (waitMs > 300 && pageNum < endPage && !isAbortedRef.current) {
              setCurrentProgressText(`Pacing anticollisione RPM: prossima pagina tra ${(waitMs / 1000).toFixed(1)}s per preservare la quota...`);
            }
            await new Promise(r => setTimeout(r, waitMs));
          }

          setQueue(prev => prev.map((q, idx) => idx === i ? { 
            ...q, 
            status: isAbortedRef.current ? 'queued' : 'done',
            extractedMonstersCount: totalMonsters,
            extractedEquipmentCount: totalEquipment,
            extractedItemsCount: totalItems,
            extractedSpellsCount: totalSpells,
            extractedSkillsCount: totalSkills,
            extractedRulesCount: totalRules,
            extractedNames: allNames
          } : q));

          // PULIZIA CHECKPOINT AL COMPLETAMENTO
          if (!isAbortedRef.current && item.file) {
            clearCheckpoint(getFileFingerprint(item.file));
          }
        }
      } catch (err: any) {
        addActivityLog(`Errore critico coda: ${err?.message || 'Errore sconosciuto'}`, 'warn');
        setQueue(prev => prev.map((q, idx) => idx === i ? { 
          ...q, 
          status: 'error', 
          errorMessage: err?.message || "Errore elaborazione pagina" 
        } : q));
      }
    }

    setIsProcessing(false);
    setCurrentProcessingIndex(null);
    setCurrentProgressText('');
    setPageProgressDetails(null);
    setPageProgressPercent(0);
    addActivityLog("Scansione completata!", "success");
    toast({
      title: "Scansione Completata ✅",
      description: `L'IA ha terminato l'analisi dei file. Controlla i risultati estratti nella sezione Revisione sotto.`
    });
    fetchDebugLog();
  };

  const handleStopProcessing = () => {
    isAbortedRef.current = true;
    if (currentAbortControllerRef.current) {
      try { currentAbortControllerRef.current.abort(); } catch {}
      currentAbortControllerRef.current = null;
    }
    // Segnala immediatamente al server di troncare qualsiasi iterazione IA attiva
    fetch('/api/catalog-new?action=abort', { method: 'POST' }).catch(() => {});

    setIsProcessing(false);
    setCurrentProcessingIndex(null);
    setCurrentProgressText('Scansione interrotta dall\'utente. I processi in background sono stati terminati e i contenuti estratti sono preservati.');
    addActivityLog("Scansione interrotta dall'utente. Tutti i processi server sono stati fermati.", "warn");
    toast({ title: "Scansione Interrotta", description: "Tutti i processi server sono stati fermati e gli elementi estratti finora sono stati preservati." });
  };

  // Gestione Conflitti e Duplicati con Decisione Singola
  const requestConflictResolution = (conflictInfo: {
    type: 'monster' | 'equipment' | 'item' | 'spell' | 'skill';
    item: any;
    existingName: string;
    existingId: string;
    bulkIndex?: number;
    bulkTotal?: number;
  }): Promise<'overwrite' | 'skip'> => {
    return new Promise<'overwrite' | 'skip'>((resolve) => {
      conflictResolverRef.current = resolve;
      setDuplicateDialog({
        isOpen: true,
        ...conflictInfo,
      });
    });
  };

  const executeOverwrite = async (type: string, item: any, existingId: string): Promise<boolean> => {
    if (type === 'monster') {
      setMonsters(prev => prev.map(m => m.id === item.id ? { ...m, isSaving: true } : m));
      try {
        const res = await actions.saveMonster({
          campaignId,
          id: existingId,
          overwrite: true,
          name: item.name,
          type: sanitizeMonsterType(item.type),
          armorClass: item.armorClass,
          hitPoints: item.hitPoints,
          challenge: item.challenge,
          description: cleanAiHallucinatoryLoops(item.description),
          imageUrl: item.imageUrl || undefined,
          thumbnailUrl: item.thumbnailUrl || undefined,
        });
        if (res.success) {
          const data = res.data as any;
          setMonsters(prev => prev.map(m => m.id === item.id ? { 
            ...m, 
            imageUrl: data?.imageUrl || m.imageUrl,
            thumbnailUrl: data?.thumbnailUrl || m.thumbnailUrl,
            savedCampaign: true, 
            savedGlobal: true, 
            isSaving: false 
          } : m));
          toast({ title: `"${item.name}" sovrascritto con successo nel Bestiario!` });
          triggerGlobalSync();
          return true;
        } else {
          throw new Error(res.error || "Errore sovrascrittura mostro");
        }
      } catch (e: any) {
        setMonsters(prev => prev.map(m => m.id === item.id ? { ...m, isSaving: false } : m));
        toast({ variant: 'destructive', title: "Errore Sovrascrittura", description: e.message });
        return false;
      }
    } else if (type === 'equipment' || type === 'item') {
      const isEq = type === 'equipment';
      const setList = isEq ? setEquipment : setMagicItems;
      setList((prev: any[]) => prev.map(i => i.id === item.id ? { ...i, isSaving: true } : i));
      try {
        const res = await actions.saveMagicItem({
          campaignId,
          id: existingId,
          overwrite: true,
          name: item.name,
          type: item.type || (isEq ? 'Armeria' : 'Oggetto Meraviglioso'),
          rarity: item.rarity || 'Comune',
          attunement: item.attunement || 'No',
          description: item.description,
          cost: item.cost || '',
          damage: item.damage || '',
          imageUrl: item.imageUrl || null,
          thumbnailUrl: item.thumbnailUrl || null,
          techType: isEq ? 'damage' : 'alchemy'
        });
        if (res.success) {
          setList((prev: any[]) => prev.map(i => i.id === item.id ? { ...i, savedCampaign: true, savedGlobal: true, isSaving: false } : i));
          toast({ title: `"${item.name}" sovrascritto con successo!` });
          triggerGlobalSync();
          return true;
        } else {
          throw new Error(res.error || "Errore sovrascrittura oggetto");
        }
      } catch (e: any) {
        setList((prev: any[]) => prev.map(i => i.id === item.id ? { ...i, isSaving: false } : i));
        toast({ variant: 'destructive', title: "Errore Sovrascrittura", description: e.message });
        return false;
      }
    } else if (type === 'spell') {
      setSpells(prev => prev.map(s => s.id === item.id ? { ...s, isSaving: true } : s));
      try {
        const res = await actions.saveSpell({
          campaignId,
          id: existingId,
          overwrite: true,
          name: item.name,
          level: item.level,
          school: item.school,
          casting_time: item.casting_time,
          range: item.range,
          components: item.components,
          duration: item.duration,
          classes: item.classes,
          description: item.description
        });
        if (res.success) {
          setSpells(prev => prev.map(s => s.id === item.id ? { ...s, savedCampaign: true, savedGlobal: true, isSaving: false } : s));
          toast({ title: `"${item.name}" sovrascritto nel Grimorio!` });
          triggerGlobalSync();
          return true;
        } else {
          throw new Error(res.error || "Errore sovrascrittura incantesimo");
        }
      } catch (e: any) {
        setSpells(prev => prev.map(s => s.id === item.id ? { ...s, isSaving: false } : s));
        toast({ variant: 'destructive', title: "Errore Sovrascrittura", description: e.message });
        return false;
      }
    } else if (type === 'skill') {
      setSkills(prev => prev.map(sk => sk.id === item.id ? { ...sk, isSaving: true } : sk));
      try {
        const res = await actions.saveSkill({
          campaignId,
          id: existingId,
          overwrite: true,
          name: item.name,
          ability: item.ability || item.type || 'Varia',
          description: item.description
        });
        if (res.success) {
          setSkills(prev => prev.map(sk => sk.id === item.id ? { ...sk, savedCampaign: true, savedGlobal: true, isSaving: false } : sk));
          toast({ title: `"${item.name}" sovrascritta con successo!` });
          triggerGlobalSync();
          return true;
        } else {
          throw new Error(res.error || "Errore sovrascrittura abilità");
        }
      } catch (e: any) {
        setSkills(prev => prev.map(sk => sk.id === item.id ? { ...sk, isSaving: false } : sk));
        toast({ variant: 'destructive', title: "Errore Sovrascrittura", description: e.message });
        return false;
      }
    }
    return false;
  };

  const handleConfirmOverwrite = async () => {
    if (!duplicateDialog) return;
    const { type, item, existingId } = duplicateDialog;
    const resolver = conflictResolverRef.current;
    conflictResolverRef.current = null;
    setDuplicateDialog(null);

    await executeOverwrite(type, item, existingId);
    if (resolver) {
      resolver('overwrite');
    }
  };

  const handleSkipDuplicate = () => {
    const resolver = conflictResolverRef.current;
    conflictResolverRef.current = null;
    setDuplicateDialog(null);
    if (resolver) {
      resolver('skip');
    }
  };

  // Salvataggio Singolo per categoria
  const handleSaveMonster = async (monster: ExtractedMonsterCard, target: 'campaign' | 'global' = 'campaign') => {
    setMonsters(prev => prev.map(m => m.id === monster.id ? { ...m, isSaving: true } : m));
    try {
      const checkRes = await actions.checkIfMonsterExists(monster.name, campaignId);
      if (checkRes.success && checkRes.data?.conflict) {
        setMonsters(prev => prev.map(m => m.id === monster.id ? { ...m, isSaving: false } : m));
        const decision = await requestConflictResolution({
          type: 'monster',
          item: monster,
          existingName: checkRes.data.existingName!,
          existingId: checkRes.data.existingId!
        });
        if (decision === 'overwrite') {
          await executeOverwrite('monster', monster, checkRes.data.existingId!);
        }
        return;
      }
      
      const res = await actions.saveMonster({
        campaignId,
        name: monster.name,
        type: sanitizeMonsterType(monster.type),
        armorClass: monster.armorClass,
        hitPoints: monster.hitPoints,
        challenge: monster.challenge,
        description: cleanAiHallucinatoryLoops(monster.description),
        imageUrl: monster.imageUrl || undefined,
        thumbnailUrl: monster.thumbnailUrl || undefined,
      });
      if (res.success) {
        const data = res.data as any;
        setMonsters(prev => prev.map(m => m.id === monster.id ? { 
          ...m, 
          imageUrl: data?.imageUrl || m.imageUrl,
          thumbnailUrl: data?.thumbnailUrl || m.thumbnailUrl,
          savedCampaign: true,
          savedGlobal: true,
          isSaving: false 
        } : m));
        toast({ title: `"${monster.name}" salvato nel Bestiario!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio mostro");
      }
    } catch (e: any) {
      setMonsters(prev => prev.map(m => m.id === monster.id ? { ...m, isSaving: false } : m));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleSaveEquipment = async (item: ExtractedEquipmentCard, target: 'campaign' | 'global') => {
    setEquipment(prev => prev.map(e => e.id === item.id ? { ...e, isSaving: true } : e));
    try {
      const checkRes = await actions.checkIfItemExists(item.name, campaignId);
      if (checkRes.success && checkRes.data?.conflict) {
        setEquipment(prev => prev.map(e => e.id === item.id ? { ...e, isSaving: false } : e));
        const decision = await requestConflictResolution({
          type: 'equipment',
          item,
          existingName: checkRes.data.existingName!,
          existingId: checkRes.data.existingId!
        });
        if (decision === 'overwrite') {
          await executeOverwrite('equipment', item, checkRes.data.existingId!);
        }
        return;
      }

      const res = await actions.saveMagicItem({
        campaignId,
        name: item.name,
        type: item.type || 'Armeria',
        rarity: 'Comune',
        attunement: 'No',
        description: item.description,
        cost: item.cost || '',
        damage: item.damage || '',
        imageUrl: item.imageUrl || null,
        thumbnailUrl: item.thumbnailUrl || null,
        techType: 'damage'
      });
      if (res.success) {
        const data = res.data as any;
        setEquipment(prev => prev.map(e => e.id === item.id ? {
          ...e,
          imageUrl: data?.imageUrl || e.imageUrl,
          thumbnailUrl: data?.thumbnailUrl || e.thumbnailUrl,
          savedCampaign: target === 'campaign' ? true : e.savedCampaign,
          savedGlobal: target === 'global' ? true : e.savedGlobal,
          isSaving: false
        } : e));
        toast({ title: `"${item.name}" salvato nell'Armeria!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio armeria");
      }
    } catch (e: any) {
      setEquipment(prev => prev.map(e => e.id === item.id ? { ...e, isSaving: false } : e));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleSaveMagicItem = async (item: ExtractedMagicItemCard, target: 'campaign' | 'global') => {
    setMagicItems(prev => prev.map(i => i.id === item.id ? { ...i, isSaving: true } : i));
    try {
      const checkRes = await actions.checkIfItemExists(item.name, campaignId);
      if (checkRes.success && checkRes.data?.conflict) {
        setMagicItems(prev => prev.map(i => i.id === item.id ? { ...i, isSaving: false } : i));
        const decision = await requestConflictResolution({
          type: 'item',
          item,
          existingName: checkRes.data.existingName!,
          existingId: checkRes.data.existingId!
        });
        if (decision === 'overwrite') {
          await executeOverwrite('item', item, checkRes.data.existingId!);
        }
        return;
      }

      const res = await actions.saveMagicItem({
        campaignId,
        name: item.name,
        type: item.type || 'Oggetto Meraviglioso',
        rarity: item.rarity || 'Comune',
        attunement: item.attunement || 'No',
        description: item.description,
        cost: item.cost || '',
        damage: item.damage || '',
        imageUrl: item.imageUrl || null,
        thumbnailUrl: item.thumbnailUrl || null,
        techType: 'alchemy'
      });
      if (res.success) {
        const data = res.data as any;
        setMagicItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          imageUrl: data?.imageUrl || i.imageUrl,
          thumbnailUrl: data?.thumbnailUrl || i.thumbnailUrl,
          savedCampaign: target === 'campaign' ? true : i.savedCampaign,
          savedGlobal: target === 'global' ? true : i.savedGlobal,
          isSaving: false
        } : i));
        toast({ title: `"${item.name}" salvato negli Oggetti!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio oggetto");
      }
    } catch (e: any) {
      setMagicItems(prev => prev.map(i => i.id === item.id ? { ...i, isSaving: false } : i));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleSaveSpell = async (spell: ExtractedSpellCard, target: 'campaign' | 'global') => {
    setSpells(prev => prev.map(s => s.id === spell.id ? { ...s, isSaving: true } : s));
    try {
      const checkRes = await actions.checkIfSpellExists(spell.name, campaignId);
      if (checkRes.success && checkRes.data?.conflict) {
        setSpells(prev => prev.map(s => s.id === spell.id ? { ...s, isSaving: false } : s));
        const decision = await requestConflictResolution({
          type: 'spell',
          item: spell,
          existingName: checkRes.data.existingName!,
          existingId: checkRes.data.existingId!
        });
        if (decision === 'overwrite') {
          await executeOverwrite('spell', spell, checkRes.data.existingId!);
        }
        return;
      }

      const res = await actions.saveSpell({
        campaignId,
        name: spell.name,
        level: spell.level,
        school: spell.school,
        casting_time: spell.casting_time,
        range: spell.range,
        components: spell.components,
        duration: spell.duration,
        classes: spell.classes,
        description: spell.description
      });
      if (res.success) {
        setSpells(prev => prev.map(s => s.id === spell.id ? {
          ...s,
          savedCampaign: target === 'campaign' ? true : s.savedCampaign,
          savedGlobal: target === 'global' ? true : s.savedGlobal,
          isSaving: false
        } : s));
        toast({ title: `"${spell.name}" salvato nel Grimorio!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio incantesimo");
      }
    } catch (e: any) {
      setSpells(prev => prev.map(s => s.id === spell.id ? { ...s, isSaving: false } : s));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleSaveSkill = async (skill: ExtractedSkillCard, target: 'campaign' | 'global') => {
    setSkills(prev => prev.map(sk => sk.id === skill.id ? { ...sk, isSaving: true } : sk));
    try {
      const checkRes = await actions.checkIfSkillExists(skill.name, campaignId);
      if (checkRes.success && checkRes.data?.conflict) {
        setSkills(prev => prev.map(sk => sk.id === skill.id ? { ...sk, isSaving: false } : sk));
        const decision = await requestConflictResolution({
          type: 'skill',
          item: skill,
          existingName: checkRes.data.existingName!,
          existingId: checkRes.data.existingId!
        });
        if (decision === 'overwrite') {
          await executeOverwrite('skill', skill, checkRes.data.existingId!);
        }
        return;
      }

      const res = await actions.saveSkill({
        campaignId,
        name: skill.name,
        ability: skill.ability || skill.type || 'Varia',
        description: skill.description
      });
      if (res.success) {
        setSkills(prev => prev.map(sk => sk.id === skill.id ? {
          ...sk,
          savedCampaign: target === 'campaign' ? true : sk.savedCampaign,
          savedGlobal: target === 'global' ? true : sk.savedGlobal,
          isSaving: false
        } : sk));
        toast({ title: `"${skill.name}" salvata nei Privilegi & Abilità!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio abilità");
      }
    } catch (e: any) {
      setSkills(prev => prev.map(sk => sk.id === skill.id ? { ...sk, isSaving: false } : sk));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleSaveRule = async (rule: ExtractedRuleCard) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isSaving: true } : r));
    try {
      const res = await actions.saveHomebrewRule({
        campaignId,
        title: rule.title,
        content: rule.content,
        category: rule.chapterTitle || 'Regole',
        isActive: true
      });
      await actions.importSystemRulesAction([{
        title: rule.title,
        content: rule.content,
        sourceBook: rule.sourceBook,
        chapterTitle: rule.chapterTitle,
        tags: rule.tags
      }]);
      if (res.success) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, savedCampaign: true, savedGlobal: true, isSaving: false } : r));
        toast({ title: `Regola "${rule.title}" salvata nelle Regole!` });
        triggerGlobalSync();
      } else {
        throw new Error(res.error || "Errore salvataggio regola");
      }
    } catch (e: any) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isSaving: false } : r));
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    }
  };

  const handleStopSaveAll = () => {
    isAbortedRef.current = true;
    if (conflictResolverRef.current) {
      conflictResolverRef.current('skip');
      conflictResolverRef.current = null;
    }
    setDuplicateDialog(null);
    setSavingAllProgress(prev => prev ? { ...prev, isActive: false, isPausedForConflict: false } : null);
    toast({ title: "Salvataggio Interrotto", description: "L'operazione è stata interrotta." });
  };

  // Salvataggio di Tutto in Blocco per la scheda attiva con avanzamento visivo in tempo reale e gestione duplicati singola
  const handleSaveAll = async () => {
    isAbortedRef.current = false;

    // Raccoglie tutti gli elementi pendenti per la scheda visualizzata
    const pendingItems: Array<{
      id: string;
      category: 'monster' | 'equipment' | 'item' | 'spell' | 'skill' | 'rule';
      name: string;
      item: any;
      categoryLabel: string;
    }> = [];

    if (activeTab === 'all' || activeTab === 'monsters') {
      monsters.filter(m => !m.savedCampaign).forEach(m => {
        pendingItems.push({ id: m.id, category: 'monster', name: m.name, item: m, categoryLabel: 'Mostro' });
      });
    }

    if (activeTab === 'all' || activeTab === 'equipment') {
      equipment.filter(e => !e.savedCampaign).forEach(e => {
        pendingItems.push({ id: e.id, category: 'equipment', name: e.name, item: e, categoryLabel: 'Armeria' });
      });
    }

    if (activeTab === 'all' || activeTab === 'items') {
      magicItems.filter(i => !i.savedCampaign).forEach(i => {
        pendingItems.push({ id: i.id, category: 'item', name: i.name, item: i, categoryLabel: 'Oggetto Magico' });
      });
    }

    if (activeTab === 'all' || activeTab === 'spells') {
      spells.filter(s => !s.savedCampaign).forEach(s => {
        pendingItems.push({ id: s.id, category: 'spell', name: s.name, item: s, categoryLabel: 'Incantesimo' });
      });
    }

    if (activeTab === 'all' || activeTab === 'skills') {
      skills.filter(sk => !sk.savedCampaign).forEach(sk => {
        pendingItems.push({ id: sk.id, category: 'skill', name: sk.name, item: sk, categoryLabel: 'Abilità' });
      });
    }

    if (activeTab === 'all' || activeTab === 'rules') {
      rules.filter(r => !r.savedCampaign).forEach(r => {
        pendingItems.push({ id: r.id, category: 'rule', name: r.title, item: r, categoryLabel: 'Regola' });
      });
    }

    if (pendingItems.length === 0) {
      toast({
        title: "Nessun elemento da salvare",
        description: "Tutti gli elementi della vista corrente risultano già salvati."
      });
      return;
    }

    const total = pendingItems.length;
    let saved = 0;
    let overwritten = 0;
    let skipped = 0;
    let errors = 0;

    setSavingAllProgress({
      isActive: true,
      current: 0,
      total,
      currentName: pendingItems[0]?.name || '',
      category: pendingItems[0]?.categoryLabel || '',
      saved: 0,
      overwritten: 0,
      skipped: 0,
      errors: 0,
      isPausedForConflict: false,
    });

    for (let i = 0; i < total; i++) {
      if (isAbortedRef.current) {
        toast({ title: "Salvataggio Interrotto", description: "L'operazione è stata fermata dall'utente." });
        break;
      }

      const currentItem = pendingItems[i];
      setSavingAllProgress(prev => prev ? {
        ...prev,
        current: i + 1,
        currentName: currentItem.name,
        category: currentItem.categoryLabel,
        isPausedForConflict: false,
      } : null);

      try {
        if (currentItem.category === 'monster') {
          const m = currentItem.item;
          setMonsters(prev => prev.map(x => x.id === m.id ? { ...x, isSaving: true } : x));
          const checkRes = await actions.checkIfMonsterExists(m.name, campaignId);
          if (checkRes.success && checkRes.data?.conflict) {
            setSavingAllProgress(prev => prev ? { ...prev, isPausedForConflict: true } : null);
            setMonsters(prev => prev.map(x => x.id === m.id ? { ...x, isSaving: false } : x));
            const choice = await requestConflictResolution({
              type: 'monster',
              item: m,
              existingName: checkRes.data.existingName!,
              existingId: checkRes.data.existingId!,
              bulkIndex: i + 1,
              bulkTotal: total,
            });
            if (choice === 'overwrite') {
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            const res = await actions.saveMonster({
              campaignId,
              name: m.name,
              type: sanitizeMonsterType(m.type),
              armorClass: m.armorClass,
              hitPoints: m.hitPoints,
              challenge: m.challenge,
              description: cleanAiHallucinatoryLoops(m.description),
              imageUrl: m.imageUrl || undefined,
              thumbnailUrl: m.thumbnailUrl || undefined,
            });
            if (res.success) {
              saved++;
              const data = res.data as any;
              setMonsters(prev => prev.map(x => x.id === m.id ? { 
                ...x, 
                imageUrl: data?.imageUrl || x.imageUrl,
                thumbnailUrl: data?.thumbnailUrl || x.thumbnailUrl,
                savedCampaign: true, 
                savedGlobal: true, 
                isSaving: false 
              } : x));
            } else {
              errors++;
              setMonsters(prev => prev.map(x => x.id === m.id ? { ...x, isSaving: false } : x));
            }
          }
        } else if (currentItem.category === 'equipment') {
          const e = currentItem.item;
          setEquipment(prev => prev.map(x => x.id === e.id ? { ...x, isSaving: true } : x));
          const checkRes = await actions.checkIfItemExists(e.name, campaignId);
          if (checkRes.success && checkRes.data?.conflict) {
            setSavingAllProgress(prev => prev ? { ...prev, isPausedForConflict: true } : null);
            setEquipment(prev => prev.map(x => x.id === e.id ? { ...x, isSaving: false } : x));
            const choice = await requestConflictResolution({
              type: 'equipment',
              item: e,
              existingName: checkRes.data.existingName!,
              existingId: checkRes.data.existingId!,
              bulkIndex: i + 1,
              bulkTotal: total,
            });
            if (choice === 'overwrite') {
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            const res = await actions.saveMagicItem({
              campaignId,
              name: e.name,
              type: e.type || 'Armeria',
              rarity: 'Comune',
              attunement: 'No',
              description: e.description,
              cost: e.cost || '',
              damage: e.damage || '',
              imageUrl: e.imageUrl || null,
              thumbnailUrl: e.thumbnailUrl || null,
              techType: 'damage'
            });
            if (res.success) {
              saved++;
              const data = res.data as any;
              setEquipment(prev => prev.map(x => x.id === e.id ? { 
                ...x, 
                imageUrl: data?.imageUrl || x.imageUrl,
                thumbnailUrl: data?.thumbnailUrl || x.thumbnailUrl,
                savedCampaign: true, 
                savedGlobal: true, 
                isSaving: false 
              } : x));
            } else {
              errors++;
              setEquipment(prev => prev.map(x => x.id === e.id ? { ...x, isSaving: false } : x));
            }
          }
        } else if (currentItem.category === 'item') {
          const item = currentItem.item;
          setMagicItems(prev => prev.map(x => x.id === item.id ? { ...x, isSaving: true } : x));
          const checkRes = await actions.checkIfItemExists(item.name, campaignId);
          if (checkRes.success && checkRes.data?.conflict) {
            setSavingAllProgress(prev => prev ? { ...prev, isPausedForConflict: true } : null);
            setMagicItems(prev => prev.map(x => x.id === item.id ? { ...x, isSaving: false } : x));
            const choice = await requestConflictResolution({
              type: 'item',
              item: item,
              existingName: checkRes.data.existingName!,
              existingId: checkRes.data.existingId!,
              bulkIndex: i + 1,
              bulkTotal: total,
            });
            if (choice === 'overwrite') {
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            const res = await actions.saveMagicItem({
              campaignId,
              name: item.name,
              type: item.type || 'Oggetto Meraviglioso',
              rarity: item.rarity || 'Comune',
              attunement: item.attunement || 'No',
              description: item.description,
              cost: item.cost || '',
              damage: item.damage || '',
              imageUrl: item.imageUrl || null,
              thumbnailUrl: item.thumbnailUrl || null,
              techType: 'alchemy'
            });
            if (res.success) {
              saved++;
              const data = res.data as any;
              setMagicItems(prev => prev.map(x => x.id === item.id ? { 
                ...x, 
                imageUrl: data?.imageUrl || x.imageUrl,
                thumbnailUrl: data?.thumbnailUrl || x.thumbnailUrl,
                savedCampaign: true, 
                savedGlobal: true, 
                isSaving: false 
              } : x));
            } else {
              errors++;
              setMagicItems(prev => prev.map(x => x.id === item.id ? { ...x, isSaving: false } : x));
            }
          }
        } else if (currentItem.category === 'spell') {
          const s = currentItem.item;
          setSpells(prev => prev.map(x => x.id === s.id ? { ...x, isSaving: true } : x));
          const checkRes = await actions.checkIfSpellExists(s.name, campaignId);
          if (checkRes.success && checkRes.data?.conflict) {
            setSavingAllProgress(prev => prev ? { ...prev, isPausedForConflict: true } : null);
            setSpells(prev => prev.map(x => x.id === s.id ? { ...x, isSaving: false } : x));
            const choice = await requestConflictResolution({
              type: 'spell',
              item: s,
              existingName: checkRes.data.existingName!,
              existingId: checkRes.data.existingId!,
              bulkIndex: i + 1,
              bulkTotal: total,
            });
            if (choice === 'overwrite') {
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            const res = await actions.saveSpell({
              campaignId,
              name: s.name,
              level: s.level,
              school: s.school,
              casting_time: s.casting_time,
              range: s.range,
              components: s.components,
              duration: s.duration,
              classes: s.classes,
              description: s.description
            });
            if (res.success) {
              saved++;
              setSpells(prev => prev.map(x => x.id === s.id ? { ...x, savedCampaign: true, savedGlobal: true, isSaving: false } : x));
            } else {
              errors++;
              setSpells(prev => prev.map(x => x.id === s.id ? { ...x, isSaving: false } : x));
            }
          }
        } else if (currentItem.category === 'skill') {
          const sk = currentItem.item;
          setSkills(prev => prev.map(x => x.id === sk.id ? { ...x, isSaving: true } : x));
          const checkRes = await actions.checkIfSkillExists(sk.name, campaignId);
          if (checkRes.success && checkRes.data?.conflict) {
            setSavingAllProgress(prev => prev ? { ...prev, isPausedForConflict: true } : null);
            setSkills(prev => prev.map(x => x.id === sk.id ? { ...x, isSaving: false } : x));
            const choice = await requestConflictResolution({
              type: 'skill',
              item: sk,
              existingName: checkRes.data.existingName!,
              existingId: checkRes.data.existingId!,
              bulkIndex: i + 1,
              bulkTotal: total,
            });
            if (choice === 'overwrite') {
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            const res = await actions.saveSkill({
              campaignId,
              name: sk.name,
              ability: sk.ability || sk.type || 'Varia',
              description: sk.description
            });
            if (res.success) {
              saved++;
              setSkills(prev => prev.map(x => x.id === sk.id ? { ...x, savedCampaign: true, savedGlobal: true, isSaving: false } : x));
            } else {
              errors++;
              setSkills(prev => prev.map(x => x.id === sk.id ? { ...x, isSaving: false } : x));
            }
          }
        } else if (currentItem.category === 'rule') {
          const r = currentItem.item;
          setRules(prev => prev.map(x => x.id === r.id ? { ...x, isSaving: true } : x));
          const res = await actions.saveHomebrewRule({
            campaignId,
            title: r.title,
            content: r.content,
            category: r.chapterTitle || 'Regole',
            isActive: true
          });
          await actions.importSystemRulesAction([{
            title: r.title,
            content: r.content,
            sourceBook: r.sourceBook,
            chapterTitle: r.chapterTitle,
            tags: r.tags
          }]);
          if (res.success) {
            saved++;
            setRules(prev => prev.map(x => x.id === r.id ? { ...x, savedCampaign: true, savedGlobal: true, isSaving: false } : x));
          } else {
            errors++;
            setRules(prev => prev.map(x => x.id === r.id ? { ...x, isSaving: false } : x));
          }
        }
      } catch (err: any) {
        errors++;
      }

      setSavingAllProgress(prev => prev ? {
        ...prev,
        saved,
        overwritten,
        skipped,
        errors,
      } : null);
    }

    setSavingAllProgress(prev => prev ? {
      ...prev,
      isActive: false,
      isPausedForConflict: false,
    } : null);

    triggerGlobalSync();
    toast({
      title: "Salvataggio Terminato!",
      description: `Riepilogo: ${saved} salvati, ${overwritten} sovrascritti, ${skipped} saltati.${errors > 0 ? ` (${errors} errori)` : ''}`
    });
  };

  // Eliminazione Singola prima dell'importazione
  const handleDeleteMonster = (id: string) => {
    setMonsters(prev => prev.filter(m => m.id !== id));
    toast({ title: "Mostro rimosso dall'anteprima" });
  };

  const handleDeleteEquipment = (id: string) => {
    setEquipment(prev => prev.filter(e => e.id !== id));
    toast({ title: "Elemento Armeria rimosso dall'anteprima" });
  };

  const handleDeleteMagicItem = (id: string) => {
    setMagicItems(prev => prev.filter(i => i.id !== id));
    toast({ title: "Oggetto rimosso dall'anteprima" });
  };

  const handleDeleteSpell = (id: string) => {
    setSpells(prev => prev.filter(s => s.id !== id));
    toast({ title: "Incantesimo rimosso dall'anteprima" });
  };

  const handleDeleteSkill = (id: string) => {
    setSkills(prev => prev.filter(sk => sk.id !== id));
    toast({ title: "Abilità rimossa dall'anteprima" });
  };

  const handleDeleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    toast({ title: "Regola rimossa dall'anteprima" });
  };

  const handleClearCurrentTab = () => {
    if (activeTab === 'all') {
      setMonsters([]);
      setEquipment([]);
      setMagicItems([]);
      setSpells([]);
      setSkills([]);
      setRules([]);
      toast({ title: "Tutti i risultati estratti sono stati rimossi" });
    } else if (activeTab === 'monsters') {
      setMonsters([]);
      toast({ title: "Mostri rimossi dall'anteprima" });
    } else if (activeTab === 'equipment') {
      setEquipment([]);
      toast({ title: "Armeria rimossa dall'anteprima" });
    } else if (activeTab === 'items') {
      setMagicItems([]);
      toast({ title: "Oggetti rimossi dall'anteprima" });
    } else if (activeTab === 'spells') {
      setSpells([]);
      toast({ title: "Incantesimi rimossi dall'anteprima" });
    } else if (activeTab === 'skills') {
      setSkills([]);
      toast({ title: "Abilità rimosse dall'anteprima" });
    } else if (activeTab === 'rules') {
      setRules([]);
      toast({ title: "Regole rimosse dall'anteprima" });
    }
  };

  const totalResultsCount = monsters.length + equipment.length + magicItems.length + spells.length + skills.length + rules.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header Intestazione */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-headline tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            Importazione Intelligente & Catalogo Automatico
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Scansiona immagini o PDF interi dei manuali (MM, PHB, DMG). L'IA estrae mostri, armi, oggetti, incantesimi e regole con ritaglio automatico delle illustrazioni.
          </p>
        </div>
      </div>

      {/* Banner Ripristino Bozza Precedente */}
      {hasSavedDraft && (
        <Card className="bg-card/80 border-primary/40 text-card-foreground shadow-lg backdrop-blur-sm">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/15 text-primary border border-primary/30 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-sm">
                  Trovata Sessione di Scansione Precedente Non Salvata!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Recuperabili <strong>{savedDraftCount.total} elementi</strong> ({savedDraftCount.summary}).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <Button
                size="sm"
                onClick={handleRestoreDraft}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Ripristina Bozza
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDiscardDraft}
                className="text-muted-foreground hover:text-foreground hover:bg-muted text-xs h-8"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Scarta
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pannello di Controllo & Parametri di Scansione */}
      <Card className="bg-card/70 backdrop-blur-sm border-border/80 text-card-foreground shadow-md">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <CardTitle className="text-base text-foreground font-headline flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" />
                Configurazione Scansione Mirata
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary transition-colors"
                title={isConfigExpanded ? "Collassa configurazione" : "Espandi configurazione"}
              >
                {isConfigExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Seleziona la provenienza della pagina o lascia l'auto-rilevamento intelligente su tutte le 6 sezioni.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowDebugModal(true);
              fetchDebugLog();
            }}
            className="text-xs h-8 border-border hover:bg-muted font-medium text-foreground self-start sm:self-auto shrink-0 shadow-sm"
            title="Visualizza i dettagli e le metriche dell'ultima scansione (file di log temporaneo)"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" /> Log Ultima Scansione
          </Button>
        </CardHeader>
        {isConfigExpanded && (
          <CardContent className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Selettore Manuale Sorgente */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/90 block">
                  Sorgente Manuale
                </label>
                <Select value={sourceManual} onValueChange={(val: ManualSource) => setSourceManual(val)}>
                  <SelectTrigger className="bg-background/80 border-input text-foreground text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    <SelectItem value="auto">🧠 Auto-Rilevamento Intelligente</SelectItem>
                    <SelectItem value="mm">🐉 Manuale dei Mostri (MM)</SelectItem>
                    <SelectItem value="dmg">🏰 Manuale del Master (DMG)</SelectItem>
                    <SelectItem value="phb">📜 Manuale del Giocatore (PHB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Forzato Opzionale */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/90 block">
                  Cosa Catturare
                </label>
                <Select value={targetContentType} onValueChange={(val: TargetFilter) => setTargetContentType(val)}>
                  <SelectTrigger className="bg-background/80 border-input text-foreground text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    <SelectItem value="all">🌟 Tutte le Categorie (Auto)</SelectItem>
                    <SelectItem value="monsters_only">🐉 Solo Mostri & Bestiario</SelectItem>
                    <SelectItem value="items_only">⚔️ Solo Armeria & Oggetti</SelectItem>
                    <SelectItem value="spells_only">✨ Solo Incantesimi</SelectItem>
                    <SelectItem value="skills_only">🧠 Solo Abilità, Specie & Privilegi</SelectItem>
                    <SelectItem value="rules_only">📖 Solo Regole Generali</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Modello AI */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/90 block">
                  Modello Visione AI
                </label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="bg-background/80 border-input text-foreground text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {RECOMMENDED_MODELS.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[10px] ml-2 text-primary font-mono">({m.badge})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Area Drag & Drop / Caricamento File */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  addFilesToQueue(Array.from(e.dataTransfer.files));
                }
              }}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-1.5 md:p-3 text-center cursor-pointer bg-muted/10 hover:bg-muted/30 transition-all flex flex-col items-center justify-center space-y-0.5 group min-h-[80px] md:min-h-[120px]"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    addFilesToQueue(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />
              <div className="p-1 md:p-2 rounded-full bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                <FileUp className="h-3.5 w-3.5 md:h-5 md:w-5" />
              </div>
              <p className="text-[12px] md:text-[13px] font-semibold text-foreground leading-tight">
                <span className="hidden md:inline">Trascina immagini/PDF o clicca</span>
                <span className="md:hidden">Tocca per caricare File</span>
              </p>
              <p className="text-[9px] md:text-[11px] text-muted-foreground max-w-md hidden sm:block">
                JPG, PNG, WebP o PDF. <span className="hidden md:inline">Incolla screenshot (Ctrl+V).</span>
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* PANNELLO TELEMETRIA IN TEMPO REALE (Spostato SOPRA la coda su richiesta utente) */}
      {isProcessing && (
        <Card className="bg-primary/10 border-primary/40 text-card-foreground shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-1 duration-300">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/20 pb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Scansione Intelligente in Corso</span>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>{pageProgressDetails ? `Pagina ${pageProgressDetails.current} di ${pageProgressDetails.total}` : 'Elaborazione in corso...'}</span>
                    {pageProgressDetails && (
                      <span className="text-xs font-normal text-muted-foreground truncate max-w-xs">({pageProgressDetails.fileName})</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Badge Modello Attivo e Cronometro Live */}
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 border border-primary/30 text-xs font-mono text-primary shadow-sm">
                  <Cpu className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="font-semibold">{activeModelInUse}</span>
                </div>

                {/* Cronometro Pagina Corrente */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-primary/40 text-xs font-mono text-primary shadow-sm" title="Tempo impiegato sulla pagina attuale">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Pagina: <strong>{currentPageSeconds}s</strong></span>
                </div>

                {/* Velocità Media per Pagina */}
                {averagePageDuration !== null && (
                  <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-emerald-500/40 text-xs font-mono text-emerald-400 shadow-sm" title="Velocità media per pagina completata">
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    <span>~{averagePageDuration.toFixed(1)}s/pag</span>
                  </div>
                )}

                {/* Pulsante Toggle Console Live Log */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowLogsDrawer(!showLogsDrawer)} 
                  className="text-xs h-7 px-2 border-primary/30 text-foreground hover:bg-primary/20"
                  title="Mostra o nascondi il registro dettagliato di cosa sta facendo l'IA"
                >
                  <Terminal className="mr-1 h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">{showLogsDrawer ? "Nascondi Log" : "Attività Live"}</span>
                  <span className="sm:hidden">Log</span>
                  {activityLogs.length > 0 && (
                    <span className="ml-1 px-1 rounded-full bg-primary/30 text-[10px] font-mono">{activityLogs.length}</span>
                  )}
                </Button>

                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleStopProcessing} 
                  className="text-xs h-7 px-2.5 font-bold"
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Ferma
                </Button>
              </div>
            </div>

            {/* Barra di avanzamento per pagina / file */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate flex items-center gap-1.5 font-medium text-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
                  {currentProgressText || "Analisi visiva del testo e delle illustrazioni..."}
                </span>
                <span className="font-mono font-bold text-foreground shrink-0 ml-2">{pageProgressPercent}%</span>
              </div>
              <Progress value={pageProgressPercent} className="h-2 bg-primary/20" />
            </div>

            {/* Ultimo evento live (ticker compatto sempre visibile) */}
            {activityLogs.length > 0 && (
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 bg-background/50 px-2.5 py-1 rounded border border-border/40 truncate">
                <span className="text-primary font-bold shrink-0">LATEST:</span>
                <span className="truncate text-foreground font-sans">{activityLogs[0].text}</span>
              </div>
            )}

            {/* CONSOLE ATTIVITÀ IN TEMPO REALE */}
            {showLogsDrawer && activityLogs.length > 0 && (
              <div className="rounded-lg bg-black/70 border border-primary/30 p-2.5 font-mono text-xs max-h-48 overflow-y-auto space-y-1 shadow-inner">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-primary/20 pb-1 mb-1.5 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-primary font-bold">
                    <Terminal className="h-3 w-3" /> Monitoraggio ({activityLogs.length} eventi registrati)
                  </span>
                  <span>In esecuzione</span>
                </div>
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed text-[11px]">
                    <span className="text-muted-foreground shrink-0 select-none font-mono">[{log.time}]</span>
                    <span className={cn(
                      "font-sans",
                      log.type === 'success' && "text-emerald-400 font-semibold",
                      log.type === 'speed' && "text-cyan-400 font-semibold",
                      log.type === 'warn' && "text-amber-400",
                      log.type === 'info' && "text-slate-200"
                    )}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Contatori Live durante la scansione */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="bg-red-950/30 text-red-300 border-red-800/40 text-[10px] py-0.5">
                🐉 Mostri: <strong className="ml-1 font-mono text-red-200">{monsters.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-amber-950/30 text-amber-300 border-amber-800/40 text-[10px] py-0.5">
                ⚔️ Armeria: <strong className="ml-1 font-mono text-amber-200">{equipment.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-cyan-950/30 text-cyan-300 border-cyan-800/40 text-[10px] py-0.5">
                💎 Oggetti: <strong className="ml-1 font-mono text-cyan-200">{magicItems.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-purple-950/30 text-purple-300 border-purple-800/40 text-[10px] py-0.5">
                ✨ Incantesimi: <strong className="ml-1 font-mono text-purple-200">{spells.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-emerald-950/30 text-emerald-300 border-emerald-800/40 text-[10px] py-0.5">
                🧠 Abilità: <strong className="ml-1 font-mono text-emerald-200">{skills.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-blue-950/30 text-blue-300 border-blue-800/40 text-[10px] py-0.5">
                📜 Regole: <strong className="ml-1 font-mono text-blue-200">{rules.length}</strong>
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coda di Scansione con Controlli Range Pagine per PDF */}
      {queue.length > 0 && (
        <Card className="bg-card/70 backdrop-blur-sm border-border/80 text-card-foreground shadow-md animate-in fade-in slide-in-from-top-1 duration-300 mt-4">
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base text-foreground font-headline flex items-center gap-2 flex-wrap">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span>Coda di Scansione ({queue.length} file)</span>
              </CardTitle>
              {!isProcessing && currentProgressText && (
                <CardDescription className="text-xs text-primary mt-0.5 break-words">
                  {currentProgressText}
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end shrink-0">
              {isProcessing ? (
                <Button variant="destructive" size="sm" onClick={handleStopProcessing} className="text-xs h-8">
                  <X className="mr-1.5 h-3.5 w-3.5" /> Interrompi
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => processQueue()}
                  disabled={queue.length === 0 || queue.every(q => q.status === 'done')}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8"
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Avvia Scansione
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowDebugModal(true);
                  fetchDebugLog();
                }}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-medium"
                title="Visualizza i dettagli e le metriche dell'ultima scansione (file di log temporaneo)"
              >
                <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" /> Log Scansione
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQueue([])}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-foreground text-xs h-8"
              >
                Svuota
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-lg border text-xs space-y-2 transition-all",
                    currentProcessingIndex === idx ? "bg-primary/10 border-primary/60 shadow-sm" :
                    item.status === 'done' ? "bg-emerald-950/20 border-emerald-800/40" :
                    item.status === 'error' ? "bg-rose-950/20 border-rose-800/40" :
                    "bg-card/50 border-border/60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="w-8 h-8 rounded object-cover border border-border shrink-0" />
                      ) : (
                        <div className="p-2 rounded bg-primary/10 text-primary shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.type === 'pdf' ? `PDF (${item.totalPages} pagine totali)` : `${(item.size / 1024).toFixed(0)} KB`}
                        </p>
                      </div>
                    </div>
                    <div>
                      {item.status === 'processing' && (
                        <div className="flex items-center gap-1 text-primary text-[11px] font-medium">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>In corso...</span>
                        </div>
                      )}
                      {item.status === 'done' && (
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Completato</span>
                          </span>
                          {!isProcessing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestartScanItem(item.id)}
                              className="h-5 text-[9px] px-1 text-muted-foreground hover:text-foreground"
                              title="Riavvia scansione per questo file"
                            >
                              <RefreshCw className="h-2.5 w-2.5 mr-0.5" /> Riscansiona
                            </Button>
                          )}
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 text-rose-400 text-[11px] font-medium" title={item.errorMessage}>
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Errore</span>
                          </span>
                          {!isProcessing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestartScanItem(item.id)}
                              className="h-5 text-[9px] px-1 text-rose-300 hover:text-rose-100"
                              title="Riprova scansione immediatamente"
                            >
                              <RefreshCw className="h-2.5 w-2.5 mr-0.5" /> Riprova
                            </Button>
                          )}
                        </div>
                      )}
                      {item.status === 'queued' && <span className="text-[11px] text-muted-foreground">In attesa</span>}
                    </div>
                  </div>

                  {/* Range Pagine Personalizzabile per PDF */}
                  {item.type === 'pdf' && (
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">Intervallo Pagine:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">Da</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={item.startPage ?? 1}
                            disabled={isProcessing}
                            onChange={(e) => updatePdfField(item.id, 'startPage', e.target.value)}
                            onBlur={() => finalizePdfPageRange(item.id)}
                            className="w-14 h-6 text-[11px] px-1 py-0 text-center bg-background border-border"
                          />
                          <span className="text-[11px] text-muted-foreground">a</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={item.endPage ?? (item.totalPages || 1)}
                            disabled={isProcessing}
                            onChange={(e) => updatePdfField(item.id, 'endPage', e.target.value)}
                            onBlur={() => finalizePdfPageRange(item.id)}
                            className="w-14 h-6 text-[11px] px-1 py-0 text-center bg-background border-border"
                          />
                        </div>
                      </div>

                      {/* Bottoni Rapidi Selezione Pagine */}
                      {!isProcessing && (item.totalPages || 0) > 10 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePdfPageRange(item.id, 1, item.totalPages || 1)}
                            className="h-5 text-[9px] px-1.5 py-0 border-border text-muted-foreground hover:text-foreground"
                          >
                            Tutte (1-{item.totalPages})
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePdfPageRange(item.id, 1, Math.min(10, item.totalPages || 10))}
                            className="h-5 text-[9px] px-1.5 py-0 border-border text-muted-foreground hover:text-foreground"
                          >
                            Prime 10
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePdfPageRange(item.id, 1, Math.min(25, item.totalPages || 25))}
                            className="h-5 text-[9px] px-1.5 py-0 border-border text-muted-foreground hover:text-foreground"
                          >
                            Prime 25
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contatori Estratti per questo File */}
                  {((item.extractedMonstersCount || 0) > 0 ||
                    (item.extractedEquipmentCount || 0) > 0 ||
                    (item.extractedItemsCount || 0) > 0 ||
                    (item.extractedSpellsCount || 0) > 0 ||
                    (item.extractedSkillsCount || 0) > 0 ||
                    (item.extractedRulesCount || 0) > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
                      {(item.extractedMonstersCount || 0) > 0 && <span className="text-[9px] bg-red-950/40 text-red-300 px-1 py-0.2 rounded border border-red-800/40">🐉 {item.extractedMonstersCount} mostri</span>}
                      {(item.extractedEquipmentCount || 0) > 0 && <span className="text-[9px] bg-amber-950/40 text-amber-300 px-1 py-0.2 rounded border border-amber-800/40">⚔️ {item.extractedEquipmentCount} armeria</span>}
                      {(item.extractedItemsCount || 0) > 0 && <span className="text-[9px] bg-cyan-950/40 text-cyan-300 px-1 py-0.2 rounded border border-cyan-800/40">💎 {item.extractedItemsCount} oggetti</span>}
                      {(item.extractedSpellsCount || 0) > 0 && <span className="text-[9px] bg-purple-950/40 text-purple-300 px-1 py-0.2 rounded border border-purple-800/40">✨ {item.extractedSpellsCount} magie</span>}
                      {(item.extractedSkillsCount || 0) > 0 && <span className="text-[9px] bg-emerald-950/40 text-emerald-300 px-1 py-0.2 rounded border border-emerald-800/40">🧠 {item.extractedSkillsCount} abilità</span>}
                      {(item.extractedRulesCount || 0) > 0 && <span className="text-[9px] bg-blue-950/40 text-blue-300 px-1 py-0.2 rounded border border-blue-800/40">📜 {item.extractedRulesCount} regole</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PANNELLO TELEMETRIA IN TEMPO REALE (quando la scansione è attiva) */}
      {isProcessing && (
        <Card className="bg-primary/10 border-primary/40 text-card-foreground shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-1 duration-300 mt-4">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/20 pb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">Scansione Intelligente in Corso</span>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>{pageProgressDetails ? `Pagina ${pageProgressDetails.current} di ${pageProgressDetails.total}` : 'Elaborazione in corso...'}</span>
                    {pageProgressDetails && (
                      <span className="text-xs font-normal text-muted-foreground truncate max-w-xs">({pageProgressDetails.fileName})</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Badge Modello Attivo e Cronometro Live */}
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 border border-primary/30 text-xs font-mono text-primary shadow-sm">
                  <Cpu className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="font-semibold">{activeModelInUse}</span>
                </div>

                {/* Cronometro Pagina Corrente */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-primary/40 text-xs font-mono text-primary shadow-sm" title="Tempo impiegato sulla pagina attuale">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Pagina: <strong>{currentPageSeconds}s</strong></span>
                </div>

                {/* Tempo Totale Sessione */}
                <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-border text-xs font-mono text-muted-foreground shadow-sm" title="Tempo totale trascorso">
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Totale: {Math.floor(elapsedTotalSeconds / 60)}m {elapsedTotalSeconds % 60}s</span>
                </div>

                {/* Velocità Media per Pagina */}
                {averagePageDuration !== null && (
                  <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-emerald-500/40 text-xs font-mono text-emerald-400 shadow-sm" title="Velocità media per pagina completata">
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    <span>~{averagePageDuration.toFixed(1)}s/pag</span>
                  </div>
                )}

                {/* Stima Tempo Rimanente (ETA) */}
                {pageProgressDetails && averagePageDuration !== null && pageProgressDetails.total > pageProgressDetails.current && (
                  <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 border border-blue-500/40 text-xs font-mono text-blue-400 shadow-sm" title="Tempo stimato rimanente">
                    <span>ETA: ~{Math.round(averagePageDuration * (pageProgressDetails.total - pageProgressDetails.current + 1))}s</span>
                  </div>
                )}

                {/* Pulsante Toggle Console Live Log */}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowLogsDrawer(!showLogsDrawer)} 
                  className="text-xs h-7 px-2 border-primary/30 text-foreground hover:bg-primary/20"
                  title="Mostra o nascondi il registro dettagliato di cosa sta facendo l'IA"
                >
                  <Terminal className="mr-1 h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">{showLogsDrawer ? "Nascondi Log" : "Attività Live"}</span>
                  <span className="sm:hidden">Log</span>
                  {activityLogs.length > 0 && (
                    <span className="ml-1 px-1 rounded-full bg-primary/30 text-[10px] font-mono">{activityLogs.length}</span>
                  )}
                </Button>

                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleStopProcessing} 
                  className="text-xs h-7 px-2.5 font-bold"
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Ferma
                </Button>
              </div>
            </div>

            {/* Barra di avanzamento per pagina / file */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate flex items-center gap-1.5 font-medium text-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
                  {currentProgressText || "Analisi visiva del testo e delle illustrazioni..."}
                </span>
                <span className="font-mono font-bold text-foreground shrink-0 ml-2">{pageProgressPercent}%</span>
              </div>
              <Progress value={pageProgressPercent} className="h-2 bg-primary/20" />
            </div>

            {/* Ultimo evento live (ticker compatto sempre visibile) */}
            {activityLogs.length > 0 && (
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2 bg-background/50 px-2.5 py-1 rounded border border-border/40 truncate">
                <span className="text-primary font-bold shrink-0">LATEST:</span>
                <span className="truncate text-foreground font-sans">{activityLogs[0].text}</span>
              </div>
            )}

            {/* CONSOLE ATTIVITÀ IN TEMPO REALE (Cosa sta facendo l'IA momento per momento) */}
            {showLogsDrawer && activityLogs.length > 0 && (
              <div className="rounded-lg bg-black/70 border border-primary/30 p-2.5 font-mono text-xs max-h-48 overflow-y-auto space-y-1 shadow-inner">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-primary/20 pb-1 mb-1.5 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-primary font-bold">
                    <Terminal className="h-3 w-3" /> Monitoraggio ({activityLogs.length} eventi registrati)
                  </span>
                  <span>In esecuzione in background</span>
                </div>
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed text-[11px]">
                    <span className="text-muted-foreground shrink-0 select-none font-mono">[{log.time}]</span>
                    <span className={cn(
                      "font-sans",
                      log.type === 'success' && "text-emerald-400 font-semibold",
                      log.type === 'speed' && "text-cyan-400 font-semibold",
                      log.type === 'warn' && "text-amber-400",
                      log.type === 'info' && "text-slate-200"
                    )}>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Contatori Live durante la scansione */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="bg-red-950/30 text-red-300 border-red-800/40 text-xs py-0.5">
                🐉 Mostri: <strong className="ml-1 font-mono text-red-200">{monsters.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-amber-950/30 text-amber-300 border-amber-800/40 text-xs py-0.5">
                ⚔️ Armeria: <strong className="ml-1 font-mono text-amber-200">{equipment.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-cyan-950/30 text-cyan-300 border-cyan-800/40 text-xs py-0.5">
                💎 Oggetti: <strong className="ml-1 font-mono text-cyan-200">{magicItems.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-purple-950/30 text-purple-300 border-purple-800/40 text-xs py-0.5">
                ✨ Incantesimi: <strong className="ml-1 font-mono text-purple-200">{spells.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-emerald-950/30 text-emerald-300 border-emerald-800/40 text-xs py-0.5">
                🧠 Abilità: <strong className="ml-1 font-mono text-emerald-200">{skills.length}</strong>
              </Badge>
              <Badge variant="outline" className="bg-blue-950/30 text-blue-300 border-blue-800/40 text-xs py-0.5">
                📜 Regole: <strong className="ml-1 font-mono text-blue-200">{rules.length}</strong>
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sezione Risultati Estratti */}
      <div ref={resultsRef} className="space-y-4 pt-2 scroll-mt-6">
        {/* Avanzamento Visivo in Tempo Reale Salvataggio in Blocco */}
        {savingAllProgress && (
          <Card className="border-primary/50 bg-card/95 shadow-xl backdrop-blur-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border-2">
            <div className="bg-primary/10 border-b border-primary/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20 text-primary border border-primary/30 shrink-0">
                  {savingAllProgress.isActive ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2 flex-wrap">
                    <span>
                      {savingAllProgress.isActive
                        ? (savingAllProgress.isPausedForConflict
                            ? `In attesa di decisione sul duplicato (${savingAllProgress.current}/${savingAllProgress.total})`
                            : "Salvataggio in corso nel database...")
                        : "Salvataggio in Blocco Terminato!"}
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      {savingAllProgress.current} di {savingAllProgress.total} ({Math.round((savingAllProgress.current / Math.max(1, savingAllProgress.total)) * 100)}%)
                    </span>
                  </h4>
                  <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                    {savingAllProgress.isActive ? (
                      <>
                        Elemento corrente: <strong className="text-foreground">{savingAllProgress.currentName}</strong> ({savingAllProgress.category})
                      </>
                    ) : (
                      "Tutti gli elementi selezionati sono stati salvati o gestiti secondo le tue scelte."
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <Badge variant="outline" className="bg-emerald-950/40 text-emerald-300 border-emerald-800/40 text-[11px]">
                    ✓ Salvati: <strong className="ml-1 text-emerald-200">{savingAllProgress.saved}</strong>
                  </Badge>
                  <Badge variant="outline" className="bg-amber-950/40 text-amber-300 border-amber-800/40 text-[11px]">
                    ↻ Sovrascritti: <strong className="ml-1 text-amber-200">{savingAllProgress.overwritten}</strong>
                  </Badge>
                  <Badge variant="outline" className="bg-slate-900/60 text-slate-300 border-slate-700/60 text-[11px]">
                    ↷ Saltati: <strong className="ml-1 text-slate-200">{savingAllProgress.skipped}</strong>
                  </Badge>
                </div>
                {savingAllProgress.isActive ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs px-2.5 ml-1 font-bold"
                    onClick={handleStopSaveAll}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Ferma
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-3 ml-1 border-primary/40 text-primary hover:bg-primary/10 font-bold"
                    onClick={() => setSavingAllProgress(null)}
                  >
                    Chiudi
                  </Button>
                )}
              </div>
            </div>
            <div className="p-3 bg-background/50 space-y-1.5">
              <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                <span>Avanzamento processo</span>
                <span className="font-bold text-foreground">
                  {Math.round((savingAllProgress.current / Math.max(1, savingAllProgress.total)) * 100)}%
                </span>
              </div>
              <Progress
                value={Math.round((savingAllProgress.current / Math.max(1, savingAllProgress.total)) * 100)}
                className="h-2.5 bg-muted"
              />
            </div>
          </Card>
        )}

        {totalResultsCount > 0 && (
          <div className="space-y-4">
            {/* Barra Schede & Azioni in Blocco */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={activeTab === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('all')}
                  className={cn("text-xs h-8", activeTab === 'all' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                >
                  Tutti ({totalResultsCount})
                </Button>
                {monsters.length > 0 && (
                  <Button
                    variant={activeTab === 'monsters' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('monsters')}
                    className={cn("text-xs h-8", activeTab === 'monsters' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    🐉 Mostri ({monsters.length})
                  </Button>
                )}
                {equipment.length > 0 && (
                  <Button
                    variant={activeTab === 'equipment' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('equipment')}
                    className={cn("text-xs h-8", activeTab === 'equipment' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    ⚔️ Armeria ({equipment.length})
                  </Button>
                )}
                {magicItems.length > 0 && (
                  <Button
                    variant={activeTab === 'items' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('items')}
                    className={cn("text-xs h-8", activeTab === 'items' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    💎 Oggetti ({magicItems.length})
                  </Button>
                )}
                {spells.length > 0 && (
                  <Button
                    variant={activeTab === 'spells' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('spells')}
                    className={cn("text-xs h-8", activeTab === 'spells' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    ✨ Incantesimi ({spells.length})
                  </Button>
                )}
                {skills.length > 0 && (
                  <Button
                    variant={activeTab === 'skills' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('skills')}
                    className={cn("text-xs h-8", activeTab === 'skills' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    🧠 Abilità ({skills.length})
                  </Button>
                )}
                {rules.length > 0 && (
                  <Button
                    variant={activeTab === 'rules' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('rules')}
                    className={cn("text-xs h-8", activeTab === 'rules' ? "bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    📜 Regole ({rules.length})
                  </Button>
                )}
              </div>

              {/* Bottoni Salvataggio In Blocco & Svuota */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleExpandAll}
                  className="border-border hover:bg-muted text-foreground font-semibold text-xs h-8"
                  title={areAllExpanded ? "Riduci tutte le anteprime" : "Espandi tutte le anteprime per visualizzare tutto il testo e statblock"}
                >
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5 text-sky-400" />
                  {areAllExpanded ? "Riduci Tutti" : "Espandi Tutti"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAll}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8"
                >
                  <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" /> Salva Tutto
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearCurrentTab}
                  className="text-xs h-8 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/20"
                  title="Elimina tutti gli elementi di questa visualizzazione"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Svuota
                </Button>
              </div>
            </div>

            {/* GRIGLIA MOSTRI */}
            {(activeTab === 'all' || activeTab === 'monsters') && monsters.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>🐉 Mostri ({monsters.length})</span>
                  </h3>
                  {monsters.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoMergeDuplicateMonsters}
                      className="text-xs h-7 px-2.5 bg-background/80 border-primary/40 hover:bg-primary/10 text-primary font-semibold"
                      title="Unifica schede separate dello stesso mostro (es. pagina con lore e pagina con statblock/illustrazione)"
                    >
                      <Layers className="h-3.5 w-3.5 mr-1" /> Unisci Duplicati Multi-Pagina
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {monsters.map((m) => {
                    const isExp = Boolean(expandedCards[m.id]);
                    return (
                      <Card key={m.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{m.name}</h4>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditModal('monster', m)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                  title="Modifica statistiche o testo prima del salvataggio"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {renderCategorySwitchMenu('monster', m)}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleExpandCard(m.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                  title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                                >
                                  {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteMonster(m.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                  title="Elimina questo mostro dall'anteprima"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground italic truncate max-w-[280px] sm:max-w-[360px]" title={sanitizeMonsterType(m.type) || 'Creatura'}>
                                {sanitizeMonsterType(m.type) || 'Creatura'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {m.thumbnailUrl ? (
                                <img
                                  src={m.thumbnailUrl}
                                  alt={m.name}
                                  onClick={() => setLightboxUrl(m.thumbnailUrl || null)}
                                  className="w-10 h-10 rounded-full object-cover border-2 border-primary/50 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                                  title="Miniatura Token generata (clicca per ingrandire)"
                                />
                              ) : (
                                (m.rawPageImage || (m.pageImages && m.pageImages.length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pages = m.pageImages && m.pageImages.length > 0
                                        ? m.pageImages
                                        : (m.rawPageImage ? [m.rawPageImage] : (m.imageUrl ? [m.imageUrl] : []));
                                      setFramerModal({
                                        isOpen: true,
                                        targetId: m.id,
                                        targetType: 'monster',
                                        imageSrc: (m.rawPageImage || (pages && pages[0]) || m.imageUrl)!,
                                        name: m.name,
                                        availablePages: pages
                                      });
                                    }}
                                    className="w-9 h-9 rounded-full border border-dashed border-amber-500/60 bg-amber-950/30 hover:bg-amber-950/60 flex items-center justify-center text-amber-300 transition-colors"
                                    title="Nessun token automatico: clicca per ritagliare la miniatura"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </button>
                                )
                              )}
                              {m.imageUrl ? (
                                <img
                                  src={m.imageUrl}
                                  alt={m.name}
                                  onClick={() => setLightboxUrl(m.imageUrl || null)}
                                  className="w-10 h-10 rounded-md object-cover border border-border cursor-pointer shadow-sm hover:scale-105 transition-transform"
                                  title="Illustrazione completa (clicca per ingrandire)"
                                />
                              ) : (
                                (m.rawPageImage || (m.pageImages && m.pageImages.length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pages = m.pageImages && m.pageImages.length > 0 ? m.pageImages : (m.rawPageImage ? [m.rawPageImage] : []);
                                      setCropperModal({
                                        isOpen: true,
                                        targetId: m.id,
                                        targetType: 'monster',
                                        imageSrc: (m.rawPageImage || pages[0])!,
                                        name: m.name,
                                        availablePages: pages
                                      });
                                    }}
                                    className="w-9 h-9 rounded-md border border-dashed border-sky-500/60 bg-sky-950/30 hover:bg-sky-950/60 flex items-center justify-center text-sky-300 transition-colors"
                                    title="Nessun artwork automatico: clicca per ritagliare l'immagine"
                                  >
                                    <Crop className="h-4 w-4" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Parametri di combattimento */}
                          <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded-lg text-center border border-border/40">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Classe Armatura</span>
                              <span className="text-xs font-bold text-foreground">{m.armorClass || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Punti Ferita</span>
                              <span className="text-xs font-bold text-foreground">{m.hitPoints || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Grado Sfida (GS)</span>
                              <span className="text-xs font-bold text-foreground">{m.challenge || '—'}</span>
                            </div>
                          </div>

                          {/* Descrizione, Statblock & Lore */}
                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[420px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-4")}>
                              {m.description}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(m.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto / Espandi <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>

                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(m.rawPageImage || m.imageUrl || (m.pageImages && m.pageImages.length > 0)) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = m.pageImages && m.pageImages.length > 0
                                      ? m.pageImages
                                      : (m.rawPageImage ? [m.rawPageImage] : (m.imageUrl ? [m.imageUrl] : []));
                                    setCropperModal({
                                      isOpen: true,
                                      targetId: m.id,
                                      targetType: 'monster',
                                      imageSrc: (m.rawPageImage || m.imageUrl || pages[0])!,
                                      name: m.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-sky-300 border-sky-800/40 bg-sky-950/20 hover:bg-sky-950/50"
                                  title="Ritaglio Immagine: ritaglia o regola l'immagine completa"
                                >
                                  <Crop className="h-3 w-3 mr-1 text-sky-400" /> Ritaglio Immagine
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = m.pageImages && m.pageImages.length > 0
                                      ? m.pageImages
                                      : (m.rawPageImage ? [m.rawPageImage] : (m.imageUrl ? [m.imageUrl] : []));
                                    setFramerModal({
                                      isOpen: true,
                                      targetId: m.id,
                                      targetType: 'monster',
                                      imageSrc: (m.rawPageImage || (pages && pages[0]) || m.imageUrl)!,
                                      name: m.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-amber-300 border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/50"
                                  title="Miniatura: centra e inquadra la miniatura circolare"
                                >
                                  <Sparkles className="h-3 w-3 mr-1 text-amber-400" /> Miniatura
                                </Button>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              size="sm"
                              onClick={() => handleSaveMonster(m, 'campaign')}
                              disabled={m.savedCampaign || m.isSaving}
                              className={cn("h-7 text-xs font-bold w-full", m.savedCampaign ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                            >
                              {m.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : m.savedCampaign ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                              {m.savedCampaign ? 'Salvato' : 'Salva'}
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GRIGLIA ARMERIA */}
            {(activeTab === 'all' || activeTab === 'equipment') && equipment.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>⚔️ Armeria ({equipment.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {equipment.map((e) => {
                    const isExp = Boolean(expandedCards[e.id]);
                    return (
                      <Card key={e.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{e.name}</h4>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditModal('equipment', e)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                  title="Modifica parametri o descrizione prima del salvataggio"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {renderCategorySwitchMenu('equipment', e)}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleExpandCard(e.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                  title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                                >
                                  {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteEquipment(e.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                  title="Elimina questo elemento dall'anteprima"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground italic">{e.type}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {e.thumbnailUrl ? (
                                <img
                                  src={e.thumbnailUrl}
                                  alt=""
                                  onClick={() => { setLightboxUrl(e.thumbnailUrl || null); setLightboxZoom(1); }}
                                  className="w-9 h-9 rounded-full object-cover border-2 border-amber-500/80 cursor-pointer shadow-sm hover:scale-110 transition-transform"
                                  title="Miniatura (clicca per ingrandire con zoom)"
                                />
                              ) : (
                                (e.rawPageImage || e.imageUrl || (e.pageImages && e.pageImages.length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pages = e.pageImages && e.pageImages.length > 0 ? e.pageImages : (e.rawPageImage ? [e.rawPageImage] : (e.imageUrl ? [e.imageUrl] : []));
                                      setFramerModal({
                                        isOpen: true,
                                        targetId: e.id,
                                        targetType: 'equipment',
                                        imageSrc: (e.rawPageImage || (pages && pages[0]) || e.imageUrl)!,
                                        name: e.name,
                                        availablePages: pages
                                      });
                                    }}
                                    className="w-9 h-9 rounded-full border border-dashed border-amber-500/60 bg-amber-950/30 hover:bg-amber-950/60 flex items-center justify-center text-amber-300 transition-colors"
                                    title="Nessuna miniatura: clicca per creare la miniatura"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </button>
                                )
                              )}
                              {e.imageUrl && (
                                <img
                                  src={e.imageUrl}
                                  alt={e.name}
                                  onClick={() => { setLightboxUrl(e.imageUrl || null); setLightboxZoom(1); }}
                                  className="w-10 h-10 rounded-md object-cover border border-border cursor-pointer shadow-sm hover:scale-105 transition-transform"
                                  title="Illustrazione completa (clicca per ingrandire con zoom)"
                                />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded-lg text-center border border-border/40 text-[11px]">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Costo</span>
                              <span className="font-bold text-foreground">{e.cost || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Danno/CA</span>
                              <span className="font-bold text-foreground">{e.damage || e.armorClass || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Peso</span>
                              <span className="font-bold text-foreground">{e.weight || '—'}</span>
                            </div>
                          </div>

                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[300px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-3")}>
                              {e.description}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(e.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>

                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(e.rawPageImage || e.imageUrl || (e.pageImages && e.pageImages.length > 0)) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = e.pageImages && e.pageImages.length > 0
                                      ? e.pageImages
                                      : (e.rawPageImage ? [e.rawPageImage] : (e.imageUrl ? [e.imageUrl] : []));
                                    setCropperModal({
                                      isOpen: true,
                                      targetId: e.id,
                                      targetType: 'equipment',
                                      imageSrc: (e.rawPageImage || e.imageUrl || pages[0])!,
                                      name: e.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-sky-300 border-sky-800/40 bg-sky-950/20 hover:bg-sky-950/50"
                                  title="Ritaglio Immagine: ritaglia o regola l'immagine dell'arma/armatura"
                                >
                                  <Crop className="h-3 w-3 mr-1 text-sky-400" /> Ritaglio Immagine
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = e.pageImages && e.pageImages.length > 0
                                      ? e.pageImages
                                      : (e.rawPageImage ? [e.rawPageImage] : (e.imageUrl ? [e.imageUrl] : []));
                                    setFramerModal({
                                      isOpen: true,
                                      targetId: e.id,
                                      targetType: 'equipment',
                                      imageSrc: (e.rawPageImage || (pages && pages[0]) || e.imageUrl)!,
                                      name: e.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-amber-300 border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/50"
                                  title="Miniatura: centra e inquadra la miniatura circolare dell'arma/armatura"
                                >
                                  <Sparkles className="h-3 w-3 mr-1 text-amber-400" /> Miniatura
                                </Button>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEquipment(e, 'campaign')}
                              disabled={e.savedCampaign || e.isSaving}
                              className={cn("h-7 text-xs font-bold", e.savedCampaign ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                            >
                              {e.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : e.savedCampaign ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                              {e.savedCampaign ? 'In Armeria' : 'Salva Armeria'}
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GRIGLIA OGGETTI */}
            {(activeTab === 'all' || activeTab === 'items') && magicItems.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>💎 Oggetti & Artefatti ({magicItems.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {magicItems.map((item) => {
                    const isExp = Boolean(expandedCards[item.id]);
                    return (
                      <Card key={item.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{item.name}</h4>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenEditModal('item', item)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                  title="Modifica parametri o descrizione prima del salvataggio"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {renderCategorySwitchMenu('item', item)}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleExpandCard(item.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                  title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                                >
                                  {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteMagicItem(item.id)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                  title="Elimina questo oggetto dall'anteprima"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground italic">{item.type} ({item.rarity})</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt=""
                                  onClick={() => { setLightboxUrl(item.thumbnailUrl || null); setLightboxZoom(1); }}
                                  className="w-9 h-9 rounded-full object-cover border-2 border-amber-500/80 cursor-pointer shadow-sm hover:scale-110 transition-transform"
                                  title="Miniatura (clicca per ingrandire con zoom)"
                                />
                              ) : (
                                (item.rawPageImage || item.imageUrl || (item.pageImages && item.pageImages.length > 0)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pages = item.pageImages && item.pageImages.length > 0 ? item.pageImages : (item.rawPageImage ? [item.rawPageImage] : (item.imageUrl ? [item.imageUrl] : []));
                                      setFramerModal({
                                        isOpen: true,
                                        targetId: item.id,
                                        targetType: 'item',
                                        imageSrc: (item.rawPageImage || (pages && pages[0]) || item.imageUrl)!,
                                        name: item.name,
                                        availablePages: pages
                                      });
                                    }}
                                    className="w-9 h-9 rounded-full border border-dashed border-amber-500/60 bg-amber-950/30 hover:bg-amber-950/60 flex items-center justify-center text-amber-300 transition-colors"
                                    title="Nessuna miniatura: clicca per creare la miniatura"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </button>
                                )
                              )}
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  onClick={() => { setLightboxUrl(item.imageUrl || null); setLightboxZoom(1); }}
                                  className="w-10 h-10 rounded-md object-cover border border-amber-500/40 cursor-pointer shadow-md hover:scale-105 transition-transform shrink-0"
                                  title="Clicca per visualizzare l'immagine completa a schermo intero con zoom"
                                />
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2 rounded-lg text-center border border-border/40 text-[11px]">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Sintonia</span>
                              <span className="font-bold text-foreground">{item.attunement}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Costo / Valore</span>
                              <span className="font-bold text-foreground">{item.cost || '—'}</span>
                            </div>
                          </div>

                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[300px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-3")}>
                              {item.description}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(item.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>

                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(item.rawPageImage || item.imageUrl || (item.pageImages && item.pageImages.length > 0)) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = item.pageImages && item.pageImages.length > 0
                                      ? item.pageImages
                                      : (item.rawPageImage ? [item.rawPageImage] : (item.imageUrl ? [item.imageUrl] : []));
                                    setCropperModal({
                                      isOpen: true,
                                      targetId: item.id,
                                      targetType: 'item',
                                      imageSrc: (item.rawPageImage || item.imageUrl || pages[0])!,
                                      name: item.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-sky-300 border-sky-800/40 bg-sky-950/20 hover:bg-sky-950/50"
                                  title="Ritaglio Immagine: ritaglia o regola l'immagine dell'oggetto"
                                >
                                  <Crop className="h-3 w-3 mr-1 text-sky-400" /> Ritaglio Immagine
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const pages = item.pageImages && item.pageImages.length > 0
                                      ? item.pageImages
                                      : (item.rawPageImage ? [item.rawPageImage] : (item.imageUrl ? [item.imageUrl] : []));
                                    setFramerModal({
                                      isOpen: true,
                                      targetId: item.id,
                                      targetType: 'item',
                                      imageSrc: (item.rawPageImage || (pages && pages[0]) || item.imageUrl)!,
                                      name: item.name,
                                      availablePages: pages
                                    });
                                  }}
                                  className="h-7 text-[11px] px-2 text-amber-300 border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/50"
                                  title="Miniatura: centra e inquadra la miniatura circolare dell'oggetto"
                                >
                                  <Sparkles className="h-3 w-3 mr-1 text-amber-400" /> Miniatura
                                </Button>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              size="sm"
                              onClick={() => handleSaveMagicItem(item, 'campaign')}
                              disabled={item.savedCampaign || item.isSaving}
                              className={cn("h-7 text-xs font-bold", item.savedCampaign ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                            >
                              {item.isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : item.savedCampaign ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                              {item.savedCampaign ? 'Negli Oggetti' : 'Salva Oggetto'}
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GRIGLIA INCANTESIMI */}
            {(activeTab === 'all' || activeTab === 'spells') && spells.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>✨ Incantesimi ({spells.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {spells.map((s) => {
                    const isExp = Boolean(expandedCards[s.id]);
                    return (
                      <Card key={s.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{s.name}</h4>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditModal('spell', s)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                title="Modifica parametri o descrizione prima del salvataggio"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {renderCategorySwitchMenu('spell', s)}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleExpandCard(s.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                              >
                                {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteSpell(s.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                title="Elimina questo incantesimo dall'anteprima"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground italic">Livello {s.level} • Scuola: {s.school}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2 rounded-lg text-[11px] border border-border/40">
                            <div><span className="text-muted-foreground">Tempo:</span> <span className="font-bold">{s.casting_time}</span></div>
                            <div><span className="text-muted-foreground">Gittata:</span> <span className="font-bold">{s.range}</span></div>
                            <div><span className="text-muted-foreground">Componenti:</span> <span className="font-bold">{s.components}</span></div>
                            <div><span className="text-muted-foreground">Durata:</span> <span className="font-bold">{s.duration}</span></div>
                          </div>
                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[300px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-3")}>
                              {s.description}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(s.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>
                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex items-center justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleSaveSpell(s, 'campaign')}
                            disabled={s.savedCampaign || s.isSaving}
                            className={cn("h-7 text-xs font-bold", s.savedCampaign ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                          >
                            {s.savedCampaign ? 'Nel Grimorio' : 'Salva Incantesimo'}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GRIGLIA ABILITÀ */}
            {(activeTab === 'all' || activeTab === 'skills') && skills.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>🧠 Abilità & Tratti ({skills.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {skills.map((sk) => {
                    const isExp = Boolean(expandedCards[sk.id]);
                    return (
                      <Card key={sk.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{sk.name}</h4>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditModal('skill', sk)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                title="Modifica abilità o descrizione prima del salvataggio"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {renderCategorySwitchMenu('skill', sk)}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleExpandCard(sk.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                              >
                                {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteSkill(sk.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                title="Elimina questa abilità dall'anteprima"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground italic">{sk.type || sk.ability || 'Privilegio / Tratto'}</p>
                          </div>
                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[300px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-3")}>
                              {sk.description}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(sk.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>
                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex items-center justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleSaveSkill(sk, 'campaign')}
                            disabled={sk.savedCampaign || sk.isSaving}
                            className={cn("h-7 text-xs font-bold", sk.savedCampaign ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                          >
                            {sk.savedCampaign ? 'Nelle Abilità' : 'Salva Abilità'}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GRIGLIA REGOLE */}
            {(activeTab === 'all' || activeTab === 'rules') && rules.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>📜 Regole Generali ({rules.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rules.map((r) => {
                    const isExp = Boolean(expandedCards[r.id]);
                    return (
                      <Card key={r.id} className="bg-card/70 border-border/80 text-card-foreground shadow-sm flex flex-col justify-between overflow-hidden group">
                        <div className="p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-base text-foreground truncate max-w-[200px] sm:max-w-[240px]">{r.title}</h4>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEditModal('rule', r)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/30 shrink-0"
                                title="Modifica titolo, manuale o testo prima del salvataggio"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {renderCategorySwitchMenu('rule', r)}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleExpandCard(r.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400 hover:bg-sky-950/30 shrink-0"
                                title={isExp ? "Riduci anteprima" : "Espandi visualizzazione completa"}
                              >
                                {isExp ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteRule(r.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30 shrink-0 opacity-80 group-hover:opacity-100"
                                title="Elimina questa regola dall'anteprima"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground italic">Manuale: {r.sourceBook.toUpperCase()} {r.chapterTitle ? `• ${r.chapterTitle}` : ''}</p>
                          </div>
                          <div>
                            <div className={cn("text-xs text-muted-foreground whitespace-pre-line", isExp ? "max-h-[350px] overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-lg border border-border/30" : "line-clamp-4")}>
                              {r.content}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(r.id)}
                              className="text-[11px] text-primary hover:underline font-semibold mt-1 inline-flex items-center gap-0.5"
                            >
                              {isExp ? <>Riduci <ChevronUp className="h-3 w-3" /></> : <>Mostra tutto <ChevronDown className="h-3 w-3" /></>}
                            </button>
                          </div>
                        </div>
                        <CardFooter className="p-3 bg-muted/20 border-t border-border/50 flex items-center justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleSaveRule(r)}
                            disabled={(r.savedCampaign || r.savedGlobal) || r.isSaving}
                            className={cn("h-7 text-xs font-bold", (r.savedCampaign || r.savedGlobal) ? "bg-emerald-900/60 text-emerald-200" : "bg-primary text-primary-foreground")}
                          >
                            {r.isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : (r.savedCampaign || r.savedGlobal) ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                            {(r.savedCampaign || r.savedGlobal) ? 'Nelle Regole' : 'Salva Regola'}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modale di Modifica Entità (Matita) */}
      {editModal.isOpen && editModal.entity && (
        <Dialog open={editModal.isOpen} onOpenChange={(open) => { if (!open) setEditModal(prev => ({ ...prev, isOpen: false })); }}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-background border-border">
            <DialogHeader className="pb-3 border-b border-border/80 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
                <Pencil className="h-4 w-4 text-amber-500" />
                Modifica {editModal.category === 'monster' ? 'Mostro / Creatura' : editModal.category === 'equipment' ? 'Armeria' : editModal.category === 'item' ? 'Oggetto Magico' : editModal.category === 'spell' ? 'Incantesimo' : editModal.category === 'skill' ? 'Abilità' : 'Regola'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Apporta le modifiche desiderate prima di salvare definitivamente l&apos;elemento.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
              {/* Selettore rapido di categoria nel modale di modifica */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-muted/40 p-3 rounded-lg border border-border/70">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-foreground block">Categoria della Scheda</span>
                    <span className="text-[10px] text-muted-foreground block">Puoi cambiare categoria in qualsiasi momento</span>
                  </div>
                </div>
                <Select
                  value={editModal.category}
                  onValueChange={(val: any) => {
                    setEditModal(prev => ({
                      ...prev,
                      category: val,
                      entity: {
                        ...prev.entity,
                        name: prev.entity.name || prev.entity.title || '',
                        title: prev.entity.name || prev.entity.title || '',
                        description: prev.entity.description || prev.entity.content || '',
                        content: prev.entity.description || prev.entity.content || ''
                      }
                    }));
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background w-full sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monster">🐉 Mostro / Bestiario</SelectItem>
                    <SelectItem value="rule">📜 Regola Generale</SelectItem>
                    <SelectItem value="equipment">⚔️ Armeria</SelectItem>
                    <SelectItem value="item">💎 Oggetto Magico</SelectItem>
                    <SelectItem value="spell">✨ Incantesimo</SelectItem>
                    <SelectItem value="skill">🧠 Abilità / Tratto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Campi specifici per tipo */}
              {editModal.category === 'monster' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Nome Creatura</Label>
                    <Input
                      value={editModal.entity.name || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, name: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Tipo & Allineamento</Label>
                    <Input
                      value={editModal.entity.type || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, type: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Classe Armatura (CA)</Label>
                      <Input
                        value={editModal.entity.armorClass || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, armorClass: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Punti Ferita (PF)</Label>
                      <Input
                        value={editModal.entity.hitPoints || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, hitPoints: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Grado Sfida (GS)</Label>
                      <Input
                        value={editModal.entity.challenge || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, challenge: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Descrizione, Statblock & Lore (Markdown)</Label>
                    <Textarea
                      rows={10}
                      value={editModal.entity.description || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, description: e.target.value } }))}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {(editModal.category === 'equipment' || editModal.category === 'item') && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Nome</Label>
                    <Input
                      value={editModal.entity.name || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, name: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Tipo</Label>
                      <Input
                        value={editModal.entity.type || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, type: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Rarità / Categoria</Label>
                      <Input
                        value={editModal.entity.rarity || editModal.entity.category || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, rarity: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Costo</Label>
                      <Input
                        value={editModal.entity.cost || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, cost: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Danno / CA</Label>
                      <Input
                        value={editModal.entity.damage || editModal.entity.armorClass || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, damage: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Peso / Sintonia</Label>
                      <Input
                        value={editModal.entity.weight || editModal.entity.attunement || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, weight: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Descrizione Effetti</Label>
                    <Textarea
                      rows={6}
                      value={editModal.entity.description || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, description: e.target.value } }))}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {editModal.category === 'spell' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Nome Incantesimo</Label>
                    <Input
                      value={editModal.entity.name || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, name: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Livello</Label>
                      <Input
                        value={editModal.entity.level || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, level: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Scuola</Label>
                      <Input
                        value={editModal.entity.school || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, school: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Tempo di Lancio</Label>
                      <Input
                        value={editModal.entity.casting_time || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, casting_time: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Gittata</Label>
                      <Input
                        value={editModal.entity.range || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, range: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Componenti</Label>
                      <Input
                        value={editModal.entity.components || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, components: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Durata</Label>
                      <Input
                        value={editModal.entity.duration || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, duration: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Descrizione & Effetti</Label>
                    <Textarea
                      rows={6}
                      value={editModal.entity.description || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, description: e.target.value } }))}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {editModal.category === 'skill' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Nome Abilità / Tratto</Label>
                    <Input
                      value={editModal.entity.name || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, name: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Tipo</Label>
                      <Input
                        value={editModal.entity.type || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, type: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Caratteristica Collegata</Label>
                      <Input
                        value={editModal.entity.ability || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, ability: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Descrizione</Label>
                    <Textarea
                      rows={6}
                      value={editModal.entity.description || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, description: e.target.value } }))}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {editModal.category === 'rule' && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Titolo Regola</Label>
                    <Input
                      value={editModal.entity.title || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, title: e.target.value } }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Manuale di Origine</Label>
                      <Select
                        value={editModal.entity.sourceBook || 'dmg'}
                        onValueChange={(val) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, sourceBook: val } }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="phb">PHB (Manuale del Giocatore)</SelectItem>
                          <SelectItem value="dmg">DMG (Guida del Dungeon Master)</SelectItem>
                          <SelectItem value="custom">Homebrew / Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Capitolo / Sezione</Label>
                      <Input
                        value={editModal.entity.chapterTitle || ''}
                        onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, chapterTitle: e.target.value } }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Testo & Tabelle della Regola (Markdown)</Label>
                    <Textarea
                      rows={8}
                      value={editModal.entity.content || ''}
                      onChange={(e) => setEditModal(prev => ({ ...prev, entity: { ...prev.entity, content: e.target.value } }))}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 border-t border-border/80 flex items-center justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEditModal}
                className="bg-primary text-primary-foreground font-bold"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" /> Applica Modifiche
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Lightbox Ingrandimento Immagini con Zoom */}
      {lightboxUrl && (
        <Dialog open={!!lightboxUrl} onOpenChange={() => { setLightboxUrl(null); setLightboxZoom(1); }}>
          <DialogContent className="max-w-4xl bg-background border-border p-4 flex flex-col items-center">
            <DialogHeader className="w-full flex flex-row items-center justify-between pb-2 border-b border-border">
              <DialogTitle className="text-sm font-bold text-foreground">Anteprima Illustrazione HD</DialogTitle>
              <DialogDescription className="sr-only">Visualizzazione ingrandita dell&apos;illustrazione</DialogDescription>
              <div className="flex items-center gap-2 pr-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLightboxZoom(prev => Math.max(0.5, prev - 0.25))}
                  className="h-8 w-8 p-0"
                  title="Riduci Zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono w-12 text-center">{Math.round(lightboxZoom * 100)}%</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLightboxZoom(prev => Math.min(3, prev + 0.25))}
                  className="h-8 w-8 p-0"
                  title="Ingrandisci Zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLightboxZoom(1)}
                  className="h-8 text-xs px-2"
                >
                  Reset
                </Button>
              </div>
            </DialogHeader>
            <div className="flex items-center justify-center p-2 w-full overflow-auto max-h-[80vh]">
              <img
                src={lightboxUrl}
                alt=""
                style={{ transform: `scale(${lightboxZoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
                className="max-h-[75vh] w-auto rounded-lg object-contain shadow-md"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}




      {/* Modale Miniatura */}
      {framerModal.isOpen && (
        <ThumbnailFramerModal
          isOpen={framerModal.isOpen}
          onClose={() => setFramerModal(prev => ({ ...prev, isOpen: false }))}
          imageSrc={framerModal.imageSrc}
          availablePages={framerModal.availablePages}
          title={`Miniatura: ${framerModal.name}`}
          onSaveThumbnail={(tokenDataUrl) => {
            if (framerModal.targetType === 'equipment') {
              setEquipment(prev => prev.map(eq => eq.id === framerModal.targetId ? { ...eq, thumbnailUrl: tokenDataUrl } : eq));
            } else if (framerModal.targetType === 'item') {
              setMagicItems(prev => prev.map(it => it.id === framerModal.targetId ? { ...it, thumbnailUrl: tokenDataUrl } : it));
            } else {
              setMonsters(prev => prev.map(m => m.id === framerModal.targetId ? { ...m, thumbnailUrl: tokenDataUrl } : m));
            }
            setFramerModal(prev => ({ ...prev, isOpen: false }));
            toast({ title: "Miniatura Aggiornata!" });
          }}
        />
      )}

      {/* Modale Ritaglio Immagine */}
      {cropperModal.isOpen && (
        <ImageCropperModal
          isOpen={cropperModal.isOpen}
          onClose={() => setCropperModal(prev => ({ ...prev, isOpen: false }))}
          imageSrc={cropperModal.imageSrc}
          availablePages={cropperModal.availablePages}
          title={`Ritaglio Immagine: ${cropperModal.name}`}
          onCropSave={(croppedDataUrl) => {
            if (cropperModal.targetType === 'equipment') {
              setEquipment(prev => prev.map(eq => eq.id === cropperModal.targetId ? { ...eq, imageUrl: croppedDataUrl } : eq));
            } else if (cropperModal.targetType === 'item') {
              setMagicItems(prev => prev.map(it => it.id === cropperModal.targetId ? { ...it, imageUrl: croppedDataUrl } : it));
            } else {
              setMonsters(prev => prev.map(m => m.id === cropperModal.targetId ? { ...m, imageUrl: croppedDataUrl } : m));
            }
            setCropperModal(prev => ({ ...prev, isOpen: false }));
            toast({ title: "Ritaglio Immagine Salvato!" });
          }}
        />
      )}
        <Dialog 
          open={!!duplicateDialog} 
          onOpenChange={(open) => {
            if (!open) {
              handleSkipDuplicate();
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-500 font-bold">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <span>Elemento Duplicato Rilevato</span>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="text-sm pt-2 space-y-2.5 text-foreground/90">
                  <p>
                    L'elemento <strong className="text-amber-400 font-semibold">"{duplicateDialog?.existingName}"</strong> esiste già nel database della campagna o nel compendio.
                  </p>
                  {duplicateDialog?.bulkTotal && (
                    <div className="text-xs bg-amber-950/40 border border-amber-800/50 p-2.5 rounded-lg text-amber-200">
                      Elemento <strong>{duplicateDialog.bulkIndex} di {duplicateDialog.bulkTotal}</strong> nel salvataggio in blocco. Scegli cosa fare per questa scheda: una volta scelta l'opzione, il salvataggio proseguirà subito con l'elemento successivo.
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Scegli come procedere per questo singolo elemento:
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3">
              <Button 
                variant="outline" 
                onClick={handleSkipDuplicate}
                className="w-full sm:w-auto text-xs font-semibold"
              >
                Salta (Mantieni originale)
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleConfirmOverwrite}
                className="w-full sm:w-auto text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                Sovrascrivi questa scheda
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      <DiagnosticModal 
        isOpen={showDebugModal} 
        onClose={() => setShowDebugModal(false)}
        debugLogData={debugLogData}
        isLoading={isLoadingDebugLog}
        fetchDebugLog={fetchDebugLog}
        handleImportFromDebugLog={handleImportFromDebugLog}
      />

      {/* Dialog Ripristino Scansione */}
      <Dialog open={!!resumeDialog} onOpenChange={() => setResumeDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Clock className="h-5 w-5" />
              <span>Sessione di Scansione Rilevata</span>
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p className="text-sm text-foreground/90">
                È stata trovata una scansione interrotta per il file <strong className="text-primary">"{resumeDialog?.file?.name}"</strong>.
              </p>
              <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-1.5 text-xs">
                <p className="flex justify-between">
                  <span>Ultima pagina completata:</span>
                  <span className="font-bold">Pagina {resumeDialog?.checkpoint?.lastPage}</span>
                </p>
                <p className="flex justify-between">
                  <span>Mostri estratti finora:</span>
                  <span className="font-bold">{resumeDialog?.checkpoint?.monstersCount || 0}</span>
                </p>
                <p className="flex justify-between">
                  <span>Data salvataggio:</span>
                  <span className="italic">{resumeDialog?.checkpoint?.timestamp ? new Date(resumeDialog.checkpoint.timestamp).toLocaleString('it-IT') : 'N/D'}</span>
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Vuoi riprendere dal punto in cui ti eri fermato o iniziare una nuova scansione da zero?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => resumeDialog && handleNewSession(resumeDialog.file)}
              className="w-full sm:w-auto text-xs"
            >
              Nuova Scansione
            </Button>
            <Button
              onClick={() => resumeDialog && handleResumeSession(resumeDialog.file, resumeDialog.checkpoint)}
              className="w-full sm:w-auto bg-primary text-primary-foreground font-bold text-xs gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              Ripristina Sessione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
