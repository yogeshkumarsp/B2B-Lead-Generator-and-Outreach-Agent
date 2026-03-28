import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '../../services/auth';
import type { AuthView } from '../LoginPage';

interface ForgotPasswordProps {
    onViewChange: (view: AuthView) => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onViewChange }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!email) {
            setError('Please enter your email.');
            return;
        }

        setIsLoading(true);
        try {
            await authService.forgotPassword(email);
            setMessage('If that email is registered, we have sent a password reset link.');
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
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Reset Password</h2>
                <p className="text-slate-500 font-medium leading-relaxed">
                    Enter your email address and we'll send you a link to reset your password.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-4 text-sm bg-red-50 text-red-600 border border-red-100 rounded-2xl font-medium">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="p-4 text-sm bg-blue-50 text-blue-700 border border-blue-100 rounded-2xl font-medium">
                        {message}
                    </div>
                )}

                <div className="space-y-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-[64px] px-8 bg-white border border-slate-200 focus:border-black focus:ring-4 focus:ring-black/5 rounded-2xl outline-none transition-all placeholder:text-slate-400 text-slate-900 text-[18px] font-medium"
                        placeholder="Work Email"
                        required
                        autoFocus
                    />

                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isLoading || !email}
                        type="submit"
                        className="h-[64px] w-full bg-black text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed text-[18px] shadow-lg shadow-black/10"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <span>Send Reset Link</span>
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </motion.button>
                </div>
            </form>
        </div>
    );
};

export default ForgotPassword;
