'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Save, X } from 'lucide-react';
import { NpcDetailCard, MagicItemDetailCard, MonsterDetailCard } from './ui/entity-detail-cards';
import { isPlayerMode } from '@/lib/pin-storage';

export function EntityOverlay({ entity, open, onOpenChange, onSave }: { 
    entity: any; 
    open: boolean; 
    onOpenChange: (open: boolean) => void;
    onSave: (entity: any) => void;
}) {
    const [playerMode, setPlayerMode] = useState(false);

    useEffect(() => {
        setPlayerMode(isPlayerMode());
        const handlePlayerModeChange = (e: any) => {
            setPlayerMode(Boolean(e.detail?.isPlayerMode));
        };
        window.addEventListener('dnd-player-mode-changed', handlePlayerModeChange);
        return () => window.removeEventListener('dnd-player-mode-changed', handlePlayerModeChange);
    }, []);

    if (!entity) return null;

    const isExisting = !!(entity.id || (entity.stats && entity.stats.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-none bg-background/95 backdrop-blur-md shadow-2xl">
                <DialogTitle className="sr-only">{entity.name || 'Dettagli Entità'}</DialogTitle>
                <div className="sticky top-0 right-0 z-50 flex justify-end p-2 pointer-events-none">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onOpenChange(false)}
                        className="h-8 w-8 rounded-full bg-background/50 hover:bg-background pointer-events-auto shadow-sm border"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                
                <div className="px-6 pb-8 pt-2">
                    {entity.type === 'Npc' && <NpcDetailCard npc={entity} playerMode={playerMode} />}
                    {entity.type === 'MagicItem' && <MagicItemDetailCard item={entity} />}
                    {(entity.type === 'Monster' || entity.type === 'Weapon' || entity.type === 'Armor') && entity.type !== 'MagicItem' && entity.type !== 'Npc' && (
                        entity.type === 'Monster' ? <MonsterDetailCard monster={entity} /> : <MagicItemDetailCard item={entity} />
                    )}
                    
                    {!isExisting && !playerMode && (
                        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20 -mx-6 px-6 pb-6 rounded-b-lg">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                Questa entità non è ancora presente nel tuo Database permanente.
                            </p>
                            <Button onClick={() => onSave(entity)} className="gap-2 w-full sm:w-auto shadow-lg shadow-primary/20">
                                <Save className="h-4 w-4" /> Salva nel Database
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
