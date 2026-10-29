'use client';

import { useMemo, useState, useEffect, useCallback, memo } from 'react';
import type { CampaignWithRelations, Session, PlayerCharacter } from '@/lib/types';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Users, 
  ScrollText, 
  Heart, 
  Shield, 
  Star,
  UserPlus, 
  Flame, 
  Pencil, 
  ChevronsUpDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { MarkdownRenderer } from './ui/markdown-renderer';
import { Icons } from './icons';
import { PlayerModeToggle } from './player-mode-toggle';
import { QuickLockButton } from './quick-lock-button';
import { 
  getBackgroundSettings, 
  DEFAULT_BACKGROUND_SETTINGS,
  resolveBackgroundStyle, 
  BackgroundConfig 
} from '@/lib/background-storage';
import { isPlayerMode } from '@/lib/pin-storage';

// Tabella di riferimento EXP per Livello D&D 5e
const LEVEL_XP_TABLE: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14000,
  7: 23000,
  8: 34000,
  9: 48000,
  10: 64000,
  11: 85000,
  12: 100000,
  13: 120000,
  14: 140000,
  15: 165000,
  16: 195000,
  17: 225000,
  18: 265000,
  19: 305000,
  20: 355000,
};

const HubCharacterCard = memo(function HubCharacterCard({
  pc,
  totalSessionXp,
  onSelect,
}: {
  pc: PlayerCharacter;
  totalSessionXp: number;
  onSelect: () => void;
}) {
  const charLevel = pc.level || 1;
  const charXp = totalSessionXp > 0 ? totalSessionXp : (LEVEL_XP_TABLE[charLevel] || 0);
  const charHp = pc.hitPoints ?? 10;

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      className="group relative rounded-xl p-4 pt-5 bg-card/80 backdrop-blur-md border border-border/80 hover:border-primary/60 transition-all duration-300 hover:shadow-2xl hover:shadow-black/60 hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-visible shadow-lg"
    >
      {/* Spilla / Chiodo da bacheca in ottone dorato */}
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-gradient-to-br from-amber-200 via-amber-600 to-amber-950 border border-amber-900/90 shadow-md z-20 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-100/90 shadow-inner" />
      </div>

      {/* Bagliore caldo su hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-primary/0 via-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="flex items-start gap-3.5 relative z-10">
        {/* Immagine / Avatar PG */}
        <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden border-2 border-border group-hover:border-primary/60 shrink-0 bg-background shadow-inner transition-colors">
          {pc.imageUrl ? (
            <img 
              src={pc.imageUrl} 
              alt={pc.name} 
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center bg-muted text-muted-foreground group-hover:text-primary">
              <Users className="h-7 w-7 opacity-70" />
              <span className="text-[10px] uppercase font-bold mt-0.5 tracking-tighter">PG</span>
            </div>
          )}
        </div>

        {/* Dati PG: Nome, Livello, Classe/Razza */}
        <div className="flex-1 min-w-0 space-y-1">
          <h4 className="font-headline font-bold text-base sm:text-lg text-foreground group-hover:text-primary truncate transition-colors">
            {pc.name}
          </h4>
          <div className="flex flex-wrap gap-1 items-center">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[11px] font-semibold px-2 py-0">
              Liv. {charLevel}
            </Badge>
            {(pc.class || pc.race) && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                {[pc.race, pc.class].filter(Boolean).join(' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Statistiche Chiave: EXP e PF */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/60 text-xs relative z-10">
        {/* EXP */}
        <div className="flex items-center gap-1.5 bg-background/60 rounded-md p-2 border border-border/60 group-hover:border-primary/40">
          <Star className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] text-muted-foreground block uppercase font-medium">EXP</span>
            <span className="font-bold text-foreground truncate" suppressHydrationWarning>{charXp.toLocaleString('it-IT')}</span>
          </div>
        </div>

        {/* PF (Punti Ferita) */}
        <div className="flex items-center gap-1.5 bg-background/60 rounded-md p-2 border border-border/60 group-hover:border-primary/40">
          <Heart className="h-4 w-4 text-rose-500 shrink-0 fill-rose-500/20" />
          <div className="min-w-0">
            <span className="text-[10px] text-muted-foreground block uppercase font-medium">PF</span>
            <span className="font-bold text-rose-400 truncate">{charHp}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

type CampaignHubProps = {
  campaign: CampaignWithRelations;
  sessions: Session[];
  onNavigateTo: (view: string) => void;
  onEditCampaign?: () => void;
  campaigns?: { id: string; name: string }[];
  onSelectCampaign?: (id: string) => void;
  onToggleSidebar?: () => void;
  onOpenPinConfig?: () => void;
};

export function CampaignHub({ 
  campaign, 
  sessions, 
  onNavigateTo,
  onEditCampaign,
  campaigns = [],
  onSelectCampaign,
  onToggleSidebar,
  onOpenPinConfig
}: CampaignHubProps) {
  const characters = campaign.playerCharacters || [];
  const [boardBgConfig, setBoardBgConfig] = useState<BackgroundConfig>(DEFAULT_BACKGROUND_SETTINGS.dashboard);
  const [playerMode, setPlayerMode] = useState<boolean>(true);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWelcomeDismissed(localStorage.getItem('dnd_welcome_dismissed') === 'true');
    }
  }, []);

  const handleDismissWelcome = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dnd_welcome_dismissed', 'true');
      setWelcomeDismissed(true);
    }
  };

  const handleOpenCharacters = useCallback(() => {
    onNavigateTo('personaggi');
  }, [onNavigateTo]);

  useEffect(() => {
    setBoardBgConfig(getBackgroundSettings().dashboard);
    const handleBgChange = (e: any) => {
      if (e.detail?.dashboard) {
        setBoardBgConfig(e.detail.dashboard);
      }
    };
    window.addEventListener('dnd-backgrounds-changed', handleBgChange);
    return () => window.removeEventListener('dnd-backgrounds-changed', handleBgChange);
  }, []);

  useEffect(() => {
    setPlayerMode(isPlayerMode());
    const handlePlayerModeChange = (e: any) => {
      setPlayerMode(Boolean(e.detail?.isPlayerMode));
    };
    window.addEventListener('dnd-player-mode-changed', handlePlayerModeChange);
    return () => window.removeEventListener('dnd-player-mode-changed', handlePlayerModeChange);
  }, []);

  // Calcolo dell'EXP totale distribuito nelle sessioni confermate/giocate
  const totalSessionXp = useMemo(() => {
    return sessions
      .filter(s => !s.is_archived)
      .reduce((acc, s) => acc + (s.xp_award || 0), 0);
  }, [sessions]);

  // Sessioni giocate (ordinate per numero sessione)
  const playedSessions = useMemo(() => {
    return [...sessions]
      .filter(s => !s.is_archived)
      .sort((a, b) => a.session_number - b.session_number);
  }, [sessions]);

  // Riassunto composito se summary non è ancora presente
  const storySummaryText = useMemo(() => {
    if (campaign.summary && campaign.summary.trim().length > 0) {
      return campaign.summary;
    }
    if (playedSessions.length === 0) {
      return `Benvenuti in **${campaign.name}**!\n\nNessuna sessione è stata ancora registrata per questa campagna. Il Dungeon Master può iniziare a forgiare la trama dalla sezione **Storia**, mentre i giocatori possono preparare le proprie schede nella sezione **Personaggi Giocanti**.`;
    }
    // Genera un breve riassunto cronologico basato sui titoli e le note delle sessioni registrate
    return playedSessions
      .map(s => `### Sessione ${s.session_number}: ${s.title}\n${s.notes || '_Nessuna nota registrata._'}`)
      .join('\n\n---\n\n');
  }, [campaign.summary, campaign.name, playedSessions]);

  const bgStyle = resolveBackgroundStyle('dashboard', boardBgConfig);

  return (
    <div 
      id="tavern-notice-board"
      className="relative w-full min-h-screen rounded-none overflow-hidden border-0 shadow-none bg-transparent text-stone-100 px-4 pb-8 pt-0 sm:px-8 sm:pb-12 animate-in fade-in duration-500 flex flex-col"
    >
      {/* Sfondo personalizzabile autentico in legno/sughero/illustrazione */}
      <div 
        suppressHydrationWarning
        className="absolute inset-0 pointer-events-none bg-cover bg-center transition-all duration-300"
        style={{
          backgroundImage: bgStyle.backgroundImage
            ? `${bgStyle.backgroundImage}, url('/tavern-board-bg.jpg'), url('/api/assets/tavern-board-bg.jpg')`
            : "url('/tavern-board-bg.jpg'), url('/api/assets/tavern-board-bg.jpg')",
          opacity: bgStyle.opacity,
          filter: bgStyle.filter,
        }}
      />

      {/* Overlay di oscuramento protettivo calibrabile per la leggibilità dei testi */}
      <div 
        suppressHydrationWarning
        className="absolute inset-0 pointer-events-none transition-all duration-300"
        style={{
          backgroundColor: `rgba(14, 9, 6, ${boardBgConfig.overlayDarkness})`
        }}
      />

      {/* Luce calda di lanterne da taverna e sfumatura vignettata scura per massima leggibilità */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 45% at 50% 0%, rgba(245, 158, 11, 0.22) 0%, transparent 75%)`
        }}
      />

      {/* Angolari decorativi in ferro battuto nei 4 angoli della bacheca */}
      <div className="absolute top-2 left-2 w-8 h-8 pointer-events-none border-t-2 border-l-2 border-amber-600/70 p-1">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-900 border border-amber-600/80 shadow-sm" />
      </div>
      <div className="absolute top-2 right-2 w-8 h-8 pointer-events-none border-t-2 border-r-2 border-amber-600/70 p-1 flex justify-end">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-900 border border-amber-600/80 shadow-sm" />
      </div>
      <div className="absolute bottom-2 left-2 w-8 h-8 pointer-events-none border-b-2 border-l-2 border-amber-600/70 p-1 flex items-end">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-900 border border-amber-600/80 shadow-sm" />
      </div>
      <div className="absolute bottom-2 right-2 w-8 h-8 pointer-events-none border-b-2 border-r-2 border-amber-600/70 p-1 flex items-end justify-end">
        <div className="w-1.5 h-1.5 rounded-full bg-stone-900 border border-amber-600/80 shadow-sm" />
      </div>

      {/* Top bar integrata con i bottoni nella bacheca */}
      <div className="relative z-20 flex items-center justify-between pt-1 pb-2 border-b border-amber-800/30">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <Button 
                type="button"
                variant="ghost" 
                size="icon" 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSidebar();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onToggleSidebar();
                }}
                className="h-10 w-10 text-amber-300 hover:bg-amber-950/50 touch-manipulation cursor-pointer active:scale-95 transition-transform flex items-center justify-center"
                aria-label="Apri/Chiudi Menu di Navigazione"
            >
                <Icons.logo className="h-6 w-6 pointer-events-none" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <PlayerModeToggle variant="ghost" />
          <QuickLockButton variant="ghost" onOpenConfig={onOpenPinConfig} />
        </div>
      </div>

      {/* Intestazione Principale della Bacheca */}
      <div className="relative z-10 text-center space-y-3 border-b border-border/60 pb-6 pt-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/80 text-primary text-xs font-serif uppercase tracking-[0.2em] shadow-md">
          <Flame className="h-3.5 w-3.5 text-primary fill-primary/20" /> Bacheca della Taverna • Compagnia degli Eroi
        </div>
        
        {/* Contenitore con centratura geometrica */}
        <div className="relative w-full flex items-center justify-center min-h-[48px] px-4">
          <div 
            onClick={() => {
              if (onEditCampaign && !playerMode) {
                onEditCampaign();
              }
            }}
            className={`w-full max-w-3xl mx-auto text-center transition-opacity duration-200 flex items-center justify-center gap-2 ${
              onEditCampaign && !playerMode ? 'cursor-pointer hover:opacity-90 active:opacity-75' : 'cursor-default select-text'
            }`}
            title={onEditCampaign && !playerMode ? "Tocca per modificare il nome o l'ambientazione" : undefined}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight font-headline text-primary drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] text-center">
              {campaign.name}
            </h2>
            {onEditCampaign && !playerMode && (
              <Pencil className="h-4 w-4 sm:h-5 sm:w-5 text-primary/70 hover:text-primary transition-colors" />
            )}
          </div>

          {/* Selettore cambio campagna */}
          {campaigns && campaigns.length > 1 && onSelectCampaign && !playerMode && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-primary hover:text-primary hover:bg-muted rounded-full border border-border/40"
                    title="Cambia Campagna"
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
                  <DropdownMenuLabel className="text-primary font-headline">Cambia Campagna</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/60" />
                  {campaigns.map((c) => (
                    <DropdownMenuItem 
                      key={c.id} 
                      onSelect={() => onSelectCampaign(c.id)}
                      className="hover:bg-muted cursor-pointer"
                    >
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {campaign.setting && (
          <p className="text-sm sm:text-base text-muted-foreground font-serif italic max-w-2xl mx-auto">
            &ldquo;{campaign.setting}&rdquo;
          </p>
        )}
      </div>

      {/* Sezione PG: Tante Box quanti sono i Personaggi Giocanti */}
      <div className="relative z-10 space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-bold font-headline text-foreground tracking-wide">
            I Personaggi Giocanti ({characters.length})
          </h3>
        </div>

        {characters.length === 0 ? (
          <Card className="bg-card/70 border-dashed border-border text-center p-8 backdrop-blur-sm shadow-inner">
            <CardContent className="flex flex-col items-center justify-center space-y-3 p-0">
              <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <UserPlus className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Nessun PG Registrato</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Crea i personaggi della compagnia per visualizzare le loro statistiche e i punti ferita nella bacheca.
                </p>
              </div>
              <Button 
                type="button"
                onClick={() => onNavigateTo('personaggi')}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 shadow-md"
              >
                <UserPlus className="h-4 w-4" /> Aggiungi Personaggio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5 pt-2">
            {characters.map((pc) => (
              <HubCharacterCard 
                key={pc.id}
                pc={pc}
                totalSessionXp={totalSessionXp}
                onSelect={handleOpenCharacters}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sezione Riassunto della Storia */}
      <div className="relative z-10 space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-bold font-headline text-foreground tracking-wide">
            Riassunto della Storia
          </h3>
        </div>

        <Card className="relative bg-card/85 border border-border/80 text-card-foreground shadow-2xl backdrop-blur-md overflow-hidden rounded-xl">
          {/* Chiodi metallici di affissione agli angoli superiori del documento */}
          <div className="absolute top-2.5 left-4 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-amber-200 via-amber-600 to-amber-950 border border-amber-950 shadow-md z-20 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-amber-100" />
          </div>
          <div className="absolute top-2.5 right-4 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-amber-200 via-amber-600 to-amber-950 border border-amber-950 shadow-md z-20 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-amber-100" />
          </div>
          <CardContent className="p-5 sm:p-6 pt-7 space-y-4 max-h-[420px] overflow-y-auto leading-relaxed text-sm sm:text-base font-serif text-foreground/90">
            <MarkdownRenderer content={storySummaryText} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
