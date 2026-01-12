import React, { useState, useEffect } from 'react';
import {
    MessageCircle,
    Plus,
    Trash2,
    Send,
    Check,
    AlertCircle,
    RefreshCw,
    Settings,
    Bell,
    User
} from 'lucide-react';

import { getApiBase } from '../config/api';

const API_BASE = getApiBase();

interface Subscriber {
    userId: string;
    masked: string;
}

interface LineStatus {
    configured: boolean;
    subscriberCount: number;
    cooldownMs: number;
    hasToken: boolean;
}

const LineMessagingSettings: React.FC = () => {
    const [status, setStatus] = useState<LineStatus | null>(null);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [newUserId, setNewUserId] = useState('');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Fetch status and subscribers on mount
    useEffect(() => {
        fetchStatus();
        fetchSubscribers();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/status`);
            const data = await res.json();
            if (data.success) {
                setStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch LINE status:', error);
        }
    };

    const fetchSubscribers = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/subscribers`);
            const data = await res.json();
            if (data.success) {
                setSubscribers(data.subscribers);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        }
    };

    const handleSaveToken = async () => {
        if (!token.trim()) {
            setMessage({ type: 'error', text: 'กรุณาใส่ Channel Access Token' });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelAccessToken: token })
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'บันทึก Token สำเร็จ!' });
                setToken('');
                fetchStatus();
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถเชื่อมต่อ server ได้' });
        } finally {
            setLoading(false);
        }
    };

    const handleAddSubscriber = async () => {
        if (!newUserId.trim()) {
            setMessage({ type: 'error', text: 'กรุณาใส่ User ID' });
            return;
        }

        if (!newUserId.startsWith('U')) {
            setMessage({ type: 'error', text: 'User ID ต้องขึ้นต้นด้วย U' });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/subscribers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: newUserId })
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'เพิ่มผู้รับสำเร็จ!' });
                setNewUserId('');
                fetchSubscribers();
                fetchStatus();
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถเชื่อมต่อ server ได้' });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveSubscriber = async (userId: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/subscribers/${userId}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'ลบผู้รับสำเร็จ!' });
                fetchSubscribers();
                fetchStatus();
            } else {
                setMessage({ type: 'error', text: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถเชื่อมต่อ server ได้' });
        } finally {
            setLoading(false);
        }
    };

    const handleTestMessage = async (userId: string) => {
        setTestLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/notifications/line/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const data = await res.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'ส่งข้อความทดสอบสำเร็จ! ตรวจสอบ LINE ของคุณ' });
            } else {
                setMessage({ type: 'error', text: data.error || 'ส่งไม่สำเร็จ' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'ไม่สามารถเชื่อมต่อ server ได้' });
        } finally {
            setTestLoading(false);
        }
    };

    // Clear message after 5 seconds
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 text-white">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    LINE Messaging API Settings
                </h2>
                <p className="text-sm text-white/80 mt-0.5">
                    ตั้งค่าการแจ้งเตือนผ่าน LINE
                </p>
            </div>

            <div className="p-6 space-y-6">
                {/* Status Indicator */}
                <div className={`p-4 rounded-lg border ${status?.configured
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${status?.configured ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className={`font-medium ${status?.configured
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-yellow-800 dark:text-yellow-200'}`}>
                            {status?.configured ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                        </span>
                        {status?.subscriberCount !== undefined && (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                • {status.subscriberCount} ผู้รับ
                            </span>
                        )}
                    </div>
                </div>

                {/* Message Alert */}
                {message && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                        }`}>
                        {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        {message.text}
                    </div>
                )}

                {/* Token Configuration */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Settings className="w-4 h-4 inline mr-1" />
                        Channel Access Token
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="ใส่ Channel Access Token จาก LINE Developers..."
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                        <button
                            onClick={handleSaveToken}
                            disabled={loading}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg 
                flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            บันทึก
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        รับ Token ได้ที่{' '}
                        <a href="https://developers.line.biz/" target="_blank" rel="noreferrer"
                            className="text-green-600 hover:underline">
                            LINE Developers Console
                        </a>
                    </p>
                </div>

                {/* Subscribers List */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Bell className="w-4 h-4 inline mr-1" />
                        ผู้รับการแจ้งเตือน (User IDs)
                    </label>

                    {/* Add new subscriber */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                            placeholder="User ID (เช่น Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)"
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                        />
                        <button
                            onClick={handleAddSubscriber}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                flex items-center gap-2 disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            เพิ่ม
                        </button>
                    </div>

                    {/* Subscribers list */}
                    <div className="space-y-2">
                        {subscribers.length === 0 ? (
                            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                                <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>ยังไม่มีผู้รับการแจ้งเตือน</p>
                            </div>
                        ) : (
                            subscribers.map((sub) => (
                                <div
                                    key={sub.userId}
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <User className="w-5 h-5 text-gray-400" />
                                        <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                                            {sub.masked}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleTestMessage(sub.userId)}
                                            disabled={testLoading}
                                            className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg"
                                            title="ส่งข้อความทดสอบ"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleRemoveSubscriber(sub.userId)}
                                            disabled={loading}
                                            className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                                            title="ลบ"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">วิธีหา User ID</h4>
                    <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                        <li>ผู้รับต้อง Add Friend กับ Official Account ของคุณก่อน</li>
                        <li>ใช้ Webhook หรือ LINE OA Manager เพื่อดู User ID</li>
                        <li>User ID จะขึ้นต้นด้วย U และมี 33 ตัวอักษร</li>
                    </ol>
                </div>
            </div>
        </div>
    );
};

export default LineMessagingSettings;
