export function AdminTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="scrollbar-hide mb-6 overflow-x-auto border-b border-gray-800 pb-1">
      <div className="flex min-w-max space-x-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? "border-yellow-500 text-yellow-500"
                : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
