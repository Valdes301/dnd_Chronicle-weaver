'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Terminal, 
  RefreshCw, 
  Trash2, 
  Copy, 
  Download, 
  Check, 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  Search, 
  HardDrive, 
  Layers, 
  Clock,
  Sparkles,
  Filter
} from 'lucide-react';
import * as actions from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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

interface LogStats {
  exists: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  maxSizeBytes: number;
  maxSizeFormatted: string;
  percentUsed: number;
  totalEntries: number;
  lastModified: string | null;
  filePath: string;
}

export function SystemLogsViewer() {
  const [rawLogs, setRawLogs] = useState<string>('');
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const { toast } = useToast();

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await actions.getAiLogsAction();
      if (res.success && res.data) {
        setRawLogs(res.data.logs || '');
        setStats(res.data.stats || null);
      } else {
        throw new Error(res.error || 'Impossibile caricare i log');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Errore Caricamento Log',
        description: err?.message || 'Errore durante la lettura del file di log.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await actions.clearAiLogsAction();
      if (res.success) {
        toast({
          title: 'File di Log Azzerato',
          description: 'Lo storico diagnostico è stato pulito con successo.',
        });
        await fetchLogs();
      } else {
        throw new Error(res.error || 'Impossibile azzerare i log.');
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Errore Azzeramento',
        description: err?.message || 'Impossibile pulire il file.',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopyLogs = () => {
    if (!rawLogs) return;
    navigator.clipboard.writeText(rawLogs);
    setCopied(true);
    toast({
      title: 'Copiato!',
      description: 'Tutto il contenuto del log è stato copiato negli appunti.',
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadLogFile = () => {
    if (!rawLogs) return;
    const blob = new Blob([rawLogs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dnd_chronicle_debug_${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: 'Download Avviato',
      description: 'File .log scaricato correttamente.',
    });
  };

  // Separa i blocchi di log
  const logEntries = useMemo(() => {
    if (!rawLogs) return [];
    return rawLogs
      .split('--------------------------------------------------\n')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  }, [rawLogs]);

  // Filtra per testo e categoria
  const filteredEntries = useMemo(() => {
    return logEntries.filter(entry => {
      const matchSearch = searchFilter.trim() === '' || entry.toLowerCase().includes(searchFilter.toLowerCase());
      if (!matchSearch) return false;

      if (activeCategoryFilter === 'ALL') return true;
      if (activeCategoryFilter === 'IMPORT') return entry.includes('IMPORT') || entry.includes('catalog');
      if (activeCategoryFilter === '429') return entry.includes('429') || entry.includes('QUOTA') || entry.includes('RESOURCE_EXHAUSTED');
      if (activeCategoryFilter === '503') return entry.includes('503') || entry.includes('OVERLOAD') || entry.includes('HIGH_DEMAND');
      if (activeCategoryFilter === 'PAYLOAD') return entry.includes('PAYLOAD') || entry.includes('LARGE') || entry.includes('imageSizeKB');
      if (activeCategoryFilter === 'STORY') return entry.includes('STORY') || entry.includes('ORACULO') || entry.includes('WORLD');
      return true;
    });
  }, [logEntries, searchFilter, activeCategoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header e Statistiche File */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/75 backdrop-blur-md border border-border/80 text-card-foreground shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Dimensione File Log</span>
              <HardDrive className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-foreground">
                {stats?.sizeFormatted || '0 KB'}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                / {stats?.maxSizeFormatted || '10 MB'}
              </span>
            </div>
            <Progress value={stats?.percentUsed || 0} className="h-2 bg-muted" />
            <p className="text-[11px] text-muted-foreground flex justify-between">
              <span>Capacità utilizzata:</span>
              <span className="font-semibold text-foreground">{stats?.percentUsed || 0}%</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/75 backdrop-blur-md border border-border/80 text-card-foreground shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Totale Eventi Registrati</span>
              <Layers className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold font-mono text-foreground">
              {stats?.totalEntries || logEntries.length}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Intercetta errori di importazione, limiti di quota e sovraccarichi di rete.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/75 backdrop-blur-md border border-border/80 text-card-foreground shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Ultima Attività Diagnostica</span>
              <Clock className="h-4 w-4 text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-sm font-semibold font-mono text-foreground truncate">
              {stats?.lastModified ? new Date(stats.lastModified).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Nessuna'}
            </div>
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              {stats?.filePath ? 'data/ai_debug.log' : 'Pronto'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra Azioni & Filtri */}
      <Card className="border border-border/80 bg-card/75 backdrop-blur-md shadow-md text-card-foreground">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-foreground font-headline">
                <Terminal className="h-5 w-5 text-primary" /> Console Diagnostica &amp; File di Log (10 MB Max)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Visualizzazione in tempo reale di tutte le eccezioni, tentativi di fallback, e risposte dei modelli Gemini.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchLogs} 
                disabled={isLoading}
                className="h-8 text-xs gap-1.5 border-border hover:bg-muted text-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
                Ricarica
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCopyLogs} 
                disabled={!rawLogs || logEntries.length === 0}
                className="h-8 text-xs gap-1.5 border-border hover:bg-muted text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiato" : "Copia"}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadLogFile} 
                disabled={!rawLogs || logEntries.length === 0}
                className="h-8 text-xs gap-1.5 border-border hover:bg-muted text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Scarica .log
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    disabled={isClearing || !rawLogs || logEntries.length === 0}
                    className="h-8 text-xs gap-1.5 shadow-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Svuota Log
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border text-card-foreground">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-5 w-5" /> Azzerare lo storico dei log?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground text-xs">
                      Questa operazione cancellerà il contenuto del file <code className="text-primary font-mono">data/ai_debug.log</code>. I nuovi errori futuri continueranno a essere registrati regolarmente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border text-muted-foreground hover:bg-muted">Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearLogs} className="bg-destructive text-destructive-foreground">
                      Sì, Svuota File
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Filtri Rapidi */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca nei log (es. 429, Bestiario, token, timeout)..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 pl-8 text-xs bg-background/60 border-input text-foreground focus-visible:ring-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1 flex items-center gap-1">
                <Filter className="h-3 w-3" /> Filtro:
              </span>
              {[
                { id: 'ALL', label: 'Tutti' },
                { id: 'IMPORT', label: 'Importazione Mostri/Manuali' },
                { id: '429', label: 'Quota / 429' },
                { id: '503', label: 'Sovraccarico 503' },
                { id: 'PAYLOAD', label: 'Immagini/Payload' },
                { id: 'STORY', label: 'Storie & Oracolo' },
              ].map(cat => (
                <Badge
                  key={cat.id}
                  variant={activeCategoryFilter === cat.id ? "default" : "outline"}
                  onClick={() => setActiveCategoryFilter(cat.id)}
                  className={cn(
                    "cursor-pointer text-[10px] transition-all px-2 py-0.5",
                    activeCategoryFilter === cat.id 
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm" 
                      : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="bg-card/30 font-mono text-xs text-foreground border-t border-border/60">
            <ScrollArea className="h-[480px] w-full p-4">
              {filteredEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                  <Terminal className="h-8 w-8 text-muted-foreground/60 mb-2" />
                  <p className="text-sm font-semibold text-foreground">
                    {searchFilter || activeCategoryFilter !== 'ALL' 
                      ? "Nessun evento corrisponde ai filtri impostati." 
                      : "Nessun errore registrato nel file di log."}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Tutte le operazioni AI, importazioni e generazioni stanno funzionando normalmente senza eccezioni registrate.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredEntries.map((entry, idx) => {
                    const lines = entry.split('\n');
                    const headerLine = lines[0] || '';
                    const bodyLines = lines.slice(1);

                    const isQuota = entry.includes('429') || entry.includes('QUOTA') || entry.includes('RESOURCE_EXHAUSTED');
                    const isOverload = entry.includes('503') || entry.includes('OVERLOAD');
                    const isPayload = entry.includes('PAYLOAD');
                    const isImport = entry.includes('IMPORT') || entry.includes('catalog');

                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "rounded-lg p-3 border transition-colors",
                          isQuota ? "bg-rose-950/20 border-rose-900/40" :
                          isOverload ? "bg-amber-950/20 border-amber-900/40" :
                          isPayload ? "bg-blue-950/20 border-blue-900/40" :
                          isImport ? "bg-purple-950/20 border-purple-900/40" :
                          "bg-card/70 border-border/60"
                        )}
                      >
                        {/* Header dell'evento */}
                        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/40 text-[11px]">
                          <span className="text-primary font-bold">
                            #{filteredEntries.length - idx}
                          </span>
                          <span className="text-muted-foreground">
                            {headerLine}
                          </span>
                        </div>

                        {/* Corpo del messaggio */}
                        <div className="pt-2 text-foreground/90 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                          {bodyLines.map((line, lIdx) => {
                            if (line.startsWith('DETTAGLIO ERRORE:') || line.startsWith('ERROR:')) {
                              return (
                                <div key={lIdx} className="text-destructive font-semibold mt-1">
                                  {line}
                                </div>
                              );
                            }
                            if (line.startsWith('Stack:')) {
                              return (
                                <div key={lIdx} className="text-muted-foreground text-[10px] mt-1 pl-2 border-l border-border/80">
                                  {line}
                                </div>
                              );
                            }
                            return <div key={lIdx}>{line}</div>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
