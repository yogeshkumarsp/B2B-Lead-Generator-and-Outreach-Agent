import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { AuthView } from '../LoginPage';
import { authService } from '../../services/auth';

interface LoginCardProps {
    onLogin: () => void;
    onViewChange: (view: AuthView) => void;
}

const LoginCard: React.FC<LoginCardProps> = ({ onLogin, onViewChange }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email || !password) {
            setError('Please fill in all fields.');
            return;
        }
        setIsLoading(true);
        try {
            await authService.login(email, password);
            onLogin();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid email or password');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full h-[52px] px-5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[15px] font-medium";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">Welcome back</h2>
                <p className="text-slate-400 text-sm font-medium">Sign in to your AutoSDR account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 text-sm bg-red-50 text-red-600 border border-red-100 rounded-xl font-medium"
                    >
                        {error}
                    </motion.div>
                )}

                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="Email Address"
                    required
                    autoFocus
                />

                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Password"
                    required
                />

                {/* Remember me + Forgot password row */}
                <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors font-medium">
                            Remember me
                        </span>
                    </label>
                    <button
                        type="button"
                        onClick={() => onViewChange('forgot-password')}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline underline-offset-4 transition-colors"
                    >
                        Forgot password?
                    </button>
                </div>

                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                    type="submit"
                    className="h-[52px] w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-[15px] shadow-lg shadow-blue-600/25"
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <span>Sign In</span>
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </motion.button>
            </form>
        </div>
    );
};

export default LoginCard;
