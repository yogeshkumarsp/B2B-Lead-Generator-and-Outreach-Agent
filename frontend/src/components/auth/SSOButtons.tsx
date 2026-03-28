import React from 'react';

const SSOButtons: React.FC = () => {
    const handleSSO = async (provider: string) => {
        console.log(`Continue with ${provider}`);
        window.location.href = `/api/auth/${provider}`;
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => handleSSO('google')}
                    className="flex items-center justify-center space-x-3 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-slate-700 h-[56px] px-6 rounded-2xl transition-all group"
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all opacity-80 group-hover:opacity-100" />
                    <span className="text-[14px] font-bold">Google</span>
                </button>
                <button
                    onClick={() => handleSSO('microsoft')}
                    className="flex items-center justify-center space-x-3 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-slate-700 h-[56px] px-6 rounded-2xl transition-all group"
                >
                    <img src="https://www.svgrepo.com/show/475662/microsoft-color.svg" alt="Microsoft" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all opacity-80 group-hover:opacity-100" />
                    <span className="text-[14px] font-bold">Microsoft</span>
                </button>
            </div>
        </div>
    );
};

export default SSOButtons;
