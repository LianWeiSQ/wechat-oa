import type { DatabaseSync } from "node:sqlite";
import type { WritingBlueprint, WritingStructure, WritingStructureRun } from "@/lib/types";

type WritingStructureRunRow = {
  id: string;
  article_id: string;
  structure_json: string;
  quality_score: number;
  model_metadata_json: string;
  created_at: string;
};

type WritingBlueprintRow = {
  id: string;
  name: string;
  source_article_ids_json: string;
  summary: string;
  section_plan_json: string;
  tone_rules_json: string;
  banned_expressions_json: string;
  model_metadata_json: string;
  created_at: string;
  updated_at: string;
};

export function createWritingStore(db: DatabaseSync) {
  return {
    saveStructureRun(run: WritingStructureRun): WritingStructureRun {
      db.prepare(`
        INSERT INTO writing_structure_runs (
          id, article_id, structure_json, quality_score, model_metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.articleId,
        JSON.stringify(run.structure),
        run.qualityScore,
        JSON.stringify(run.modelMetadata),
        run.createdAt,
      );
      return run;
    },

    listStructureRuns(articleId?: string): WritingStructureRun[] {
      const rows = articleId
        ? (db
            .prepare("SELECT * FROM writing_structure_runs WHERE article_id = ? ORDER BY created_at DESC")
            .all(articleId) as WritingStructureRunRow[])
        : (db
            .prepare("SELECT * FROM writing_structure_runs ORDER BY created_at DESC")
            .all() as WritingStructureRunRow[]);
      return rows.map(mapStructureRun);
    },

    saveBlueprint(blueprint: WritingBlueprint): WritingBlueprint {
      db.prepare(`
        INSERT INTO writing_blueprints (
          id, name, source_article_ids_json, summary, section_plan_json,
          tone_rules_json, banned_expressions_json, model_metadata_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        blueprint.id,
        blueprint.name,
        JSON.stringify(blueprint.sourceArticleIds),
        blueprint.summary,
        JSON.stringify(blueprint.sectionPlan),
        JSON.stringify(blueprint.toneRules),
        JSON.stringify(blueprint.bannedExpressions),
        JSON.stringify(blueprint.modelMetadata),
        blueprint.createdAt,
        blueprint.updatedAt,
      );
      return blueprint;
    },

    listBlueprints(): WritingBlueprint[] {
      return (db
        .prepare("SELECT * FROM writing_blueprints ORDER BY updated_at DESC")
        .all() as WritingBlueprintRow[]).map(mapBlueprint);
    },

    getBlueprint(id: string): WritingBlueprint | null {
      const row = db.prepare("SELECT * FROM writing_blueprints WHERE id = ?").get(id) as WritingBlueprintRow | undefined;
      return row ? mapBlueprint(row) : null;
    },
  };
}

function mapStructureRun(row: WritingStructureRunRow): WritingStructureRun {
  return {
    id: row.id,
    articleId: row.article_id,
    structure: parseJson<WritingStructure>(row.structure_json, emptyStructure()),
    qualityScore: row.quality_score,
    modelMetadata: parseJson<WritingStructureRun["modelMetadata"]>(row.model_metadata_json, {
      provider: "openai-compatible",
      model: "",
    }),
    createdAt: row.created_at,
  };
}

function mapBlueprint(row: WritingBlueprintRow): WritingBlueprint {
  return {
    id: row.id,
    name: row.name,
    sourceArticleIds: parseJson<string[]>(row.source_article_ids_json, []),
    summary: row.summary,
    sectionPlan: parseJson<WritingBlueprint["sectionPlan"]>(row.section_plan_json, []),
    toneRules: parseJson<string[]>(row.tone_rules_json, []),
    bannedExpressions: parseJson<string[]>(row.banned_expressions_json, []),
    modelMetadata: parseJson<WritingBlueprint["modelMetadata"]>(row.model_metadata_json, {
      provider: "openai-compatible",
      model: "",
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function emptyStructure(): WritingStructure {
  return {
    titlePattern: "",
    openingHook: "",
    pressurePoint: "",
    ethicalRewrite: "",
    technicalBackbone: [],
    evidencePattern: [],
    pacingPattern: "",
    reusableMoves: [],
    antiPatterns: [],
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
