import { Zap } from 'lucide-react';
import { ConnectionStatus, DeviceInfo } from '../../types/picopd';

interface ConnectionBarProps {
  status: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function ConnectionBar({ status, deviceInfo, onConnect, onDisconnect }: ConnectionBarProps) {
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-gray-100 bg-white px-6">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500" fill="currentColor" />
        <span className="text-base font-medium text-gray-900">PicoPD Control</span>
      </div>

      <div className="flex items-center gap-3">
        {isConnected ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            </span>
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            {isConnecting ? 'Connecting…' : status === 'error' ? 'Error' : 'Disconnected'}
          </span>
        )}

        {isConnected && deviceInfo && (
          <span className="hidden text-xs font-mono text-gray-500 sm:inline">
            {deviceInfo.name} · {deviceInfo.port}
          </span>
        )}

        {isConnected ? (
          <button
            onClick={onDisconnect}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isConnecting ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
    </header>
  );
}
