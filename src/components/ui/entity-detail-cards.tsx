'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MarkdownRenderer } from './markdown-renderer';
import { cn } from '@/lib/utils';
import { 
    User2, 
    Fingerprint, 
    Footprints, 
    Sword, 
    Shield, 
    Heart, 
    Beaker, 
    Zap, 
    Trophy, 
    Package,
    Skull
} from 'lucide-react';
import Image from 'next/image';

// --- UTILS ---

function parseAbilityScores(desc?: string) {
  if (!desc) return null;
  const lines = desc.split('\n').map(l => l.trim());
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.includes('|') && (/FOR|STR/i.test(line)) && (/DES|DEX/i.test(line))) {
      const headerCols = line.split('|').map(c => c.trim().toUpperCase()).filter(Boolean);
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const dataLine = lines[j];
        if (!dataLine.includes('|') || dataLine.includes('---')) continue;
        const dataCols = dataLine.split('|').map(c => c.trim()).filter(Boolean);
        if (dataCols.length >= 6) {
          const res: Record<string, { score: string; mod: string }> = {};
          headerCols.forEach((col, idx) => {
            const rawVal = dataCols[idx] || '';
            const valMatch = rawVal.match(/(\d+)\s*(?:\(([+-]?\d+)\))?/);
            if (valMatch) {
              const score = valMatch[1];
              const scoreVal = parseInt(score, 10);
              const calcMod = Math.floor((scoreVal - 10) / 2);
              const mod = valMatch[2] || (calcMod >= 0 ? `+${calcMod}` : `${calcMod}`);
              
              if (/FOR|STR/i.test(col)) res.str = { score, mod };
              else if (/DES|DEX/i.test(col)) res.dex = { score, mod };
              else if (/COS|CON/i.test(col)) res.con = { score, mod };
              else if (/INT/i.test(col)) res.int = { score, mod };
              else if (/SAG|WIS/i.test(col)) res.wis = { score, mod };
              else if (/CAR|CHA/i.test(col)) res.cha = { score, mod };
            }
          });
          if (res.str && res.dex) {
            return {
              str: res.str || { score: '10', mod: '+0' },
              dex: res.dex || { score: '10', mod: '+0' },
              con: res.con || { score: '10', mod: '+0' },
              int: res.int || { score: '10', mod: '+0' },
              wis: res.wis || { score: '10', mod: '+0' },
              cha: res.cha || { score: '10', mod: '+0' },
            };
          }
        }
      }
    }
  }
  return null;
}

