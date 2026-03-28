import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, Target, TrendingUp } from 'lucide-react';
import LoginCard from './auth/LoginCard';
import ForgotPassword from './auth/ForgotPassword';
import RequestAccess from './auth/RequestAccess';
import ResetPassword from './auth/ResetPassword';

export type AuthView = 'login' | 'forgot-password' | 'request-access' | 'reset-password';

interface LoginPageProps {
    onLogin: () => void;
}

const features = [
    { icon: Zap, label: 'AI-Powered Discovery', desc: 'Find qualified leads automatically' },
    { icon: Target, label: 'Smart Prospect Scoring', desc: 'Focus on leads most likely to convert' },
    { icon: TrendingUp, label: 'Automated Campaigns', desc: 'Launch sequences while you sleep' },
];

const Orb = ({ className, delay = 0 }: { className: string; delay?: number }) => (
    <motion.div
        className={`absolute rounded-full blur-3xl opacity-30 ${className}`}
        animate={{ scale: [1, 1.15, 1], x: [0, 20, -10, 0], y: [0, -20, 10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay }}
    />
);

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [view, setView] = useState<AuthView>('login');
    const [resetToken, setResetToken] = useState<string | null>(null);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const mode = window.location.pathname.includes('reset-password') ? 'reset-password' : null;
        if (token && mode === 'reset-password') {
            setResetToken(token);
            setView('reset-password');
        }
    }, []);

    const renderView = () => {
        switch (view) {
            case 'login': return <LoginCard onLogin={onLogin} onViewChange={setView} />;
            case 'forgot-password': return <ForgotPassword onViewChange={setView} />;
            case 'request-access': return <RequestAccess onViewChange={setView} />;
            case 'reset-password': return <ResetPassword token={resetToken || ''} onViewChange={setView} />;
            default: return <LoginCard onLogin={onLogin} onViewChange={setView} />;
        }
    };

    return (
        <div className="h-screen w-screen overflow-hidden flex font-sans bg-[#0f172a]">

            {/* ─── LEFT PANEL ─── */}
            <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-[#0f172a]">
                <Orb className="w-[500px] h-[500px] bg-blue-600 top-[-100px] left-[-100px]" delay={0} />
                <Orb className="w-[400px] h-[400px] bg-indigo-700 bottom-[-80px] right-[40px]" delay={2.5} />
                <Orb className="w-[300px] h-[300px] bg-blue-400 top-[40%] left-[30%]" delay={5} />

                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />

                <div className="relative z-10 flex flex-col h-full p-14 justify-between">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center gap-3"
                    >
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/40">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-white text-2xl font-bold tracking-tight">AutoSDR</span>
                    </motion.div>

                    <div className="max-w-sm">
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                            <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5 mb-6">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                <span className="text-blue-300 text-xs font-bold uppercase tracking-widest">AI Agents Active</span>
                            </div>
                            <h1 className="text-5xl font-extrabold text-white leading-[1.1] tracking-tight mb-4">
                                Automate your<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">B2B outreach</span><br />
                                with AI agents
                            </h1>
                            <p className="text-slate-400 text-lg font-medium leading-relaxed">
                                Find leads · Score prospects · Launch campaigns automatically
                            </p>
                        </motion.div>

                        <div className="mt-10 space-y-3">
                            {features.map((f, i) => {
                                const Icon = f.icon;
                                return (
                                    <motion.div
                                        key={f.label}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: 0.5 + i * 0.12 }}
                                        className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 backdrop-blur-sm"
                                    >
                                        <div className="w-9 h-9 bg-blue-600/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="text-white text-sm font-bold">{f.label}</div>
                                            <div className="text-slate-400 text-xs font-medium">{f.desc}</div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>


                </div>
            </div>

            {/* ─── RIGHT PANEL ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full lg:w-[520px] flex-shrink-0 bg-white flex flex-col items-center justify-center relative overflow-hidden"
            >
                {/* Top accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400" />

                {/* Mobile logo */}
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="lg:hidden absolute top-8 left-8 flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-slate-900 text-xl font-bold">AutoSDR</span>
                </motion.div>

                <div className="w-full max-w-[400px] px-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={view}
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -16, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                        >
                            {renderView()}
                        </motion.div>
                    </AnimatePresence>

                    {/* "Don't have an account? Request access" — only on login view */}
                    <AnimatePresence>
                        {view === 'login' && (
                            <motion.p
                                key="request-link"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ delay: 0.25 }}
                                className="mt-6 text-center text-sm text-slate-500 font-medium"
                            >
                                Don't have an account?{' '}
                                <button
                                    onClick={() => setView('request-access')}
                                    className="text-blue-600 font-bold hover:underline underline-offset-4 transition-colors"
                                >
                                    Request access
                                </button>
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
