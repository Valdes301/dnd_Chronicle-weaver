'use client';

import React, { useState, useEffect } from 'react';
import { Copy, Terminal, X } from 'lucide-react';

export default function AiLogMonitor() {
  const [logs, setLogs] = useState<string>('');
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/logs/export', { cache: 'no-store' });
        if (!response.ok) {
            console.error('Risposta API fallita:', response.status, response.statusText);
            return;
        }
        const content = await response.text();
        setLogs(content);
      } catch (error) {
        // Silenzioso in caso di temporanea disconnessione o riavvio server
      }
    };

    // Polling ogni 2 secondi per aggiornare la UI in tempo reale
    const interval = setInterval(fetchLogs, 2000);
    fetchLogs();

    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(logs);
    alert('Log copiati negli appunti!');
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-zinc-900 text-green-400 p-4 rounded-lg shadow-sm border border-zinc-700 flex flex-col mt-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Terminal size={16} /> Monitoraggio
        </h3>
        <div className="flex gap-2">
          <button onClick={copyToClipboard} className="p-1 hover:bg-zinc-700 rounded" title="Copia Log">
            <Copy size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 font-mono text-xs whitespace-pre-wrap">
        {logs || 'In attesa di log...'}
      </div>
    </div>
  );
}
