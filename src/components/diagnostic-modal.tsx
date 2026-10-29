'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, RefreshCw, Check, X } from 'lucide-react';
import { SystemLogsViewer } from './system-logs-viewer';
import AiLogMonitor from './AiLogMonitor';

export function DiagnosticModal({ isOpen, onClose, debugLogData, isLoading, fetchDebugLog, handleImportFromDebugLog }: any) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] bg-background border-border p-5 flex flex-col overflow-hidden shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/80 shrink-0">
          <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Centro Diagnostico
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="log" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 text-xs sm:text-sm">
            <TabsTrigger value="log">Ultima Scansione</TabsTrigger>
            <TabsTrigger value="monitor">Monitoraggio</TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-y-auto py-3">
            <TabsContent value="log" className="m-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span>Lettura del file temporaneo in corso...</span>
                </div>
              ) : !debugLogData ? (
                <div className="text-center py-12 px-4 space-y-2 border border-dashed border-border/70 rounded-xl bg-muted/10">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">Nessun log temporaneo presente al momento</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <pre className="bg-black/80 text-emerald-300 border border-border/80 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-96 leading-relaxed shadow-inner">
                    {JSON.stringify(debugLogData, null, 2)}
                  </pre>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="monitor" className="m-0">
              <AiLogMonitor />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="pt-3 border-t border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDebugLog}
            disabled={isLoading}
            className="text-xs h-9 sm:h-8 border-border hover:bg-muted font-medium w-full sm:w-auto"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Aggiorna Log
          </Button>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {debugLogData && (debugLogData.summary?.monstersFound?.length > 0 || debugLogData.extractedData?.monsters?.length > 0) && (
              <Button
                size="sm"
                onClick={handleImportFromDebugLog}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-auto min-h-[36px] sm:min-h-[32px] py-1.5 px-3 shadow-sm flex items-center justify-center gap-1.5 w-full sm:w-auto text-wrap text-center"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>Importa nella Revisione ({debugLogData.summary?.monstersFound?.length || debugLogData.extractedData?.monsters?.length || 1})</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={onClose}
              className="bg-primary text-primary-foreground font-semibold text-xs h-9 sm:h-8 w-full sm:w-auto"
            >
              Chiudi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
