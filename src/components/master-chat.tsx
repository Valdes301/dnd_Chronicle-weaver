'use client';

import { useState, useEffect } from 'react';
import * as actions from '@/lib/actions';

export default function MasterChat() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    const res = await actions.getChatMessagesAction();
    if (res.success && res.data) {
      setMessages(res.data);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    setLoading(true);
    
    // Save User message
    await actions.saveChatMessageAction(input, 'master');

    // Call API
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
    });
    const data = await response.json();

    // Save AI response
    await actions.saveChatMessageAction(data.text, 'ai');
      
    setInput('');
    setLoading(false);
    loadMessages();
  };

  return (
    <div className="flex flex-col h-full bg-card/75 backdrop-blur-md text-foreground rounded-xl border border-border/80 shadow-md overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-xs italic">
            Nessun messaggio ancora. Scrivi qualcosa per iniziare a dialogare con l&apos;assistente.
          </div>
        ) : (
          messages.map(m => (
            <div 
              key={m.id} 
              className={`p-3 rounded-lg text-xs leading-relaxed max-w-[85%] ${
                m.sender === 'master' 
                  ? 'bg-primary/10 border border-primary/30 text-foreground ml-auto' 
                  : 'bg-muted/50 border border-border/70 text-card-foreground mr-auto'
              }`}
            >
              <div className="font-semibold text-[11px] mb-1 text-primary">
                {m.sender === 'master' ? 'Master' : 'Assistente AI'}:
              </div>
              <div>{m.content}</div>
            </div>
          ))
        )}
      </div>
      <div className="p-3 border-t border-border/60 bg-card/50">
        <div className="flex gap-2">
          <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            className="flex-1 bg-background/60 border border-input text-foreground text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" 
            placeholder="Chiedi al Master AI..."
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button 
            onClick={sendMessage} 
            disabled={loading || !input.trim()} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? '...' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}
