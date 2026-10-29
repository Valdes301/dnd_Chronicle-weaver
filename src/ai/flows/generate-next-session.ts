'use server';

/**
 * @fileOverview Flow avanzato per la generazione granulare di sessioni/quest D&D 5e
 * con controllo approfondito su riassunti, PG, agganci precedenti, PNG con ruoli,
 * oggetti, magie, luoghi e calcolo dettagliato dei Punti Esperienza (PX / XP).
 * Produce una quest completa, ricca e pronta all'uso senza sintesi sbrigative,
 * corredata da schede dedicate per PNG, Oggetti Magici e Mostri pronti all'importazione.
 */

import {storyAi as ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getGenAI, safeGenerateContent, getActiveFlashModel } from '@/ai/genai-client';

import {
  GenerateNextSessionInputSchema,
  GenerateNextSessionOutputSchema,
  type GenerateNextSessionInput,
  type GenerateNextSessionOutput
} from '@/lib/quest-types';

export async function generateNextSession(
  input: GenerateNextSessionInput
): Promise<GenerateNextSessionOutput> {
  return generateNextSessionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateNextSessionPrompt',
  input: {schema: GenerateNextSessionInputSchema},
  output: {schema: GenerateNextSessionOutputSchema},
  config: {
    maxOutputTokens: 8192,
    temperature: 0.75,
  },
  prompt: `{{#if systemOverride}}{{{systemOverride}}}{{else}}Sei un Dungeon Master leggendario di Dungeons & Dragons 5e e un maestro della narrazione fantasy. Il tuo compito è creare un'avventura/sessione di D&D ricca, complessa, visiva, con prosa immersiva in lingua italiana, pronta per essere giocata direttamente al tavolo da gioco.{{/if}}

---
**REGOLA TASSATIVA ED IMPERATIVO CATEGORICO (PLAYER AGENCY):**
NON scrivere, decidere o descrivere MAI cosa dicono, pensano, fanno, muovono o lanciano (incantesimi, abilità, gesti) i Personaggi Giocanti (PG). I PG sono controllati ESCLUSIVAMENTE dai giocatori reali durante la sessione. 
Il tuo compito è preparare l'ambientazione, le insidie, le battute dei PNG, le descrizioni sensoriali ed i bivi tattici/morali per il Master. I PG sono coinvolti solo come destinatari degli eventi o dei ganci narrativi.

---
**MASSIMA RICCHEZZA NARRATIVA E DIVIETO DI SINTESI (NO SUMMARY / NO SINTESI):**
Non limitarti a una scaletta, un riassunto o una traccia generica! Il Master deve poter aprire questa quest e giocarla riga per riga. Fornisci:
1. **Scene narrative estese e profonde:** Dettaglia l'ambientazione, i pericoli latenti, gli indizi visivi e auditivi.
2. **Descrizioni sensoriali d'ambiente (Read-Aloud Boxes):** Per ogni scena o transizione, includi sempre un riquadro in citazione Markdown (> ...) scritto in prosa evocativa al presente da leggere ad alta voce ai giocatori al tavolo.
3. **Dialoghi scenici completi dei PNG:** Scrivi le battute per esteso, specificando tra parentesi quadre tono di voce, mimica facciale, posture fisiche ed emozioni celate.
4. **Meccaniche D&D 5e e Prove di Abilità:** Includi sempre prove precise con CD (Classe Difficoltà) esplicite (es. "CD 14 Saggezza (Percezione) per notare...", "CD 15 Intelligenza (Indagare)", "CD 13 Carisma (Persuasione)", "Trappola a dardi avvelenati: CD 14 per disarmarla, altrimenti 2d8 veleno").
5. **Combattimenti e Tattica:** Se è presente uno scontro, descrivi l'ambiente (ripari, dislivelli, pericoli ambientali) e la tattica turno per turno adottata dai nemici.
6. **Bivi Decisionali del Master:** Espliciti rami ("Se il party tratta...", "Se tentano l'assalto furtivo...", "In caso di fallimento...").
7. **Colpo di scena & Climax drammatico:** Una svolta avvincente e memorabile.
8. **Ricompense e Bottino dettagliato:** Monete, pergamene e tesori.

---
**GENERAZIONE OBBLIGATORIA DELLE SCHEDE ENTITÀ ('entities'):**
Genera SEMPRE nell'array 'entities' le schede complete per TUTTI i PNG chiave, gli Oggetti Magici o Mostri rilevanti emersi nella quest, pronte per essere importate dal Master nel database della campagna:
- **Per ogni PNG (type: 'NPC'):**
  - 'name': Nome completo con titolo o soprannome
  - 'type': 'NPC'
  - 'description': Descrizione estetica, retroscena, personalità, legami e segreto inconfessabile
  - 'stats': {
      "race": "es. Elfo dei Boschi, Nano, Tiefling",
      "role": "Ruolo nella quest (es. Amico mercante, Sacerdote corrotto)",
      "alignment": "es. Legale Neutrale, Caotico Buono",
      "cr": "es. GS 2 o Livello 4",
      "armorClass": "es. 15 (Armatura di cuoio borchiato)",
      "hitPoints": "es. 42 (6d8 + 12)",
      "speed": "es. 9 m",
      "attributes": { "str": 10, "dex": 16, "con": 14, "int": 12, "wis": 15, "cha": 16 },
      "skills": "es. Percezione +4, Furtività +5, Intuizione +4",
      "traits": "Tratti distintivi e capacità speciali",
      "actions": "Azioni di combattimento con bonus al tiro per colpire e dadi di danno",
      "personality": "Tratti caratteriali, ideali, legami, difetti",
      "secret": "Segreto o motivazione nascosta"
    }
- **Per ogni Oggetto Magico o Ricompensa speciale (type: 'MagicItem'):**
  - 'name': Nome dell'oggetto
  - 'type': 'MagicItem'
  - 'description': Descrizione visiva, aura magica e storia antica dell'artefatto
  - 'stats': {
      "itemType": "es. Arma (Stocco), Armatura, Bacchetta, Anello, Oggetto Meraviglioso",
      "rarity": "Comune | Non Comune | Rara | Molto Rara | Leggendaria",
      "attunement": "Sì (richiede sintonia da un incantatore) oppure No",
      "properties": "Proprietà meccaniche complete D&D 5e: bonus ai tiri, danni aggiuntivi, incantesimi concessi, cariche giornaliere",
      "cost": "es. 400 mo"
    }
- **Per ogni Mostro / Minaccia speciale (type: 'Monster'):**
  - 'name': Nome creatura
  - 'type': 'Monster'
  - 'description': Aspetto mostruoso, comportamento e motivazione
  - 'stats': {
      "type": "es. Non Morto, Aberrazione, Mostruosità",
      "challenge": "es. 3 (700 PX)",
      "armorClass": "es. 14 (Armatura naturale)",
      "hitPoints": "es. 58 (9d8 + 18)",
      "speed": "es. 9 m, Scavare 4.5 m",
      "attributes": { "str": 16, "dex": 12, "con": 15, "int": 6, "wis": 10, "cha": 5 },
      "traits": "Capacità passive, resistenze o vulnerabilità",
      "actions": "Attacchi completi con portata, tiri per colpire e danni",
      "tactics": "Comportamento tattico in battaglia"
    }

---
**AMBIENTAZIONE E CAMPAGNA:**
* **Nome Campagna:** {{{campaignName}}}
* **Mondo / Ambientazione:** {{{campaignSetting}}}

{{#if homebrewRules}}
**REGOLE DELLA CASA (HOMEBREW) OBBLIGATORIE:**
{{{homebrewRules}}}
{{/if}}

{{#if campaignSummary}}
**QUADRO GENERALE DELLA CAMPAGNA / MACRO-TRAMA (ARCO ATTIVO):**
{{{campaignSummary}}}
{{/if}}

{{#if loreContext}}
**DOSSIER DI LORE, CITTÀ E FAZIONI (SELEZIONATI DAL MASTER):**
{{{loreContext}}}
{{/if}}

{{#if recentSessionsSummary}}
**ESTRATTO ULTIME SESSIONI PRECEDENTI (CONTINUITÀ NARRATIVA):**
{{{recentSessionsSummary}}}
{{/if}}

---
**PARTY DI PERSONAGGI GIOCANTI (SOLO PER IL BILANCIAMENTO DELLE SFIDE D&D 5e):**
Usa la classe ed il livello del gruppo SOLO per calcolare il Grado di Sfida (GS) dei mostri, le trappole ed il totale di Punti Esperienza (PX):
'''
{{{playerCharacters}}}
'''

{{#if granularDirectives}}
---
**DIRETTIVE GRANULARI E CONTESTO SELEZIONATO DAL MASTER:**
{{{granularDirectives}}}
{{/if}}

---
**OBIETTIVO E RICHIESTA DELLA SESSIONE:**
{{#if modificationRequest}}
**Bozza Precedente da Modificare:**
\`\`\`
{{{storyToModify}}}
\`\`\`
**Istruzioni di Revisione:** "{{{modificationRequest}}}"
{{else}}
**Prompt Principale del Master:** "{{{customPrompt}}}"
{{/if}}

---
**FORMATO DI OUTPUT OBBLIGATORIO:**
- 'titleProposal': Titolo epico della quest.
- 'sessionOutline': Testo narrativo completo in Markdown esteso, ricchissimo di scene, descrizioni > ..., dialoghi reali e bivi del Master.
- 'xpAward': Totale PX bilanciato secondo il livello del party.
- 'xpDetails': Dettaglio suddiviso in combattimento, traguardi, esplorazione e roleplay.
- 'entities': Array completo con le schede dedicate per tutti i PNG, Oggetti Magici e Mostri rilevanti.
`,
});

