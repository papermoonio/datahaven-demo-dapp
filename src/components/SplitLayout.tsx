import type { ReactNode } from 'react';
import { CodePanel } from './CodePanel';
import { CodeToggleButton } from './CodeToggleButton';
import { useCodePanel } from '../hooks/useCodePanel';
import type { CodeSnippet } from '../config/codeSnippets';

interface SplitLayoutProps {
  snippets: CodeSnippet[];
  defaultSnippetId: string;
  pageTitle: string;
  pageDescription: string;
  activeSnippetId?: string;
  onSnippetChange?: (id: string) => void;
  children: ReactNode;
}

export function SplitLayout({
  snippets,
  defaultSnippetId,
  pageTitle,
  pageDescription,
  activeSnippetId: controlledSnippetId,
  onSnippetChange,
  children,
}: SplitLayoutProps) {
  const { isCodePanelOpen, toggleCodePanel, activeSnippetId, setActiveSnippetId } =
    useCodePanel(defaultSnippetId);

  const currentSnippetId = controlledSnippetId ?? activeSnippetId;

  const handleSnippetSelect = (id: string) => {
    setActiveSnippetId(id);
    onSnippetChange?.(id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header with Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
          <p className="mt-1 text-dh-300">{pageDescription}</p>
        </div>
        <CodeToggleButton isOpen={isCodePanelOpen} onToggle={toggleCodePanel} />
      </div>

      {/* Conditional Split Grid */}
      {isCodePanelOpen ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="xl:sticky xl:top-8 xl:self-start">
            <CodePanel
              snippets={snippets}
              activeSnippetId={currentSnippetId}
              onSnippetSelect={handleSnippetSelect}
            />
          </div>
          <div className="space-y-6">{children}</div>
        </div>
      ) : (
        <>{children}</>
      )}
    </div>
  );
}
