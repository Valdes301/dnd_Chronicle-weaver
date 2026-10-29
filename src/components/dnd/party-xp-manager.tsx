'use client';

import React, { useState, useMemo } from 'react';
import { 
  PlayerCharacter, 
  PcXpAward 
} from '@/lib/types';
import { 
  DND5E_LEVEL_XP, 
  DND5E_ENCOUNTER_THRESHOLDS, 
  DND5E_NON_COMBAT_XP,
  getLevelFromXp, 
  getXpProgress,
  evaluateEncounterDifficulty
} from '@/lib/dnd5e-xp';
import { assignQuestXpToCharacters } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Award, 
  Sparkles, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  User, 
  Plus, 
  Minus,
  RefreshCw,
  HelpCircle,
  Swords,
  Scroll,
  Flame
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PartyXpManagerProps {
  campaignId: string;
  playerCharacters: PlayerCharacter[];
  initialBaseXp?: number;
  initialReason?: string;
  onPcsUpdated?: (updatedPcs: PlayerCharacter[]) => void;
  onClose?: () => void;
}

export function PartyXpManager({
  campaignId,
  playerCharacters,
  initialBaseXp = 0,
  initialReason = 'Completamento Quest',
  onPcsUpdated,
  onClose,
}: PartyXpManagerProps) {
  const { toast } = useToast();
  const [baseXpPerPc, setBaseXpPerPc] = useState<number>(initialBaseXp);
  const [customReason, setCustomReason] = useState<string>(initialReason);
  const [bonusMap, setBonusMap] = useState<Record<string, { bonus: number; reason: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'distribution' | 'thresholds' | 'guidelines'>('distribution');

  // Party levels
  const partyLevels = useMemo(() => {
    return playerCharacters.map(pc => {
      const xp = pc.experiencePoints ?? DND5E_LEVEL_XP[pc.level || 1] ?? 0;
      return getLevelFromXp(xp);
    });
  }, [playerCharacters]);

  // Difficulty thresholds for current party
  const partyThresholds = useMemo(() => {
    return evaluateEncounterDifficulty(partyLevels, baseXpPerPc * Math.max(1, playerCharacters.length));
  }, [partyLevels, baseXpPerPc, playerCharacters.length]);

  // Compute XP awards for each PC
  const awards = useMemo<PcXpAward[]>(() => {
    return playerCharacters.map(pc => {
      const currentXp = pc.experiencePoints ?? DND5E_LEVEL_XP[pc.level || 1] ?? 0;
      const currentLevel = getLevelFromXp(currentXp);
      const pcBonus = bonusMap[pc.id]?.bonus || 0;
      const bonusReason = bonusMap[pc.id]?.reason || '';
      const totalNewXp = Math.max(0, currentXp + baseXpPerPc + pcBonus);
      const newLevel = getLevelFromXp(totalNewXp);
      const leveledUp = newLevel > currentLevel;

      return {
        pcId: pc.id,
        pcName: pc.name,
        currentXp,
        currentLevel,
        questBaseXp: baseXpPerPc,
        bonusXp: pcBonus,
        bonusReason,
        totalNewXp,
        newLevel,
        leveledUp,
      };
    });
  }, [playerCharacters, baseXpPerPc, bonusMap]);

  const anyLevelUp = awards.some(a => a.leveledUp);

  const handleBonusChange = (pcId: string, bonus: number, reason?: string) => {
    setBonusMap(prev => ({
      ...prev,
      [pcId]: {
        bonus: isNaN(bonus) ? 0 : bonus,
        reason: reason !== undefined ? reason : (prev[pcId]?.reason || ''),
      },
    }));
  };

  const handleBonusReasonChange = (pcId: string, reason: string) => {
    setBonusMap(prev => ({
      ...prev,
      [pcId]: {
        bonus: prev[pcId]?.bonus || 0,
        reason,
      },
    }));
  };

  const handleApplyPresetNonCombat = (xpAmount: number, label: string) => {
    setBaseXpPerPc(prev => prev + xpAmount);
    setCustomReason(prev => prev ? `${prev} + ${label}` : label);
    toast({ title: `Aggiunti +${xpAmount} PX base: ${label}` });
  };

  const handleSaveAndAssign = async () => {
    if (playerCharacters.length === 0) {
      toast({ variant: 'destructive', title: 'Errore', description: 'Nessun personaggio presente nel gruppo.' });
      return;
    }
    setIsSaving(true);
    try {
      const res = await assignQuestXpToCharacters(campaignId, awards);
      if (res.success && res.data) {
        toast({ title: 'Successo', description: 'Punti Esperienza e Livelli assegnati con successo!' });
        if (onPcsUpdated) {
          onPcsUpdated(res.data);
        }
        if (onClose) {
          onClose();
        }
      } else {
        toast({ variant: 'destructive', title: 'Errore', description: res.error || 'Errore durante l\'assegnazione dei PX.' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Errore', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card/75 backdrop-blur-sm border border-border/70 rounded-xl p-6 text-foreground shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-headline text-foreground flex items-center gap-2">
              Assegnazione Punti Esperienza (PX / XP)
              <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10 font-mono">
                D&D 5e SRD
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Calcola e distribuisci l&apos;esperienza per la quest o sessione, con tracciamento avanzato di avanzamento di livello.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50 text-xs">
          <button
            onClick={() => setActiveTab('distribution')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'distribution' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Distribuzione Party
          </button>
          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'thresholds' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Soglie di Sfida
          </button>
          <button
            onClick={() => setActiveTab('guidelines')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'guidelines' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Guida Traguardi
          </button>
        </div>
      </div>

      {/* Global Quest Base XP Input */}
      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-background/40 p-4 rounded-xl border border-border/60">
          <div>
            <Label className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              PX Base Quest (a ciascun PG)
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-2 bg-muted/30 border-input hover:bg-muted/60 text-foreground"
                onClick={() => setBaseXpPerPc(prev => Math.max(0, prev - 50))}
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <Input
                type="number"
                min="0"
                step="25"
                value={baseXpPerPc}
                onChange={e => setBaseXpPerPc(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="h-9 bg-background/60 border-input text-amber-400 font-bold text-center text-base"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 px-2 bg-muted/30 border-input hover:bg-muted/60 text-foreground"
                onClick={() => setBaseXpPerPc(prev => prev + 50)}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5 mb-1.5">
              <Scroll className="w-3.5 h-3.5 text-primary" />
              Motivazione / Traguardo Sessione
            </Label>
            <Input
              type="text"
              placeholder="Es. Sconfitta del Necromante + Recupero dell'Amuleto di Sangue"
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              className="h-9 bg-background/60 border-input text-foreground text-sm"
            />
          </div>
        </div>
      )}

      {/* Main Tab: Distribution */}
      {activeTab === 'distribution' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Ripartizione per Personaggio ({playerCharacters.length} PG)
            </h3>
            {anyLevelUp && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Avanzamento di Livello Disponibile!
              </Badge>
            )}
          </div>

          {playerCharacters.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
              Nessun personaggio giocante trovato nella campagna. Aggiungi personaggi nella sezione Schede PG per gestire i PX.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {awards.map(award => {
                const pc = playerCharacters.find(p => p.id === award.pcId)!;
                const currentProgress = getXpProgress(award.currentXp);
                const projectedProgress = getXpProgress(award.totalNewXp);

                return (
                  <div
                    key={award.pcId}
                    className={`p-4 rounded-xl border transition-all ${
                      award.leveledUp
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                        : 'bg-card/60 border-border/70 hover:border-primary/40'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Character Info */}
                      <div className="flex items-start gap-3 min-w-[220px]">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                          {award.pcName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{award.pcName}</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-border/60 bg-muted/30 text-muted-foreground">
                              {pc.race || 'Razza'} {pc.class || 'Classe'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>Livello attuale: <strong className="text-foreground">{award.currentLevel}</strong></span>
                            {award.leveledUp && (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                → Livello {award.newLevel}! 🎉
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar and XP Stats */}
                      <div className="flex-1 max-w-md space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>PX: <strong className="text-foreground">{award.currentXp.toLocaleString()}</strong> → <strong className="text-primary font-semibold">{award.totalNewXp.toLocaleString()}</strong></span>
                          <span>Prossimo Liv.: <strong className="text-foreground">{projectedProgress.nextLevelXp.toLocaleString()} PX</strong></span>
                        </div>
                        
                        {/* Custom visual progress bar */}
                        <div className="w-full h-2.5 bg-muted/60 rounded-full overflow-hidden relative">
                          {/* Current progress */}
                          <div
                            className="h-full bg-muted-foreground/40 rounded-full transition-all duration-500"
                            style={{ width: `${currentProgress.progressPercent}%` }}
                          />
                          {/* Projected gain preview */}
                          {award.totalNewXp > award.currentXp && (
                            <div
                              className={`absolute top-0 bottom-0 ${award.leveledUp ? 'bg-emerald-500' : 'bg-primary'} opacity-80 rounded-full transition-all duration-500`}
                              style={{
                                left: `${award.leveledUp ? 0 : currentProgress.progressPercent}%`,
                                width: `${award.leveledUp ? projectedProgress.progressPercent : Math.min(100 - currentProgress.progressPercent, projectedProgress.progressPercent - currentProgress.progressPercent)}%`,
                              }}
                            />
                          )}
                        </div>

                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{projectedProgress.progressPercent}% verso Liv. {projectedProgress.nextLevel}</span>
                          <span>Mancano {projectedProgress.xpNeededForNextLevel.toLocaleString()} PX</span>
                        </div>
                      </div>

                      {/* Individual Bonus and Reason */}
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                        <div>
                          <Label className="text-[11px] text-muted-foreground block mb-1">
                            Bonus Individuale (PX)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="10"
                            placeholder="+0"
                            value={bonusMap[award.pcId]?.bonus || ''}
                            onChange={e => handleBonusChange(award.pcId, parseInt(e.target.value, 10) || 0)}
                            className="w-28 h-8 bg-background/50 border-input text-xs text-right text-primary font-semibold"
                          />
                        </div>
                        <div className="w-full sm:w-36">
                          <Label className="text-[11px] text-muted-foreground block mb-1">
                            Motivo Bonus (opzionale)
                          </Label>
                          <Input
                            type="text"
                            placeholder="Es. Eroe della battaglia"
                            value={bonusMap[award.pcId]?.reason || ''}
                            onChange={e => handleBonusReasonChange(award.pcId, e.target.value)}
                            className="h-8 bg-background/50 border-input text-xs text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Thresholds & Difficulty Calculation */}
      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-card/75 border border-border/80 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Swords className="w-4 h-4 text-primary" />
              Soglie di Difficoltà per il Party Attuale ({playerCharacters.length} Giocatori)
            </h3>
            <p className="text-xs text-muted-foreground">
              In base ai livelli dei tuoi PG, ecco i valori di riferimento ufficiali per quantificare la difficoltà di uno scontro o di una sessione.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-center">
                <span className="text-xs text-emerald-400 font-semibold block">Facile</span>
                <span className="text-lg font-bold text-foreground">{partyThresholds.partyThresholds.easy.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground block">PX Totali Gruppo</span>
              </div>
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-center">
                <span className="text-xs text-primary font-semibold block">Medio</span>
                <span className="text-lg font-bold text-foreground">{partyThresholds.partyThresholds.medium.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground block">PX Totali Gruppo</span>
              </div>
              <div className="p-3 rounded-lg bg-orange-950/20 border border-orange-500/30 text-center">
                <span className="text-xs text-orange-400 font-semibold block">Difficile</span>
                <span className="text-lg font-bold text-foreground">{partyThresholds.partyThresholds.hard.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground block">PX Totali Gruppo</span>
              </div>
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-center">
                <span className="text-xs text-rose-400 font-semibold block">Mortale</span>
                <span className="text-lg font-bold text-foreground">{partyThresholds.partyThresholds.deadly.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground block">PX Totali Gruppo</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border/70 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Budget Giornaliero Consigliato (Full Adventuring Day):</span>
              <span className="font-mono font-bold text-primary">{partyThresholds.partyThresholds.daily.toLocaleString()} PX</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Non-Combat XP Guidelines & Quick Presets */}
      {activeTab === 'guidelines' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-card/75 border border-border/80 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Scroll className="w-4 h-4 text-primary" />
              Guida Rapida Traguardi Non di Combattimento (D&D 5e DMG)
            </h3>
            <p className="text-xs text-muted-foreground">
              Clicca su un traguardo per applicare automaticamente il relativo ammontare di PX alla sessione attuale:
            </p>

            <div className="space-y-2 pt-2">
              {DND5E_NON_COMBAT_XP.map((guideline, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-card border border-border/70 hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/10">
                        {guideline.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-card-foreground mt-1">{guideline.label}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2 bg-card border-border hover:bg-muted hover:text-foreground"
                      onClick={() => handleApplyPresetNonCombat(guideline.tier1, `${guideline.category} (Tier 1)`)}
                    >
                      Tier 1 (+{guideline.tier1} PX)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2 bg-card border-border hover:bg-muted hover:text-foreground"
                      onClick={() => handleApplyPresetNonCombat(guideline.tier2, `${guideline.category} (Tier 2)`)}
                    >
                      Tier 2 (+{guideline.tier2} PX)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2 bg-card border-border hover:bg-muted hover:text-foreground"
                      onClick={() => handleApplyPresetNonCombat(guideline.tier3, `${guideline.category} (Tier 3)`)}
                    >
                      Tier 3 (+{guideline.tier3} PX)
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/60">
        <div className="text-xs text-muted-foreground">
          Totale stimato da assegnare al party: <strong className="text-primary font-bold">{(awards.reduce((sum, a) => sum + a.questBaseXp + a.bonusXp, 0)).toLocaleString()} PX totali</strong>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onClose && (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Annulla
            </Button>
          )}

          <Button
            type="button"
            onClick={handleSaveAndAssign}
            disabled={isSaving || playerCharacters.length === 0}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 shadow-md"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvataggio in corso...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Conferma e Assegna PX ai PG
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
