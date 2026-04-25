/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Wallet, 
  Settings as SettingsIcon, 
  Info, 
  Menu, 
  Search, 
  Bell, 
  Plus, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CloudUpload,
  CloudDownload,
  FileSpreadsheet,
  Palette,
  Edit2,
  Calendar,
  Gift,
  User,
  CheckCircle,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { cn, LedgerRecord, Scenario, SCENARIOS } from './lib/utils';

// --- Components ---

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  
  return (
    <div className="flex flex-col min-h-screen">
      <header className="glass border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-screen-md mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-extrabold text-on-surface tracking-tighter">往来礼记</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2.5 glass-dark rounded-2xl transition-all active:scale-95">
              <Search className="w-6 h-6 text-on-surface" />
            </button>
            <div className="w-10 h-10 rounded-full primary-gradient flex items-center justify-center text-white font-bold text-sm shadow-lg glow-primary">
              JS
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-md mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

// --- Pages ---

const Dashboard = () => {
  return (
    <div className="space-y-8 flex flex-col items-center justify-center min-h-[60vh]">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <div className="relative overflow-hidden primary-gradient p-6 rounded-[2.5rem] shadow-2xl text-white glow-primary group">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-bold opacity-80 uppercase tracking-widest">总收礼</p>
              <h2 className="text-3xl font-black mt-2 tracking-tighter">¥ 0.00</h2>
            </div>
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
              <Wallet className="w-8 h-8" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 relative z-10">
            <span className="bg-white/30 backdrop-blur-xl px-4 py-1.5 rounded-full text-xs font-black">0% 较上月</span>
            <span className="text-xs font-bold opacity-70">暂无新增</span>
          </div>
        </div>

        <div className="relative overflow-hidden celebration-gradient p-6 rounded-[2.5rem] shadow-2xl text-white glow-secondary group">
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-black/10 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-bold opacity-80 uppercase tracking-widest">总随礼</p>
              <h2 className="text-3xl font-black mt-2 tracking-tighter">¥ 0.00</h2>
            </div>
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
              <Gift className="w-8 h-8" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 relative z-10">
            <span className="bg-white/30 backdrop-blur-xl px-4 py-1.5 rounded-full text-xs font-black">0% 较上月</span>
            <span className="text-xs font-bold opacity-70">暂无记录</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 w-full">
        <Link to="/add" className={cn(
          "glass p-10 rounded-[3.5rem] space-y-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 group",
          "bg-white/50 ios-shadow border-white/60 glow-primary"
        )}>
          <div className="w-24 h-24 rounded-[2.5rem] primary-gradient flex items-center justify-center text-white shadow-2xl transition-all group-hover:rotate-6 group-hover:scale-110">
            <Plus className="w-12 h-12 stroke-[3]" />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-2xl tracking-tight">记一笔</h3>
            <p className="text-sm font-bold text-on-surface-variant opacity-60">记录收到或送出的每一份情谊</p>
          </div>
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-6 w-full">
         {[
           { to: '/settings', icon: <SettingsIcon />, title: '设置', color: 'text-on-surface-variant', glow: 'ios-shadow', desc: '账户偏好设置' },
           { to: '/about', icon: <Info />, title: '关于', color: 'text-on-surface-variant', glow: 'ios-shadow', desc: '产品与开发信息' },
         ].map((item, idx) => (
           <Link key={idx} to={item.to} className={cn(
             "glass p-8 rounded-[3rem] space-y-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 group",
             "bg-white/40",
             item.glow
           )}>
              <div className={cn("w-16 h-16 rounded-[1.8rem] flex items-center justify-center bg-surface transition-all group-hover:rotate-6", item.color)}>
                {React.cloneElement(item.icon, { className: "w-8 h-8 stroke-[2.5]" })}
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-base tracking-tight">{item.title}</h3>
                <p className="text-[10px] font-bold text-on-surface-variant opacity-50">{item.desc}</p>
              </div>
           </Link>
         ))}
      </section>

      <section className="w-full space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-black text-on-surface tracking-tight">近期记录</h2>
          <Link to="/history" className="text-primary text-sm font-black flex items-center gap-2 group p-2 px-4 glass rounded-full">
            查看全部 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        <div className="flex flex-col items-center justify-center py-12 glass rounded-[3rem] bg-white/20 border-white/30 ios-shadow text-on-surface-variant opacity-40">
          <Clock size={48} className="mb-4 opacity-50" />
          <p className="font-black text-sm uppercase tracking-widest">暂无记录</p>
          <p className="text-xs font-bold mt-1">开始记一笔让记录丰满起来</p>
        </div>
      </section>
    </div>
  );
};

const RecordItem = ({ title, date, amount, scenario, type }: { title: string, date: string, amount: number, scenario: Scenario, type: 'sent' | 'received' }) => (
  <div className={cn(
    "p-3 bg-white border border-outline-variant/20 rounded-2xl flex items-center justify-between shadow-sm border-l-4",
    type === 'sent' ? "border-l-secondary" : "border-l-primary"
  )}>
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center",
        type === 'sent' ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary"
      )}>
        {scenario === 'celebration' ? <Heart className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
      </div>
      <div>
        <p className="text-sm font-bold text-on-surface leading-none">{title}</p>
        <p className="text-[10px] text-on-surface-variant mt-1.5 opacity-60 uppercase tracking-wider">{date} · {type === 'sent' ? '随礼' : '收礼'}</p>
      </div>
    </div>
    <p className={cn(
      "text-sm font-bold",
      amount < 0 ? "text-secondary" : "text-tertiary-container"
    )}>
      {amount < 0 ? `- ¥ ${Math.abs(amount)}` : `+ ¥ ${amount}`}
    </p>
  </div>
);

