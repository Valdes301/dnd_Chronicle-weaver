'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Scissors, Check, X, RotateCw, RefreshCw, ZoomIn, Eye, Move } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  availablePages?: string[];
  title?: string;
  onCropSave: (croppedDataUrl: string) => void;
}

export function ImageCropperModal({
  isOpen,
  onClose,
  imageSrc,
  availablePages,
  title = "Ritaglio Immagine",
  onCropSave
}: ImageCropperModalProps) {
  const [activeImageSrc, setActiveImageSrc] = useState<string>(imageSrc);

  // Bounding box percentages (0 to 100)
  const [top, setTop] = useState<number>(0);
  const [bottom, setBottom] = useState<number>(0);
  const [left, setLeft] = useState<number>(0);
  const [right, setRight] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [showManualSliders, setShowManualSliders] = useState<boolean>(false);

  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [naturalDimensions, setNaturalDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const [dragType, setDragType] = useState<'move' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right' | null>(null);

  const dragStartRef = useRef<{ 
    x: number; 
    y: number; 
    top: number; 
    bottom: number; 
    left: number; 
    right: number;
    width: number;
    height: number;
  }>({
    x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0
  });

  // Sync active image when modal opens or imageSrc changes
  useEffect(() => {
    if (isOpen && imageSrc) {
      setActiveImageSrc(imageSrc);
    }
  }, [isOpen, imageSrc]);

  // Reset parameters and pre-load image only once when opened or activeImageSrc changes
  useEffect(() => {
    if (isOpen && activeImageSrc) {
      setTop(0);
      setBottom(0);
      setLeft(0);
      setRight(0);
      setRotation(0);
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

  const generateCroppedCanvas = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!activeImageSrc || !imageLoaded || !imageElementRef.current) {
        resolve('');
        return;
      }

      const img = imageElementRef.current;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;

      // Calculate actual pixel coordinates
      const cropX = Math.max(0, Math.floor((left / 100) * iw));
      const cropY = Math.max(0, Math.floor((top / 100) * ih));
      const cropW = Math.max(10, Math.floor(((100 - left - right) / 100) * iw));
      const cropH = Math.max(10, Math.floor(((100 - top - bottom) / 100) * ih));

      if (cropW <= 0 || cropH <= 0) {
        resolve('');
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      if (rotation % 360 === 0) {
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      } else {
        // Handle rotation
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.save();
        ctx.translate(cropW / 2, cropH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(
          img,
          cropX,
          cropY,
          cropW,
          cropH,
          -cropW / 2,
          -cropH / 2,
          cropW,
          cropH
        );
        ctx.restore();
      }

      resolve(canvas.toDataURL('image/jpeg', 0.90));
    });
  };

  // Update preview canvas whenever crop bounds or rotation change
  useEffect(() => {
    if (!imageSrc || !isOpen || !imageLoaded) return;

    const timer = setTimeout(() => {
      generateCroppedCanvas().then((url) => {
        if (url) setPreviewUrl(url);
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [top, bottom, left, right, rotation, imageSrc, isOpen, imageLoaded]);

  // Pointer drag and drop logic (Mouse + Touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, type: typeof dragType) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    isDraggingRef.current = true;
    setDragType(type);
    
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      top,
      bottom,
      left,
      right,
      width: rect.width,
      height: rect.height
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragType || !containerRef.current) return;
    
    const start = dragStartRef.current;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    
    const pctX = (dx / start.width) * 100;
    const pctY = (dy / start.height) * 100;
    
    if (dragType === 'move') {
      const currentWidth = 100 - start.left - start.right;
      const currentHeight = 100 - start.top - start.bottom;
      
      let newLeft = Math.max(0, start.left + pctX);
      let newTop = Math.max(0, start.top + pctY);
      
      if (newLeft + currentWidth > 100) {
        newLeft = 100 - currentWidth;
      }
      if (newTop + currentHeight > 100) {
        newTop = 100 - currentHeight;
      }
      
      setLeft(Math.round(newLeft));
      setRight(Math.round(100 - newLeft - currentWidth));
      setTop(Math.round(newTop));
      setBottom(Math.round(100 - newTop - currentHeight));
    } else {
      const typeStr = dragType as string;
      if (typeStr.includes('top')) {
        const newTop = Math.max(0, Math.min(95, start.top + pctY));
        if (100 - newTop - bottom >= 5) {
          setTop(Math.round(newTop));
        }
      }
      if (typeStr.includes('bottom')) {
        const newBottom = Math.max(0, Math.min(95, start.bottom - pctY));
        if (100 - top - newBottom >= 5) {
          setBottom(Math.round(newBottom));
        }
      }
      if (typeStr.includes('left')) {
        const newLeft = Math.max(0, Math.min(95, start.left + pctX));
        if (100 - newLeft - right >= 5) {
          setLeft(Math.round(newLeft));
        }
      }
      if (typeStr.includes('right')) {
        const newRight = Math.max(0, Math.min(95, start.right - pctX));
        if (100 - left - newRight >= 5) {
          setRight(Math.round(newRight));
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setDragType(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleApply = async () => {
    setIsProcessing(true);
    const finalCropped = await generateCroppedCanvas();
    if (finalCropped) {
      onCropSave(finalCropped);
      onClose();
    }
    setIsProcessing(false);
  };

  const handlePreset = (preset: 'reset' | 'removeTextBottom' | 'removeHeaderTop' | 'centerSquare') => {
    switch (preset) {
      case 'reset':
        setTop(0);
        setBottom(0);
        setLeft(0);
        setRight(0);
        setRotation(0);
        break;
      case 'removeTextBottom':
        setTop(0);
        setBottom(45);
        setLeft(0);
        setRight(0);
        break;
      case 'removeHeaderTop':
        setTop(20);
        setBottom(0);
        setLeft(0);
        setRight(0);
        break;
      case 'centerSquare':
        setTop(15);
        setBottom(15);
        setLeft(15);
        setRight(15);
        break;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-[98vw] sm:w-[95vw] h-[95dvh] sm:h-auto max-h-[95dvh] sm:max-h-[92vh] flex flex-col p-3 sm:p-6 overflow-hidden bg-background/95 backdrop-blur-md rounded-lg">
        <DialogHeader className="pb-1 sm:pb-2 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg font-bold">
            <Scissors className="h-4 w-4 sm:h-5 sm:w-5 text-rose-500 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
            Trascina direttamente sull&apos;immagine, ruota o usa un preset per isolare la creatura.
          </DialogDescription>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-2 sm:py-3 space-y-3 sm:space-y-4 pr-0.5 flex flex-col">
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
                          ? "bg-rose-950/60 border-rose-500 text-rose-200 shadow-sm ring-1 ring-rose-500"
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 flex-1">
            {/* Visual Editor Area with Interactive Pointer Handles */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center bg-black/60 rounded-xl p-2 sm:p-3 border border-border/50 min-h-[180px] sm:min-h-[300px] relative overflow-hidden group max-h-[35vh] sm:max-h-[380px]">
              {activeImageSrc ? (
                <div 
                  ref={containerRef} 
                  className="relative inline-block max-w-full max-h-[160px] sm:max-h-[360px] select-none touch-none"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <img
                    src={activeImageSrc}
                    alt="Sorgente"
                    className="max-h-[150px] sm:max-h-[340px] w-auto object-contain rounded border border-white/10 shadow-lg pointer-events-none select-none"
                    style={{ transform: `rotate(${rotation}deg)` }}
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Draggable Bounding Box Crop Overlay */}
                  <div
                    className="absolute border-2 border-dashed border-rose-500 bg-rose-500/15 shadow-2xl touch-none select-none active:border-rose-400 active:bg-rose-500/20"
                    style={{
                      top: `${top}%`,
                      bottom: `${bottom}%`,
                      left: `${left}%`,
                      right: `${right}%`,
                      cursor: 'move',
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'move')}
                  >
                    <div className="absolute top-0.5 left-0.5 bg-rose-600/95 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none select-none whitespace-nowrap scale-90 origin-top-left">
                      Ritaglio ({100 - left - right}% x {100 - top - bottom}%)
                    </div>
                    
                    {/* Corner Handles (Larger on mobile for easier touch) */}
                    <div 
                      className="absolute -top-2.5 -left-2.5 w-5 h-5 sm:w-4 sm:h-4 bg-rose-500 border-2 border-white rounded-full shadow hover:bg-rose-400 cursor-nwse-resize active:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDown(e, 'top-left')}
                    />
                    <div 
                      className="absolute -top-2.5 -right-2.5 w-5 h-5 sm:w-4 sm:h-4 bg-rose-500 border-2 border-white rounded-full shadow hover:bg-rose-400 cursor-nesw-resize active:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDown(e, 'top-right')}
                    />
                    <div 
                      className="absolute -bottom-2.5 -left-2.5 w-5 h-5 sm:w-4 sm:h-4 bg-rose-500 border-2 border-white rounded-full shadow hover:bg-rose-400 cursor-nesw-resize active:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDown(e, 'bottom-left')}
                    />
                    <div 
                      className="absolute -bottom-2.5 -right-2.5 w-5 h-5 sm:w-4 sm:h-4 bg-rose-500 border-2 border-white rounded-full shadow hover:bg-rose-400 cursor-nwse-resize active:scale-125 transition-transform"
                      onPointerDown={(e) => handlePointerDown(e, 'bottom-right')}
                    />

                    {/* Edge Handles */}
                    <div 
                      className="absolute -top-1 left-4 right-4 h-2 hover:bg-rose-500/30 cursor-ns-resize"
                      onPointerDown={(e) => handlePointerDown(e, 'top')}
                    />
                    <div 
                      className="absolute -bottom-1 left-4 right-4 h-2 hover:bg-rose-500/30 cursor-ns-resize"
                      onPointerDown={(e) => handlePointerDown(e, 'bottom')}
                    />
                    <div 
                      className="absolute -left-1 top-4 bottom-4 w-2 hover:bg-rose-500/30 cursor-ew-resize"
                      onPointerDown={(e) => handlePointerDown(e, 'left')}
                    />
                    <div 
                      className="absolute -right-1 top-4 bottom-4 w-2 hover:bg-rose-500/30 cursor-ew-resize"
                      onPointerDown={(e) => handlePointerDown(e, 'right')}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-xs flex flex-col items-center py-8">
                  <Eye className="h-8 w-8 mb-2 opacity-40" />
                  Nessuna immagine fornita
                </div>
              )}
            </div>

            {/* Live Preview & Presets - Responsive Row layout on mobile */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-muted/20 p-2.5 sm:p-3.5 rounded-xl border border-border/40 shrink-0">
              <div className="flex flex-row sm:flex-col items-center sm:items-stretch gap-3 justify-between">
                
                {/* Result Preview Box */}
                <div className="flex-1 max-w-[120px] sm:max-w-none">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <span className="text-[10px] sm:text-xs font-bold flex items-center gap-1.5">
                      <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" /> Anteprima
                    </span>
                    {naturalDimensions.w > 0 && (
                      <Badge variant="outline" className="hidden sm:inline-flex text-[9px] font-mono py-0 h-4 px-1.5">
                        {naturalDimensions.w}x{naturalDimensions.h}px
                      </Badge>
                    )}
                  </div>

                  <div className="w-20 h-20 sm:w-full sm:aspect-square sm:max-h-[160px] bg-black/40 rounded-lg border border-rose-500/30 overflow-hidden flex items-center justify-center p-1 relative shadow-inner">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Anteprima"
                        className="max-w-full max-h-full object-contain rounded shadow"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[9px] text-muted-foreground">Generazione...</span>
                    )}
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex-1 space-y-1 sm:space-y-1.5 min-w-0">
                  <Label className="text-[9px] sm:text-[11px] font-bold text-muted-foreground">Preset Rapidi:</Label>
                  <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 sm:h-7 text-[9px] sm:text-[10px] justify-start px-1.5"
                      onClick={() => handlePreset('removeTextBottom')}
                    >
                      <Scissors className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 text-rose-400 shrink-0" /> Rimuovi Testo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 sm:h-7 text-[9px] sm:text-[10px] justify-start px-1.5"
                      onClick={() => handlePreset('removeHeaderTop')}
                    >
                      <Scissors className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 text-amber-400 shrink-0" /> Rimuovi Intest.
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 sm:h-7 text-[9px] sm:text-[10px] justify-start px-1.5"
                      onClick={() => handlePreset('centerSquare')}
                    >
                      <ZoomIn className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 text-sky-400 shrink-0" /> Focus Cent.
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 sm:h-7 text-[9px] sm:text-[10px] justify-start px-1.5"
                      onClick={() => handlePreset('reset')}
                    >
                      <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 shrink-0" /> Ripristina
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toggle Fine Adjustment Sliders button (Visible only on mobile) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-7 text-[10px] font-bold sm:hidden shrink-0"
            onClick={() => setShowManualSliders(!showManualSliders)}
          >
            {showManualSliders ? "🎛️ Nascondi Regolazione Cursori" : "🎛️ Mostra Regolazione Cursori"}
          </Button>

          {/* Precision Sliders - Collapsed by default on mobile to save vertical space */}
          <div className={cn("p-2 sm:p-3 bg-muted/30 rounded-xl border border-border/50 space-y-2 sm:space-y-3 shrink-0", !showManualSliders && "hidden sm:block")}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-bold flex items-center gap-1.5">
                <Move className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-500" /> Regolazione Margini (%)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 sm:h-6 px-1.5 sm:px-2 text-[9px] sm:text-[10px]"
                onClick={() => setRotation((prev) => (prev + 90) % 360)}
              >
                <RotateCw className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" /> Ruota 90° ({rotation}°)
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {/* Taglia Alto */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex justify-between text-[10px] sm:text-[11px]">
                  <span className="text-muted-foreground">Margine Alto</span>
                  <span className="font-bold font-mono text-rose-400">{top}%</span>
                </div>
                <Slider
                  value={[top]}
                  min={0}
                  max={Math.min(90, 100 - bottom - 5)}
                  step={1}
                  onValueChange={(val) => setTop(val[0])}
                />
              </div>

              {/* Taglia Basso */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex justify-between text-[10px] sm:text-[11px]">
                  <span className="text-muted-foreground">Margine Basso</span>
                  <span className="font-bold font-mono text-rose-400">{bottom}%</span>
                </div>
                <Slider
                  value={[bottom]}
                  min={0}
                  max={Math.min(90, 100 - top - 5)}
                  step={1}
                  onValueChange={(val) => setBottom(val[0])}
                />
              </div>

              {/* Taglia Sinistra */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex justify-between text-[10px] sm:text-[11px]">
                  <span className="text-muted-foreground">Margine Sinistro</span>
                  <span className="font-bold font-mono text-rose-400">{left}%</span>
                </div>
                <Slider
                  value={[left]}
                  min={0}
                  max={Math.min(90, 100 - right - 5)}
                  step={1}
                  onValueChange={(val) => setLeft(val[0])}
                />
              </div>

              {/* Taglia Destra */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex justify-between text-[10px] sm:text-[11px]">
                  <span className="text-muted-foreground">Margine Destro</span>
                  <span className="font-bold font-mono text-rose-400">{right}%</span>
                </div>
                <Slider
                  value={[right]}
                  min={0}
                  max={Math.min(90, 100 - left - 5)}
                  step={1}
                  onValueChange={(val) => setRight(val[0])}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 sm:pt-3 border-t flex flex-row items-center justify-between sm:justify-end gap-2 shrink-0">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose} disabled={isProcessing}>
            <X className="h-3.5 w-3.5 mr-1" /> Annulla
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-8 text-xs px-4"
            onClick={handleApply}
            disabled={isProcessing || !imageLoaded}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Applica Ritaglio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
