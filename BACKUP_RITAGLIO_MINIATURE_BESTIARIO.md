# 📜 DOCUMENTO DI BACKUP COMPLETO & GUIDA ARCHITETTURALE
## Funzionalità: Ritaglio Immagini (Cropper), Inquadratura Miniature (Framer) & Bestiario D&D 5e

Questo documento contiene tutte le specifiche tecniche, componenti, schemi dati e frammenti di codice necessari per ricreare fedelmente e in qualsiasi momento le tre funzionalità chiave:
1. **Ritaglio Libero e Intelligente dell'Illustrazione del Mostro** (`ImageCropperModal`)
2. **Inquadratura & Zoom Miniatura 1:1** (`ThumbnailFramerModal` + Lightbox)
3. **Bestiario Completo D&D 5e** (`MonstersDb` + Form Dialog + Integrazione Compendio e Campagna)

---

## 1. SCHEMA DATI DEL MOSTRO (DATABASE & TYPESCRIPT)

### Struttura Typescript (`/src/lib/types.ts`)
```typescript
export interface Monster {
    id: string;
    campaignId?: string;
    name: string;
    type?: string;
    armorClass?: string;
    hitPoints?: string;
    challenge?: string;
    description?: string;
    imageUrl?: string | null;      // URL dell'illustrazione completa ritagliata (es. /api/assets/aarakocra_...jpg)
    thumbnailUrl?: string | null; // URL della miniatura quadrata 1:1 (es. /api/assets/aarakocra_thumb_...jpg)
    sourceBook?: string;          // 'mm', 'phb', 'dmg', 'homebrew'
    createdAt?: string;
    updatedAt?: string;
}
```

### Struttura Tabella SQLite (`/src/lib/db.ts`)
```sql
CREATE TABLE IF NOT EXISTS Monster (
    id TEXT PRIMARY KEY,
    campaignId TEXT,
    name TEXT NOT NULL,
    type TEXT,
    armorClass TEXT,
    hitPoints TEXT,
    challenge TEXT,
    description TEXT,
    imageUrl TEXT,
    thumbnailUrl TEXT,
    sourceBook TEXT DEFAULT 'mm',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. RITAGLIO AUTOMATICO DELL'ILLUSTRAZIONE DA IA (`cropMonsterIllustration`)

Quando Gemini analizza una pagina e restituisce `imageBox` con le coordinate normalizzate (0-1000 oppure 0.0-1.0):

```typescript
async function cropMonsterIllustration(
  originalBase64: string, 
  box?: { ymin: number; xmin: number; ymax: number; xmax: number } | null
): Promise<string> {
  if (!box || typeof window === 'undefined') return '';
  const { ymin, xmin, ymax, xmax } = box;
  if (ymin == null || xmin == null || ymax == null || xmax == null) return '';

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');

      const iw = img.width;
      const ih = img.height;

      // Rilevamento automatico scala (normalizzata 0.0-1.0 vs 0-1000)
      const maxVal = Math.max(ymin, xmin, ymax, xmax);
      const isAlreadyNormalized = maxVal <= 1.05;
      const scaleDivider = isAlreadyNormalized ? 1 : 1000;

      const x = Math.max(0, Math.floor((xmin / scaleDivider) * iw));
      const y = Math.max(0, Math.floor((ymin / scaleDivider) * ih));
      const w = Math.min(iw - x, Math.floor(((xmax - xmin) / scaleDivider) * iw));
      const h = Math.min(ih - y, Math.floor(((ymax - ymin) / scaleDivider) * ih));

      if (w <= 20 || h <= 20) return resolve('');

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve('');
    img.src = originalBase64;
  });
}
```

---

## 3. COMPONENTE RITAGLIO MANUALE (`ImageCropperModal.tsx`)

Il componente `/src/components/image-cropper-modal.tsx` include:
* Canvas reattivo per ritaglio manuale su 4 lati e 4 angoli con maniglie di trascinamento interattive (Pointer Events touch + mouse).
* Supporto alla rotazione libera dell'immagine (0°, 90°, 180°, 270°).
* Slider manuali percentuali di precisione (Alto, Basso, Sinistra, Destra).
* Esportazione su canvas in JPEG di alta qualità (0.90) con callback `onCropSave(croppedDataUrl)`.

---

## 4. COMPONENTE INQUADRATURA MINIATURA (`ThumbnailFramerModal.tsx`)

Il componente `/src/components/thumbnail-framer-modal.tsx` include:
* Inquadratore quadrato 1:1 con maschera circolare di anteprima token (D&D / VTT ready).
* Pan con trascinamento (Mouse o 1 dito).
* Pinch-to-zoom proporzionale (2 dita) + Slider di Zoom (da 0.5x a 3.8x) + rotellina del mouse.
* Rendering su canvas 320x320 pixel con centratura pixel-perfect e sfondo neutro `#0f172a`.
* Callback `onSaveThumbnail(thumbnailDataUrl)`.

---

## 5. COMPONENTE BESTIARIO (`MonstersDb.tsx`)

Il componente `/src/components/monsters-db.tsx` include:
* Lista e Griglia con ricerca in tempo reale per nome, tipo o ambientazione.
* Filtri a cascata per Grado di Sfida (GS) e Tipo Creatura (Umanoide, Immondo, Bestia, ecc.).
* Ordinamento alfabetico o per Grado di Sfida (crescente/decrescente).
* Card fisiche stile Manuale dei Mostri con:
  * Miniatura circolare e illustrazione in Lightbox cliccabile a schermo intero.
  * Tabella caratteristiche complete (FOR, DES, COS, INT, SAG, CAR).
  * Statistiche (CA, PF, Velocità).
  * Tratti, Azioni, Reazioni, Azioni Leggendarie e Riquadri renderizzati con Markdown completo.
* Pulsanti diretti di Modifica (`MonsterFormDialog`) e Rimozione con Alert Dialog di conferma.
* Tasto rapido per aprire direttamente il Ritaglio (`Scissors`) o la Miniatura (`Sparkles`) su qualsiasi mostro già esistente.