const AddRecord = ({ defaultType }: { defaultType?: 'sent' | 'received' }) => {
  const [searchParams] = useSearchParams();
  const initialType = defaultType || (searchParams.get('type') as 'sent' | 'received') || 'received';
  
  const [scenario, setScenario] = useState<Scenario>('celebration');
  const [recordType, setRecordType] = useState<'sent' | 'received'>(initialType);
  const [customEvents, setCustomEvents] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [newCustomEvent, setNewCustomEvent] = useState('');
  
  const baseEvents = SCENARIOS[scenario].events;
  const allEvents = [...baseEvents, ...customEvents];
  const [selectedEvent, setSelectedEvent] = useState(allEvents[0]);
  
  const config = SCENARIOS[scenario];

  const handleAddCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomEvent.trim() && !allEvents.includes(newCustomEvent.trim())) {
      setCustomEvents(prev => [...prev, newCustomEvent.trim()]);
      setSelectedEvent(newCustomEvent.trim());
      setNewCustomEvent('');
      setShowCustomInput(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4 mb-2">
        <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </Link>
        <h2 className="text-2xl font-black tracking-tight">{recordType === 'received' ? '收礼登记' : '随礼登记'}</h2>
      </div>

      <div className={cn(
        "relative overflow-hidden rounded-[3rem] p-8 text-white shadow-2xl transition-all duration-500", 
        recordType === 'received' ? (scenario === 'celebration' ? 'celebration-gradient glow-secondary' : 'solemn-gradient ios-shadow') : 'primary-gradient glow-primary'
      )}>
        <div className="relative z-10 space-y-2">
          <p className="text-xs font-black opacity-80 tracking-[0.2em] uppercase">
            {recordType === 'received' ? '别人送给我的' : '我送给别人的'}
          </p>
          <h2 className="text-3xl font-black tracking-tighter">
            {recordType === 'received' ? SCENARIOS[scenario].title : '随礼登记'}
          </h2>
          <p className="text-sm font-bold opacity-70">
            {recordType === 'received' ? SCENARIOS[scenario].subtitle : '礼尚往来，记录您送出的情谊。'}
          </p>
        </div>
        <div className="absolute -right-12 -bottom-12 opacity-10 transform rotate-12">
          {recordType === 'received' ? <Gift size={200} /> : <Wallet size={200} />}
        </div>
      </div>

      <div className="glass rounded-[3rem] p-8 ios-shadow space-y-8 bg-white/40">
        <div className="flex flex-col gap-6">
          <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2 mb-[-8px]">
            <Edit2 size={16} /> 选择账目类型
          </label>
          <div className="flex bg-surface-container-high/30 p-2.5 rounded-[2.2rem] gap-3 backdrop-blur-md shadow-inner">
            <button 
              type="button"
              onClick={() => setRecordType('received')}
              className={cn(
                "flex-1 py-5 rounded-[1.8rem] text-base font-black transition-all active:scale-95 shadow-sm",
                recordType === 'received' ? "bg-white text-primary glow-primary" : "text-on-surface-variant opacity-40 hover:opacity-100"
              )}
            >收礼登记</button>
            <button 
              type="button"
              onClick={() => setRecordType('sent')}
              className={cn(
                "flex-1 py-5 rounded-[1.8rem] text-base font-black transition-all active:scale-95 shadow-sm",
                recordType === 'sent' ? "bg-white text-secondary glow-secondary" : "text-on-surface-variant opacity-40 hover:opacity-100"
              )}
            >随礼挂礼</button>
          </div>
        </div>

        <form className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2">
              <User size={16} /> 姓名
            </label>
            <input 
              className="w-full bg-white/50 border border-white/20 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold outline-none backdrop-blur-md" 
              placeholder="请输入来宾姓名" 
            />
          </div>

          <div className={cn(
            "p-6 rounded-[2.5rem] space-y-3 transition-all backdrop-blur-md",
            recordType === 'received' ? (scenario === 'celebration' ? "bg-secondary/5 border border-secondary/10" : "bg-white/20 border border-white/30") : "bg-primary/5 border border-primary/10"
          )}>
            <label className={cn(
              "text-xs font-black flex items-center gap-2",
              recordType === 'received' ? (scenario === 'celebration' ? "text-secondary" : "text-on-surface-variant") : "text-primary"
            )}>
              <Wallet size={16} /> 金额 (元)
            </label>
            <div className={cn(
              "flex items-center border-b-2 py-2",
              recordType === 'received' ? (scenario === 'celebration' ? "border-secondary/30 focus-within:border-secondary" : "border-white/40 focus-within:border-on-surface") : "border-primary/30 focus-within:border-primary"
            )}>
              <span className={cn("text-xl font-black pr-3", recordType === 'received' ? (scenario === 'celebration' ? "text-secondary" : "text-on-surface") : "text-primary")}>¥</span>
              <input 
                className="w-full bg-transparent border-none focus:ring-0 text-3xl font-black p-0 text-on-surface" 
                placeholder="0.00" 
                type="number" 
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2">
              <Gift size={16} /> 事项
            </label>
            <div className="grid grid-cols-3 gap-3">
              {allEvents.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => setSelectedEvent(event)}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-95",
                    selectedEvent === event 
                      ? (recordType === 'received' ? (scenario === 'celebration' ? "border-secondary bg-white text-secondary shadow-lg shadow-secondary/20" : "border-on-surface bg-white text-on-surface shadow-lg") : "border-primary bg-white text-primary shadow-lg shadow-primary/20") 
                      : "border-white/40 bg-white/10 backdrop-blur-md text-on-surface-variant hover:bg-white/30"
                  )}
                >
                  <span className="text-xs font-black">{event}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-white/60 bg-white/5 backdrop-blur-md text-on-surface-variant hover:bg-white/20 active:scale-95 transition-all"
              >
                <Plus size={16} className="mb-0.5" />
                <span className="text-xs font-black">自定义</span>
              </button>
            </div>

            {showCustomInput && (
              <div className="mt-2 glass p-4 rounded-2xl flex gap-2 bg-white/40 border-white/60">
                <input 
                  type="text"
                  value={newCustomEvent}
                  onChange={(e) => setNewCustomEvent(e.target.value)}
                  className="flex-1 bg-white/50 border border-white/40 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="事项名称"
                  autoFocus
                />
                <button 
                  type="button"
                  onClick={handleAddCustomEvent}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all shadow-lg"
                >确定</button>
                <button 
                  type="button"
                  onClick={() => setShowCustomInput(false)}
                  className="bg-white/40 text-on-surface-variant px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all border border-white/40"
                >取消</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2">
                <Calendar size={16} /> 日期
              </label>
              <div className="relative">
                <input 
                  className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-primary/10 text-sm font-bold outline-none appearance-none cursor-pointer ios-shadow" 
                  type="date"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2">
                <Edit2 size={16} /> 模式
              </label>
              <div className="flex bg-white/20 p-2 rounded-2xl h-[60px] backdrop-blur-md border border-white/30 shadow-inner">
                <button 
                  type="button"
                  onClick={() => {
                    setScenario('celebration');
                    setSelectedEvent(SCENARIOS.celebration.events[0]);
                  }}
                  className={cn(
                    "flex-1 rounded-xl text-xs font-black transition-all active:scale-95",
                    scenario === 'celebration' ? "bg-white shadow-xl text-secondary" : "text-on-surface-variant opacity-40"
                  )}
                >喜事</button>
                <button 
                  type="button"
                  onClick={() => {
                    setScenario('solemn');
                    setSelectedEvent(SCENARIOS.solemn.events[0]);
                  }}
                  className={cn(
                    "flex-1 rounded-xl text-xs font-black transition-all active:scale-95",
                    scenario === 'solemn' ? "bg-white shadow-xl text-on-surface" : "text-on-surface-variant opacity-40"
                  )}
                >肃穆</button>
              </div>
            </div>
          </div>

          <button className={cn(
            "w-full py-5 rounded-[2rem] text-white text-lg font-black shadow-2xl active:scale-95 transition-all mt-6",
            recordType === 'received' ? (scenario === 'celebration' ? 'celebration-gradient glow-secondary' : 'solemn-gradient glow-primary') : 'primary-gradient glow-primary'
          )}>
            确认保存记录
          </button>
        </form>
      </div>
    </div>
  );
};

