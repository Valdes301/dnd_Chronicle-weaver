'use client';

import { useState, useEffect } from 'react';
import type { CampaignWithRelations } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Lock, 
  KeyRound, 
  Hammer, 
  Settings, 
  Download, 
  Image as ImageIcon, 
  Upload, 
  Plus, 
  ShieldCheck, 
  Database, 
  Sliders,
  Sparkles,
  Palette,
  Bot,
  Cpu,
  Copy,
  Check,
  Terminal,
  Loader2,
  PanelLeft,
  Link2
} from 'lucide-react';
import { SettingsView } from './settings-view';
import { HomebrewCompendium } from './homebrew-compendium';
import { BackgroundCustomizer } from './background-customizer';
import { AiModelSelector } from './ai-model-selector';
import { SystemLogsViewer } from './system-logs-viewer';
import { isPinConfigured, setIsLocked } from '@/lib/pin-storage';
import { useToast } from '@/hooks/use-toast';
import { PlayerPermissionsMatrix } from './player-permissions-matrix';
import * as actions from '@/lib/actions';

type SystemPanelProps = {
  campaign: CampaignWithRelations;
  onOpenPinConfig: () => void;
  onBackupData: () => void;
  onBackupImages: () => void;
  onNewCampaign: () => void;
};

export function SystemPanel({
  campaign,
  onOpenPinConfig,
  onBackupData,
  onBackupImages,
  onNewCampaign,
}: SystemPanelProps) {
  const [activeTab, setActiveTab] = useState<'control' | 'backgrounds' | 'settings' | 'homebrew' | 'model' | 'permissions' | 'logs'>('control');
  const [migrationLogs, setMigrationLogs] = useState<string>('');
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const { toast } = useToast();
  const [autoCloseSidebar, setAutoCloseSidebar] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dnd_auto_close_sidebar');
      if (stored !== null) return stored === 'true';
    }
    return true;
  });

  useEffect(() => {
    actions.getAppSettingAction('autoCloseSidebar', 'true').then(res => {
      if (res.success && res.data) {
        const val = res.data !== 'false';
        setAutoCloseSidebar(val);
        localStorage.setItem('dnd_auto_close_sidebar', val ? 'true' : 'false');
      }
    });

    const handleSettingChange = (e: any) => {
      if (e.detail?.key === 'autoCloseSidebar') {
        const val = e.detail?.value !== 'false';
        setAutoCloseSidebar(val);
        localStorage.setItem('dnd_auto_close_sidebar', val ? 'true' : 'false');
      }
    };
    window.addEventListener('dnd-setting-changed', handleSettingChange);
    return () => window.removeEventListener('dnd-setting-changed', handleSettingChange);
  }, []);

  const handleQuickLock = () => {
    if (isPinConfigured()) {
      setIsLocked(true);
      toast({ title: "Schermo Sigillato", description: "Inserisci il PIN per riprendere." });
    } else {
      onOpenPinConfig();
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 w-full h-auto bg-neutral-900/80 p-1.5 border border-border/40 rounded-xl mb-6 gap-1.5">
          <TabsTrigger 
            id="tab-system-control"
            value="control" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Sliders className="h-4 w-4 shrink-0" />
            <span>Gestione &amp; Backup</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-permissions"
            value="permissions" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-amber-600/25 data-[state=active]:text-amber-200 font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Schede Giocatori</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-model"
            value="model" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-amber-600/25 data-[state=active]:text-amber-200 font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Bot className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Modello IA</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-logs"
            value="logs" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-amber-600/25 data-[state=active]:text-amber-200 font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Cpu className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Log &amp; Errori</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-backgrounds"
            value="backgrounds" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-amber-600/25 data-[state=active]:text-amber-200 font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Palette className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Sfondi &amp; Tema</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-settings"
            value="settings" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Stato Sistema &amp; API</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-homebrew"
            value="homebrew" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Hammer className="h-4 w-4 shrink-0" />
            <span>Compendio Homebrew</span>
          </TabsTrigger>
          <TabsTrigger 
            id="tab-system-maintenance"
            value="maintenance" 
            className="w-full h-auto py-2.5 px-2.5 flex items-center justify-center gap-1.5 rounded-lg data-[state=active]:bg-rose-600/20 data-[state=active]:text-rose-400 font-medium text-xs sm:text-sm whitespace-normal transition-all text-center"
          >
            <Database className="h-4 w-4 shrink-0" />
            <span>Manutenzione</span>
          </TabsTrigger>
        </TabsList>

        {/* Scheda 1: Controlli, Sicurezza e Backup */}
        <TabsContent value="control" className="space-y-6 mt-0">
          
          {/* Sezione Interfaccia & Navigazione */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <PanelLeft className="h-4 w-4 text-primary" /> Interfaccia &amp; Navigazione Sidebar
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <PanelLeft className="h-5 w-5 text-primary" />
                  Comportamento Sidebar su PC, Tablet e Smartphone
                </CardTitle>
                <CardDescription className="text-xs">
                  Regola la chiusura automatica e l'adattamento dello schermo: quando attiva, toccando o cliccando in qualsiasi punto fuori dalla barra questa si chiude subito lasciando le pagine libere.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-stone-900/60 border border-stone-800">
                  <div className="space-y-0.5 pr-4">
                    <Label htmlFor="system-control-auto-close-sidebar" className="text-sm font-medium text-foreground cursor-pointer">
                      Chiusura automatica sidebar al tocco/click fuori
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {autoCloseSidebar ? "Attiva: toccando un punto della pagina, la sidebar si chiude automaticamente." : "Disattivata: la sidebar rimane aperta finché non usi il pulsante di chiusura."}
                    </p>
                  </div>
                  <Switch
                    id="system-control-auto-close-sidebar"
                    checked={autoCloseSidebar}
                    onCheckedChange={(checked) => {
                      setAutoCloseSidebar(checked);
                      localStorage.setItem('dnd_auto_close_sidebar', checked.toString());
                      actions.setAppSettingAction('autoCloseSidebar', checked.toString());
                      window.dispatchEvent(new CustomEvent('dnd-setting-changed', {
                        detail: { key: 'autoCloseSidebar', value: checked.toString() }
                      }));
                      toast({ 
                        title: checked ? "Chiusura Automatica Attivata" : "Chiusura Automatica Disattivata",
                        description: checked 
                          ? "La sidebar si chiuderà toccando qualsiasi punto della pagina." 
                          : "La sidebar rimarrà aperta fino alla chiusura manuale."
                      });
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sezione Selezione Modello IA */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <Bot className="h-4 w-4 text-primary" /> Motore IA Generativo (Gemini)
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <Bot className="h-5 w-5 text-primary" />
                  Configurazione &amp; Cambio Modello IA
                </CardTitle>
                <CardDescription className="text-xs">
                  Scegli o inserisci il modello Gemini attivo (es. gemini-3.8-flash, gemini-3.7-flash) per narrazione, PNG e lore. Verifica le date di dismissione e testa la connettività.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Button 
                  id="btn-open-ai-model-tab"
                  onClick={() => setActiveTab('model')} 
                  variant="outline"
                  className="w-full sm:w-auto border-border hover:bg-muted text-foreground gap-2"
                >
                  <Bot className="h-4 w-4 text-primary" />
                  Gestisci Modello IA
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sezione Personalizzazione Sfondi Rapida */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <Palette className="h-4 w-4 text-primary" /> Personalizzazione Grafica
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <Palette className="h-5 w-5 text-primary" />
                  Sfondi Schermate (Principale, Bacheca & Sigillo PIN)
                </CardTitle>
                <CardDescription className="text-xs">
                  Modifica l'atmosfera visiva impostando preset fantasy, illustrazioni personalizzate o sfondi da file/URL con regolazione di trasparenza e contrasto.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Button 
                  onClick={() => setActiveTab('backgrounds')} 
                  variant="outline"
                  className="w-full sm:w-auto border-border hover:bg-muted text-foreground gap-2"
                >
                  <Palette className="h-4 w-4 text-primary" />
                  Apri Personalizzazione Sfondi
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sezione Sicurezza */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4 text-primary" /> Sicurezza &amp; Permessi Giocatori
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                    <Lock className="h-5 w-5 text-primary" />
                    Sigilla Schermo (PIN)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Blocca istantaneamente lo schermo nascondendo le informazioni del DM agli sguardi indiscreti.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <Button 
                    onClick={handleQuickLock} 
                    variant="outline"
                    className="w-full border-border hover:bg-muted text-foreground gap-2"
                  >
                    <Lock className="h-4 w-4 text-primary" />
                    Sigilla Schermo Ora
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                    <KeyRound className="h-5 w-5 text-primary" />
                    Configura PIN &amp; Timer
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Imposta il PIN numerico, la password di ripristino d'emergenza e il tempo di blocco per inattività.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <Button 
                    onClick={onOpenPinConfig}
                    variant="outline"
                    className="w-full border-border hover:bg-muted text-foreground gap-2"
                  >
                    <KeyRound className="h-4 w-4 text-primary" />
                    Gestisci PIN &amp; Timer
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Visibilità Schede
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Seleziona quali sezioni, botteghe, mappe e compendi nascondere o mostrare ai giocatori connessi.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <Button 
                    onClick={() => setActiveTab('permissions')}
                    variant="outline"
                    className="w-full border-border hover:bg-muted text-foreground gap-2"
                  >
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Configura Visibilità
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sezione Backup & Ripristino */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <Database className="h-4 w-4 text-primary" /> Backup &amp; Ripristino
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
                <CardHeader className="p-3.5 sm:p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-foreground font-headline">
                    <Download className="h-4 w-4 text-primary shrink-0" />
                    <span>Backup Dati</span>
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Esporta un file JSON compatto contenente tutte le storie, schede, magie e PNG.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 pt-2">
                  <Button onClick={onBackupData} variant="secondary" className="w-full text-xs gap-2">
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span>Scarica Backup Dati</span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
                <CardHeader className="p-3.5 sm:p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-foreground font-headline">
                    <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                    <span>Backup Immagini</span>
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Esporta tutte le illustrazioni, ritratti e mappe salvate localmente per la campagna.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 pt-2">
                  <Button onClick={onBackupImages} variant="secondary" className="w-full text-xs gap-2">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Scarica Backup Immagini</span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all sm:col-span-2 md:col-span-1">
                <CardHeader className="p-3.5 sm:p-4 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-foreground font-headline">
                    <Upload className="h-4 w-4 text-primary shrink-0" />
                    <span>Ripristina Backup</span>
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Carica un file JSON salvato in precedenza per ripristinare dati o immagini.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 sm:p-4 pt-2">
                  <Button asChild variant="outline" className="w-full text-xs gap-2 cursor-pointer border-border hover:bg-muted text-foreground">
                    <label htmlFor="restore-backup-input" className="cursor-pointer flex items-center justify-center gap-2 w-full h-full">
                      <Upload className="h-3.5 w-3.5 shrink-0" />
                      <span>Ripristina Backup</span>
                    </label>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sezione Gestione Campagna */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="h-4 w-4 text-primary" /> Gestione Campagne
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-border transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <Plus className="h-5 w-5 text-primary" />
                  Nuova Campagna
                </CardTitle>
                <CardDescription className="text-xs">
                  Inizia il processo per creare un nuova campagna o importarne una da zero. La campagna attuale rimarrà salvata.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto text-xs gap-2 border-border hover:bg-muted text-foreground">
                      <Plus className="h-4 w-4 text-primary" />
                      Crea Nuova Campagna
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[95vw]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Creare una Nuova Campagna?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Questo ti porterà alla schermata di creazione di una nuova campagna. La campagna attuale non sarà modificata né eliminata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={onNewCampaign}>Continua</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        {/* Scheda Modello IA & Motore */}
        <TabsContent value="model" className="space-y-4 mt-0">
          <AiModelSelector />
        </TabsContent>

        {/* Scheda Console Log & Errori */}
        <TabsContent value="logs" className="space-y-4 mt-0">
          <SystemLogsViewer />
        </TabsContent>

        {/* Scheda Gestione Permessi Schede Giocatori */}
        <TabsContent value="permissions" className="space-y-4 mt-0">
          <Card className="bg-stone-950/40 border border-amber-900/40 p-4 sm:p-6 rounded-xl">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg font-headline font-bold text-amber-200 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                Controllo Visibilità Schede Giocatore
              </CardTitle>
              <CardDescription className="text-xs text-stone-400">
                Seleziona quali strumenti e sezioni compendio sono visibili o oscurati per i giocatori quando l&apos;app è in Modalità Giocatore.
              </CardDescription>
            </CardHeader>
            <PlayerPermissionsMatrix campaignId={campaign.id} />
          </Card>
        </TabsContent>

        {/* Scheda 2: Personalizzazione Sfondi */}
        <TabsContent value="backgrounds" className="space-y-4 mt-0">
          <BackgroundCustomizer />
        </TabsContent>

        {/* Scheda 3: Stato Sistema e API */}
        <TabsContent value="settings" className="space-y-4 mt-0">
          <SettingsView campaignId={campaign.id} />
        </TabsContent>

        {/* Scheda 4: Compendio Homebrew */}
        <TabsContent value="homebrew" className="space-y-4 mt-0">
          <HomebrewCompendium campaign={campaign} />
        </TabsContent>

        {/* Scheda 5: Manutenzione & Migrazione */}
        <TabsContent value="maintenance" className="space-y-6 mt-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-400 uppercase tracking-wider">
              <Database className="h-4 w-4 text-rose-400" /> Database & Migrazione
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-rose-900/30 hover:border-rose-900/50 transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <Database className="h-5 w-5 text-rose-400" />
                  Consolidamento Database Unificato
                </CardTitle>
                <CardDescription className="text-xs">
                  Questa operazione migrerà tutti i mostri, oggetti, magie e abilità dai file JSON di sistema nel database SQLite. È un'operazione necessaria per unificare i dati e permettere ricerche globali istantanee.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive"
                      className="w-full sm:w-auto gap-2"
                      disabled={isMigrating}
                    >
                      {isMigrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                      {isMigrating ? "Esecuzione in corso..." : "Esegui Consolidamento Dati"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[95vw]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Sei sicuro di voler procedere?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tutti i dati presenti nei file JSON verranno copiati nel database. Eventuali duplicati verranno ignorati (basato sul nome). Questa operazione è consigliata per unificare i dati o riparare il compendio.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        setIsMigrating(true);
                        setMigrationLogs("Inizializzazione diagnostica ed esecuzione migrazione in corso...\nAttendere prego...");
                        try {
                          const res = await actions.consolidateAllDataToDbAction();
                          const outputLogs = res.data?.logOutput || res.error || "Nessun log restituito.";
                          setMigrationLogs(outputLogs);

                          if (res.success) {
                            toast({ title: "Migrazione completata!", description: res.data?.message });
                          } else {
                            toast({ variant: 'destructive', title: "Errore migrazione", description: res.error || "Si è verificato un errore." });
                          }
                        } catch (err: any) {
                          const errMsg = `[ERRORE CLIENT EXCEPTION]: ${err.message || err}`;
                          setMigrationLogs(errMsg);
                          toast({ variant: 'destructive', title: "Errore durante la chiamata", description: err.message });
                        } finally {
                          setIsMigrating(false);
                        }
                      }}>Procedi con la Migrazione</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {migrationLogs && (
                  <div className="space-y-2 border-t border-rose-900/30 pt-4 mt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 font-mono">
                        <Terminal className="h-4 w-4 text-amber-400" /> Log Diagnostico Dettagliato:
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 border-amber-500/50 hover:bg-amber-500/20 text-amber-300 font-mono"
                        onClick={() => {
                          navigator.clipboard.writeText(migrationLogs);
                          setCopiedLogs(true);
                          toast({ title: "Log Copiato negli Appunti!", description: "Ora puoi incollarlo nei messaggi della chat." });
                          setTimeout(() => setCopiedLogs(false), 3000);
                        }}
                      >
                        {copiedLogs ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedLogs ? "Log Copiato!" : "Copia Log Diagnostico"}
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={migrationLogs}
                      placeholder="I log diagnostici appariranno qui dopo aver eseguito la migrazione..."
                      className="w-full h-64 p-3 bg-stone-950 font-mono text-[11px] text-emerald-400 border border-stone-800 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/50 select-all leading-relaxed shadow-inner"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 uppercase tracking-wider">
              <Link2 className="h-4 w-4 text-amber-400" /> Analisi & Collegamenti
            </div>
            <Card className="bg-card/75 backdrop-blur-md border border-amber-900/30 hover:border-amber-900/50 transition-all">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                  <Link2 className="h-5 w-5 text-amber-400" />
                  Collega Quest alle Entità
                </CardTitle>
                <CardDescription className="text-xs">
                  Analizza le note delle sessioni esistenti per collegare automaticamente PNG, Mostri e Oggetti menzionati.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <Button 
                    variant="outline"
                    className="w-full sm:w-auto gap-2 border-amber-500/50 hover:bg-amber-500/20 text-amber-300"
                    onClick={async () => {
                        setIsMigrating(true);
                        setMigrationLogs("Analisi sessioni e collegamento entità in corso...");
                        try {
                            const res = await actions.linkExistingQuestsToEntitiesAction(campaign.id);
                            if (res.success) {
                                toast({ title: "Collegamento completato!", description: res.data?.message });
                                setMigrationLogs(res.data?.message || "Operazione completata.");
                            } else {
                                toast({ variant: 'destructive', title: "Errore collegamento", description: res.error || "Si è verificato un errore." });
                                setMigrationLogs(`Errore: ${res.error}`);
                            }
                        } catch (err: any) {
                            setMigrationLogs(`[ERRORE EXCEPTION]: ${err.message}`);
                            toast({ variant: 'destructive', title: "Errore", description: err.message });
                        } finally {
                            setIsMigrating(false);
                        }
                    }}
                    disabled={isMigrating}
                >
                    {isMigrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {isMigrating ? "Esecuzione..." : "Esegui Collegamento"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-muted/30 border-dashed border-border/50">
            <CardContent className="p-4 flex gap-3 items-start">
              <Sparkles className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold">Nota di Sincronizzazione</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Dopo il consolidamento, l'app darà la priorità ai dati presenti nel Database. I file JSON rimarranno sul disco ma non verranno più aggiornati dalle nuove operazioni di salvataggio.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
