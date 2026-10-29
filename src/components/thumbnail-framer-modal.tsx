'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, X, ZoomIn, Move, RefreshCw, Sparkles, User, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThumbnailFramerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  availablePages?: string[];
  title?: string;
  onSaveThumbnail: (thumbnailDataUrl: string) => void;
}

export function ThumbnailFramerModal({
  isOpen,
  onClose,
  imageSrc,
  availablePages,
  title = "Miniatura",
  onSaveThumbnail
}: ThumbnailFramerModalProps) {
  const [activeImageSrc, setActiveImageSrc] = useState<string>(imageSrc);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [naturalDimensions, setNaturalDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; startPanX: number; startPanY: number }>({
    clientX: 0,
    clientY: 0,
    startPanX: 0,
    startPanY: 0
  });

  // Touch state for 2-finger pinch-to-zoom
  const touchStateRef = useRef<{
    initialPinchDistance: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    isPinching: boolean;
  }>({
    initialPinchDistance: 0,
    initialZoom: 1,
    initialPan: { x: 0, y: 0 },
    isPinching: false,
  });

  const imageElementRef = useRef<HTMLImageElement | null>(null);

  // Sync active image when modal opens or imageSrc changes
  useEffect(() => {
    if (isOpen && imageSrc) {
      setActiveImageSrc(imageSrc);
    }
  }, [isOpen, imageSrc]);

  // Inizializza o resetta l'immagine all'apertura o al cambio pagina
  useEffect(() => {
    if (isOpen && activeImageSrc) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);
      setPreviewUrl('');

      const img = new Image();
      if (activeImageSrc.startsWith('http://') || activeImageSrc.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        setNaturalDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        imageElementRef.current = img;
        setImageLoaded(true);
      };
      img.onerror = () => {
        setImageLoaded(false);
        imageElementRef.current = null;
      };
      img.src = activeImageSrc;
    } else {
      setImageLoaded(false);
      imageElementRef.current = null;
    }
  }, [isOpen, activeImageSrc]);

  // Gestione Mouse / Pointer per desktop
  const handlePointerDown = (e: React.PointerEvent) => {
    // Se è un evento touch, lasciamo gestire i touch nativi dedicati per supportare pinch a 2 dita
    if (e.pointerType === 'touch') return;

    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    isDraggingRef.current = true;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Gestione Touch dedicata: 1 dito = Pan, 2 dita = Pinch-to-Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Inizia Pinch a 2 dita
      e.preventDefault();
      touchStateRef.current.isPinching = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStateRef.current.initialPinchDistance = dist || 1;
      touchStateRef.current.initialZoom = zoom;
      isDraggingRef.current = false;
    } else if (e.touches.length === 1) {
      // Inizia Drag con 1 dito
      touchStateRef.current.isPinching = false;
      isDraggingRef.current = true;
      dragStartRef.current = {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        startPanX: pan.x,
        startPanY: pan.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStateRef.current.isPinching) {
      // Calcola il nuovo fattore di zoom proporzionale
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = currentDist / (touchStateRef.current.initialPinchDistance || 1);
      const newZoom = Math.max(0.5, Math.min(15.0, touchStateRef.current.initialZoom * ratio));
      setZoom(Number(newZoom.toFixed(2)));
    } else if (e.touches.length === 1 && isDraggingRef.current && !touchStateRef.current.isPinching) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStartRef.current.clientX;
      const dy = e.touches[0].clientY - dragStartRef.current.clientY;
      setPan({
        x: dragStartRef.current.startPanX + dx,
        y: dragStartRef.current.startPanY + dy
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      isDraggingRef.current = false;
      touchStateRef.current.isPinching = false;
    } else if (e.touches.length === 1) {
      // Passa a modalità drag per il dito rimasto
      touchStateRef.current.isPinching = false;
      isDraggingRef.current = true;
      dragStartRef.current = {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        startPanX: pan.x,
        startPanY: pan.y
      };
    }
  };

  // Zoom da rotellina mouse
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.5, Math.min(15.0, Number((prev + delta).toFixed(2)))));
  };

  // Genera il canvas 1:1 per il rendering definitivo o anteprima
  const renderThumbnailDataUrl = useCallback((targetSize: number = 320): string => {
    if (!imageElementRef.current || !containerRef.current) return '';
    const img = imageElementRef.current;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return '';

    const containerW = containerRef.current.clientWidth || 240;
    const containerH = containerRef.current.clientHeight || 240;

    // Calcola il fattore di scala "contain" di base nel contenitore
    const baseScale = Math.min(containerW / iw, containerH / ih);
    const displayedW = iw * baseScale * zoom;
    const displayedH = ih * baseScale * zoom;

    // Calcola la posizione del centro dell'immagine nel contenitore
    const imgCenterX = containerW / 2 + pan.x;
    const imgCenterY = containerH / 2 + pan.y;

    const imgLeft = imgCenterX - displayedW / 2;
    const imgTop = imgCenterY - displayedH / 2;

    // Canvas quadrato di esportazione
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Sfondo neutro scuro di sicurezza
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, targetSize, targetSize);

    // Rapporto di scala tra contenitore UI e canvas finale
    const scaleFactor = targetSize / containerW;

    ctx.save();
    ctx.drawImage(
      img,
      imgLeft * scaleFactor,
      imgTop * scaleFactor,
      displayedW * scaleFactor,
      displayedH * scaleFactor
    );
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.92);
  }, [zoom, pan]);

  // Aggiorna l'anteprima in tempo reale
  useEffect(() => {
    if (!isOpen || !imageLoaded) return;
    const timer = setTimeout(() => {
      const url = renderThumbnailDataUrl(160);
      if (url) setPreviewUrl(url);
    }, 60);
    return () => clearTimeout(timer);
  }, [isOpen, imageLoaded, renderThumbnailDataUrl]);

  // Presets rapidi di centratura
  const applyPreset = (type: 'center' | 'top' | 'fill') => {
    if (!naturalDimensions.w || !naturalDimensions.h) return;
    if (type === 'center') {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else if (type === 'top') {
      setZoom(1.4);
      setPan({ x: 0, y: 35 });
    } else if (type === 'fill') {
      setZoom(1.25);
      setPan({ x: 0, y: 0 });
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      const finalThumb = renderThumbnailDataUrl(360);
      if (finalThumb) {
        onSaveThumbnail(finalThumb);
        onClose();
      }
    } catch (e) {
      console.error("Errore salvataggio miniatura:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const containerW = containerRef.current?.clientWidth || 240;
  const containerH = containerRef.current?.clientHeight || 240;
  const baseScale = (naturalDimensions.w && naturalDimensions.h)
    ? Math.min(containerW / naturalDimensions.w, containerH / naturalDimensions.h)
    : 1;
  const renderedImgW = naturalDimensions.w ? naturalDimensions.w * baseScale : undefined;
  const renderedImgH = naturalDimensions.h ? naturalDimensions.h * baseScale : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="max-w-xl w-[95vw] max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-background/95 backdrop-blur-md"
      >
        <DialogHeader className="pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
              <DialogTitle className="text-base sm:text-lg font-bold">
                {title}
              </DialogTitle>
            </div>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 font-semibold">
              Formato 1:1 Quadrato
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Trascina con 1 dito per spostare, pizzica con 2 dita per zoomare o usa i controlli sotto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 sm:py-3 space-y-4">
          {availablePages && availablePages.length > 1 && (
            <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg border border-border/50 overflow-x-auto shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap flex items-center gap-1">
                📄 Pagine ({availablePages.length}):
              </span>
              <div className="flex items-center gap-1.5">
                {availablePages.map((pageUrl, idx) => {
                  const isSelected = activeImageSrc === pageUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageSrc(pageUrl)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all border",
                        isSelected
                          ? "bg-amber-950/60 border-amber-500 text-amber-200 shadow-sm ring-1 ring-amber-500"
                          : "bg-background/80 border-border/60 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      )}
                    >
                      <img src={pageUrl} alt={`Pagina ${idx + 1}`} className="w-5 h-5 object-cover rounded border border-white/20" referrerPolicy="no-referrer" />
                      <span>Pagina {idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Area Interattiva di Inquadratura & Anteprima */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
            {/* Box Interattivo di Modifica con Drag & Touch Zoom */}
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <Move className="h-3.5 w-3.5 text-amber-500" /> Trascina / Zoom con 2 dita
              </span>
              
              <div 
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onWheel={handleWheel}
                className="relative w-52 h-52 sm:w-60 sm:h-60 rounded-2xl overflow-hidden border-2 border-amber-500/70 bg-black/80 shadow-xl cursor-grab active:cursor-grabbing select-none touch-none flex items-center justify-center"
                style={{ touchAction: 'none' }}
              >
                {imageLoaded && activeImageSrc ? (
                  <div 
                    className="absolute pointer-events-none transition-transform duration-75 ease-out"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center'
                    }}
                  >
                      <img 
                        src={activeImageSrc} 
                        alt="Thumbnail crop target" 
                        style={{
                          width: renderedImgW ? `${renderedImgW}px` : undefined,
                          height: renderedImgH ? `${renderedImgH}px` : undefined,
                          maxWidth: 'none',
                          maxHeight: 'none',
                        }}
                        className="object-contain rounded border border-white/10 pointer-events-none select-none"
                        referrerPolicy="no-referrer"
                      />
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground text-xs">
                    <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                    Caricamento...
                  </div>
                )}

                {/* Reticolo di composizione sottile */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-amber-500/20">
                  <div className="border-r border-b border-white/10" />
                  <div className="border-r border-b border-white/10" />
                  <div className="border-b border-white/10" />
                  <div className="border-r border-b border-white/10" />
                  <div className="border-r border-b border-white/10" />
                  <div className="border-b border-white/10" />
                  <div className="border-r border-white/10" />
                  <div className="border-r border-white/10" />
                  <div />
                </div>
              </div>
            </div>

            {/* Anteprima Risultato Finale */}
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> Risultato Liste
              </span>
              <div className="flex flex-col items-center gap-2.5 p-3 bg-muted/20 rounded-xl border border-border/50">
                {/* Miniatura grande */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-amber-500/50 bg-black/60 shadow-md">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Anteprima miniatura" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-muted animate-pulse" />
                  )}
                </div>
                {/* Miniatura compatta icona (come appare nelle righe) */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-8 h-8 rounded-md overflow-hidden border border-amber-500/40 bg-black/60 shadow-sm shrink-0">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Miniatura compatta" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-muted" />
                    )}
                  </div>
                  <span className="text-[10px]">Icona riga</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controlli di Regolazione Zoom & Presets */}
          <div className="space-y-3 bg-muted/15 p-3 sm:p-4 rounded-xl border border-border/40">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <Label className="flex items-center gap-1.5 font-medium">
                  <ZoomIn className="h-3.5 w-3.5 text-amber-500" /> Zoom ({Math.round(zoom * 100)}%)
                </Label>
                <span className="text-[10px] text-muted-foreground">Pizzica con 2 dita o usa il cursore</span>
              </div>
              <Slider
                value={[zoom]}
                min={0.5}
                max={15.0}
                step={0.05}
                onValueChange={(val) => setZoom(val[0])}
                className="py-1 cursor-pointer"
              />
            </div>

            {/* Pulsanti Rapidi di Inquadratura */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => applyPreset('top')}
              >
                <User className="h-3 w-3 mr-1 text-amber-500" /> Primo Piano
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => applyPreset('fill')}
              >
                <Maximize2 className="h-3 w-3 mr-1 text-emerald-500" /> Busto
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => applyPreset('center')}
              >
                <RefreshCw className="h-3 w-3 mr-1 text-blue-500" /> Figura Intera
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t flex flex-row items-center justify-between sm:justify-end gap-2 shrink-0">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="text-xs"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Annulla
          </Button>
          <Button 
            type="button" 
            size="sm" 
            disabled={!imageLoaded || isSaving}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-md gap-1.5"
            onClick={handleSave}
          >
            <Check className="h-4 w-4" /> {isSaving ? "Salvataggio..." : "Salva Miniatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
