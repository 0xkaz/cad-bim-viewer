interface ViewerToolbarProps {
  onFitView: () => void;
  onToggleGrid: () => void;
  showGrid: boolean;
  onFullscreen: () => void;
}

export default function ViewerToolbar({
  onFitView,
  onToggleGrid,
  showGrid,
  onFullscreen,
}: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <button
        type="button"
        onClick={onFitView}
        className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Fit View
      </button>
      <button
        type="button"
        onClick={onToggleGrid}
        className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {showGrid ? "Hide Grid" : "Show Grid"}
      </button>
      <button
        type="button"
        onClick={onFullscreen}
        className="rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Fullscreen
      </button>
    </div>
  );
}
