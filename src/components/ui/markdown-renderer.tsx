'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
  entities?: { name: string; type: 'Monster' | 'MagicItem' | 'Npc'; description: string; stats?: any }[];
  onEntityClick?: (entity: any) => void;
}

export function MarkdownRenderer({ content, className, entities, onEntityClick }: MarkdownRendererProps) {
  if (!content) return null;

  let processedContent = content;
  const tokens: { id: string; value: string }[] = [];
  let tokenCounter = 0;

  const addToken = (value: string) => {
    const id = `___MD_TOKEN_${tokenCounter++}___`;
    tokens.push({ id, value });
    return id;
  };

  // 1. Proteggi i blocchi di codice (fenced code blocks)
  processedContent = processedContent.replace(/```[\s\S]*?```/g, (match) => addToken(match));

  // 2. Proteggi il codice inline
  processedContent = processedContent.replace(/`[^`\n]+`/g, (match) => addToken(match));

  // 3. Proteggi i link esistenti (standard markdown e formati comuni come [[Nome]](url))
  // Gestiamo anche link parziali o rotti che iniziano con [
  processedContent = processedContent.replace(/\[{1,2}([^\]]+)\]{1,2}\s*\(\s*([^\)]+)\s*\)/g, (match, name, url) => {
    // Se è già un link a un'entità, normalizziamolo per il rendering
    if (url.startsWith('entity:') || url.includes('https://entity/')) {
        const cleanName = name.replace(/[\[\]]/g, '').trim();
        return addToken(`[${cleanName}](https://entity/${encodeURIComponent(cleanName)})`);
    }
    return addToken(match);
  });

  // 4. Auto-linking dei nomi delle entità nel testo "pulito"
  if (entities && entities.length > 0) {
    // Ordina per lunghezza decrescente per evitare che nomi corti "rubino" parti di nomi lunghi
    const sortedEntities = [...entities].sort((a, b) => b.name.length - a.name.length);
    
    sortedEntities.forEach(entity => {
      if (!entity.name || entity.name.length < 3) return;
      
      const escapedName = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Regex: confini di parola, non preceduto da [ o seguito da ] o parte di un token
      // Usiamo una strategia di sostituzione che evita di ri-processare stringhe già sostituite
      const regex = new RegExp(`(?<![\\w\\[_])(${escapedName})(?![\\w\\]_])`, 'gi');
      
      processedContent = processedContent.replace(regex, (match) => {
        // Avvolgiamo in un token immediatamente per evitare che altre entità lo sovrascrivano
        return addToken(`**[${match}](https://entity/${encodeURIComponent(match)})**`);
      });
    });
  }

  // 5. Ripristina i token in ordine inverso (per gestire eventuali token annidati se mai capitassero, 
  // anche se qui li abbiamo evitati)
  for (let i = tokens.length - 1; i >= 0; i--) {
    processedContent = processedContent.replace(tokens[i].id, tokens[i].value);
  }

  const components = {
    a: ({node, href, children, ...props}: any) => {
        if (href && (href.startsWith('https://entity/') || href.startsWith('entity:'))) {
            const entityName = decodeURIComponent(href.replace('https://entity/', '').replace('entity:', ''));
            const entity = entities?.find(e => e.name.toLowerCase() === entityName.toLowerCase() || e.name === entityName);
            
            return (
                <span 
                    className="cursor-pointer text-amber-500 hover:text-amber-400 font-bold underline decoration-amber-500/30 underline-offset-4"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEntityClick?.(entity || { name: entityName, type: 'Npc', description: 'Entità della campagna.' });
                    }}
                >
                    {children}
                </span>
            );
        }
        return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    }
  };

  return (
    <div
      className={cn(
        'prose prose-invert max-w-none break-words leading-relaxed',
        'prose-headings:font-headline prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-xl sm:prose-h1:text-2xl prose-h1:border-b prose-h1:border-border/40 prose-h1:pb-2 prose-h1:mt-4 prose-h1:mb-2',
        'prose-h2:text-lg sm:prose-h2:text-xl prose-h2:border-b prose-h2:border-border/30 prose-h2:pb-1.5 prose-h2:mt-4 prose-h2:mb-2',
        'prose-h3:text-base sm:prose-h3:text-lg prose-h3:text-foreground/95 prose-h3:mt-3 prose-h3:mb-1.5',
        'prose-h4:text-sm sm:prose-h4:text-base prose-h4:font-medium prose-h4:mt-2.5 prose-h4:mb-1',
        'prose-p:my-2 prose-p:text-foreground/90 leading-relaxed',
        'prose-strong:text-foreground prose-strong:font-bold prose-strong:text-amber-300/90 dark:prose-strong:text-amber-200/95',
        'prose-em:italic prose-em:text-foreground/85',
        'prose-ul:my-2.5 prose-ul:list-disc prose-ul:pl-5 prose-ul:space-y-1',
        'prose-ol:my-2.5 prose-ol:list-decimal prose-ol:pl-5 prose-ol:space-y-1',
        'prose-li:my-0.5 prose-li:text-foreground/90',
        'prose-blockquote:border-l-2 prose-blockquote:border-accent prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-3 prose-blockquote:text-muted-foreground',
        'prose-hr:my-4 prose-hr:border-border/50',
        'prose-table:my-3 prose-table:w-full prose-table:border-collapse',
        'prose-th:border prose-th:border-border/60 prose-th:p-2 prose-th:bg-muted/30 prose-th:text-left prose-th:font-semibold',
        'prose-td:border prose-td:border-border/40 prose-td:p-2',
        'prose-code:bg-muted/40 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono',
        className
      )}
    >
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        components={components}
        urlTransform={(url) => url}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
