'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { MarkdownRenderer } from './ui/markdown-renderer';
import { useRouter } from 'next/navigation';
import {
  Brain,
  MessageSquare,
  Bot,
  User,
  Loader2,
  Copy,
  Plus,
  Search,
  BookOpen,
  Wand,
  Skull,
  Sparkles,
  MapPin,
  UserCircle,
  FileText,
  Save,
  ArrowRight,
  BrainCircuit,
  HelpCircle,
  Undo,
  Check,
  Send,
  Trash2,
  FolderPlus,
  Hammer
} from 'lucide-react';
import {
  askOracoloAi,
  saveSpell,
  saveMagicItem,
  saveMonster,
  saveNpc,
  saveWorldLocation,
  saveHomebrewRule
} from '@/lib/actions';
import { cn } from '@/lib/utils';
import type { Spell, Monster, MagicItem, Skill, Npc, WorldLocation } from '@/lib/types';

type Message = {
  role: 'user' | 'model';
  text: string;
};

type OracoloAiProps = {
  campaignId: string;
  dbSpells?: Spell[];
  dbMonsters?: Monster[];
  dbMagicItems?: MagicItem[];
  skills?: Skill[];
  worldLocations?: WorldLocation[];
  npcs?: Npc[];
};

const SUGGESTIONS = [
  { text: "Consigliami 3 spunti di quest a Waterdeep", desc: "Avventure urbane" },
  { text: "Spiegami le regole canoniche sull'Inseguimento (5e)", desc: "Risoluzione inseguimenti" },
  { text: "Genera un PNG d'atmosfera legato alla gilda degli assassini di Neverwinter", desc: "PNG e Background" },
  { text: "Che tipo di tesoro bilanciato posso dare a un party di Livello 4?", desc: "Bottini e Ricompense" },
];