function formatStructuredSessionToMarkdown(data: any): { title: string; markdown: string; xp: number; entities: any[] } {
  const session = data?.sessione || data;
  const title = session?.titolo || session?.title || data?.titolo_sessione || data?.titleProposal || 'Nuova Quest';
  
  const xp = typeof session?.xp_totale_previsto === 'number'
    ? session.xp_totale_previsto
    : (typeof data?.xpAward === 'number' 
        ? data.xpAward 
        : (typeof session?.xp_totali_sessione === 'number' 
            ? session.xp_totali_sessione 
            : 300));

  const sections: string[] = [];

  // Intestazione
  sections.push(`# ${title}`);

  // Metadati di sessione
  const meta: string[] = [];
  if (data?.campagna) meta.push(`**Campagna:** ${data.campagna}`);
  if (data?.ambientazione || session?.ambientazione) meta.push(`**Ambientazione:** ${data?.ambientazione || session?.ambientazione}`);
  if (session?.tono) meta.push(`**Tono:** ${session.tono}`);
  if (session?.difficoltà || session?.difficolta) meta.push(`**Difficoltà:** ${session.difficoltà || session.difficolta}`);
  if (xp) meta.push(`**PX Totali Stimati:** ${xp} PX`);
  if (meta.length > 0) sections.push(meta.join(' | '));

  // Ganci personali per i PG
  const ganci = session?.ganci_personali || data?.ganci_personali || data?.ganci_narrativi_pg || session?.ganci_narrativi;
  if (Array.isArray(ganci) && ganci.length > 0) {
    const lines = ganci.map((g: any) => {
      const pg = g.personaggio || g.nome_pg || 'Personaggio';
      const elemento = g.elemento_scheda ? ` *(${g.elemento_scheda})*` : '';
      const hook = g.gancio || g.connessione_narrativa || (typeof g === 'string' ? g : JSON.stringify(g));
      return `- **${pg}**${elemento}: ${hook}`;
    });
    sections.push(`## Ganci Narrativi e Personali per i PG\n${lines.join('\n')}`);
  }

  // Incontri / Scene
  const incontri = session?.incontri || data?.incontri || data?.incontri_dettagliati || session?.scene;
  if (Array.isArray(incontri) && incontri.length > 0) {
    sections.push(`## Svolgimento dell'Avventura & Scene Dettagliate`);
    incontri.forEach((inc: any, i: number) => {
      const num = i + 1;
      const nome = inc.nome || inc.titolo || `Scena ${num}`;
      const tipo = inc.tipo ? ` [${inc.tipo}]` : '';
      const parts: string[] = [`### Scena ${num}: ${nome}${tipo}`];

      if (inc.descrizione) {
        parts.push(`> ${inc.descrizione}`);
      }
      if (inc.interazione) {
        parts.push(`**Interazione Sociale & Ambientale:**\n${inc.interazione}`);
      }
      if (inc.sfida) {
        parts.push(`**Sfida Tattica, Pericoli & Prove D&D 5e:**\n${inc.sfida}`);
      }
      if (inc.dialoghi) {
        parts.push(`**Dialoghi Scenici dei PNG:**\n${typeof inc.dialoghi === 'string' ? inc.dialoghi : JSON.stringify(inc.dialoghi)}`);
      }
      if (inc.opzioni_master || inc.bivi) {
        parts.push(`**Bivi Decisionali del Master:**\n${typeof (inc.opzioni_master || inc.bivi) === 'string' ? (inc.opzioni_master || inc.bivi) : JSON.stringify(inc.opzioni_master || inc.bivi)}`);
      }
      sections.push(parts.join('\n\n'));
    });
  } else if (data?.struttura_atti || session?.struttura_atti) {
    const atti = data?.struttura_atti || session?.struttura_atti;
    sections.push(`## Struttura dell'Avventura in Atti`);
    Object.entries(atti).forEach(([k, v]: [string, any]) => {
      sections.push(`### ${v.titolo || k}\n${v.descrizione || JSON.stringify(v)}`);
    });
  }

  // Colpo di scena
  const twist = session?.colpo_di_scena || data?.colpo_di_scena || session?.plot_twist;
  if (twist) {
    sections.push(`## Colpo di Scena / Sviluppo Imprevisto\n${twist}`);
  }

  // Ricompense & Bottino
  const ricompensa = session?.ricompensa || data?.ricompensa || session?.tesoro;
  if (ricompensa) {
    let ricompensaText = '## Ricompense & Tesoro\n';
    if (typeof ricompensa === 'string') {
      ricompensaText += ricompensa;
    } else if (Array.isArray(ricompensa)) {
      ricompensaText += ricompensa.map((r: any) => `- ${typeof r === 'string' ? r : JSON.stringify(r)}`).join('\n');
    } else if (typeof ricompensa === 'object') {
      if (ricompensa.oggetti && Array.isArray(ricompensa.oggetti)) {
        ricompensaText += `**Oggetti & Bottino:**\n` + ricompensa.oggetti.map((o: any) => `- ${typeof o === 'string' ? o : JSON.stringify(o)}`).join('\n') + '\n\n';
      }
      if (ricompensa.monete || ricompensa.oro) {
        ricompensaText += `**Monete:** ${ricompensa.monete || ricompensa.oro}\n\n`;
      }
      if (ricompensa.note) {
        ricompensaText += `**Note Ricompensa:** ${ricompensa.note}\n`;
      }
    }
    sections.push(ricompensaText.trim());
  }

  // Estrazione entità se presenti nel payload strutturato
  const extractedEntities: any[] = [];
  if (Array.isArray(data?.entities) && data.entities.length > 0) {
    extractedEntities.push(...data.entities);
  } else if (Array.isArray(session?.entities) && session.entities.length > 0) {
    extractedEntities.push(...session.entities);
  }

  // Se non ci sono entità ma ci sono oggetti in ricompensa, trasformiamoli in entità MagicItem
  if (extractedEntities.length === 0 && ricompensa && typeof ricompensa === 'object' && Array.isArray(ricompensa.oggetti)) {
    ricompensa.oggetti.forEach((og: any) => {
      const name = typeof og === 'string' ? og : (og.nome || og.name || 'Oggetto Magico');
      extractedEntities.push({
        name,
        type: 'MagicItem',
        description: `Trovato durante la quest ${title}.`,
        stats: {
          rarity: 'Non Comune',
          attunement: 'No',
          properties: typeof og === 'string' ? og : (og.descrizione || og.effetti || 'Oggetto prezioso da quest.'),
          cost: '150 mo'
        }
      });
    });
  }

  return {
    title,
    markdown: sections.join('\n\n'),
    xp,
    entities: extractedEntities
  };
}

