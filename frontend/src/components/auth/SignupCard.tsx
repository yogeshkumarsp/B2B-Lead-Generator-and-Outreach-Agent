import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import type { AuthView } from '../LoginPage';
import { authService } from '../../services/auth';

interface SignupCardProps {
    onLogin: () => void;
    onViewChange: (view: AuthView) => void;
}

const SignupCard: React.FC<SignupCardProps> = ({ onLogin, onViewChange }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name || !email || !password || !confirm) {
            setError('All fields are required.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            await authService.register(name, email, password);
            onLogin();
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Failed to create account. Please try again.';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "w-full h-[52px] px-5 bg-slate-50 border border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 rounded-xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[15px] font-medium";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">Create account</h2>
                <p className="text-slate-400 font-medium text-sm">Join AutoSDR and start automating your outreach.</p>
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
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={inputClass}
                    placeholder="Full Name"
                    required
                    autoFocus
                />
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="Work Email"
                    required
                />
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={`${inputClass} pr-12`}
                        placeholder="Password (min. 8 characters)"
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="Confirm Password"
                    required
                />

                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                    type="submit"
                    className="h-[52px] w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed text-[15px] shadow-lg shadow-blue-600/25"
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <span>Create Account</span>
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </motion.button>
            </form>

            <p className="text-center text-slate-400 text-xs font-medium">
                Already have an account?{' '}
                <button
                    onClick={() => onViewChange('login')}
                    className="text-blue-600 font-bold hover:underline underline-offset-4"
                >
                    Sign In
                </button>
            </p>
        </div>
    );
};

export default SignupCard;