const Settings = () => {
  return (
    <div className="space-y-8">
      <section className="flex items-end justify-between px-2">
        <div>
          <Link to="/" className="p-2 mb-2 inline-block glass rounded-xl transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h2 className="text-3xl font-black font-extrabold tracking-tight text-on-surface">系统设置</h2>
          <p className="text-sm font-bold text-on-surface-variant mt-1 opacity-50">管理您的偏好设置与数据安全</p>
        </div>
        <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full flex items-center gap-2 border border-primary/20">
          <CheckCircle className="w-4 h-4 font-black" />
          <span className="text-xs font-black">V1.0</span>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingCard 
          icon={<Wallet className="text-primary" />} 
          title="货币选择" 
          desc="设置默认记账币种" 
          badge="CNY" 
          actionLabel="修改币种" 
        />
        <SettingCard 
          icon={<Palette className="text-primary" />} 
          title="主题切换" 
          desc="深色与浅色模式切换" 
          action={(
            <div className="flex bg-surface p-1.5 rounded-2xl w-full h-[48px]">
              <button className="flex-1 py-2 bg-white text-primary rounded-xl shadow-md text-xs font-black">浅色</button>
              <button className="flex-1 py-2 text-on-surface-variant text-xs font-black hover:bg-white/50 transition-all rounded-xl">深色</button>
            </div>
          )}
        />
        
        <div className="md:col-span-2 glass p-8 rounded-[3rem] ios-shadow space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl primary-gradient flex items-center justify-center shadow-lg glow-primary">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-black text-lg tracking-tight">数据管理</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <DataAction icon={<CloudUpload />} label="数据备份" />
            <DataAction icon={<CloudDownload />} label="恢复数据" />
            <DataAction icon={<FileSpreadsheet />} label="Excel导出" />
          </div>
        </div>
      </div>

      <section className="glass rounded-[3rem] p-6 border-white/50 ios-shadow flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[2rem] primary-gradient flex items-center justify-center text-white shadow-xl glow-primary">
            <User size={32} strokeWidth={2.5} />
          </div>
          <div>
            <h4 className="font-black text-lg text-on-surface tracking-tight">陈洪涛</h4>
            <p className="text-xs font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">UI Designer & Developer</p>
          </div>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs font-black text-primary">往来礼记 V1.0.0 Stable</p>
          <p className="text-[10px] font-bold text-on-surface-variant opacity-40">© 2024 All Rights Reserved.</p>
        </div>
      </section>
    </div>
  );
};

