// Client-side access to the model catalog embedded by boardRenderer's
// configScript (window.modelCatalog / window.defaultAgent), plus the
// model -> effort dropdown linkage shared by the add modal and detail panel.

import type { ModelCatalogEntry } from './types';

export function getModelCatalog(): ModelCatalogEntry[] {
  return window.modelCatalog ?? [];
}

export function getDefaultAgent(): string {
  return window.defaultAgent ?? 'claude';
}

function getPhaseDefault(phase: 'planning' | 'run'): { agent: string; model?: string } {
  return window.phaseDefaults?.[phase] ?? { agent: getDefaultAgent() };
}

/**
 * Effort values selectable for a model. An empty model means "Default (config)"
 * and uses the resolved model or agent for the requested phase.
 */
export function effortsForModel(model: string, phase: 'planning' | 'run' = 'planning'): string[] {
  const catalog = getModelCatalog();
  if (model) {
    const entry = catalog.find((e) => e.model === model);
    return entry ? [...entry.efforts] : [];
  }
  const phaseDefault = getPhaseDefault(phase);
  if (phaseDefault.model) {
    const entry = catalog.find(
      (candidate) => candidate.cli === phaseDefault.agent && candidate.model === phaseDefault.model
    );
    if (entry) return [...entry.efforts];
  }
  const agent = phaseDefault.agent;
  const result: string[] = [];
  for (const entry of catalog) {
    if (entry.cli !== agent) continue;
    for (const effort of entry.efforts) {
      if (result.indexOf(effort) === -1) result.push(effort);
    }
  }
  return result;
}

/**
 * Rebuild an effort select's options for the currently selected model.
 * The current selection survives only when it is still a candidate.
 */
export function rebuildEffortOptions(
  modelSelect: HTMLSelectElement,
  effortSelect: HTMLSelectElement,
  phase: 'planning' | 'run' = 'planning'
): void {
  const current = effortSelect.value;
  const efforts = effortsForModel(modelSelect.value, phase);

  effortSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Effort: default';
  effortSelect.appendChild(defaultOption);
  efforts.forEach((effort) => {
    const option = document.createElement('option');
    option.value = effort;
    option.textContent = effort;
    effortSelect.appendChild(option);
  });

  effortSelect.value = efforts.indexOf(current) === -1 ? '' : current;
}

/** Wire a model select so changing it rebuilds its paired effort select. */
export function wireModelEffortSync(modelId: string, effortId: string, phase: 'planning' | 'run' = 'planning'): void {
  const modelSelect = document.getElementById(modelId) as HTMLSelectElement | null;
  const effortSelect = document.getElementById(effortId) as HTMLSelectElement | null;
  if (!modelSelect || !effortSelect) return;
  modelSelect.addEventListener('change', () => rebuildEffortOptions(modelSelect, effortSelect, phase));
}
