/**
 * Utilità avanzata per la formattazione e pulizia automatica dei testi narrativi,
 * storie, dossier lore, cronache di sessione e regole D&D (Markdown).
 */

export function formatNarrativeText(rawText: string | null | undefined): string {
  if (!rawText) return '';
  
  let text = rawText;

  // 1. Normalizzazione fine riga (CRLF/CR -> LF)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Rimozione spazi bianchi a fine riga
  text = text.split('\n').map(line => line.trimEnd()).join('\n');

  // 3. Normalizzazione intestazioni Markdown (# Titolo, ## Sottotitolo, etc.)
  // Assicura che ci sia uno spazio tra gli '#' e il testo dell'intestazione
  text = text.replace(/^(\#{1,6})([^\#\s\n])/gm, '$1 $2');
  
  // Se un'intestazione è attaccata a una riga precedente senza a capo doppio, assicura la separazione
  text = text.replace(/([^\n])\n(\#{1,6}\s+[^\n]+)/g, '$1\n\n$2');

  // Assicura che dopo un'intestazione ci sia un a capo pulito
  text = text.replace(/^(\#{1,6}\s+[^\n]+)\n([^\n\#\s])/gm, '$1\n\n$2');

  // 4. Normalizzazione elenchi puntati e numerati
  // Assicura spazio dopo i marcatori di elenco (- item, * item, + item)
  text = text.replace(/^(\s*[-*+])([^\s\-*+\n])/gm, '$1 $2');
  // Assicura spazio dopo gli elenchi numerati (1. item)
  text = text.replace(/^(\s*\d+\.)([^\s\n])/gm, '$1 $2');

  // 5. Normalizzazione citazioni (Blockquotes: > Citazione)
  text = text.replace(/^(\s*>)([^\s>\n])/gm, '$1 $2');

  // 6. Normalizzazione separatori orizzontali (--- o ***)
  text = text.replace(/([^\n])\n(\s*[-*_]{3,}\s*)\n([^\n])/g, '$1\n\n$2\n\n$3');

  // 7. Pulizia sintassi Grassetto e Corsivo Markdown
  // Rimuove spazi errati all'interno di ** grassetto ** o * corsivo *
  text = text.replace(/\*\*\s+([^\*\n]+?)\s+\*\*/g, '**$1**');
  text = text.replace(/__\s+([^_\n]+?)\s+__/g, '__$1__');
  text = text.replace(/(?<!\*)\*\s+([^\*\n\s]+?)\s+\*(?!\*)/g, '*$1*');
  text = text.replace(/(?<!_)_\s+([^_\n\s]+?)\s+_(?!_)/g, '_$1_');

  // 8. Correzione punteggiatura prima/dopo grassetto/corsivo
  text = text.replace(/\*\*\s+([,\.\:\;\!\?])/g, '**$1');

  // Normalizza marcatori di azione con punto: es. **Sperone.** -> **Sperone:** 
  text = text.replace(/\*\*([^*]+?)\.\*\*(\s*)/g, '**$1:** ');
  text = text.replace(/\*\*([^*]+?):\*\*([^\s\n])/g, '**$1:** $2');

  // Separa parole incolonnate attaccate ai grassetti: es. "+5**Sensi:**" o "danni taglienti.**Giavellotto:**"
  text = text.replace(/([^\n\s])\s*\*\*([A-Za-zÀ-ÖØ-öø-ÿ0-9\s]+?)([:.]?)\*\*/g, '$1\n\n**$2:** ');

  // 9. Pulizia punteggiatura generale
  text = text.replace(/\s+([,\.\:\;\!\?])/g, '$1');

  // Assicura spazio dopo virgole, punti e virgola, due punti se seguiti da lettere (evitando URL, numeri come 3.5, etc.)
  text = text.replace(/([,;])([a-zA-ZàèéìòùÀÈÉÌÒÙ])/g, '$1 $2');
  text = text.replace(/(:)(?!\/\/|\d)([a-zA-ZàèéìòùÀÈÉÌÒÙ])/g, '$1 $2');
  
  // Assicura spazio dopo punto fermo, punto esclamativo e interrogativo se seguiti da lettere
  text = text.replace(/([\.\!\?])([A-ZÀÈÉÌÒÙ])/g, '$1 $2');
  
  // CORREZIONE SPECIFICA: Separa azioni incollate al punto fermo di fine danno
  text = text.replace(/([a-z])\.([A-Z][a-z]+)/g, '$1.\n$2');

  text = text.replace(/([a-zà-öø-ÿ0-9\)])\.([A-ZÀ-ÖØ-öø-ÿ])/g, '$1. $2');

  // 10. Normalizzazione trattini di dialogo narrativo
  // Es: inizio riga con "- " o "— "
  text = text.replace(/^(\s*)-\s+/gm, '$1— ');

  // 11. Normalizzazione punti di sospensione multipli (es: "....." -> "...")
  text = text.replace(/\.{4,}/g, '...');
  text = text.replace(/\?{2,}/g, '?');
  text = text.replace(/\!{2,}/g, '!');

  // 12. Pulizia righe vuote multiple (massimo 1 riga vuota tra paragrafi, cioè \n\n)
  text = text.replace(/\n{3,}/g, '\n\n');

  // 13. Trim finale
  return cleanAiHallucinatoryLoops(text.trim());
}

/**
 * Pulisce e formatta stringhe corte (es. titoli, sottotitoli, tag)
 */
export function formatTitleOrTag(str: string | null | undefined): string {
  if (!str) return '';
  const clean = cleanAiHallucinatoryLoops(str);
  return clean
    .replace(/\s+/g, ' ')
    .replace(/\s+([,\.\:\;\!\?])/g, '$1')
    .trim();
}

/**
 * Rimuove rigurgiti, loop degenerativi di prompt engineering e frammenti meta-linguistici
 * generati accidentalmente dai modelli di visione o linguaggio (es. "General text description...", "JSON pipelines...", ecc.)
 */
export function cleanAiHallucinatoryLoops(text: string | null | undefined): string {
  if (!text) return '';
  let clean = text;

  // Regex per intercettare l'inizio dei loop allucinatori di prompt engineering tipici dei generatori
  const hallucinatoryPattern = /(?:\bGeneral text description\b|\bstandard context parameters\b|\bcanonical dnd manuals\b|\bjson pipelines\b|\bunified json payload\b|\bpage scan completeness\b|\bspecification requirements standard\b|\brulesets explicitly defined\b|\bstrictly json valid\b|\bparsed payload array\b|\bdictionary entity schema\b|\bvalidation parsing directly\b|\bstandard validated output schema\b|\bparsed block output\b|\bstandard syntax structured json\b|\bstructured json output object\b|\bstandard output array result layout\b|\bstrictly object formatted\b|\bstandard parseable valid json\b|\bresponse payload structure\b|\barray format content wrapper\b|\bcontent wrapper structure format\b|\bparsed output sequence context\b|\btext formatted parsed json block\b|\bschema exact standard formatting\b|\bstandard result parsed list text\b|\bstrictly formatted structure cleanly\b|\bblock context output valid array\b|\binside json layout standard schema\b|\bstandardly json format result\b|\bdirectly contextually inside parsing\b|\bcompletely precisely properly correctly\b|\baccurately strictly json valid\b|\bparsed block output object text schema\b|\bstrictly exact standard valid json\b|\boutput format json object standard context\b|\bclean structure cleanly output result\b|\bresult format validation parsing directly\b|\bstrictly logic parsed context structure\b)[\s\S]*/i;

  if (hallucinatoryPattern.test(clean)) {
    clean = clean.replace(hallucinatoryPattern, '').trim();
  }

  // Rileva loop degenerativi di parole/frasi identiche ripetute 4 o più volte di seguito
  clean = clean.replace(/(\b[\w\s]{4,30}\b)(?:\s+\1){3,}/gi, '$1');

  return clean.trim();
}

/**
 * Pulisce e valida la riga del tipo di mostro (es. "Umanoide Medio (aarakocra), neutrale buono")
 * isolandola da testo lore sfuggito o allucinazioni di meta-prompt.
 */
export function sanitizeMonsterType(rawType: string | null | undefined): string {
  if (!rawType) return 'Mostro';
  let str = rawType.trim();

  // 1. Pulizia loop allucinatorio meta-prompt
  str = cleanAiHallucinatoryLoops(str);

  // 2. Se una parola di allucinazione è attaccata direttamente all'allineamento (es. "neutrale buonoGeneral text...")
  const alignmentCutoff = /(neutrale\s+buono|legale\s+buono|caotico\s+buono|legale\s+neutrale|caotico\s+neutrale|neutrale\s+puro|neutrale\s+malvagio|legale\s+malvagio|caotico\s+malvagio|non\s+allineato|qualsiasi\s+allineamento|senza\s+allineamento|neutrale|buono|malvagio|lawful\s+good|neutral\s+good|chaotic\s+good|lawful\s+neutral|chaotic\s+neutral|true\s+neutral|lawful\s+evil|neutral\s+evil|chaotic\s+evil|unaligned|any\s+alignment)([A-Za-z].*)$/i;
  
  const alignMatch = str.match(alignmentCutoff);
  if (alignMatch) {
    const trailing = alignMatch[2].trim();
    // Se la parte successiva non è una virgola o punteggiatura standard, ma parole di testo come "General...", tronchiamo all'allineamento
    if (trailing.length > 0 && !trailing.startsWith(',') && !trailing.startsWith('(')) {
      str = str.substring(0, alignMatch.index! + alignMatch[1].length).trim();
    }
  }

  // 3. Tronca alla prima riga se contiene a capo
  if (str.includes('\n')) {
    str = str.split('\n')[0].trim();
  }

  // 4. Rimuovi virgole o punti finali spuri
  str = str.replace(/[,\.\:\;]+$/, '').trim();

  // 5. Se la stringa è ancora insolitamente lunga (> 90 caratteri), estrai la struttura canonica
  if (str.length > 90) {
    const canonicalMatch = str.match(/^([A-Za-zàèéìòùÀÈÉÌÒÙ\s\(\)\'\-]+?,\s*(?:neutrale buono|legale buono|caotico buono|legale neutrale|caotico neutrale|neutrale puro|neutrale malvagio|legale malvagio|caotico malvagio|non allineato|qualsiasi allineamento|senza allineamento|neutrale|buono|malvagio))/i);
    if (canonicalMatch) {
      str = canonicalMatch[1].trim();
    } else {
      str = str.substring(0, 85).trim();
    }
  }

  return str || 'Mostro';
}

/**
 * Pulisce e standardizza il nome della creatura/mostro, eliminando suffissi
 * spuri come (Statblock), (Scheda), (Statistiche), (Lore), (Illustrazione), ecc.
 */
export function sanitizeMonsterName(name: string | null | undefined): string {
  if (!name) return '';
  let clean = name.trim();
  clean = cleanAiHallucinatoryLoops(clean);
  
  // Rimuove suffissi tra parentesi o in coda
  clean = clean.replace(/\s*\((?:statblock|stat block|statistiche|scheda|stats|lore|narrazione|illustrazione|artwork|immagine|token|art|figura|disegno|parte \d+|continua)\)/gi, '').trim();
  clean = clean.replace(/[\s\-_–—]+(?:statblock|stat block|scheda|lore|statistiche)\s*$/i, '').trim();
  clean = clean.replace(/[\s\-_–—]+(?:pag\.?|pagine?|p\.)?\s*\d+\s*$/i, '').trim();

  // Rimuove duplicazioni immediate es. "Aarakocra Aarakocra"
  const words = clean.split(/\s+/);
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    clean = words[0];
  }
  if (clean.length >= 6 && clean.length % 2 === 0) {
    const half = clean.length / 2;
    if (clean.substring(0, half).toLowerCase() === clean.substring(half).toLowerCase()) {
      clean = clean.substring(0, half);
    }
  }

  return formatTitleOrTag(clean);
}

