'use client';

import { useState, useEffect, memo } from 'react';
import * as actions from '@/lib/actions';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  ScrollText,
  BrainCircuit,
  Shield,
  Sparkles,
  Skull,
  Wand,
  Map,
  LayoutGrid,
  Palette,
  Hammer,
  Beer,
  Library,
  Settings,
  MapPin,
  UserCircle,
  Sword,
  Mail,
  Store,
  Users,
  BookMarked,
  BookOpen,
  Lock,
  Compass,
  Trophy,
  Package
} from 'lucide-react';
import { Icons } from './icons';
import { cn } from "@/lib/utils";
import { useToast } from '@/hooks/use-toast';
import {
  isPinConfigured,
  isPlayerMode,
  setPlayerMode,
  openPinConfigDialog,
  getBlockedViews,
  getBlockedBehavior,
  BlockedBehavior,
  DEFAULT_BLOCKED_VIEWS,
  syncFromDatabase,
} from '@/lib/pin-storage';
import { PinPromptDialog } from './pin-prompt-dialog';

type SidebarNavProps = {
  activeView: string;
  onViewChange: (view: string | null) => void;
  onNewCampaign?: () => void;
  onBackup?: () => void;
  onOpenPinConfig?: () => void;
  dbSettings?: Record<string, string>;
};

const navItems = [
  { id: 'bacheca', label: 'Bacheca del Gruppo', icon: Shield },
  { id: 'storia', label: 'Storia & Cronache', icon: ScrollText },
  { id: 'quest-creator', label: 'Crea Nuova Quest', icon: Compass },
  { id: 'oracolo-ai', label: 'Oracolo', icon: BrainCircuit },
  { id: 'party-xp', label: 'Assegna PX Party (5e)', icon: Trophy },
  { id: 'lore', label: 'Lore & Ambientazione', icon: BookMarked },
  { id: 'personaggi', label: 'Personaggi Giocanti', icon: Users },
  { id: 'riepilogo-png', label: 'Anagrafe dei PNG', icon: UserCircle },
];

const creativeItems = [
  { id: 'architetto', label: 'Architetto di Mondi', icon: MapPin },
  { id: 'combattimenti', label: 'Arena del Destino', icon: Sword },
  { id: 'botteghe', label: 'Botteghe ed Empori', icon: Store },
  { id: 'anagrafe', label: 'Emporio dei Volti (PNG)', icon: UserCircle },
  { id: 'tesori', label: 'Generatore di Tesori', icon: Sparkles },
  { id: 'mappe', label: 'Mappe', icon: Map },
  { id: 'lettere', label: 'Ordini e Lettere', icon: Mail },
  { id: 'taverna', label: 'Taverna', icon: Beer },
].sort((a, b) => a.label.localeCompare(b.label));

const handbookItems = [
    { id: 'manuale', label: 'Manuale di Gioco', icon: BookOpen },
    { id: 'manuale-importa', label: 'Importazione Intelligente', icon: Sparkles },
    { id: 'abilità', label: 'Abilità', icon: BrainCircuit },
    { id: 'equipaggiamento', label: 'Armeria', icon: Sword },
    { id: 'oggetti', label: 'Oggetti', icon: Package },
    { id: 'bestiario', label: 'Bestiario', icon: Skull },
    { id: 'magie', label: 'Incantesimi', icon: Wand },
];

const supportItems = [
  { id: 'layout-sperimentale', label: 'Genera Carte Complete', icon: LayoutGrid },
  { id: 'crea-carte', label: 'Crea Carte (Multiplo)', icon: Hammer },
  { id: 'personalizza', label: 'Personalizza Sfondo', icon: Palette },
];

