// Shared branch selection dropdown component used by both the add-task modal
// and the detail panel.

export const BRANCH_AUTO_GENERATE = '<auto-generate>';
export const BRANCH_AUTO_GENERATE_DISPLAY = '✨ Auto-generate on run';

export interface BranchSelector {
  getValue(): string;
  reset(): void;
}

// Suggestions are fetched once and shared across every selector instance.
let branchSuggestions: string[] = [];
let branchSuggestionsLoaded = false;

async function loadBranchSuggestions(): Promise<void> {
  if (branchSuggestionsLoaded) return;
  try {
    const res = await fetch('/api/git/branches');
    if (!res.ok) throw new Error('Server error');
    const data = (await res.json()) as { branches: string[] };
    branchSuggestions = data.branches;
  } catch {
    branchSuggestions = [];
  }
  branchSuggestionsLoaded = true;
}

export interface BranchSelectorOptions {
  inputId: string;
  dropdownId: string;
  // Initial branch value. Omit (or pass null/undefined/BRANCH_AUTO_GENERATE)
  // to start in auto-generate mode.
  initialBranch?: string | null;
}

export function initBranchSelector(options: BranchSelectorOptions): BranchSelector {
  const input = document.getElementById(options.inputId) as HTMLInputElement | null;
  const dropdown = document.getElementById(options.dropdownId) as HTMLElement | null;

  const isAuto =
    options.initialBranch === null ||
    options.initialBranch === undefined ||
    options.initialBranch === BRANCH_AUTO_GENERATE;
  let branchInternalValue: string = isAuto ? BRANCH_AUTO_GENERATE : options.initialBranch!;

  function setAutoMode(): void {
    branchInternalValue = BRANCH_AUTO_GENERATE;
    if (input) {
      input.value = BRANCH_AUTO_GENERATE_DISPLAY;
      input.readOnly = true;
      input.classList.add('branch-auto-mode');
    }
    if (dropdown) dropdown.style.display = 'none';
  }

  function setManualMode(branch: string): void {
    branchInternalValue = branch;
    if (input) {
      input.value = branch;
      input.readOnly = false;
      input.classList.remove('branch-auto-mode');
    }
  }

  function renderDropdown(inputValue: string): void {
    if (!dropdown) return;
    // When in auto-generate mode, show all suggestions unfiltered
    const isAutoMode = branchInternalValue === BRANCH_AUTO_GENERATE;
    const q = isAutoMode ? '' : inputValue.trim().toLowerCase();
    const filtered = q ? branchSuggestions.filter((b) => b.toLowerCase().includes(q)) : branchSuggestions;

    dropdown.innerHTML = '';

    // Fixed top item: auto-generate
    const autoOpt = document.createElement('div');
    autoOpt.className = 'branch-select-option branch-select-option-auto';
    autoOpt.textContent = BRANCH_AUTO_GENERATE_DISPLAY;
    if (branchInternalValue === BRANCH_AUTO_GENERATE) {
      autoOpt.classList.add('selected');
    }
    autoOpt.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      setAutoMode();
    });
    dropdown.appendChild(autoOpt);

    // Separator
    const separator = document.createElement('div');
    separator.className = 'branch-select-separator';
    dropdown.appendChild(separator);

    // Git branch list
    filtered.forEach((branch) => {
      const opt = document.createElement('div');
      opt.className = 'branch-select-option';
      opt.textContent = branch;
      opt.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        setManualMode(branch);
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(opt);
    });

    dropdown.style.display = 'block';
  }

  if (input && dropdown) {
    input.addEventListener('focus', async () => {
      await loadBranchSuggestions();
      renderDropdown(input.value);
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (input.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        input.readOnly = false;
        input.classList.remove('branch-auto-mode');
        branchInternalValue = e.key;
        input.value = e.key;
        renderDropdown(e.key);
      }
    });

    input.addEventListener('input', () => {
      if (branchInternalValue === BRANCH_AUTO_GENERATE) {
        input.readOnly = false;
        input.classList.remove('branch-auto-mode');
      }
      branchInternalValue = input.value;
      renderDropdown(input.value);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 150);
    });
  }

  return {
    getValue: () => branchInternalValue,
    reset: setAutoMode,
  };
}