const SettingCard = ({ icon, title, desc, badge, actionLabel, action }: { icon: React.ReactNode, title: string, desc: string, badge?: string, actionLabel?: string, action?: React.ReactNode }) => (
  <div className="glass p-6 rounded-[2.5rem] ios-shadow flex flex-col justify-between min-h-[180px] transition-all hover:scale-[1.02]">
    <div className="flex justify-between items-start">
      <div className="space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center shadow-inner">
          {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
        </div>
        <div>
          <h3 className="font-black text-base tracking-tight">{title}</h3>
          <p className="text-xs font-bold text-on-surface-variant opacity-50">{desc}</p>
        </div>
      </div>
      {badge && <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black italic border border-primary/20">{badge}</div>}
    </div>
    <div className="mt-4">
      {action ? action : (
        <button className="w-full py-3 bg-white hover:bg-surface transition-all text-primary font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm">
          <Edit2 className="w-3.5 h-3.5" /> {actionLabel}
        </button>
      )}
    </div>
  </div>
);

const DataAction = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
  <button className="flex flex-col items-center justify-center p-6 bg-surface rounded-[2rem] hover:bg-white hover:shadow-lg transition-all group gap-3 active:scale-95">
    <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
      {React.cloneElement(icon as React.ReactElement, { className: "w-7 h-7 text-primary group-hover:stroke-[2.5]" })}
    </div>
    <span className="text-xs font-black whitespace-nowrap">{label}</span>
  </button>
);

// --- App Root ---

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddRecord />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sent" element={<div className="space-y-6"><AddRecord defaultType="sent" /></div>} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

const HistoryPage = () => {
  const [searchParams] = useSearchParams();
  const type = (searchParams.get('type') as 'sent' | 'received') || 'received';

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-2xl font-black tracking-tight">{type === 'received' ? '收礼明细' : '随礼明细'}</h2>
      </div>

      <div className="space-y-4">
        <RecordItem title="李华的婚礼" date="2024-11-20" type="sent" amount={-1000} scenario="celebration" />
        <RecordItem title="小张的满月酒" date="2024-11-15" type="received" amount={2000} scenario="celebration" />
        <RecordItem title="王五的乔迁之喜" date="2024-11-02" type="sent" amount={-600} scenario="celebration" />
        <RecordItem title="赵六的生日" date="2024-10-25" type="received" amount={500} scenario="celebration" />
        <RecordItem title="陈七的升学宴" date="2024-09-12" type="received" amount={800} scenario="celebration" />
      </div>
    </div>
  );
};

