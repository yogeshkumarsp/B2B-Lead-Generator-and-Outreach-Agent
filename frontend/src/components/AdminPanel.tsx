import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../services/apiFetch';
import { CheckCircle, XCircle, Trash2, Loader2, RefreshCw, ShieldCheck, Clock, User, Building2, Mail, Venus, MessageSquare } from 'lucide-react';

interface AccessRequest {
    id: string;
    name: string;
    email: string;
    companyName: string;
    role: string;
    gender?: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
}

const statusConfig = {
    PENDING: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
    APPROVED: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    REJECTED: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

const AdminPanel: React.FC = () => {
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
    const [updating, setUpdating] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/api/admin/requests');
            if (res.ok) setRequests(await res.json());
        } catch (err) {
            console.error('Failed to fetch requests:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchRequests(); }, []);

    const updateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
        const actionKey = `${status.toLowerCase()}-${id}`;
        setUpdating(actionKey);
        try {
            const res = await apiFetch(`/api/admin/requests/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status }),
            });
            if (res.ok) {
                setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
            }
        } finally {
            setUpdating(null);
        }
    };

    const deleteRequest = async (id: string) => {
        if (!confirm('Delete this access request permanently?')) return;
        const actionKey = `delete-${id}`;
        setUpdating(actionKey);
        try {
            const res = await apiFetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
            if (res.ok) setRequests(prev => prev.filter(r => r.id !== id));
        } finally {
            setUpdating(null);
        }
    };

    const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);
    const counts = {
        ALL: requests.length,
        PENDING: requests.filter(r => r.status === 'PENDING').length,
        APPROVED: requests.filter(r => r.status === 'APPROVED').length,
        REJECTED: requests.filter(r => r.status === 'REJECTED').length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-blue-600" />
                        Access Requests
                    </h1>
                    <p className="text-slate-500 mt-1">Review and manage platform access requests.</p>
                </div>
                <button
                    onClick={fetchRequests}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </header>

            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setFilter(tab)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${filter === tab
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                            }`}
                    >
                        {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                        <span className={`ml-2 px-1.5 py-0.5 rounded-md text-xs ${filter === tab ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {counts[tab]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-3">
                    <ShieldCheck className="w-12 h-12 opacity-10" />
                    <p className="font-medium">No {filter !== 'ALL' ? filter.toLowerCase() : ''} requests found.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence>
                        {filtered.map((req, i) => {
                            const cfg = statusConfig[req.status];
                            const isExpanded = expandedId === req.id;
                            return (
                                <motion.div
                                    key={req.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ delay: i * 0.04 }}
                                    className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                                >
                                    {/* Card Header row */}
                                    <div
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                                        onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Avatar */}
                                            <div className="w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
                                                {req.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 text-base leading-tight">{req.name}</div>
                                                <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                                                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{req.email}</span>
                                                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.companyName}</span>
                                                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{req.role}</span>
                                                    {req.gender && <span className="flex items-center gap-1"><Venus className="w-3 h-3" />{req.gender}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            {/* Status Badge */}
                                            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </span>
                                            {/* Date */}
                                            <span className="text-xs text-slate-400 flex items-center gap-1 hidden sm:flex">
                                                <Clock className="w-3 h-3" />
                                                {new Date(req.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Detail */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                                                    <div className="bg-slate-50 rounded-xl p-4 mb-4">
                                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                            Reason for Access
                                                        </div>
                                                        <p className="text-slate-700 text-sm leading-relaxed">{req.reason}</p>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-3">
                                                            <button
                                                                onClick={() => updateStatus(req.id, 'APPROVED')}
                                                                disabled={!!updating && updating.includes(req.id)}
                                                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-60"
                                                            >
                                                                {updating === `approved-${req.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => updateStatus(req.id, 'REJECTED')}
                                                                disabled={!!updating && updating.includes(req.id)}
                                                                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm shadow-red-600/20 disabled:opacity-60"
                                                            >
                                                                {updating === `rejected-${req.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                                                Reject
                                                            </button>
                                                        <button
                                                            onClick={() => deleteRequest(req.id)}
                                                            disabled={!!updating && updating.includes(req.id)}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-sm font-bold rounded-xl transition-all disabled:opacity-60 ml-auto"
                                                        >
                                                            {updating === `delete-${req.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;
