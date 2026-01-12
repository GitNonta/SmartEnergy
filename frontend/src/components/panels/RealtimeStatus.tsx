import React from 'react';
import { useWebSocket } from '../../context/WebSocketContext';

export default function RealtimeStatus() {
  const { isConnected, connectionStatus, lastUpdate } = useWebSocket();
  const status = isConnected ? 'Online' : (connectionStatus === 'connecting' ? 'Connecting' : 'Offline');
  const color = isConnected ? 'bg-emerald-500' : 'bg-red-500';
  const localTs = lastUpdate ? new Date(lastUpdate).toLocaleString() : '';

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <div className="text-sm text-gray-700">Realtime Status: <span className="font-medium">{status}</span></div>
      {localTs && (
        <div className="ml-auto text-xs text-gray-500">Last update: {localTs}</div>
      )}
    </div>
  );
}