const AboutPage = () => {
  return (
    <div className="space-y-8 text-center py-6">
      <div className="flex items-center gap-4 text-left px-2">
        <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-2xl font-black tracking-tight">关于产品</h2>
      </div>

      <div className="flex flex-col items-center gap-6 mt-4">
        <div className="w-24 h-24 rounded-[2.5rem] primary-gradient flex items-center justify-center text-white shadow-2xl glow-primary">
          <Heart size={48} strokeWidth={2.5} />
        </div>
        <div className="space-y-2">
          <h2 className="text-4xl font-black tracking-tighter">往来礼记</h2>
          <p className="text-sm font-bold text-on-surface-variant opacity-50 uppercase tracking-[0.2em]">Version 1.0.0 Stable</p>
        </div>
      </div>

      <div className="glass p-8 rounded-[3rem] ios-shadow text-left space-y-6 max-w-sm mx-auto bg-white/40">
        <p className="text-sm font-bold leading-relaxed text-on-surface-variant">
          “礼尚往来”是中华民族的传统美德。往来礼记致力于为您提供最精致、最智能的数字化礼金管理服务。
        </p>
        
        <div className="pt-4 border-t border-white/40 space-y-4">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl primary-gradient flex items-center justify-center text-white shadow-xl glow-primary">
              <User size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-black text-base text-on-surface tracking-tight">陈洪涛</h4>
              <p className="text-[10px] font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">UI Designer & Developer</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-4 p-4 bg-surface rounded-2xl">
            <div className="w-10 h-10 rounded-xl primary-gradient flex items-center justify-center text-white shadow-lg">
              <CheckCircle size={20} />
            </div>
            <div className="text-left">
              <p className="text-xs font-black">极致隐私</p>
              <p className="text-[10px] font-bold opacity-50">本地存储，安全无忧</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-surface rounded-2xl">
            <div className="w-10 h-10 rounded-xl celebration-gradient flex items-center justify-center text-white shadow-lg">
              <TrendingUp size={20} />
            </div>
            <div className="text-left">
              <p className="text-xs font-black">智能统计</p>
              <p className="text-[10px] font-bold opacity-50">一目了然的情谊往来</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-10 space-y-2 text-[10px] font-bold text-on-surface-variant opacity-30">
        <p>© 2024 Wanglai Liji Team. All Rights Reserved.</p>
        <p>Made with Love for Chinese Traditions</p>
      </div>
    </div>
  );
};
