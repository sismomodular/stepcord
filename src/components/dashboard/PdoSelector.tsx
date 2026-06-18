import { PDO } from '../../types/picopd';

interface PdoSelectorProps {
  pdos?: PDO[];
  activePdoIndex: number;
  onSelectPdo: (pdo: PDO) => void;
}

const DEFAULT_PDOS: PDO[] = [
  { index: 0, voltage: 5,  current: 3,    type: 'fixed' },
  { index: 1, voltage: 9,  current: 3,    type: 'fixed' },
  { index: 2, voltage: 12, current: 3,    type: 'fixed' },
  { index: 3, voltage: 20, current: 3.25, type: 'fixed' },
  { index: 4, voltage: 0,  current: 0,    type: 'pps', minVoltage: 3.3, maxVoltage: 21 },
];

export default function PdoSelector({
  pdos = DEFAULT_PDOS,
  activePdoIndex,
  onSelectPdo,
}: PdoSelectorProps) {
  const fixed = pdos.filter(p => p.type === 'fixed');
  const pps = pdos.find(p => p.type === 'pps');

  const baseBtn = 'rounded-lg p-3 text-left transition-colors';
  const activeCls = 'border-2 border-blue-500 bg-blue-50';
  const inactiveCls = 'border border-gray-200 bg-gray-50 hover:border-gray-300';

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        PDO selector
      </div>

      <div className="grid grid-cols-2 gap-2">
        {fixed.map(pdo => {
          const isActive = pdo.index === activePdoIndex;
          const watts = Math.round(pdo.voltage * pdo.current);
          return (
            <button
              key={pdo.index}
              onClick={() => onSelectPdo(pdo)}
              className={`${baseBtn} ${isActive ? activeCls : inactiveCls}`}
            >
              <div className="text-lg font-bold text-gray-900">{pdo.voltage} V</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {pdo.current} A · {watts} W
              </div>
            </button>
          );
        })}

        {pps && (
          <button
            onClick={() => onSelectPdo(pps)}
            className={`${baseBtn} col-span-2 ${pps.index === activePdoIndex ? activeCls : inactiveCls}`}
          >
            <div className="text-lg font-bold text-gray-900">PPS mode</div>
            <div className="mt-0.5 text-xs text-gray-500">
              {pps.minVoltage} – {pps.maxVoltage} V programmable
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