function cleanAndEnsureMarkdown(rawText: string, fallbackTitle: string = 'Nuova Quest'): { title: string; markdown: string; xp?: number; entities?: any[] } {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { title: fallbackTitle, markdown: 'Nessun contenuto narrativo generato.' };
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.sessionOutline && typeof parsed.sessionOutline === 'string' && !parsed.sessionOutline.trim().startsWith('{')) {
        return {
          title: parsed.titleProposal || fallbackTitle,
          markdown: parsed.sessionOutline.trim(),
          xp: typeof parsed.xpAward === 'number' ? parsed.xpAward : undefined,
          entities: Array.isArray(parsed.entities) ? parsed.entities : []
        };
      }
      if (parsed.sessione || parsed.incontri || parsed.ganci_personali || parsed.struttura_atti || parsed.campagna) {
        const transformed = formatStructuredSessionToMarkdown(parsed);
        return {
          title: transformed.title || fallbackTitle,
          markdown: transformed.markdown,
          xp: transformed.xp,
          entities: transformed.entities
        };
      }
    } catch {}
  }

  return { title: fallbackTitle, markdown: trimmed };
}

const generateNextSessionFlow = ai.defineFlow(
  {
    name: 'generateNextSessionFlow',
    inputSchema: GenerateNextSessionInputSchema,
    outputSchema: GenerateNextSessionOutputSchema,
  },
  async input => {
    try {
      const {output} = await prompt(input);
      if (output && output.sessionOutline && output.sessionOutline.trim().length > 10) {
        const processed = cleanAndEnsureMarkdown(output.sessionOutline, output.titleProposal || 'Nuova Quest');
        return {
          titleProposal: processed.title || output.titleProposal || 'Nuova Quest',
          sessionOutline: processed.markdown,
          xpAward: processed.xp ?? output.xpAward ?? 300,
          xpDetails: output.xpDetails || undefined,
          entities: (output.entities && output.entities.length > 0) ? output.entities : (processed.entities || [])
        };
      }
    } catch (e: any) {
      console.warn("[generateNextSessionFlow] Genkit prompt parsing warning/fallback:", e?.message || e);
    }

    // Direct Gemini SDK Fallback with safe JSON parsing & explicit schema enforcement
    const genAi = getGenAI();
    const model = input.selectedModel || getActiveFlashModel('STORY');
    const baseSystemInstruction = input.systemOverride
      ? `${input.systemOverride}\n\nSEI UN DUNGEON MASTER LEGGENDARIO DI D&D 5e E UN MAESTRO DELLA NARRAZIONE FANTASY.`
      : `Sei un Dungeon Master leggendario di D&D 5e e un maestro della narrazione fantasy.`;

    const systemInstruction = `${baseSystemInstruction}

MASSIMA RICCHEZZA NARRATIVA (DIVIETO ASSOLUTO DI SINTESI):
Crea una quest COMPLETA, DETTAGLIATA ed ENTUSIASMANTE. Non riassumere o abbozzare.
- Scene lunghe, vivide, con riquadri in citazione Markdown (> ...) da leggere ad alta voce ai giocatori al tavolo.
- Dialoghi completi dei PNG scritti per esteso con sfumature di voce e mimica.
- Meccaniche D&D 5e con Classi Difficoltà (CD) specifiche per ogni prova, pericoli ambientali, trappole e tattiche di combattimento.
- Bivi espliciti per il Dungeon Master ("Se i PG fanno A...", "Se fanno B...").
- Schede complete per PNG ed Oggetti Magici nell'array 'entities'.
- Rispetta sempre la Player Agency: non forzare mai pensieri o azioni dei PG.

RISPONDI ESCLUSIVAMENTE IN FORMATO JSON VALIDO CON QUESTA STRUTTURA ESATTA:
{
  "titleProposal": "Titolo Epico della Quest",
  "sessionOutline": "# Titolo della Quest\\n\\n> Descrizione d'atmosfera sensoriale da leggere ad alta voce per i giocatori...\\n\\n### Scena 1: Arrivo al Santuario Corrotto\\n...\\n\\n**Dialoghi PNG:**\\n- **Maelor (Sacerdote Caduto)**: *[Con voce roca e sguardo febbrile]* \\\"Non comprendete ciò che è sepolto qui...\\\"\\n\\n**Prove di Abilità (D&D 5e):**\\n- **CD 14 Saggezza (Percezione):** Per scorgere...\\n\\n### Bivi Decisionali del Master:\\n- **Se i PG tentano la via diplomatica:** ...\\n- **Se scatta il combattimento:** ...",
  "xpAward": 500,
  "xpDetails": {
    "combatXp": 250,
    "questMilestoneXp": 150,
    "explorationXp": 50,
    "roleplayDilemmaXp": 50,
    "xpBreakdownNotes": "250 PX scontro guardiani + 150 PX purificazione santuario + 100 PX esplorazione e roleplay"
  },
  "entities": [
    {
      "name": "Maelor il Custode Corrotto",
      "type": "NPC",
      "description": "Ex sacerdote anziano del santuario, ormai consumato da un sussurro oscuro. Veste abiti cerimoniali logori.",
      "stats": {
        "race": "Mezzelfo",
        "role": "Antagonista tragico / Ex guardiano",
        "alignment": "Caotico Neutrale",
        "cr": "GS 3",
        "armorClass": "14 (Corazza di Cuoio Borchiato)",
        "hitPoints": "45 (7d8 + 14)",
        "speed": "9 m",
        "attributes": { "str": 10, "dex": 14, "con": 14, "int": 12, "wis": 16, "cha": 13 },
        "skills": "Religione +3, Intuizione +5, Percezione +5",
        "traits": "Incantesimi clericali (CD 13, attacco incantesimo +5), Retaggio Fatato",
        "actions": "Bastone ferrato: +4 al tiro per colpire, danno 1d6+2 contundente; Guida o Raggio di Luna",
        "personality": "Tormentato dal rimorso per non aver salvato il tempio",
        "secret": "Custodisce la chiave della cripta nascosta sotto il pavimento dell'altare"
      }
    },
    {
      "name": "Amuleto della Linfa Eterna",
      "type": "MagicItem",
      "description": "Un pendente in legno fossile racchiudente una goccia d'ambra sempre tiepida.",
      "stats": {
        "itemType": "Oggetto Meraviglioso",
        "rarity": "Rara",
        "attunement": "Sì (richiede sintonia da un druido, chierico o ranger)",
        "properties": "Fornisce +1 ai tiri salvezza su Costituzione e permette di lanciare Cura Ferite di 2° livello una volta per riposo lungo.",
        "cost": "750 mo"
      }
    }
  ]
}`;

    const userPrompt = `Nome Campagna: ${input.campaignName}
Ambientazione: ${input.campaignSetting}
Prompt Principale del Master: ${input.customPrompt}
Direttive Granulari e Selezione DM:
${input.granularDirectives || ''}
Party di PG (per bilanciamento e ganci):
${input.playerCharacters}
${input.campaignSummary ? `\nMacro-Trama Campagna:\n${input.campaignSummary}` : ''}
${input.loreContext ? `\nDossier Lore di Supporto:\n${input.loreContext}` : ''}
${input.recentSessionsSummary ? `\nSessioni Recenti:\n${input.recentSessionsSummary}` : ''}
${input.storyToModify ? `\nBozza da Modificare:\n${input.storyToModify}\nRichiesta di Modifica: ${input.modificationRequest}` : ''}`;

    const res = await safeGenerateContent(genAi, {
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
        temperature: 0.75,
      }
    }, 'STORY');

    try {
      const rawText = res.text || '{}';
      const json = JSON.parse(rawText);
      let title = json.titleProposal || json.titolo_sessione || json.title || 'Nuova Quest';
      let outline = json.sessionOutline || json.story || json.descrizione || json.notes || '';
      let entities = Array.isArray(json.entities) ? json.entities : [];

      let xp = typeof json.xpAward === 'number' 
        ? json.xpAward 
        : (typeof json.xp_totali_sessione === 'number' ? json.xp_totali_sessione : 300);

      // Normalize XP Details (handling various potential naming conventions from AI)
      let normalizedXpDetails = undefined;
      const rawXp = json.xpDetails || json.xp_details || json.dettaglio_xp || json.dettaglio_px || {};
      if (Object.keys(rawXp).length > 0) {
        normalizedXpDetails = {
          combatXp: Number(rawXp.combatXp || rawXp.combat_xp || rawXp.px_combattimento || rawXp.combattimento || 0),
          questMilestoneXp: Number(rawXp.questMilestoneXp || rawXp.quest_milestone_xp || rawXp.px_traguardo || rawXp.traguardi || 0),
          explorationXp: Number(rawXp.explorationXp || rawXp.exploration_xp || rawXp.px_esplorazione || rawXp.esplorazione || 0),
          roleplayDilemmaXp: Number(rawXp.roleplayDilemmaXp || rawXp.roleplay_dilemma_xp || rawXp.px_roleplay || rawXp.roleplay || 0),
          xpBreakdownNotes: String(rawXp.xpBreakdownNotes || rawXp.xp_breakdown_notes || rawXp.note_px || rawXp.note || ''),
        };
      }

      // Se il JSON ha una struttura con sessione, incontri, ganci_personali, trasformala in Markdown formattato
      if (json.sessione || json.incontri || json.ganci_personali || json.struttura_atti || json.ganci_narrativi_pg || json.incontri_dettagliati || json.campagna) {
        const transformed = formatStructuredSessionToMarkdown(json);
        title = transformed.title || title;
        outline = transformed.markdown;
        if (transformed.xp) xp = transformed.xp;
        if (entities.length === 0 && transformed.entities.length > 0) {
          entities = transformed.entities;
        }
      } else if (!outline) {
        const processed = cleanAndEnsureMarkdown(rawText, title);
        title = processed.title || title;
        outline = processed.markdown;
        if (processed.xp) xp = processed.xp;
        if (entities.length === 0 && processed.entities && processed.entities.length > 0) {
          entities = processed.entities;
        }
      } else {
        const processed = cleanAndEnsureMarkdown(outline, title);
        outline = processed.markdown;
        if (entities.length === 0 && processed.entities && processed.entities.length > 0) {
          entities = processed.entities;
        }
      }

      return {
        titleProposal: title,
        sessionOutline: outline || 'Nessun testo narrativo generato.',
        xpAward: xp,
        xpDetails: normalizedXpDetails,
        entities: entities
      };
    } catch {
      const processed = cleanAndEnsureMarkdown(res.text || '', 'Nuova Quest');
      return {
        titleProposal: processed.title,
        sessionOutline: processed.markdown || 'Nessun testo generato.',
        xpAward: processed.xp || 300,
        entities: processed.entities || []
      };
    }
  }
);
