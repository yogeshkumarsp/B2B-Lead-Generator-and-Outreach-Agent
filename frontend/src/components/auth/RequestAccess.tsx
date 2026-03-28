import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth';
import type { AuthView } from '../LoginPage';

interface RequestAccessProps {
    onViewChange: (view: AuthView) => void;
}

const RequestAccess: React.FC<RequestAccessProps> = ({ onViewChange }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        companyName: '',
        role: '',
        gender: '',
        password: '',
        reason: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoading(true);

        try {
            await authService.requestAccess(formData);
            setMessage('Your request has been submitted. We will review it and get back to you shortly.');
            setFormData({ name: '', email: '', companyName: '', role: '', gender: '', reason: '' });
        } catch (err: any) {
            // Try to extract the specific error message from the API response
            const serverMsg =
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                (typeof err?.response?.data === 'string' ? err.response.data : null);

            if (serverMsg?.toLowerCase().includes('already been submitted')) {
                setError('An access request for this email already exists. Our team will be in touch.');
            } else {
                setError(serverMsg || err?.message || 'Failed to submit request. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (message) {
        return (
            <div className="space-y-8 text-center py-6">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                    <ShieldCheck className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Request Received</h3>
                    <p className="text-slate-500 font-medium px-4 leading-relaxed">{message}</p>
                </div>
                <button
                    onClick={() => onViewChange('login')}
                    className="text-black font-bold hover:underline underline-offset-4 transition"
                >
                    Return to Login
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="text-left">
                <button
                    onClick={() => onViewChange('login')}
                    className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-black transition-colors mb-6"
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to login
                </button>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Request Access</h2>
                <p className="text-slate-500 font-medium leading-relaxed">
                    Please provide your details below and our team will be in touch.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-4 text-sm bg-red-50 text-red-600 border border-red-100 rounded-2xl font-medium">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[16px] font-medium"
                        placeholder="Full Name"
                        required
                        autoFocus
                    />
                    <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[16px] font-medium"
                        placeholder="Work Email"
                        required
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                        type="text"
                        name="companyName"
                        value={formData.companyName}
                        onChange={handleChange}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[16px] font-medium"
                        placeholder="Company Name"
                        required
                    />
                    <input
                        type="text"
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[16px] font-medium"
                        placeholder="Your Role"
                        required
                    />
                </div>

                {/* Gender */}
                <div>
                    <select
                        required
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm appearance-none"
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    >
                        <option value="" disabled className="text-slate-400">Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                </div>

                {/* Password */}
                <div>
                    <input
                        required
                        type="password"
                        placeholder="Create a password"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm placeholder:text-slate-400"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        minLength={8}
                    />
                </div>

                {/* Reason */}
                <div>
                    <textarea
                        name="reason"
                        value={formData.reason}
                        onChange={handleChange}
                        className="w-full px-8 py-6 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[16px] font-medium min-h-[160px] resize-none"
                        placeholder="Reason for access / How you plan to use AutoSDR"
                        required
                    />
                </div>

                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                    type="submit"
                    className="w-full mt-4 bg-black text-white font-bold h-[64px] rounded-2xl shadow-lg shadow-black/10 transition-all flex items-center justify-center space-x-2 disabled:opacity-70 text-[18px]"
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                        <>
                            <span>Submit Request</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </motion.button>
            </form>
        </div>
    );
};

export default RequestAccess;
