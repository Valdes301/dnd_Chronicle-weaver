import { z } from 'genkit';

export const GenerateNextSessionInputSchema = z.object({
  campaignName: z.string().describe('Il nome della campagna D&D.'),
  campaignSetting: z.string().describe("L'ambientazione della campagna D&D."),
  campaignSummary: z
    .string()
    .optional()
    .describe("Un riassunto generale dell'intera campagna per il contesto a lungo termine."),
  recentSessionsSummary: z
    .string()
    .optional()
    .describe('Riassunto o estratto delle sessioni precedenti selezionate per continuità.'),
  playerCharacters: z
    .string()
    .describe('Dati JSON o formattati dei Personaggi Giocanti (PG) selezionati con ideali, legami, difetti, magie e abilità.'),
  customPrompt: z
    .string()
    .describe("Il prompt / indicazioni principali del Dungeon Master per questa specifica quest."),
  storyToModify: z
    .string()
    .optional()
    .describe('La bozza precedente da raffinare o modificare.'),
  modificationRequest: z
    .string()
    .optional()
    .describe('Istruzioni di modifica specifica fornite dal Master.'),
  homebrewRules: z
    .string()
    .optional()
    .describe('Regole personalizzate di campagna da rispettare.'),
  loreContext: z
    .string()
    .optional()
    .describe('Dossier di lore, città, fazioni ed enciclopedia geografica.'),
  systemOverride: z
    .string()
    .optional()
    .describe('Sovrascrittura facoltativa del System Prompt.'),
  granularDirectives: z
    .string()
    .optional()
    .describe('Direttive granulari dettagliate: ruoli dei PNG, oggetti con contesto, incantesimi, abilità, agganci specifici a vecchie quest, ambientazione e tono narrativo.'),
  selectedModel: z
    .string()
    .optional()
    .describe('Il modello AI selezionato per la generazione o per i fallback.'),
});

export type GenerateNextSessionInput = z.infer<typeof GenerateNextSessionInputSchema>;

export const GenerateNextSessionEntitySchema = z.object({
  name: z.string().describe('Nome del PNG, Oggetto Magico, Mostro o Luogo.'),
  type: z.string().default('NPC').describe('Tipo di entità: NPC, MagicItem, Monster, Location, Lore.'),
  description: z.string().describe('Descrizione dettagliata, aspetto, lore, ruolo narrativo e caratteristiche.'),
  stats: z.any().optional().describe('Statistiche complete di gioco D&D 5e.')
});

export const GenerateNextSessionOutputSchema = z.object({
  titleProposal: z
    .string()
    .optional()
    .default('Nuova Quest')
    .describe('Un titolo evocativo, solenne ed entusiasmante per la sessione o quest.'),
  sessionOutline: z
    .string()
    .optional()
    .default('')
    .describe('La narrazione dettagliata, ricca ed esaustiva della sessione in Markdown con scene, riquadri da leggere ad alta voce (> ...), dialoghi completi dei PNG, bivi morali e prove di abilità.'),
  xpAward: z
    .number()
    .optional()
    .default(300)
    .describe('Punti Esperienza (PX / XP) totali di base per la sessione secondo le regole di D&D 5e.'),
  xpDetails: z
    .object({
      combatXp: z.number().optional().default(0),
      questMilestoneXp: z.number().optional().default(0),
      explorationXp: z.number().optional().default(0),
      roleplayDilemmaXp: z.number().optional().default(0),
      xpBreakdownNotes: z.string().optional().default(''),
    })
    .optional()
    .describe('Scomposizione dettagliata dei PX guadagnati.'),
  entities: z
    .array(GenerateNextSessionEntitySchema)
    .optional()
    .default([])
    .describe('Entità menzionate nella storia che richiedono una scheda dedicata per PNG, Oggetti Magici, Mostri o Luoghi.')
});

export type GenerateNextSessionOutput = z.infer<typeof GenerateNextSessionOutputSchema>;