const AbilityScoresTable = ({ desc }: { desc?: string }) => {
  const scores = parseAbilityScores(desc);
  if (!scores) return null;
  const items = [
    { label: 'FOR', ...scores.str },
    { label: 'DES', ...scores.dex },
    { label: 'COS', ...scores.con },
    { label: 'INT', ...scores.int },
    { label: 'SAG', ...scores.wis },
    { label: 'CAR', ...scores.cha },
  ];
  return (
    <div className="space-y-1.5 mb-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 font-sans">
        Caratteristiche
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {items.map((it) => (
          <div key={it.label} className="bg-amber-950/20 rounded-lg p-2 text-center border border-amber-500/30 shadow-sm flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-amber-500 block leading-tight">{it.label}</span>
            <span className="text-sm font-bold text-foreground leading-tight my-0.5">{it.score}</span>
            <span className="text-[10px] font-medium text-muted-foreground leading-tight">({it.mod})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TechBadge = ({ value, type }: { value?: string | null, type?: string }) => {
    if (!value) return null;
    let Icon = Sword;
    let colorClass = "bg-rose-500/10 text-rose-500 border-rose-500/20";
    
    switch (type) {
        case 'defense': Icon = Shield; colorClass = "bg-sky-500/10 text-sky-500 border-sky-500/20"; break;
        case 'cure': Icon = Heart; colorClass = "bg-red-500/10 text-red-500 border-red-500/20"; break;
        case 'alchemy': Icon = Beaker; colorClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"; break;
        case 'charges': Icon = Zap; colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20"; break;
        case 'reward': Icon = Trophy; colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20"; break;
        case 'none': return null;
    }

    return (
        <Badge variant="secondary" className={cn("flex items-center gap-1 h-5 text-[9px] uppercase", colorClass)}>
            <Icon className="h-2.5 w-2.5" />
            {value}
        </Badge>
    );
};

const DetailItem = ({ label, value }: { label: string, value?: React.ReactNode }) => {
    if (!value || value === '—' || value === '') return null;
    return <p className="text-sm"><strong className="text-primary/80">{label}:</strong> {String(value)}</p>;
}

// --- CARDS ---

export function NpcDetailCard({ npc, playerMode = false }: { npc: any, playerMode?: boolean }) {
    let details: any = {};
    try {
        details = typeof npc.details === 'string' ? JSON.parse(npc.details) : (npc.details || npc.stats || {});
    } catch {
        details = npc.details || npc.stats || {};
    }
    
    const isFieldHidden = (fieldId: string) => {
        if (!playerMode) return false;
        return details.hiddenFields?.includes(fieldId);
    };

    return (
        <div className="space-y-6 text-left">
            <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-full overflow-hidden border bg-muted shrink-0 relative shadow-md">
                    {details.imageUrl ? (
                        <img src={details.imageUrl} alt={npc.name} className="h-full w-full object-cover" />
                    ) : (
                        <User2 className="h-full w-full p-4 opacity-20" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-headline text-2xl text-primary leading-tight truncate">{npc.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {!isFieldHidden('occupation') && details.occupation && <Badge variant="secondary" className="text-[10px] uppercase">{details.occupation}</Badge>}
                        {!isFieldHidden('race') && (npc.race || details.race) && <Badge variant="outline" className="text-[10px] uppercase">{npc.race || details.race}</Badge>}
                        {!isFieldHidden('alignment') && (npc.alignment || details.alignment) && <Badge variant="outline" className="text-[10px] uppercase border-amber-500/40 text-amber-400">{npc.alignment || details.alignment}</Badge>}
                        {!isFieldHidden('attitude') && (
                            <Badge 
                                variant="outline" 
                                className={cn(
                                    "text-[10px] uppercase font-semibold",
                                    details.attitude === "Amico" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                                    details.attitude === "Nemico" && "bg-rose-500/10 text-rose-400 border-rose-500/30",
                                    (!details.attitude || details.attitude === "Neutrale") && "bg-slate-500/10 text-slate-300 border-slate-700"
                                )}
                            >
                                {details.attitude === "Amico" ? "🟢 Amico" : details.attitude === "Nemico" ? "🔴 Nemico" : "⚪ Neutrale"}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                    { id: "gender", label: "Genere", val: npc.gender || details.gender },
                    { id: "age", label: "Età", val: npc.age || details.age },
                    { id: "status", label: "Stato Sociale", val: npc.status || details.status },
                ].filter(f => !isFieldHidden(f.id) && f.val).map(f => (
                    <div key={f.id} className="bg-primary/5 border rounded p-2 text-center flex flex-col items-center justify-center">
                        <span className="text-[8px] uppercase font-bold text-muted-foreground block mb-0.5">{f.label}</span>
                        <span className="text-xs font-medium">{f.val}</span>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                {!isFieldHidden('appearance') && details.appearance && (
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground opacity-70">Aspetto Pubblico</span>
                        <p className="text-sm text-foreground/90 italic leading-relaxed">"{details.appearance}"</p>
                    </div>
                )}
                
                {!isFieldHidden('personality') && details.personality && (
                    <div className="p-4 rounded-lg bg-muted/30 border space-y-2">
                        <span className="text-[10px] font-bold uppercase text-primary/70 block">Psicologia & Tratti</span>
                        <p className="text-sm italic leading-relaxed">"{details.personality}"</p>
                    </div>
                )}

                {!isFieldHidden('mannerism') && details.mannerism && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <span className="text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1 mb-1">
                            <Fingerprint className="h-3 w-3" /> Peculiarità
                        </span>
                        <p className="text-sm italic">"{details.mannerism}"</p>
                    </div>
                )}

                {!playerMode && details.secret && (
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <span className="text-[10px] font-bold uppercase text-amber-400 block mb-1">🔒 Segreto del DM</span>
                        <p className="text-sm text-amber-200 italic">"{details.secret}"</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export function MagicItemDetailCard({ item }: { item: any }) {
    const stats = item.stats || item;
    const isArmor = (item.type || '').toLowerCase().includes('armatura') || (item.type || '').toLowerCase().includes('scudo');
    const isWeapon = (item.type || '').toLowerCase().includes('arma');

    return (
        <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-6">
                {stats.imageUrl && (
                    <div className="relative w-full sm:w-40 aspect-square rounded-lg overflow-hidden border bg-muted shrink-0 shadow-sm">
                        <img src={stats.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    </div>
                )}
                <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-headline text-2xl text-primary leading-tight">{item.name}</h3>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase gap-1">
                                <Package className="h-2.5 w-2.5" /> {item.type || stats.type || 'Oggetto'}
                            </Badge>
                            {stats.rarity && <Badge variant="outline" className="text-[10px] uppercase">{stats.rarity}</Badge>}
                            <TechBadge 
                                value={stats.armorClass || stats.damage} 
                                type={stats.techType || (isArmor ? 'defense' : isWeapon ? 'damage' : 'none')} 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1">
                        <DetailItem label="Costo" value={stats.cost} />
                        {stats.armorClass && <DetailItem label="Classe Armatura" value={stats.armorClass} />}
                        {stats.strength && <DetailItem label="Forza Richiesta" value={stats.strength} />}
                        {stats.stealth && <DetailItem label="Furtività" value={stats.stealth} />}
                        {stats.damage && <DetailItem label="Danno / Effetto" value={stats.damage} />}
                        {stats.properties && <DetailItem label="Proprietà" value={stats.properties} />}
                        {stats.weight && <DetailItem label="Peso" value={stats.weight} />}
                        {stats.attunement && stats.attunement !== 'No' && <DetailItem label="Sintonia" value={stats.attunement} />}
                    </div>
                </div>
            </div>

            <Separator />

            <div className="prose prose-sm prose-invert max-w-none">
                <MarkdownRenderer content={item.description || stats.description} className="font-serif text-foreground/90" />
            </div>
        </div>
    );
}

export function MonsterDetailCard({ monster }: { monster: any }) {
    const stats = monster.stats || monster;
    
    return (
        <div className="space-y-6 text-left">
            <AbilityScoresTable desc={monster.description || stats.description} />

            <div className="flex flex-col sm:flex-row gap-6">
                {stats.imageUrl && (
                    <div className="relative w-full sm:w-48 max-h-[300px] rounded-lg overflow-hidden border border-amber-500/30 bg-black/70 shrink-0 shadow-md flex items-center justify-center p-1">
                        <img src={stats.imageUrl} alt={monster.name} className="max-h-full w-auto object-contain rounded" />
                    </div>
                )}
                <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                        <h3 className="font-headline text-2xl text-primary leading-tight">{monster.name}</h3>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase gap-1">
                                <Skull className="h-2.5 w-2.5" /> Bestiario
                            </Badge>
                            {stats.challenge && <Badge variant="secondary" className="text-[10px] uppercase">GS {stats.challenge}</Badge>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-amber-950/10 border border-amber-500/10 font-mono">
                        <div className="space-y-0.5">
                            <span className="text-muted-foreground block text-[9px] uppercase font-bold tracking-wider">Tipo & Taglia</span>
                            <span className="font-semibold text-foreground text-xs block truncate">{stats.type || 'Creatura'}</span>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-rose-400/90 block text-[9px] uppercase font-bold tracking-wider">CA</span>
                            <span className="font-semibold text-foreground text-sm">{stats.armorClass || 'N/D'}</span>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-emerald-400/90 block text-[9px] uppercase font-bold tracking-wider">PF</span>
                            <span className="font-semibold text-foreground text-sm">{stats.hitPoints || 'N/D'}</span>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-amber-400 block text-[9px] uppercase font-bold tracking-wider">GS</span>
                            <span className="font-semibold text-foreground text-sm">{stats.challenge || 'N/D'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative border-l-4 border-l-amber-600 bg-amber-950/5 p-4 rounded-r-lg border border-border/30 font-serif">
                <h4 className="text-base font-bold text-amber-500 font-sans tracking-wide uppercase border-b border-amber-500/20 pb-1 mb-3">
                    Statistiche & Tratti
                </h4>
                <MarkdownRenderer content={monster.description || stats.description} className="text-sm leading-relaxed" />
            </div>
        </div>
    );
}
