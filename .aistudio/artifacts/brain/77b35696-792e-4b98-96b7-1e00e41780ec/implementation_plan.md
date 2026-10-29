# Implementation Plan - Bestiary & Importer Fixes

## Objectives
1. **Thumbnail & Crop Persistence & Full-Page Framing**:
   - Ensure the thumbnail framer (`ThumbnailFramerModal`) receives the full scanned page (`rawPageImage` / `pageImages`) rather than only a cropped portrait, so the user can navigate and zoom across the whole page to create tokens.
   - Synchronize the visual preview display scale with the 2D canvas export scale for pixel-perfect cropping.
2. **Bestiary Formatting & Markdown Cleaning**:
   - Ability scores table rendered prominently at the top with RPG card layout.
   - Clean paragraph breaks, proper spacing for headers and bold tags (`**Abilità:** `, `**Sensi:** `), without raw symbols or unparsed markers.
3. **Complete Content Extraction & Maximum Token Ceiling**:
   - Raised `maxOutputTokens` to **32.768 token** across both `catalog-router.ts` and `extract-monsters.ts` to fully support multi-page monsters without truncation.
   - Added exhaustive system instructions to transcribe 100% of the text verbatim (including sections like *"Nemici del Male Elementale"*, *"Alla Ricerca dei Sette Frammenti"*, ecology, sidebars, and background lore).
4. **Duplicate Detection & Warning**:
   - In `actions.saveMonster` and `handleSaveMonster`, detect if a monster with the same name already exists in the campaign and prompt with `window.confirm` before overwriting.

## Completed Tasks
- [x] In `src/components/content-importer-new.tsx`, prioritize `rawPageImage` / `pageImages` when invoking `setFramerModal`.
- [x] In `src/components/thumbnail-framer-modal.tsx`, computed precise base scaling matching `renderThumbnailDataUrl` to ensure what is seen in the framing circle is pixel-identical to what is saved.
- [x] In `src/ai/flows/extractors/catalog-router.ts`, set `maxOutputTokens: 32768` and strengthened lore instructions.
- [x] In `src/ai/flows/extractors/extract-monsters.ts`, set `maxOutputTokens: 32768` and reinforced verbatim multi-page/multi-column extraction.
- [x] Verified compilation with `compile_applet` and linting with `lint_applet` (all passed successfully).
