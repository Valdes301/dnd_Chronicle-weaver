'use client';

import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Sparkles, 
  Image as ImageIcon, 
  Upload, 
  Link as LinkIcon, 
  RotateCcw, 
  Sliders, 
  Check, 
  Layers, 
  Eye, 
  Lock, 
  LayoutGrid, 
  Scroll, 
  ShieldCheck, 
  Info,
  Trash2,
  Loader2,
  FolderOpen,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  BackgroundTarget, 
  BackgroundConfig, 
  BackgroundSettings, 
  PRESETS_MAIN, 
  PRESETS_DASHBOARD, 
  PRESETS_PIN, 
  getBackgroundSettings, 
  DEFAULT_BACKGROUND_SETTINGS,
  saveBackgroundSettings, 
  updateBackgroundConfig, 
  resetBackgroundTarget, 
  resetAllBackgrounds,
  PresetBackground 
} from '@/lib/background-storage';
import * as actions from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

export function BackgroundCustomizer() {
  const [settings, setSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND_SETTINGS);
  const [activeTarget, setActiveTarget] = useState<BackgroundTarget>('main');
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [savedAssets, setSavedAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const { toast } = useToast();

  const loadAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const res = await actions.listAssetsAction();
      if (res.success && res.data) {
        setSavedAssets(res.data);
      }
    } catch (e) {
      console.error("Error loading assets", e);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await actions.getSystemSettingAction('dnd_master_background_settings');
        if (res.success && res.data) {
          saveBackgroundSettings(res.data);
          setSettings(res.data);
        } else {
          setSettings(getBackgroundSettings());
        }
      } catch {
        setSettings(getBackgroundSettings());
      }
      loadAssets();
    };
    init();

    const handleBgChange = (e: any) => {
      if (e.detail) {
        setSettings(e.detail);
      }
    };
    const handleAssetsUpdated = () => {
      loadAssets();
    };

    window.addEventListener('dnd-backgrounds-changed', handleBgChange);
    window.addEventListener('dnd-assets-updated', handleAssetsUpdated);
    return () => {
      window.removeEventListener('dnd-backgrounds-changed', handleBgChange);
      window.removeEventListener('dnd-assets-updated', handleAssetsUpdated);
    };
  }, []);

  const currentConfig: BackgroundConfig = settings[activeTarget];
  const presets: PresetBackground[] = activeTarget === 'main' 
    ? PRESETS_MAIN 
    : activeTarget === 'dashboard' 
    ? PRESETS_DASHBOARD 
    : PRESETS_PIN;

  const handleSelectPreset = (preset: PresetBackground) => {
    const updated = updateBackgroundConfig(activeTarget, {
      type: 'preset',
      presetId: preset.id,
      customUrl: undefined,
      opacity: preset.defaultOpacity ?? currentConfig.opacity,
      overlayDarkness: preset.defaultOverlayDarkness ?? currentConfig.overlayDarkness,
    });
    setSettings(updated);
    toast({
      title: "Sfondo Aggiornato",
      description: `Applicato: ${preset.name}`,
    });
  };

  const handleApplyCustomUrl = () => {
    if (!customUrlInput.trim()) return;
    const updated = updateBackgroundConfig(activeTarget, {
      type: 'custom_url',
      customUrl: customUrlInput.trim(),
      presetId: undefined
    });
    setSettings(updated);
    setCustomUrlInput('');
    toast({
      title: "Sfondo Personalizzato Applicato",
      description: "L'immagine da URL è stata impostata.",
    });
  };

  const handleSelectSavedAsset = (assetUrl: string, assetName: string) => {
    const updated = updateBackgroundConfig(activeTarget, {
      type: 'custom_file',
      customUrl: assetUrl,
      presetId: undefined
    });
    setSettings(updated);
    toast({
      title: "Asset Applicato",
      description: `Sfondo impostato da: ${assetName}`,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File troppo pesante",
        description: "Seleziona un'immagine inferiore a 8MB.",
      });
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        try {
          const filename = `sfondo_${activeTarget}_${Date.now()}.jpg`;
          const result = await actions.uploadCardBackground(dataUrl, filename);
          const uploadedUrl = (result.data as any)?.url || `/api/assets/${encodeURIComponent(filename)}`;
          if (result.success) {
            const updated = updateBackgroundConfig(activeTarget, {
              type: 'custom_file',
              customUrl: uploadedUrl,
              presetId: undefined
            });
            setSettings(updated);
            loadAssets();
            window.dispatchEvent(new CustomEvent('dnd-assets-updated'));
            toast({
              title: "Immagine Salvata e Applicata",
              description: `Sfondo salvato nella cartella persistente degli asset (${filename}) e incluso nel backup immagini!`,
            });
          } else {
            throw new Error(result.error || "Errore durante il salvataggio");
          }
        } catch (err: any) {
          toast({
            variant: 'destructive',
            title: 'Errore di caricamento',
            description: err.message || 'Impossibile salvare l\'immagine negli asset.',
          });
        } finally {
          setIsUploading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetCurrent = () => {
    const updated = resetBackgroundTarget(activeTarget);
    setSettings(updated);
    toast({
      title: "Sfondo Ripristinato",
      description: "Impostazioni predefinite ricaricate per questa schermata.",
    });
  };

  const handleResetAll = () => {
    const updated = resetAllBackgrounds();
    setSettings(updated);
    toast({
      title: "Tutti gli Sfondi Ripristinati",
      description: "Tutte le schermate sono tornate all'aspetto predefinito.",
    });
  };

  // Calcolo stile di anteprima live per il target corrente
  const getPreviewBgStyle = () => {
    let bg = '';
    if (currentConfig.type === 'custom_url' || currentConfig.type === 'custom_file') {
      if (currentConfig.customUrl) {
        bg = `url("${currentConfig.customUrl}")`;
      }
    } else {
      const preset = presets.find(p => p.id === currentConfig.presetId) || presets[0];
      if (preset.imageUrl) {
        bg = `url("${preset.imageUrl}")`;
      } else if (preset.cssBackground) {
        bg = preset.cssBackground;
      } else {
        bg = preset.previewGradient;
      }
    }
    return bg;
  };

  return (
    <div className="space-y-6">
      {/* Header con Titolo & Azioni rapide */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div>
          <h3 className="text-lg font-headline font-semibold text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Personalizzazione Sfondi &amp; Atmosfera
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scegli sfondi fantasy tematici o carica illustrazioni per la schermata principale (Taverna), la bacheca (Tavolo di Legno) e il sigillo PIN (Antico Libro).
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 border-border hover:bg-muted text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Ripristina Tutti i Predefiniti
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border text-card-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline text-primary">Ripristinare tutti gli sfondi?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-xs">
                Questa operazione riporterà la schermata principale, la bacheca della taverna e la schermata PIN alle ambientazioni originali predefinite.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border text-muted-foreground hover:bg-muted">Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetAll} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                Conferma Ripristino
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Selettore Schermata (3 Target Richiesti) */}
      <Tabs value={activeTarget} onValueChange={(v) => setActiveTarget(v as BackgroundTarget)} className="w-full">
        <TabsList className="grid grid-cols-1 sm:grid-cols-3 w-full h-auto bg-muted/40 p-1.5 border border-border/60 rounded-xl gap-1.5">
          <TabsTrigger 
            value="main" 
            className="w-full py-2.5 px-3 flex items-center justify-center gap-2 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-muted-foreground font-medium text-xs sm:text-sm whitespace-normal transition-all"
          >
            <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
            <span>Schermata Principale &amp; Backup</span>
          </TabsTrigger>
          <TabsTrigger 
            value="dashboard" 
            className="w-full py-2.5 px-3 flex items-center justify-center gap-2 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-muted-foreground font-medium text-xs sm:text-sm whitespace-normal transition-all"
          >
            <Scroll className="h-4 w-4 shrink-0 text-primary" />
            <span>Bacheca Taverna</span>
          </TabsTrigger>
          <TabsTrigger 
            value="pin" 
            className="w-full py-2.5 px-3 flex items-center justify-center gap-2 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-muted-foreground font-medium text-xs sm:text-sm whitespace-normal transition-all"
          >
            <Lock className="h-4 w-4 shrink-0 text-primary" />
            <span>Schermata Sigillo PIN</span>
          </TabsTrigger>
        </TabsList>

        {/* Contenuto per il Target Selezionato */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Colonna Sinistra: Caricamento & Galleria Unificata Immagini (7 Colonne) */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="rounded-xl border border-border/80 bg-card/75 backdrop-blur-md p-4 space-y-4 shadow-md text-card-foreground">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2 text-xs font-serif uppercase tracking-widest text-primary font-bold">
                  <ImageIcon className="h-3.5 w-3.5 text-primary" />
                  Caricamento e Galleria Immagini di Sfondo
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={loadAssets} 
                  disabled={isLoadingAssets}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingAssets ? 'animate-spin' : ''}`} />
                  Aggiorna
                </Button>
              </div>

              {/* Upload Diretto salvato in Volume Persistente */}
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Carica Nuova Immagine Personale (Salvata su Server &amp; Backup)</Label>
                <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all text-xs text-foreground group">
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                  )}
                  <span>{isUploading ? 'Salvataggio asset in corso...' : 'Clicca per caricare un file (JPG, PNG, WebP)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Le immagini caricate vengono salvate in modo permanente sul server e incluse nel backup delle immagini.
                </p>
              </div>

              {/* Galleria Unificata: Immagini Esistenti (Preset) + Asset Personali Salvati */}
              {(() => {
                const defaultImages = [
                  { name: 'Taverna del Viandante', url: '/hero-dnd-bg.jpg' },
                  { name: 'Pergamena Arcana', url: '/handout-background.jpg' },
                  { name: 'Grimorio dei Segreti', url: '/ancient-grimoire-bg.jpg' },
                  { name: 'Tavolo di Quercia Antica', url: '/tavern-board-bg.jpg' },
                ];
                const allImages = [
                  ...defaultImages,
                  ...savedAssets.map(a => ({ name: a.name, url: a.url }))
                ];

                return (
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-primary" />
                        Scegli tra le immagini disponibili ({allImages.length})
                      </span>
                      <span className="text-[10px] text-muted-foreground">Clicca per applicare</span>
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1 p-1 bg-card/40 rounded-lg border border-border/70">
                      {allImages.map((imgItem) => {
                        const isSelected = (currentConfig.type === 'custom_file' || currentConfig.type === 'custom_url' || currentConfig.type === 'preset') && currentConfig.customUrl === imgItem.url;
                        return (
                          <button
                            key={imgItem.url}
                            type="button"
                            onClick={() => handleSelectSavedAsset(imgItem.url, imgItem.name)}
                            className={`group relative rounded-md overflow-hidden aspect-video border transition-all ${
                              isSelected 
                                ? 'border-primary ring-2 ring-primary/50 shadow-md' 
                                : 'border-border/60 hover:border-primary/40 opacity-85 hover:opacity-100'
                            }`}
                            title={imgItem.name}
                          >
                            <img 
                              src={imgItem.url} 
                              alt={imgItem.name} 
                              className="w-full h-full object-cover" 
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                              <span className="text-[9px] text-stone-200 truncate w-full font-serif font-medium">{imgItem.name}</span>
                            </div>
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Inserimento URL Esterno */}
              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <Label className="text-xs text-foreground font-medium">Oppure Inserisci URL Immagine Esterno</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="url"
                      placeholder="https://esempio.com/sfondo-fantasy.jpg"
                      value={customUrlInput}
                      onChange={(e) => setCustomUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomUrl()}
                      className="pl-8 text-xs bg-background/60 border-input h-9 text-foreground focus-visible:ring-primary"
                    />
                  </div>
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleApplyCustomUrl}
                    disabled={!customUrlInput.trim()}
                    className="h-9 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shrink-0"
                  >
                    Applica
                  </Button>
                </div>
              </div>

              {/* Mostra badge se è attivo custom */}
              {(currentConfig.type === 'custom_url' || currentConfig.type === 'custom_file') && (
                <div className="flex items-center justify-between p-2 rounded bg-card/90 border border-primary/40 text-xs text-foreground">
                  <span className="flex items-center gap-1.5 truncate">
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">Sfondo attivo: <strong className="font-mono text-[11px] text-primary">{currentConfig.customUrl}</strong></span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetCurrent}
                    className="h-6 text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                  >
                    Ripristina
                  </Button>
                </div>
              )}
            </div>

          </div>

          {/* Colonna Destra: Regolazioni Fine-Tuning & Anteprima Live (5 Colonne) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Box Anteprima Live */}
            <div className="rounded-xl border border-border/80 bg-card/75 backdrop-blur-md p-4 space-y-3 shadow-md text-card-foreground">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-serif uppercase tracking-widest text-foreground font-bold flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  Anteprima in Tempo Reale
                </span>
                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                  {activeTarget === 'main' ? 'Schermata Principale' : activeTarget === 'dashboard' ? 'Bacheca' : 'Sigillo PIN'}
                </Badge>
              </div>

              {/* Miniatura Mockup Schermata */}
              <div className="relative w-full h-44 rounded-lg overflow-hidden border border-border/80 bg-background/90 shadow-inner flex flex-col justify-between p-3 select-none">
                
                {/* Sfondo attivo con stili applicati */}
                <div 
                  className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-300"
                  style={{
                    backgroundImage: getPreviewBgStyle(),
                    opacity: currentConfig.opacity,
                    filter: currentConfig.blur > 0 ? `blur(${currentConfig.blur}px)` : undefined,
                  }}
                />

                {/* Overlay di oscuramento */}
                <div 
                  className="absolute inset-0 pointer-events-none transition-all duration-300"
                  style={{
                    backgroundColor: `rgba(0, 0, 0, ${currentConfig.overlayDarkness})`
                  }}
                />

                {/* Trama sovrapposta se presente */}
                {currentConfig.textureOverlay === 'dots' && (
                  <div className="absolute inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px]" />
                )}
                {currentConfig.textureOverlay === 'vignette' && (
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />
                )}

                {/* Contenuto simulato del mockup a seconda del target */}
                {activeTarget === 'main' && (
                  <div className="relative z-10 w-full h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        <span className="text-[10px] font-headline font-bold text-foreground">La Forgia delle Cronache</span>
                      </div>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 rounded bg-muted" />
                        <div className="w-4 h-2 rounded bg-primary/60" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 my-auto">
                      <div className="p-2 rounded bg-card/85 border border-border/60 text-[9px] text-foreground">
                        🛡️ Sessione Attiva
                      </div>
                      <div className="p-2 rounded bg-card/85 border border-border/60 text-[9px] text-foreground">
                        ⚔️ Registro Eroi
                      </div>
                    </div>
                    <div className="text-[8px] text-muted-foreground italic text-center">Interfaccia Principale del Master</div>
                  </div>
                )}

                {activeTarget === 'dashboard' && (
                  <div className="relative z-10 w-full h-full flex flex-col justify-between">
                    <div className="text-[11px] font-serif font-bold text-primary text-center border-b border-border/60 pb-1">
                      📜 Bacheca della Taverna
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 my-auto">
                      <div className="p-1.5 rounded bg-card/85 border border-border/60 text-[8px] text-primary text-center font-serif">
                        Avviso di Taglia
                      </div>
                      <div className="p-1.5 rounded bg-card/85 border border-border/60 text-[8px] text-foreground text-center">
                        Mappa Locale
                      </div>
                      <div className="p-1.5 rounded bg-card/85 border border-border/60 text-[8px] text-primary text-center font-serif">
                        Contratto
                      </div>
                    </div>
                    <div className="text-[8px] text-muted-foreground italic text-center">Visualizzazione Note e Schede</div>
                  </div>
                )}

                {activeTarget === 'pin' && (
                  <div className="relative z-10 w-full h-full flex flex-col items-center justify-center space-y-2">
                    <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow">
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                    <div className="text-[10px] font-headline font-bold text-foreground">Inserisci Sigillo d'Accesso</div>
                    <div className="flex gap-1.5">
                      {[1,2,3,4].map(n => (
                        <div key={n} className="w-2.5 h-2.5 rounded-full border border-primary/40 bg-primary/20" />
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Slider di Regolazione Fine */}
            <div className="rounded-xl border border-border/80 bg-card/75 backdrop-blur-md p-4 space-y-5 shadow-md text-card-foreground">
              <span className="text-xs font-serif uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" />
                Regolazioni Ottiche Schermata
              </span>

              {/* Slider Opacità */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label className="text-foreground">Intensità / Opacità Immagine</Label>
                  <span className="font-mono text-primary text-xs font-semibold">{Math.round(currentConfig.opacity * 100)}%</span>
                </div>
                <Slider
                  value={[currentConfig.opacity * 100]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([val]) => {
                    const updated = updateBackgroundConfig(activeTarget, { opacity: val / 100 });
                    setSettings(updated);
                  }}
                  className="cursor-pointer"
                />
              </div>

              {/* Slider Oscuramento / Contrasto */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label className="text-foreground">Oscuramento Overlay (Leggibilità)</Label>
                  <span className="font-mono text-primary text-xs font-semibold">{Math.round(currentConfig.overlayDarkness * 100)}%</span>
                </div>
                <Slider
                  value={[currentConfig.overlayDarkness * 100]}
                  min={0}
                  max={90}
                  step={5}
                  onValueChange={([val]) => {
                    const updated = updateBackgroundConfig(activeTarget, { overlayDarkness: val / 100 });
                    setSettings(updated);
                  }}
                  className="cursor-pointer"
                />
              </div>

              {/* Slider Sfocatura (Blur) */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label className="text-foreground">Sfocatura Artistica (Blur)</Label>
                  <span className="font-mono text-primary text-xs font-semibold">{currentConfig.blur}px</span>
                </div>
                <Slider
                  value={[currentConfig.blur]}
                  min={0}
                  max={12}
                  step={1}
                  onValueChange={([val]) => {
                    const updated = updateBackgroundConfig(activeTarget, { blur: val });
                    setSettings(updated);
                  }}
                  className="cursor-pointer"
                />
              </div>

              {/* Texture Sovrapposta */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <Label className="text-xs text-foreground">Filtro Texture d'Ambiente</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={currentConfig.textureOverlay === 'none' ? 'default' : 'outline'}
                    onClick={() => {
                      const updated = updateBackgroundConfig(activeTarget, { textureOverlay: 'none' });
                      setSettings(updated);
                    }}
                    className={`text-xs h-8 ${currentConfig.textureOverlay === 'none' ? 'bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm' : 'border-border hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                  >
                    Nessuna
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={currentConfig.textureOverlay === 'vignette' ? 'default' : 'outline'}
                    onClick={() => {
                      const updated = updateBackgroundConfig(activeTarget, { textureOverlay: 'vignette' });
                      setSettings(updated);
                    }}
                    className={`text-xs h-8 ${currentConfig.textureOverlay === 'vignette' ? 'bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm' : 'border-border hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                  >
                    Vignettatura
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={currentConfig.textureOverlay === 'dots' ? 'default' : 'outline'}
                    onClick={() => {
                      const updated = updateBackgroundConfig(activeTarget, { textureOverlay: 'dots' });
                      setSettings(updated);
                    }}
                    className={`text-xs h-8 ${currentConfig.textureOverlay === 'dots' ? 'bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm' : 'border-border hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                  >
                    Puntinato D&amp;D
                  </Button>
                </div>
              </div>

              {/* Bottone Ripristino Target Corrente */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetCurrent}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Ripristina Default per Questa Schermata
                </Button>
              </div>

            </div>

          </div>

        </div>
      </Tabs>
    </div>
  );
}
