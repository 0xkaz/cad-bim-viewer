interface PropertyPanelProps {
  properties: Record<string, unknown> | null;
}

export default function PropertyPanel({ properties }: PropertyPanelProps) {
  return (
    <aside className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Properties</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {!properties ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select an element in the viewer to see its properties.
          </p>
        ) : (
          <dl className="space-y-2">
            {Object.entries(properties).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {key}
                </dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100 break-words">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </aside>
  );
}