export const SidebarNav = memo(function SidebarNav({ activeView, onViewChange, onNewCampaign, onBackup, onOpenPinConfig, dbSettings }: SidebarNavProps) {
  const { isMobile, setOpenMobile, toggleSidebar, open, setOpen, openMobile } = useSidebar();
  const [isClient, setIsClient] = useState(false);
  const [autoCloseEnabled, setAutoCloseEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('dnd_auto_close_sidebar');
      if (stored !== null) return stored === 'true';
    }
    return true;
  });

  // Inizializzazione sincrona dello stato di sicurezza basata sia sui dati DB sia su localStorage
  const initialHasPin = Boolean(dbSettings?.master_pin_hash);
  const initialBlockedViews = (() => {
    if (dbSettings?.blocked_views) {
      try {
        const parsed = JSON.parse(dbSettings.blocked_views);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return DEFAULT_BLOCKED_VIEWS;
  })();
  const initialBehavior = (dbSettings?.blocked_behavior as BlockedBehavior) || 'hide';

  const [hasPin, setHasPin] = useState<boolean>(initialHasPin);
  const [playerMode, setPlayerModeState] = useState<boolean>(true);
  const [blockedViews, setBlockedViewsState] = useState<string[]>(initialBlockedViews);
  const [blockedBehavior, setBlockedBehaviorState] = useState<BlockedBehavior>(initialBehavior);
  const [promptView, setPromptView] = useState<string | null>(null);
  const [isExitPlayerPromptOpen, setIsExitPlayerPromptOpen] = useState<boolean>(false);
  const { toast } = useToast();

  const fallbackBlockedViews = Array.isArray(DEFAULT_BLOCKED_VIEWS) ? DEFAULT_BLOCKED_VIEWS : [];
  const activePlayerMode = isClient ? playerMode : true;
  const activeBlockedViews = isClient ? (Array.isArray(blockedViews) ? blockedViews : fallbackBlockedViews) : initialBlockedViews;
  const activeBlockedBehavior = isClient ? blockedBehavior : initialBehavior;

  useEffect(() => {
    setIsClient(true);
    actions.getAppSettingAction('autoCloseSidebar', 'true').then(res => {
      if (res.success && res.data) {
        const val = res.data !== 'false';
        setAutoCloseEnabled(val);
        localStorage.setItem('dnd_auto_close_sidebar', val ? 'true' : 'false');
      }
    });

    if (dbSettings) {
      syncFromDatabase(dbSettings);
    }
    const pinActive = isPinConfigured() || Boolean(dbSettings?.master_pin_hash);
    setHasPin(pinActive);
    setPlayerModeState(isPlayerMode());
    setBlockedViewsState(getBlockedViews());
    setBlockedBehaviorState(getBlockedBehavior());

    const handlePlayerModeChange = (e: any) => {
      setPlayerModeState(Boolean(e.detail?.isPlayerMode));
    };
    const handleBlockedViewsChange = (e: any) => {
      const views = e.detail?.blockedViews;
      setBlockedViewsState(Array.isArray(views) ? views : getBlockedViews());
    };
    const handleBehaviorChange = (e: any) => {
      setBlockedBehaviorState(e.detail?.behavior || 'hide');
    };
    const handlePinChange = () => {
      setHasPin(isPinConfigured() || Boolean(dbSettings?.master_pin_hash));
      setBlockedViewsState(getBlockedViews());
    };
    const handleSettingChange = (e: any) => {
      if (e.detail?.key === 'autoCloseSidebar') {
        const val = e.detail?.value !== 'false';
        setAutoCloseEnabled(val);
        localStorage.setItem('dnd_auto_close_sidebar', val ? 'true' : 'false');
      }
    };

    window.addEventListener('dnd-player-mode-changed', handlePlayerModeChange);
    window.addEventListener('dnd-blocked-views-changed', handleBlockedViewsChange);
    window.addEventListener('dnd-blocked-behavior-changed', handleBehaviorChange);
    window.addEventListener('dnd-pin-changed', handlePinChange);
    window.addEventListener('dnd-pin-config-changed', handlePinChange);
    window.addEventListener('dnd-setting-changed', handleSettingChange);

    return () => {
      window.removeEventListener('dnd-player-mode-changed', handlePlayerModeChange);
      window.removeEventListener('dnd-blocked-views-changed', handleBlockedViewsChange);
      window.removeEventListener('dnd-blocked-behavior-changed', handleBehaviorChange);
      window.removeEventListener('dnd-pin-changed', handlePinChange);
      window.removeEventListener('dnd-pin-config-changed', handlePinChange);
      window.removeEventListener('dnd-setting-changed', handleSettingChange);
    };
  }, [dbSettings]);

  // Gestione chiusura automatica al click/tocco su qualsiasi punto esterno alla sidebar
  useEffect(() => {
    if (!autoCloseEnabled) return;
    if (!open && !openMobile) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Se il click è all'interno della sidebar, non chiudere
      const sidebarEl = document.querySelector('[data-sidebar="sidebar"]');
      if (sidebarEl && sidebarEl.contains(target)) return;

      // Se il click è all'interno di un dialogo (Radix UI), un popup o l'overlay di blocco, non chiudere
      // Questo previene la chiusura accidentale della sidebar (e i relativi loop di touch) quando si interagisce con il PIN
      const isInsideDialog = target.closest('[role="dialog"], [data-radix-portal], .fixed.inset-0.z-\\[99999\\]');
      if (isInsideDialog) return;

      // Se il click è su un pulsante di apertura/chiusura menu, non interferire
      const triggerEl = target.closest('[data-sidebar="trigger"], [aria-label*="Menu"], [aria-label*="Navigazione"], #sidebar-toggle-btn');
      if (triggerEl) return;

      // Tocco/click sulla pagina: chiudi la sidebar
      if (openMobile) {
        setOpenMobile(false);
      }
      if (open) {
        setOpen(false);
      }
    };

    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('touchend', handleOutsideClick, true);

    return () => {
      document.removeEventListener('click', handleOutsideClick, true);
      document.removeEventListener('touchend', handleOutsideClick, true);
    };
  }, [autoCloseEnabled, isMobile, open, openMobile, setOpen, setOpenMobile]);

  const [isTouchBlocking, setIsTouchBlocking] = useState<boolean>(false);
  const [prevOpen, setPrevOpen] = useState(false);

  // Trigger touch blocking whenever the sidebar starts closing (catches all methods of closure)
  useEffect(() => {
    const isCurrentlyOpen = open || openMobile;
    if (prevOpen && !isCurrentlyOpen) {
      setIsTouchBlocking(true);
      const timer = setTimeout(() => setIsTouchBlocking(false), 400);
      return () => clearTimeout(timer);
    }
    setPrevOpen(isCurrentlyOpen);
  }, [open, openMobile, prevOpen]);

  const triggerBlock = () => {
    setIsTouchBlocking(true);
    setTimeout(() => setIsTouchBlocking(false), 400);
  };

  const handleViewChange = (view: string) => {
    // Immediate block on intent to change view/close
    triggerBlock();

    if (view === 'bacheca') {
      onViewChange(null);
    } else {
      onViewChange(view);
    }
    
    if (isMobile) {
      setOpenMobile(false);
    } else if (autoCloseEnabled) {
      setOpen(false);
    }
  };

  const handleTogglePlayerMode = (e?: React.SyntheticEvent) => {
    if (e && e.type === 'touchend') {
      e.preventDefault();
    }
    if (playerMode) {
      if (!isPinConfigured()) {
        openPinConfigDialog();
      } else {
        setIsExitPlayerPromptOpen(true);
      }
    } else {
      setPlayerMode(true);
      setPlayerModeState(true);
      toast({ title: "Modalità Giocatore Attiva", description: "Le sezioni riservate sono oscurate." });
    }
  };

  const isItemBlocked = (id: string) => {
    if (id === 'bacheca') return false;
    if (!activePlayerMode) return false;

    // Se il PIN del Master NON è configurato, tutte le altre sezioni sono bloccate per i giocatori
    if (!hasPin) {
      return true;
    }

    return activeBlockedViews.includes(id);
  };

  const renderMenuItem = (item: { id: string; label: string; icon: any }) => {
    const isBlocked = isItemBlocked(item.id);
    if (isBlocked && activeBlockedBehavior === 'hide') {
      return null;
    }

    const handleClick = () => {
      if (isBlocked) {
        setPromptView(item.id);
      } else {
        handleViewChange(item.id);
      }
    };

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          onClick={handleClick}
          isActive={activeView === item.id}
          tooltip={isBlocked ? `${item.label} (🔒 Riservato al DM)` : item.label}
          className={cn(
            "transition-colors",
            isBlocked && "opacity-60 text-muted-foreground hover:opacity-100 hover:text-amber-300"
          )}
        >
          {isBlocked ? (
            <Lock className="size-4 shrink-0 text-amber-500" />
          ) : (
            <item.icon className="size-4 shrink-0" />
          )}
          <span className="truncate flex-1">{item.label}</span>
          {isBlocked && (
            <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-amber-950/80 text-amber-400 border border-amber-600/40">
              🔒 DM
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const isItemVisible = (id: string) => {
    if (id === 'bacheca') return true;
    if (!activePlayerMode) return true;

    // Se il PIN del Master NON è configurato, la vista Giocatore deve mostrare SOLO la bacheca
    if (!hasPin) {
      return false;
    }

    const isBlocked = isItemBlocked(id);
    return !(isBlocked && activeBlockedBehavior === 'hide');
  };
  const hasVisibleNavItems = navItems.some(i => isItemVisible(i.id));
  const hasVisibleCreativeItems = creativeItems.some(i => isItemVisible(i.id));
  const hasVisibleHandbookItems = handbookItems.some(i => isItemVisible(i.id));
  const hasVisibleSupportItems = supportItems.some(i => isItemVisible(i.id));
  
  return (
    <>
      <Sidebar collapsible="offcanvas" style={{ "--sidebar-width": "13rem" } as React.CSSProperties}>
        <SidebarHeader>
          <SidebarMenu>
              <SidebarMenuItem>
                  <SidebarMenuButton 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSidebar();
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleSidebar();
                      }}
                      tooltip="Contrai/Espandi Navigazione"
                      className="touch-manipulation cursor-pointer active:scale-95 transition-transform"
                  >
                      <Icons.logo className="size-4 shrink-0 pointer-events-none" />
                      <span className="truncate font-headline font-bold text-lg pointer-events-none">Tessitore</span>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Tasto Modalità Giocatore rapido nella barra */}
              <SidebarMenuItem>
                  <SidebarMenuButton
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePlayerMode(e);
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleTogglePlayerMode(e);
                      }}
                      tooltip={activePlayerMode ? "Vista Giocatore Attiva (Clicca per sbloccare DM)" : "Passa a Modalità Giocatore"}
                      className={cn(
                        "text-xs font-serif transition-all touch-manipulation cursor-pointer active:scale-95",
                        activePlayerMode 
                          ? "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60 border border-emerald-600/40" 
                          : "hover:bg-stone-800 text-stone-300"
                      )}
                  >
                      {activePlayerMode ? <Users className="size-4 text-emerald-400 shrink-0 pointer-events-none" /> : <Shield className="size-4 text-amber-400 shrink-0 pointer-events-none" />}
                      <span className="truncate flex-1 font-semibold pointer-events-none">{activePlayerMode ? "Vista Giocatori" : "Modalità DM"}</span>
                      {activePlayerMode && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 pointer-events-none" />}
                  </SidebarMenuButton>
              </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {hasVisibleNavItems && (
            <SidebarGroup>
                <SidebarGroupLabel>{activePlayerMode ? "Bacheca" : "Master"}</SidebarGroupLabel>
                <SidebarMenu>
                  {navItems.map(renderMenuItem)}
                </SidebarMenu>
            </SidebarGroup>
          )}

          {hasVisibleCreativeItems && (
            <SidebarGroup>
                <SidebarGroupLabel>Strumenti Creativi</SidebarGroupLabel>
                <SidebarMenu>
                  {creativeItems.map(renderMenuItem)}
                </SidebarMenu>
            </SidebarGroup>
          )}
          
          {hasVisibleHandbookItems && (
            <SidebarGroup>
                <SidebarGroupLabel>Manuale</SidebarGroupLabel>
                <SidebarMenu>
                  {handbookItems.map(renderMenuItem)}
                </SidebarMenu>
            </SidebarGroup>
          )}

          {hasVisibleSupportItems && (
            <SidebarGroup>
                <SidebarGroupLabel>Avanzate</SidebarGroupLabel>
                <SidebarMenu>
                  {supportItems.map(renderMenuItem)}
                </SidebarMenu>
            </SidebarGroup>
          )}

          {!activePlayerMode && (
            <SidebarGroup>
                <SidebarGroupLabel>Sistema</SidebarGroupLabel>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton 
                            onClick={() => {
                              if (isPinConfigured()) {
                                setPromptView('sistema');
                              } else {
                                handleViewChange('sistema');
                              }
                            }}
                            isActive={activeView === 'sistema'} 
                            tooltip={isClient && hasPin ? "Sistema (🔒 Protetto da PIN)" : "Pannello Sistema"}
                            className="hover:text-amber-300 font-medium"
                        >
                          <Settings className="w-4 h-4 text-amber-400" />
                          <span>Sistema</span>
                          {isClient && hasPin && <Lock className="w-3.5 h-3.5 text-amber-500 ml-auto" />}
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter />

        {/* Dialog per apertura scheda protetta da PIN */}
        {promptView && (
          <PinPromptDialog
            open={Boolean(promptView)}
            onOpenChange={(open) => !open && setPromptView(null)}
            title="Sezione Protetta dal Dungeon Master"
            description={`Inserisci il PIN per accedere alla scheda "${promptView === 'sistema' ? 'Sistema' : promptView}".`}
            onSuccess={() => {
              const target = promptView;
              setPromptView(null);
              handleViewChange(target);
            }}
          />
        )}

        {/* Dialog per sblocco Modalità Master */}
        <PinPromptDialog
          open={isExitPlayerPromptOpen}
          onOpenChange={setIsExitPlayerPromptOpen}
          title="Torna alla Modalità Dungeon Master"
          description="Inserisci il PIN del DM per disattivare la visuale giocatori."
          onSuccess={() => {
            setIsExitPlayerPromptOpen(false);
            setPlayerMode(false);
            setPlayerModeState(false);
            toast({ title: "Modalità DM Ripristinata", description: "Accesso completo sbloccato." });
          }}
        />
      </Sidebar>
      {/* Sovrapposizione trasparente anti-ghost click per transizioni di vista - ORA ESTERNA AL SIDEBAR */}
      {isTouchBlocking && (
        <div className="fixed inset-0 z-[99999] bg-transparent pointer-events-auto" />
      )}
    </>
  );
});