export function OracoloAi({
  campaignId,
  dbSpells = [],
  dbMonsters = [],
  dbMagicItems = [],
  skills = [],
  worldLocations = [],
  npcs = [],
}: OracoloAiProps) {
  const { toast } = useToast();
  const router = useRouter();

  // 1. STATO CHAT (IN ALTO)
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 2. STATO APPUNTI / ANNOTAZIONI (SOTTO LA CHAT)
  const [notes, setNotes] = useState('');

  // 3. STATI PER L'INSERIMENTO DIRETTO NELLE ALTRE SEZIONI (IN FONDO)
  const [selectedSection, setSelectedSection] = useState<'magie' | 'oggetti' | 'mostri' | 'png' | 'luoghi' | 'regole'>('magie');
  
  // Campi form rapido Incantesimi
  const [spellForm, setSpellForm] = useState({ name: '', level: '1', school: 'Evocazione', casting_time: '1 azione', range: '18 metri', duration: 'Istantanea', description: '' });
  // Campi form rapido Oggetti Magici
  const [itemForm, setItemForm] = useState({ name: '', type: 'Oggetto meraviglioso', rarity: 'Non comune', attunement: 'No', description: '' });
  // Campi form rapido Mostri
  const [monsterForm, setMonsterForm] = useState({ name: '', type: 'Umanoide', armorClass: '12', hitPoints: '22', challenge: '1/2', description: '' });
  // Campi form rapido PNG
  const [npcForm, setNpcForm] = useState({ name: '', race: 'Umano', gender: 'Uomo', alignment: 'Neutrale', description: '' });
  // Campi form rapido Luoghi
  const [locForm, setLocForm] = useState({ name: '', atmosphere: 'Misteriosa e antica', style: 'Città costiera', details: '' });
  // Campi form rapido Regole
  const [ruleForm, setRuleForm] = useState({ title: '', category: 'Generale', content: '' });

  const [isSavingEntity, setIsSavingEntity] = useState(false);

  // Caricamento appunti e cronologia chat locale all'avvio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNotes = localStorage.getItem(`dnd_oracolo_notes_${campaignId}`);
      if (savedNotes) {
        setNotes(savedNotes);
      } else {
        setNotes(`# Appunti dell'Oracolo\n\nUtilizza questa sezione per appuntare idee, dettagli e risposte generate per la campagna.\n\n- **Trame e Spunti:** \n- **PNG Incontrati:** \n- **Oggetti e Ricompense:** `);
      }

      const savedChat = localStorage.getItem(`dnd_oracolo_chat_${campaignId}`);
      if (savedChat && savedChat.trim() !== '') {
        try {
          const parsed = JSON.parse(savedChat);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          } else {
            throw new Error("Invalid format");
          }
        } catch (e) {
          console.error("Errore caricamento cronologia chat:", e);
          localStorage.removeItem(`dnd_oracolo_chat_${campaignId}`);
          setMessages([
            {
              role: 'model',
              text: "Salute! Io sono l'Oracolo del Tessitore, custode delle regole di D&D 5e e delle cronache dei Forgotten Realms. Chiedimi qualsiasi cosa per pianificare le tue sessioni, chiarire dubbi o generare contenuti!"
            }
          ]);
        }
      } else {
        setMessages([
          {
            role: 'model',
            text: "Salute! Io sono l'Oracolo del Tessitore, custode delle regole di D&D 5e e delle cronache dei Forgotten Realms. Chiedimi qualsiasi cosa per pianificare le tue sessioni, chiarire dubbi o generare contenuti!"
          }
        ]);
      }
    }
  }, [campaignId]);

  // Scorrimento verso il basso al riceversi di nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Salvataggio automatico degli appunti
  const saveNotesLocally = (val: string) => {
    setNotes(val);
    localStorage.setItem(`dnd_oracolo_notes_${campaignId}`, val);
  };

  const handleSaveNotesManually = () => {
    localStorage.setItem(`dnd_oracolo_notes_${campaignId}`, notes);
    toast({
      title: "Appunti salvati!",
      description: "Le annotazioni sono state registrate in locale.",
    });
  };

  const handleClearChat = () => {
    const defaultMsg: Message[] = [
      {
        role: 'model',
        text: "La conversazione è stata ripulita. Fai pure una nuova domanda!"
      }
    ];
    setMessages(defaultMsg);
    localStorage.setItem(`dnd_oracolo_chat_${campaignId}`, JSON.stringify(defaultMsg));
    toast({
      title: "Chat ripulita",
      description: "La cronologia locale è stata azzerata.",
    });
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputPrompt;
    if (!promptToSend.trim()) return;

    const userMessage: Message = { role: 'user', text: promptToSend };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const historyToSend = updatedMessages.slice(0, -1);
      const res = await askOracoloAi(promptToSend, historyToSend, campaignId);

      if (res.success && res.data) {
        const botMessage: Message = { role: 'model', text: res.data };
        const finalMessages = [...updatedMessages, botMessage];
        setMessages(finalMessages);
        localStorage.setItem(`dnd_oracolo_chat_${campaignId}`, JSON.stringify(finalMessages));
      } else {
        throw new Error(res.error || "Impossibile ottenere risposta dall'Oracolo.");
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: "Errore di Connessione",
        description: e.message || "L'Oracolo non risponde. Verifica la chiave API.",
      });
      setMessages(updatedMessages.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertIntoNotes = (text: string) => {
    const newNotes = notes + "\n\n" + text;
    saveNotesLocally(newNotes);
    toast({
      title: "Aggiunto alle annotazioni",
      description: "Il contenuto è stato inserito in fondo agli appunti.",
    });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Testo copiato!" });
  };

  // Funzioni di salvataggio diretto nelle sezioni
  const handleSaveSpellDirect = async () => {
    if (!spellForm.name.trim()) {
      toast({ variant: 'destructive', title: "Nome obbligatorio", description: "Inserisci un nome per l'incantesimo." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const res = await saveSpell({ ...spellForm, campaignId });
      if (res.success) {
        toast({ title: "Incantesimo Salvato!", description: `"${spellForm.name}" è stato aggiunto alla sezione Incantesimi.` });
        setSpellForm({ name: '', level: '1', school: 'Evocazione', casting_time: '1 azione', range: '18 metri', duration: 'Istantanea', description: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleSaveItemDirect = async () => {
    if (!itemForm.name.trim()) {
      toast({ variant: 'destructive', title: "Nome obbligatorio", description: "Inserisci un nome per l'oggetto." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const res = await saveMagicItem({ ...itemForm, campaignId });
      if (res.success) {
        toast({ title: "Oggetto Salvato!", description: `"${itemForm.name}" è stato aggiunto alla sezione Oggetti.` });
        setItemForm({ name: '', type: 'Oggetto meraviglioso', rarity: 'Non comune', attunement: 'No', description: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleSaveMonsterDirect = async () => {
    if (!monsterForm.name.trim()) {
      toast({ variant: 'destructive', title: "Nome obbligatorio", description: "Inserisci un nome per la creatura." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const res = await saveMonster({ ...monsterForm, campaignId });
      if (res.success) {
        toast({ title: "Mostro Salvato!", description: `"${monsterForm.name}" è stato aggiunto al Bestiario.` });
        setMonsterForm({ name: '', type: 'Umanoide', armorClass: '12', hitPoints: '22', challenge: '1/2', description: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleSaveNpcDirect = async () => {
    if (!npcForm.name.trim()) {
      toast({ variant: 'destructive', title: "Nome obbligatorio", description: "Inserisci un nome per il PNG." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const detailsJson = JSON.stringify({
        name: npcForm.name,
        race: npcForm.race,
        gender: npcForm.gender,
        alignment: npcForm.alignment,
        personalityTraits: npcForm.description || "Nessun dettaglio aggiuntivo.",
        backgroundSummary: npcForm.description || ""
      });
      const res = await saveNpc({
        campaignId,
        name: npcForm.name,
        race: npcForm.race,
        gender: npcForm.gender,
        age: 30,
        status: 'Vivo',
        alignment: npcForm.alignment,
        details: detailsJson
      });
      if (res.success) {
        toast({ title: "PNG Salvato!", description: `"${npcForm.name}" è stato aggiunto all'Anagrafe dei PNG.` });
        setNpcForm({ name: '', race: 'Umano', gender: 'Uomo', alignment: 'Neutrale', description: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleSaveLocationDirect = async () => {
    if (!locForm.name.trim()) {
      toast({ variant: 'destructive', title: "Nome obbligatorio", description: "Inserisci un nome per il luogo." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const res = await saveWorldLocation({
        campaignId,
        name: locForm.name,
        atmosphere: locForm.atmosphere,
        style: locForm.style,
        scale: 'Locale',
        details: locForm.details || locForm.atmosphere
      });
      if (res.success) {
        toast({ title: "Luogo Salvato!", description: `"${locForm.name}" è stato aggiunto all'Architetto di Mondi.` });
        setLocForm({ name: '', atmosphere: 'Misteriosa e antica', style: 'Città costiera', details: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  const handleSaveRuleDirect = async () => {
    if (!ruleForm.title.trim()) {
      toast({ variant: 'destructive', title: "Titolo obbligatorio", description: "Inserisci un titolo per la regola." });
      return;
    }
    setIsSavingEntity(true);
    try {
      const res = await saveHomebrewRule({
        campaignId,
        title: ruleForm.title,
        category: ruleForm.category,
        content: ruleForm.content || 'Regola personalizzata.',
        isActive: true
      });
      if (res.success) {
        toast({ title: "Regola Salvata!", description: `"${ruleForm.title}" è stata aggiunta alle Regole Homebrew.` });
        setRuleForm({ title: '', category: 'Generale', content: '' });
        router.refresh();
      } else throw new Error(res.error || "Errore");
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Errore Salvataggio", description: e.message });
    } finally {
      setIsSavingEntity(false);
    }
  };

  return (
    <div className="flex flex-col space-y-8 w-full max-w-5xl mx-auto pb-16 animate-in fade-in duration-300">
      
      {/* 1. SEZIONE IN ALTO: BOX CHAT */}
      <Card className="flex flex-col bg-card/70 backdrop-blur-sm border border-border/80 shadow-md overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/60 p-4 bg-muted/30 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-headline text-foreground">
                Oracolo
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground font-serif">
                Chat AI per regole 5e, storia Forgotten Realms e consigli di sessione
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearChat}
            className="h-8 text-xs border-border hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Undo className="h-3.5 w-3.5 mr-1.5" /> Ripristina Chat
          </Button>
        </CardHeader>

        {/* Lista Messaggi */}
        <ScrollArea className="h-[380px] p-4 bg-background/50">
          <div className="space-y-4 pb-2">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-3 max-w-[88%] rounded-xl p-4 shadow-md border",
                  msg.role === 'user'
                    ? "ml-auto bg-primary/15 border-primary/30 text-foreground flex-row-reverse"
                    : "bg-card/85 border-border text-foreground"
                )}
              >
                <div className={cn(
                  "h-7 w-7 rounded-full shrink-0 flex items-center justify-center border text-xs shadow-inner",
                  msg.role === 'user'
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-muted border-border text-primary"
                )}>
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>

                <div className="space-y-2 flex-1 overflow-hidden font-serif leading-relaxed text-sm">
                  <MarkdownRenderer content={msg.text} />
                  
                  {msg.role === 'model' && (
                    <div className="flex gap-2 pt-2 border-t border-border/40 mt-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyText(msg.text)}
                        title="Copia testo"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleInsertIntoNotes(`### Risposta dell'Oracolo\n\n${msg.text}`)}
                        className="h-7 text-xs text-primary hover:text-primary/90 hover:bg-primary/10 px-2.5 font-serif"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi alle Annotazioni
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 max-w-[80%] rounded-xl p-4 bg-card/85 border border-border text-foreground">
                <div className="h-7 w-7 rounded-full bg-muted border border-border text-primary shrink-0 flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
                <div className="flex-1 space-y-1 py-1">
                  <p className="text-xs font-serif text-primary/90 animate-pulse tracking-wide">
                    L'Oracolo sta consultando i tomi antichi...
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Spunti / Suggerimenti se ci sono pochi messaggi */}
        {messages.length <= 1 && (
          <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
            <p className="text-xs font-serif text-primary/90 mb-2 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
              <HelpCircle className="h-3.5 w-3.5 text-primary" /> Domande Rapide:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s.text)}
                  className="text-left p-2.5 rounded-lg bg-card/60 hover:bg-card border border-border/60 transition-colors text-xs space-y-0.5 group cursor-pointer"
                >
                  <p className="font-bold text-foreground group-hover:text-primary transition-colors">{s.text}</p>
                  <p className="text-[10px] text-muted-foreground font-serif italic">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box invio messaggio */}
        <div className="p-4 border-t border-border/60 bg-muted/20 rounded-b-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <Input
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Fai una domanda sulle regole 5e, creature, PNG o trame..."
              disabled={isLoading}
              className="flex-1 bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-primary h-11 text-sm font-serif"
            />
            <Button
              type="submit"
              disabled={isLoading || !inputPrompt.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5 shadow-sm font-medium"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Invia
            </Button>
          </form>
        </div>
      </Card>

      {/* 2. SEZIONE CENTRALE (SOTTO LA CHAT): TEXT BOX ANNOTAZIONI */}
      <Card className="flex flex-col bg-card/70 backdrop-blur-sm border border-border/80 shadow-md overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/60 p-4 bg-muted/30 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-headline text-foreground">
                Annotazioni & Appunti
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground font-serif">
                Salvataggio locale persistente per consultare e annotare promemoria della campagna
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveNotesManually}
              className="h-8 text-xs border-border hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" /> Salva Appunti
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col">
          <Textarea
            value={notes}
            onChange={(e) => saveNotesLocally(e.target.value)}
            placeholder="Scrivi qui le tue annotazioni, statistiche, idee e note per le prossime sessioni..."
            className="w-full min-h-[220px] bg-transparent p-4 border-0 focus-visible:ring-0 resize-y font-serif text-sm text-foreground leading-relaxed overflow-y-auto focus-visible:ring-offset-0 focus:outline-none focus:ring-0"
            style={{
              backgroundImage: "linear-gradient(rgba(245, 158, 11, 0.04) 1px, transparent 1px)",
              backgroundSize: "100% 1.6rem",
              lineHeight: "1.6rem"
            }}
          />
        </CardContent>
        <CardFooter className="px-4 py-2 border-t border-border/40 bg-muted/20 flex justify-between items-center text-xs text-muted-foreground font-serif">
          <span>{notes.length} caratteri registrati</span>
          <span className="italic">Salvataggio automatico locale attivo</span>
        </CardFooter>
      </Card>

      {/* 3. SEZIONE IN BASSO: BOX PER INSERIRE DIRETTAMENTE NELLE ALTRE SEZIONI */}
      <Card className="flex flex-col bg-card/70 backdrop-blur-sm border border-border/80 shadow-md overflow-hidden rounded-xl">
        <CardHeader className="border-b border-border/60 p-4 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-headline text-foreground">
                Inserimento Diretto nelle Altre Sezioni
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground font-serif">
                Registra istantaneamente nuove voci nei compendi ufficiali e nei database della campagna
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-6">
          <Tabs value={selectedSection} onValueChange={(v: any) => setSelectedSection(v)}>
            {/* Selettore sezione target */}
            <TabsList className="bg-muted/50 border border-border/60 grid grid-cols-3 sm:grid-cols-6 h-auto p-1 gap-1">
              <TabsTrigger value="magie" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Wand className="h-3.5 w-3.5 mr-1.5" /> Incantesimi
              </TabsTrigger>
              <TabsTrigger value="oggetti" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Oggetti
              </TabsTrigger>
              <TabsTrigger value="mostri" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Skull className="h-3.5 w-3.5 mr-1.5" /> Bestiario
              </TabsTrigger>
              <TabsTrigger value="png" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <UserCircle className="h-3.5 w-3.5 mr-1.5" /> PNG
              </TabsTrigger>
              <TabsTrigger value="luoghi" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <MapPin className="h-3.5 w-3.5 mr-1.5" /> Luoghi
              </TabsTrigger>
              <TabsTrigger value="regole" className="text-xs py-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Hammer className="h-3.5 w-3.5 mr-1.5" /> Regole
              </TabsTrigger>
            </TabsList>

            {/* 3.1 FORM INCANTESIMI */}
            <TabsContent value="magie" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Nome Incantesimo *</label>
                  <Input
                    value={spellForm.name}
                    onChange={(e) => setSpellForm({ ...spellForm, name: e.target.value })}
                    placeholder="es. Sfera di Fuoco Arcano"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Livello</label>
                  <Input
                    value={spellForm.level}
                    onChange={(e) => setSpellForm({ ...spellForm, level: e.target.value })}
                    placeholder="0 per Trucchetto, 1-9"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Scuola di Magia</label>
                  <Input
                    value={spellForm.school}
                    onChange={(e) => setSpellForm({ ...spellForm, school: e.target.value })}
                    placeholder="es. Evocazione, Abiurazione"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Tempo di Lancio</label>
                  <Input
                    value={spellForm.casting_time}
                    onChange={(e) => setSpellForm({ ...spellForm, casting_time: e.target.value })}
                    placeholder="es. 1 azione, 1 reazione"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Gittata</label>
                  <Input
                    value={spellForm.range}
                    onChange={(e) => setSpellForm({ ...spellForm, range: e.target.value })}
                    placeholder="es. 18 metri, Contatto"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Durata</label>
                  <Input
                    value={spellForm.duration}
                    onChange={(e) => setSpellForm({ ...spellForm, duration: e.target.value })}
                    placeholder="es. Istantanea, Concentrazione 1 min"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Descrizione & Effetto</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSpellForm({ ...spellForm, description: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={spellForm.description}
                  onChange={(e) => setSpellForm({ ...spellForm, description: e.target.value })}
                  placeholder="Effetto dell'incantesimo, danni o tiri salvezza..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveSpellDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wand className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nella Sezione Incantesimi
                </Button>
              </div>
            </TabsContent>

            {/* 3.2 FORM OGGETTI MAGICI */}
            <TabsContent value="oggetti" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Nome Oggetto *</label>
                  <Input
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    placeholder="es. Anello della Grazia Felina"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Tipo</label>
                  <Input
                    value={itemForm.type}
                    onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}
                    placeholder="es. Oggetto meraviglioso, Arma, Armatura"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Rarità</label>
                  <Input
                    value={itemForm.rarity}
                    onChange={(e) => setItemForm({ ...itemForm, rarity: e.target.value })}
                    placeholder="es. Comune, Non comune, Raro, Molto raro, Leggendario"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Descrizione & Proprietà</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItemForm({ ...itemForm, description: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Proprietà magiche, cariche, bonus e sintonizzazione..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveItemDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nella Sezione Oggetti
                </Button>
              </div>
            </TabsContent>

            {/* 3.3 FORM MOSTRI / BESTIARIO */}
            <TabsContent value="mostri" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Nome Creatura *</label>
                  <Input
                    value={monsterForm.name}
                    onChange={(e) => setMonsterForm({ ...monsterForm, name: e.target.value })}
                    placeholder="es. Goblin Predatore delle Ombre"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Tipo & Taglia</label>
                  <Input
                    value={monsterForm.type}
                    onChange={(e) => setMonsterForm({ ...monsterForm, type: e.target.value })}
                    placeholder="es. Umanoide Piccolo, Non morto Enorme"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Classe Armatura (CA)</label>
                  <Input
                    value={monsterForm.armorClass}
                    onChange={(e) => setMonsterForm({ ...monsterForm, armorClass: e.target.value })}
                    placeholder="es. 15 (armatura di cuoio)"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Punti Ferita (PF)</label>
                  <Input
                    value={monsterForm.hitPoints}
                    onChange={(e) => setMonsterForm({ ...monsterForm, hitPoints: e.target.value })}
                    placeholder="es. 32 (5d8 + 10)"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Statistiche, Azioni e Tratti</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMonsterForm({ ...monsterForm, description: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={monsterForm.description}
                  onChange={(e) => setMonsterForm({ ...monsterForm, description: e.target.value })}
                  placeholder="Caratteristiche (FOR, DES, COS...), attacchi, tattiche e abilità speciali..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveMonsterDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Skull className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nel Bestiario
                </Button>
              </div>
            </TabsContent>

            {/* 3.4 FORM PNG / PERSONAGGI */}
            <TabsContent value="png" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Nome PNG *</label>
                  <Input
                    value={npcForm.name}
                    onChange={(e) => setNpcForm({ ...npcForm, name: e.target.value })}
                    placeholder="es. Durnan, Oste del Portale Sbadigliante"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Razza</label>
                  <Input
                    value={npcForm.race}
                    onChange={(e) => setNpcForm({ ...npcForm, race: e.target.value })}
                    placeholder="es. Umano, Nano degli Scudi, Elfo della Luna"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Allineamento</label>
                  <Input
                    value={npcForm.alignment}
                    onChange={(e) => setNpcForm({ ...npcForm, alignment: e.target.value })}
                    placeholder="es. Neutrale Buono, Caotico Neutrale"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Personalità, Ruolo e Segreti</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNpcForm({ ...npcForm, description: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={npcForm.description}
                  onChange={(e) => setNpcForm({ ...npcForm, description: e.target.value })}
                  placeholder="Aspetto, motivazioni, agganci per i giocatori e segreti..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveNpcDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserCircle className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nell'Anagrafe dei PNG
                </Button>
              </div>
            </TabsContent>

            {/* 3.5 FORM LUOGHI / ARCHITETTO */}
            <TabsContent value="luoghi" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Nome Luogo o Insediamento *</label>
                  <Input
                    value={locForm.name}
                    onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                    placeholder="es. Locanda del Cigno Nero, Pozzo delle Ombre"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Atmosfera o Stile</label>
                  <Input
                    value={locForm.atmosphere}
                    onChange={(e) => setLocForm({ ...locForm, atmosphere: e.target.value })}
                    placeholder="es. Taverna affollata, Rovine infestate, Foresta primordiale"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Dettagli del Luogo, Punti di Interesse e PNG Presenti</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocForm({ ...locForm, details: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={locForm.details}
                  onChange={(e) => setLocForm({ ...locForm, details: e.target.value })}
                  placeholder="Descrizione visiva, odori, pericoli ambientali e incontri..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveLocationDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <MapPin className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nell'Architetto di Mondi
                </Button>
              </div>
            </TabsContent>

            {/* 3.6 FORM REGOLE HOMEBREW */}
            <TabsContent value="regole" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Titolo Regola *</label>
                  <Input
                    value={ruleForm.title}
                    onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                    placeholder="es. Regola della Pozione come Azione Bonus"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-foreground font-medium">Categoria</label>
                  <Input
                    value={ruleForm.category}
                    onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                    placeholder="es. Combattimento, Riposo, Magia, Esplorazione"
                    className="bg-background border-input text-foreground text-xs h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground font-medium">Testo della Regola</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRuleForm({ ...ruleForm, content: notes })}
                    className="h-6 text-[10px] text-primary hover:text-primary/80"
                  >
                    Incolla dagli Appunti
                  </Button>
                </div>
                <Textarea
                  value={ruleForm.content}
                  onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })}
                  placeholder="Spiega esattamente come funziona la regola e quali meccaniche modifica..."
                  className="bg-background border-input text-foreground text-xs min-h-[90px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveRuleDirect}
                  disabled={isSavingEntity}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 px-4 font-medium"
                >
                  {isSavingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Hammer className="h-3.5 w-3.5 mr-1.5" />}
                  Inserisci nelle Regole Homebrew
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

    </div>
  );
}
