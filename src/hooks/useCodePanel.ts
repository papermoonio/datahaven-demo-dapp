import { useState, useCallback } from 'react';

const STORAGE_KEY = 'datahaven_code_panel_open';

function getInitialState(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function useCodePanel(defaultSnippetId: string) {
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(getInitialState);
  const [activeSnippetId, setActiveSnippetId] = useState(defaultSnippetId);

  const toggleCodePanel = useCallback(() => {
    setIsCodePanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { isCodePanelOpen, toggleCodePanel, activeSnippetId, setActiveSnippetId };
}
