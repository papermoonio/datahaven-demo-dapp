import type { ReactNode } from 'react';
import type { CodeSnippet } from '../config/codeSnippets';

interface CodePanelProps {
  snippets: CodeSnippet[];
  activeSnippetId: string;
  onSnippetSelect: (id: string) => void;
}

type TokenType = 'keyword' | 'string' | 'comment' | 'type' | 'number' | 'default';

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'text-sage-400',
  string: 'text-amber-300',
  comment: 'text-dh-500 italic',
  type: 'text-sky-300',
  number: 'text-orange-300',
  default: 'text-dh-200',
};

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'async', 'await', 'return',
  'export', 'import', 'from', 'if', 'else', 'throw', 'new',
  'try', 'catch', 'finally', 'class', 'interface', 'type',
  'extends', 'implements', 'typeof', 'instanceof',
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'void', 'null', 'undefined',
  'Promise', 'Blob', 'File', 'ReadableStream', 'Response',
  'MspClient', 'StorageHubClient', 'ApiPromise',
  'HttpClientConfig', 'UserInfo', 'FileManager',
  'TransactionReceipt', 'Bucket', 'FileListResponse',
  'StorageFileInfo', 'HealthStatus', 'ReplicationLevel',
]);

function tokenizeLine(line: string): { text: string; type: TokenType }[] {
  const tokens: { text: string; type: TokenType }[] = [];

  // Check if entire line is a comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//')) {
    tokens.push({ text: line, type: 'comment' });
    return tokens;
  }

  let i = 0;
  while (i < line.length) {
    // Skip whitespace
    if (/\s/.test(line[i])) {
      let ws = '';
      while (i < line.length && /\s/.test(line[i])) {
        ws += line[i];
        i++;
      }
      tokens.push({ text: ws, type: 'default' });
      continue;
    }

    // Inline comment
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      break;
    }

    // Strings (single quote, double quote, backtick)
    if (line[i] === "'" || line[i] === '"' || line[i] === '`') {
      const quote = line[i];
      let str = quote;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') {
          str += line[i];
          i++;
        }
        if (i < line.length) {
          str += line[i];
          i++;
        }
      }
      if (i < line.length) {
        str += line[i];
        i++;
      }
      tokens.push({ text: str, type: 'string' });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i - 1]))) {
      let num = '';
      while (i < line.length && /[0-9.xXa-fA-F]/.test(line[i])) {
        num += line[i];
        i++;
      }
      tokens.push({ text: num, type: 'number' });
      continue;
    }

    // Words (keywords, types, identifiers)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let word = '';
      while (i < line.length && /[a-zA-Z0-9_$]/.test(line[i])) {
        word += line[i];
        i++;
      }
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (TYPES.has(word)) {
        tokens.push({ text: word, type: 'type' });
      } else {
        tokens.push({ text: word, type: 'default' });
      }
      continue;
    }

    // Operators and punctuation
    tokens.push({ text: line[i], type: 'default' });
    i++;
  }

  return tokens;
}

function highlightCode(code: string): ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, lineIndex) => {
    const tokens = tokenizeLine(line);
    return (
      <div key={lineIndex} className="leading-6 whitespace-pre">
        <span className="text-dh-600 select-none inline-block w-8 text-right mr-4 text-xs">
          {lineIndex + 1}
        </span>
        {tokens.map((token, i) => (
          <span key={i} className={TOKEN_CLASSES[token.type]}>
            {token.text}
          </span>
        ))}
      </div>
    );
  });
}

export function CodePanel({ snippets, activeSnippetId, onSnippetSelect }: CodePanelProps) {
  const activeSnippet = snippets.find((s) => s.id === activeSnippetId) || snippets[0];

  return (
    <div className="bg-dh-900 rounded-lg border border-dh-700 overflow-hidden">
      {/* Tab Bar */}
      <div className="flex overflow-x-auto border-b border-dh-700 bg-dh-800/50">
        {snippets.map((snippet) => (
          <button
            key={snippet.id}
            onClick={() => onSnippetSelect(snippet.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              snippet.id === activeSnippetId
                ? 'border-sage-400 text-white bg-dh-900/50'
                : 'border-transparent text-dh-400 hover:text-dh-200 hover:bg-dh-800'
            }`}
          >
            {snippet.title}
          </button>
        ))}
      </div>

      {/* Code Display */}
      <div className="p-4 overflow-x-auto overflow-y-auto max-h-[calc(100vh-12rem)]">
        <pre className="text-sm font-mono">{highlightCode(activeSnippet.code)}</pre>
      </div>
    </div>
  );
}
