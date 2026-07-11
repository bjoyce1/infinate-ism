/**
 * Compatibility shim.
 *
 * The 2D graph now uses the hybrid hierarchical planner in
 * `hybridKnowledgeLayout.ts`. This file preserves the historical API surface
 * (`planNeighborhoods`, `applyNeighborhoodSeed`, `NeighborhoodPlan`,
 * `HUB_ID`, `isStructuralRelation`) so unrelated callers and persisted
 * tests keep working.
 */
export { HUB_ID, isStructuralRelation, applyHybridSeed as applyNeighborhoodSeed, planHybridKnowledgeLayout as planNeighborhoods } from "./hybridKnowledgeLayout";
export type { HybridPlan as NeighborhoodPlan, NodeTarget } from "./hybridKnowledgeLayout";
