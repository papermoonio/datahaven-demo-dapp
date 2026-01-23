interface CodeToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function CodeToggleButton({ isOpen, onToggle }: CodeToggleButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        isOpen
          ? 'bg-sage-600 text-white hover:bg-sage-500'
          : 'bg-dh-700 text-dh-200 hover:bg-dh-600'
      }`}
      title={isOpen ? 'Hide code' : 'Show code'}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
      {isOpen ? 'Hide Code' : 'Show Code'}
    </button>
  );
}
