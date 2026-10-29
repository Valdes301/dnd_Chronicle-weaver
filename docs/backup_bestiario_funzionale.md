# Backup Funzionalità Estrattiva Bestiario (Ritaglio, Miniature, Parsing)

## 1. Struttura del Parsing (Azioni Server-Side)
- **File**: `/src/lib/actions.ts`
- **Funzione chiave**: `catalogHandbookAction`
- **Logica di estrazione**:
  - Utilizza `safeGenerateContent` per inviare l'immagine (Base64) e il prompt al modello.
  - Il prompt è definito in `/src/ai/flows/catalog-handbook.ts` (flusso Genkit).
  - La risposta deve essere un JSON che segue lo schema `CatalogHandbookOutputSchema` (Items, Monsters, Spells, Skills, Rules).
  - **Dettaglio critico**: La struttura della chiamata `safeGenerateContent` deve passare l'array `contents` direttamente (o come `parts: contents`), senza wrapper di `role: "user"` che causano allucinazioni o risposte vuote `{}`.
  - **Deduplicazione**: Utilizza `Map` per unire i risultati basandosi sui nomi normalizzati (lowercase trim).

## 2. Gestione Ritaglio Illustrazioni (Client-Side)
- **File**: `/src/components/content-importer.tsx`
- **Funzione chiave**: `cropMonsterIllustration`
- **Logica**:
  - Crea un canvas HTML5 temporaneo.
  - Riceve il `base64Data` dell'immagine originale e un oggetto `box` con coordinate `ymin`, `xmin`, `ymax`, `xmax`.
  - Calcola la scala (0-1000 vs 0-1) e le dimensioni del ritaglio.
  - `ctx.drawImage` esegue il ritaglio reale.
  - Restituisce il nuovo `dataURL` (JPEG 85% qualità).

## 3. Gestione Miniature (Client-Side)
- **File**: `/src/components/content-importer.tsx`
- **Funzione chiave**: `ThumbnailFramerModal`
- **Logica**:
  - Interfaccia UI dedicata per posizionare l'inquadratura sulla creatura.
  - Simile al ritaglio, ma finalizzata a generare un'icona piccola per la lista del bestiario.

## 4. Salvataggio Mostri nel Bestiario
- **File**: `/src/lib/db-actions.ts` (o simili azioni di database)
- **Logica di salvataggio**:
  - Il salvataggio avviene dopo che `mergeAndDeduplicateResults` ha validato le entità.
  - Le entità (mostri) vengono trasformate nel formato atteso dal DB (Drizzle schema).
  - Necessario assicurarsi che `imageUrl` e `thumbnailUrl` (i DataURI elaborati dal frontend) siano correttamente salvati come stringhe o caricati su un bucket di storage esterno (se previsto).
  - La transazione DB deve essere atomica per evitare salvataggi parziali.

## 5. Modelli Gemini Consigliati
- **Modelli Primari**: 
  - `gemini-3.5-flash`: Bilanciamento ottimo per estrazione dati complessi da immagini.
  - `gemini-3.7-flash`: Massima precisione per testi tecnici (statistiche mostri).
- **Rete di Sicurezza (Quota Limit Exceeded)**:
  - **File**: `/src/ai/genai-client.ts`
  - **Strategia**: Utilizzare `modelsToTry` in `safeGenerateContent` con `gemini-3.5-flash` e `gemini-2.5-flash` come fallback automatico.
  - Gestione automatica dell'errore `RESOURCE_EXHAUSTED` (429) con `setTimeout` (backoff esponenziale) e cambio modello automatico.
