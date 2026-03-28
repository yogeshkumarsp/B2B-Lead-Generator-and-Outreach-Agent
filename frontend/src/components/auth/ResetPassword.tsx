import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { authService } from '../../services/auth';
import type { AuthView } from '../LoginPage';

interface ResetPasswordProps {
    token: string;
    onViewChange: (view: AuthView) => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onViewChange }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        setIsLoading(true);
        try {
            await authService.resetPassword({ token, newPassword: password });
            setMessage('Password reset successful. You can now log in with your new password.');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="text-left">
                <button
                    onClick={() => onViewChange('login')}
                    className="flex items-center text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-black transition-colors mb-6"
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to login
                </button>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Set New Password</h2>
                <p className="text-slate-500 font-medium leading-relaxed">
                    Please enter your new password below to secure your account.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-4 text-sm bg-red-50 text-red-600 border border-red-100 rounded-2xl font-medium">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="p-4 text-sm bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl font-medium">
                        {message}
                    </div>
                )}

                <div className="space-y-4">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[18px] font-medium"
                        placeholder="New Password"
                        required
                        autoFocus
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[18px] font-medium"
                        placeholder="Confirm New Password"
                        required
                    />
                </div>

                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading || !password || !confirmPassword}
                    type="submit"
                    className="h-[64px] w-full bg-black text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed text-[18px] shadow-lg shadow-black/10"
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                        <>
                            <span>Reset Password</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </motion.button>
            </form>
        </div>
    );
};

export default ResetPassword;
