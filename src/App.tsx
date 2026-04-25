/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  Wallet,
  Settings as SettingsIcon,
  Info,
  Search,
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
  ArrowLeft,
  X,
  ChevronLeft
} from 'lucide-react';
import { cn, LedgerRecord, RecordType, Scenario, SCENARIOS } from './lib/utils';

// --- 本地存储键 ---
const STORAGE_KEY = 'wanglai_records';
const THEME_KEY = 'wanglai_theme';

// --- 数据层 ---
interface AppStore {
  records: LedgerRecord[];
  theme: 'light' | 'dark';
}

function loadStore(): AppStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const records = raw ? JSON.parse(raw) : [];
    const theme = (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light';
    return { records, theme };
  } catch {
    return { records: [], theme: 'light' };
  }
}

function saveStore(records: LedgerRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// --- 侧滑返回 (iOS 风格) ---
const SwipeBackContext = React.createContext<{
  onSwipeBack: () => void;
}>({ onSwipeBack: () => {} });

function useSwipeBack() {
  return React.useContext(SwipeBackContext);
}

// --- 顶部标题栏（可隐藏） ---
const AppHeader = ({ onSearchClick }: {
  onSearchClick?: () => void;
}) => {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const { onSwipeBack } = useSwipeBack();

  useEffect(() => {
    let startX = 0;
    let translating = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      if (startX > 30) return;
      translating = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!translating) return;
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      if (dx > 0 && dx < 200) {
        const main = document.querySelector('main');
        if (main) {
          main.style.transform = `translateX(${dx}px)`;
          main.style.transition = 'none';
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!translating) return;
      translating = false;
      const dx = e.changedTouches[0].clientX - startX;
      const main = document.querySelector('main');
      if (main) {
        main.style.transform = '';
        main.style.transition = 'transform 0.3s ease';
      }
      if (dx > 80) onSwipeBack();
    };

    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const scrollY = target.scrollTop;
      if (scrollY > lastY.current && scrollY > 60) setHidden(true);
      else setHidden(false);
      lastY.current = scrollY;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    const main = document.querySelector('main');
    main?.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      main?.removeEventListener('scroll', onScroll);
    };
  }, [onSwipeBack]);

  return (
    <header className={cn(
      "glass border-b border-white/20 z-50 transition-transform duration-300",
      hidden ? "-translate-y-full" : "translate-y-0"
    )}>
      <div className="max-w-screen-md mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tighter">往来礼记</h1>
        </div>
        <div className="flex items-center gap-3">
          {onSearchClick ? (
            <button onClick={onSearchClick} className="p-2.5 glass-dark rounded-2xl transition-all active:scale-95">
              <Search className="w-6 h-6 text-on-surface" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};

// --- Toast 提示 ---
const Toast = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 50, scale: 0.9 }}
    className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] bg-black/80 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-3"
  >
    <CheckCircle className="w-6 h-6 text-green-400" />
    <span className="font-black text-sm">{message}</span>
    <button onClick={onClose} className="ml-2 p-1 rounded-full hover:bg-white/20 transition-all">
      <X className="w-4 h-4" />
    </button>
  </motion.div>
);

// --- 搜索弹窗 ---
const SearchModal = ({ records, onClose }: { records: LedgerRecord[]; onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const filtered = records.filter(r =>
    r.name.includes(query) || r.event.includes(query)
  );
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24 px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-md glass rounded-[2.5rem] p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-on-surface-variant" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索姓名或事项..."
            className="flex-1 bg-white/50 border border-white/20 rounded-2xl px-4 py-3 text-sm font-bold outline-none" />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant opacity-50 py-6 font-bold">无匹配记录</p>
          ) : filtered.map(r => (
            <div key={r.id} className={cn("p-4 rounded-2xl border-l-4 flex justify-between items-center",
              r.type === 'sent' ? "border-l-secondary bg-secondary/5" : "border-l-primary bg-primary/5")}>
              <div>
                <p className="text-sm font-black">{r.name}</p>
                <p className="text-xs text-on-surface-variant mt-1">{r.event} · {r.date}</p>
              </div>
              <p className={cn("text-sm font-black", r.type === 'sent' ? "text-secondary" : "text-green-600")}>
                {r.type === 'sent' ? '-' : '+'}¥{Math.abs(r.amount)}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- 统计卡片 ---
const StatCard = ({ label, amount, icon, gradient, glow, subLabel }: {
  label: string; amount: number; icon: React.ReactNode;
  gradient: string; glow: string; subLabel: string;
}) => (
  <div className={cn("relative overflow-hidden p-6 rounded-[2.5rem] shadow-2xl text-white group", gradient, glow)}>
    <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform" />
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-sm font-bold opacity-80 uppercase tracking-widest">{label}</p>
        <h2 className="text-3xl font-black mt-2 tracking-tighter">¥ {amount.toFixed(2)}</h2>
      </div>
      <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">{icon}</div>
    </div>
    <div className="mt-6 flex items-center gap-3 relative z-10">
      <span className="bg-white/30 backdrop-blur-xl px-4 py-1.5 rounded-full text-xs font-black">{subLabel}</span>
    </div>
  </div>
);

// --- 记录项 ---
const RecordItem = ({ record }: { record: LedgerRecord }) => (
  <div className={cn(
    "p-3 bg-white border border-outline-variant/20 rounded-2xl flex items-center justify-between shadow-sm border-l-4",
    record.type === 'sent' ? "border-l-secondary" : "border-l-primary"
  )}>
    <div className="flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center",
        record.type === 'sent' ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary")}>
        {record.scenario === 'celebration' ? <Heart className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
      </div>
      <div>
        <p className="text-sm font-bold text-on-surface leading-none">{record.name}</p>
        <p className="text-[10px] text-on-surface-variant mt-1.5 opacity-60 uppercase tracking-wider">
          {record.date} · {record.event} · {record.type === 'sent' ? '随礼' : '收礼'}
        </p>
      </div>
    </div>
    <p className={cn("text-sm font-black", record.type === 'sent' ? "text-secondary" : "text-green-600")}>
      {record.type === 'sent' ? `- ¥ ${Math.abs(record.amount)}` : `+ ¥ ${record.amount}`}
    </p>
  </div>
);

// --- Layout ---
const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 w-full max-w-screen-md mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

// --- Dashboard ---
const Dashboard = ({ records }: { records: LedgerRecord[] }) => {
  const [showSearch, setShowSearch] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const totalReceived = records.filter(r => r.type === 'received').reduce((sum, r) => sum + r.amount, 0);
  const totalSent = records.filter(r => r.type === 'sent').reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const recent = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const thisMonth = records.filter(r => r.date.startsWith(today.slice(0, 7)));
  const lastMonth = records.filter(r => {
    const lm = new Date(today); lm.setMonth(lm.getMonth() - 1);
    return r.date.startsWith(lm.toISOString().slice(0, 7));
  });
  const thisMonthSent = thisMonth.filter(r => r.type === 'sent').reduce((s, r) => s + Math.abs(r.amount), 0);
  const lastMonthSent = lastMonth.filter(r => r.type === 'sent').reduce((s, r) => s + Math.abs(r.amount), 0);
  const changePct = lastMonthSent > 0 ? Math.round(((thisMonthSent - lastMonthSent) / lastMonthSent) * 100) : 0;

  return (
    <>
      <AppHeader onSearchClick={() => setShowSearch(true)} />
      <div className="space-y-8 flex flex-col items-center justify-center min-h-[60vh]">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full pt-4">
          <StatCard label="总收礼" amount={totalReceived} icon={<Wallet className="w-8 h-8" />} gradient="primary-gradient" glow="glow-primary" subLabel={`${changePct >= 0 ? '+' : ''}${changePct}% 较上月`} />
          <StatCard label="总随礼" amount={totalSent} icon={<Gift className="w-8 h-8" />} gradient="celebration-gradient" glow="glow-secondary" subLabel={recent.length > 0 ? `${recent.length} 条近期记录` : '暂无记录'} />
        </section>
        <section className="grid grid-cols-1 gap-6 w-full">
          <Link to="/add" className={cn("glass p-10 rounded-[3.5rem] space-y-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 group bg-white/50 ios-shadow border-white/60 glow-primary")}>
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
          {[{ to: '/settings', icon: <SettingsIcon />, title: '设置', desc: '账户偏好设置' }, { to: '/about', icon: <Info />, title: '关于', desc: '产品与开发信息' }].map((item, idx) => (
            <Link key={idx} to={item.to} className="glass p-8 rounded-[3rem] space-y-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 group bg-white/40 ios-shadow">
              <div className="w-16 h-16 rounded-[1.8rem] flex items-center justify-center bg-surface transition-all group-hover:rotate-6 text-on-surface-variant">
                {React.cloneElement(item.icon as React.ReactElement, { className: "w-8 h-8 stroke-[2.5]" })}
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
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 glass rounded-[3rem] bg-white/20 border-white/30 ios-shadow text-on-surface-variant opacity-40">
              <Clock size={48} className="mb-4 opacity-50" />
              <p className="font-black text-sm uppercase tracking-widest">暂无记录</p>
              <p className="text-xs font-bold mt-1">开始记一笔让记录丰满起来</p>
            </div>
          ) : <div className="space-y-2">{recent.map(r => <RecordItem key={r.id} record={r} />)}</div>}
        </section>
      </div>
      <AnimatePresence>{showSearch && <SearchModal records={records} onClose={() => setShowSearch(false)} />}</AnimatePresence>
    </>
  );
};

// --- AddRecord ---
const AddRecord = ({ defaultType, onSave }: { defaultType?: 'sent' | 'received'; onSave: (record: LedgerRecord) => void }) => {
  const [searchParams] = useSearchParams();
  const today = new Date().toISOString().split('T')[0];
  const initialType = defaultType || (searchParams.get('type') as 'sent' | 'received') || 'received';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [scenario, setScenario] = useState<Scenario>('celebration');
  const [recordType, setRecordType] = useState<'sent' | 'received'>(initialType);
  const [customEvents, setCustomEvents] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [newCustomEvent, setNewCustomEvent] = useState('');
  const [date, setDate] = useState(today);
  const [showToast, setShowToast] = useState(false);
  const baseEvents = SCENARIOS[scenario].events;
  const allEvents = [...baseEvents, ...customEvents];
  const [selectedEvent, setSelectedEvent] = useState(allEvents[0]);

  const handleAddCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomEvent.trim() && !allEvents.includes(newCustomEvent.trim())) {
      setCustomEvents(prev => [...prev, newCustomEvent.trim()]);
      setSelectedEvent(newCustomEvent.trim());
      setNewCustomEvent('');
      setShowCustomInput(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || parseFloat(amount) <= 0) return;
    const record: LedgerRecord = { id: Date.now().toString(), name: name.trim(), amount: parseFloat(amount), type: recordType, scenario, event: selectedEvent, date };
    onSave(record);
    setShowToast(true);
    setTimeout(() => { setShowToast(false); window.location.href = '/'; }, 1500);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4 mb-2">
        <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95">
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </Link>
        <h2 className="text-2xl font-black tracking-tight">{recordType === 'received' ? '收礼登记' : '随礼登记'}</h2>
      </div>
      <div className={cn("relative overflow-hidden rounded-[3rem] p-8 text-white shadow-2xl transition-all duration-500",
        recordType === 'received' ? (scenario === 'celebration' ? 'celebration-gradient glow-secondary' : 'solemn-gradient ios-shadow') : 'primary-gradient glow-primary')}>
        <div className="relative z-10 space-y-2">
          <p className="text-xs font-black opacity-80 tracking-[0.2em] uppercase">{recordType === 'received' ? '别人送给我的' : '我送给别人的'}</p>
          <h2 className="text-3xl font-black tracking-tighter">{recordType === 'received' ? SCENARIOS[scenario].title : '随礼登记'}</h2>
          <p className="text-sm font-bold opacity-70">{recordType === 'received' ? SCENARIOS[scenario].subtitle : '礼尚往来，记录您送出的情谊。'}</p>
        </div>
        <div className="absolute -right-12 -bottom-12 opacity-10 transform rotate-12">{recordType === 'received' ? <Gift size={200} /> : <Wallet size={200} />}</div>
      </div>
      <div className="glass rounded-[3rem] p-8 ios-shadow space-y-8 bg-white/40">
        <div className="flex flex-col gap-6">
          <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2 mb-[-8px]"><Edit2 size={16} /> 选择账目类型</label>
          <div className="flex bg-surface-container-high/30 p-2.5 rounded-[2.2rem] gap-3 backdrop-blur-md shadow-inner">
            <button type="button" onClick={() => setRecordType('received')} className={cn("flex-1 py-5 rounded-[1.8rem] text-base font-black transition-all active:scale-95 shadow-sm", recordType === 'received' ? "bg-white text-primary glow-primary" : "text-on-surface-variant opacity-40 hover:opacity-100")}>收礼登记</button>
            <button type="button" onClick={() => setRecordType('sent')} className={cn("flex-1 py-5 rounded-[1.8rem] text-base font-black transition-all active:scale-95 shadow-sm", recordType === 'sent' ? "bg-white text-secondary glow-secondary" : "text-on-surface-variant opacity-40 hover:opacity-100")}>随礼挂礼</button>
          </div>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2"><User size={16} /> 姓名</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/50 border border-white/20 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-primary/10 transition-all text-sm font-bold outline-none backdrop-blur-md" placeholder="请输入姓名" required />
          </div>
          <div className={cn("p-6 rounded-[2.5rem] space-y-3 transition-all backdrop-blur-md", recordType === 'received' ? (scenario === 'celebration' ? "bg-secondary/5 border border-secondary/10" : "bg-white/20 border border-white/30") : "bg-primary/5 border border-primary/10")}>
            <label className={cn("text-xs font-black flex items-center gap-2", recordType === 'received' ? (scenario === 'celebration' ? "text-secondary" : "text-on-surface-variant") : "text-primary")}><Wallet size={16} /> 金额 (元)</label>
            <div className={cn("flex items-center border-b-2 py-2", recordType === 'received' ? (scenario === 'celebration' ? "border-secondary/30 focus-within:border-secondary" : "border-white/40 focus-within:border-on-surface") : "border-primary/30 focus-within:border-primary")}>
              <span className={cn("text-xl font-black pr-3", recordType === 'received' ? (scenario === 'celebration' ? "text-secondary" : "text-on-surface") : "text-primary")}>¥</span>
              <input value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 text-3xl font-black p-0 text-on-surface" placeholder="0.00" type="number" min="0.01" step="0.01" required />
            </div>
          </div>
          <div className="space-y-4">
            <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2"><Gift size={16} /> 事项</label>
            <div className="grid grid-cols-3 gap-3">
              {allEvents.map((event) => (
                <button key={event} type="button" onClick={() => setSelectedEvent(event)} className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-95",
                  selectedEvent === event ? (recordType === 'received' ? (scenario === 'celebration' ? "border-secondary bg-white text-secondary shadow-lg shadow-secondary/20" : "border-on-surface bg-white text-on-surface shadow-lg") : "border-primary bg-white text-primary shadow-lg shadow-primary/20") : "border-white/40 bg-white/10 backdrop-blur-md text-on-surface-variant hover:bg-white/30")}>
                  <span className="text-xs font-black">{event}</span>
                </button>
              ))}
              <button type="button" onClick={() => setShowCustomInput(true)} className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-white/60 bg-white/5 backdrop-blur-md text-on-surface-variant hover:bg-white/20 active:scale-95 transition-all">
                <Plus size={16} className="mb-0.5" /><span className="text-xs font-black">自定义</span>
              </button>
            </div>
            {showCustomInput && (
              <div className="mt-2 glass p-4 rounded-2xl flex gap-2 bg-white/40 border-white/60">
                <input type="text" value={newCustomEvent} onChange={e => setNewCustomEvent(e.target.value)} className="flex-1 bg-white/50 border border-white/40 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" placeholder="事项名称" autoFocus />
                <button type="button" onClick={handleAddCustomEvent} className="bg-primary text-white px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all shadow-lg">确定</button>
                <button type="button" onClick={() => setShowCustomInput(false)} className="bg-white/40 text-on-surface-variant px-4 py-2 rounded-xl text-xs font-black active:scale-95 transition-all border border-white/40">取消</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2"><Calendar size={16} /> 日期</label>
              <input value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white/40 backdrop-blur-md border border-white/40 rounded-2xl px-6 py-4 focus:ring-4 focus:ring-primary/10 text-sm font-bold outline-none appearance-none cursor-pointer ios-shadow" type="date" />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-black text-on-surface-variant flex items-center gap-2 ml-2"><Edit2 size={16} /> 模式</label>
              <div className="flex bg-white/20 p-2 rounded-2xl h-[60px] backdrop-blur-md border border-white/30 shadow-inner">
                <button type="button" onClick={() => { setScenario('celebration'); setSelectedEvent(SCENARIOS.celebration.events[0]); }} className={cn("flex-1 rounded-xl text-xs font-black transition-all active:scale-95", scenario === 'celebration' ? "bg-white shadow-xl text-secondary" : "text-on-surface-variant opacity-40")}>喜事</button>
                <button type="button" onClick={() => { setScenario('solemn'); setSelectedEvent(SCENARIOS.solemn.events[0]); }} className={cn("flex-1 rounded-xl text-xs font-black transition-all active:scale-95", scenario === 'solemn' ? "bg-white shadow-xl text-on-surface" : "text-on-surface-variant opacity-40")}>肃穆</button>
              </div>
            </div>
          </div>
          <button type="submit" className={cn("w-full py-5 rounded-[2rem] text-white text-lg font-black shadow-2xl active:scale-95 transition-all mt-6",
            recordType === 'received' ? (scenario === 'celebration' ? 'celebration-gradient glow-secondary' : 'solemn-gradient glow-primary') : 'primary-gradient glow-primary')}>
            确认保存记录
          </button>
        </form>
      </div>
      <AnimatePresence>{showToast && <Toast message="录入成功！" onClose={() => setShowToast(false)} />}</AnimatePresence>
    </div>
  );
};

// --- HistoryPage ---
const HistoryPage = ({ records }: { records: LedgerRecord[] }) => {
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [query, setQuery] = useState('');
  const filtered = records.filter(r => filter === 'all' || r.type === filter).filter(r => !query || r.name.includes(query) || r.event.includes(query)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95"><ArrowLeft className="w-6 h-6 text-on-surface" /></Link>
        <h2 className="text-2xl font-black tracking-tight">全部记录</h2>
      </div>
      <div className="flex gap-2">
        {(['all', 'received', 'sent'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-4 py-2 rounded-full text-xs font-black transition-all", filter === f ? "primary-gradient text-white shadow-lg" : "glass text-on-surface-variant opacity-50")}>
            {f === 'all' ? '全部' : f === 'received' ? '收礼' : '随礼'}
          </button>
        ))}
      </div>
      <div className="flex bg-white/40 glass rounded-2xl px-4 py-2 items-center gap-2">
        <Search className="w-4 h-4 text-on-surface-variant" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索姓名或事项..." className="flex-1 bg-transparent text-sm font-bold outline-none" />
      </div>
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant opacity-40"><Clock size={48} className="mx-auto mb-4" /><p className="font-black text-sm">暂无记录</p></div>
        ) : filtered.map(r => <RecordItem key={r.id} record={r} />)}
      </div>
    </div>
  );
};

// --- Settings ---
const Settings = ({ theme, onThemeChange, onExport, onBackup, onRestore }: {
  theme: 'light' | 'dark'; onThemeChange: (t: 'light' | 'dark') => void;
  onExport: () => void; onBackup: () => void; onRestore: () => void;
}) => {
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toast = (msg: string) => { setToastMsg(msg); setShowToast(true); setTimeout(() => setShowToast(false), 2000); };

  return (
    <div className="space-y-8">
      <section className="flex items-end justify-between px-2">
        <div>
          <Link to="/" className="p-2 mb-2 inline-block glass rounded-xl transition-all active:scale-95"><ArrowLeft className="w-5 h-5" /></Link>
          <h2 className="text-3xl font-black font-extrabold tracking-tight text-on-surface">系统设置</h2>
          <p className="text-sm font-bold text-on-surface-variant mt-1 opacity-50">管理您的偏好设置与数据安全</p>
        </div>
        <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full flex items-center gap-2 border border-primary/20">
          <CheckCircle className="w-4 h-4 font-black" /><span className="text-xs font-black">V1.0</span>
        </div>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SettingCard icon={<Wallet className="text-primary" />} title="货币选择" desc="设置默认记账币种" badge="CNY" actionLabel="修改币种" />
        <SettingCard icon={<Palette className="text-primary" />} title="主题切换" desc="深色与浅色模式切换" action={
          <div className="flex bg-surface p-1.5 rounded-2xl w-full h-[48px]">
            <button onClick={() => { onThemeChange('light'); toast('已切换浅色主题'); }} className={cn("flex-1 py-2 rounded-xl shadow-md text-xs font-black transition-all", theme === 'light' ? "bg-white text-primary shadow-xl" : "text-on-surface-variant hover:bg-white/50")}>浅色</button>
            <button onClick={() => { onThemeChange('dark'); toast('已切换深色主题'); }} className={cn("flex-1 py-2 text-xs font-black transition-all rounded-xl", theme === 'dark' ? "bg-white text-secondary shadow-xl" : "text-on-surface-variant hover:bg-white/50")}>深色</button>
          </div>
        } />
        <div className="md:col-span-2 glass p-8 rounded-[3rem] ios-shadow space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl primary-gradient flex items-center justify-center shadow-lg glow-primary"><SettingsIcon className="w-5 h-5 text-white" /></div>
            <h3 className="font-black text-lg tracking-tight">数据管理</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <DataAction icon={<CloudUpload />} label="数据备份" onClick={() => { onBackup(); toast('数据已备份'); }} />
            <DataAction icon={<CloudDownload />} label="恢复数据" onClick={() => { onRestore(); toast('数据已恢复'); }} />
            <DataAction icon={<FileSpreadsheet />} label="Excel导出" onClick={() => { onExport(); toast('导出完成'); }} />
          </div>
        </div>
      </div>
      <section className="glass rounded-[3rem] p-6 border-white/50 ios-shadow flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[2rem] primary-gradient flex items-center justify-center text-white shadow-xl glow-primary"><User size={32} strokeWidth={2.5} /></div>
          <div><h4 className="font-black text-lg text-on-surface tracking-tight">陈洪涛</h4><p className="text-xs font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">UI Designer & Developer</p></div>
        </div>
        <div className="text-right space-y-1"><p className="text-xs font-black text-primary">往来礼记 V1.0.0 Stable</p><p className="text-[10px] font-bold text-on-surface-variant opacity-40">© 2024 All Rights Reserved.</p></div>
      </section>
      <AnimatePresence>{showToast && <Toast message={toastMsg} onClose={() => setShowToast(false)} />}</AnimatePresence>
    </div>
  );
};

const SettingCard = ({ icon, title, desc, badge, actionLabel, action }: { icon: React.ReactNode; title: string; desc: string; badge?: string; actionLabel?: string; action?: React.ReactNode }) => (
  <div className="glass p-6 rounded-[2.5rem] ios-shadow flex flex-col justify-between min-h-[180px] transition-all hover:scale-[1.02]">
    <div className="flex justify-between items-start">
      <div className="space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center shadow-inner">{React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}</div>
        <div><h3 className="font-black text-base tracking-tight">{title}</h3><p className="text-xs font-bold text-on-surface-variant opacity-50">{desc}</p></div>
      </div>
      {badge && <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black italic border border-primary/20">{badge}</div>}
    </div>
    <div className="mt-4">{action ? action : <button className="w-full py-3 bg-white hover:bg-surface transition-all text-primary font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm"><Edit2 className="w-3.5 h-3.5" /> {actionLabel}</button>}</div>
  </div>
);

const DataAction = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex flex-col items-center justify-center p-6 bg-surface rounded-[2rem] hover:bg-white hover:shadow-lg transition-all group gap-3 active:scale-95 cursor-pointer">
    <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">{React.cloneElement(icon as React.ReactElement, { className: "w-7 h-7 text-primary group-hover:stroke-[2.5]" })}</div>
    <span className="text-xs font-black whitespace-nowrap">{label}</span>
  </button>
);

// --- About ---
const AboutPage = () => (
  <div className="space-y-8 text-center py-6">
    <div className="flex items-center gap-4 text-left px-2">
      <Link to="/" className="p-2.5 glass rounded-2xl transition-all active:scale-95"><ArrowLeft className="w-6 h-6 text-on-surface" /></Link>
      <h2 className="text-2xl font-black tracking-tight">关于产品</h2>
    </div>
    <div className="flex flex-col items-center gap-6 mt-4">
      <div className="w-24 h-24 rounded-[2.5rem] primary-gradient flex items-center justify-center text-white shadow-2xl glow-primary"><Heart size={48} strokeWidth={2.5} /></div>
      <div className="space-y-2"><h2 className="text-4xl font-black tracking-tighter">往来礼记</h2><p className="text-sm font-bold text-on-surface-variant opacity-50 uppercase tracking-[0.2em]">Version 1.0.0 Stable</p></div>
    </div>
    <div className="glass p-8 rounded-[3rem] ios-shadow text-left space-y-6 max-w-sm mx-auto bg-white/40">
      <p className="text-sm font-bold leading-relaxed text-on-surface-variant">"礼尚往来"是中华民族的传统美德。往来礼记致力于为您提供最精致、最智能的数字化礼金管理服务。</p>
      <div className="pt-4 border-t border-white/40 space-y-4">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl primary-gradient flex items-center justify-center text-white shadow-xl glow-primary"><User size={28} strokeWidth={2.5} /></div>
          <div><h4 className="font-black text-base text-on-surface tracking-tight">陈洪涛</h4><p className="text-[10px] font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">UI Designer & Developer</p></div>
        </div>
      </div>
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-4 p-4 bg-surface rounded-2xl"><div className="w-10 h-10 rounded-xl primary-gradient flex items-center justify-center text-white shadow-lg"><CheckCircle size={20} /></div><div className="text-left"><p className="text-xs font-black">极致隐私</p><p className="text-[10px] font-bold opacity-50">本地存储，安全无忧</p></div></div>
        <div className="flex items-center gap-4 p-4 bg-surface rounded-2xl"><div className="w-10 h-10 rounded-xl celebration-gradient flex items-center justify-center text-white shadow-lg"><TrendingUp size={20} /></div><div className="text-left"><p className="text-xs font-black">智能统计</p><p className="text-[10px] font-bold opacity-50">一目了然的情谊往来</p></div></div>
      </div>
    </div>
    <div className="pt-10 space-y-2 text-[10px] font-bold text-on-surface-variant opacity-30"><p>© 2024 Wanglai Liji Team. All Rights Reserved.</p><p>Made with Love for Chinese Traditions</p></div>
  </div>
);

// --- App Root ---
export default function App() {
  const [store, setStore] = useState<AppStore>(loadStore);

  useEffect(() => {
    saveStore(store.records);
    document.documentElement.setAttribute('data-theme', store.theme);
    localStorage.setItem(THEME_KEY, store.theme);
  }, [store]);

  const handleSave = useCallback((record: LedgerRecord) => {
    setStore(prev => ({ ...prev, records: [...prev.records, record] }));
  }, []);

  const handleThemeChange = useCallback((theme: 'light' | 'dark') => {
    setStore(prev => ({ ...prev, theme }));
  }, []);

  const handleBackup = useCallback(() => {
    const data = JSON.stringify(store.records, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `wanglai-backup-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
  }, [store.records]);

  const handleRestore = useCallback(() => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { try { const records = JSON.parse(ev.target?.result as string); if (Array.isArray(records)) setStore(prev => ({ ...prev, records })); } catch { alert('文件格式错误'); } };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleExport = useCallback(() => {
    if (store.records.length === 0) return;
    const header = '\uFEFF姓名,类型,事项,金额,日期,场景';
    const rows = store.records.map(r => `${r.name},${r.type === 'sent' ? '随礼' : '收礼'},${r.event},${r.amount},${r.date},${r.scenario === 'celebration' ? '喜事' : '肃穆'}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `wanglai-export-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  }, [store.records]);

  const navigateBack = useCallback(() => { window.location.href = '/'; }, []);

  return (
    <Router>
      <SwipeBackContext.Provider value={{ onSwipeBack: navigateBack }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard records={store.records} />} />
            <Route path="/add" element={<AddRecord onSave={handleSave} />} />
            <Route path="/sent" element={<AddRecord defaultType="sent" onSave={handleSave} />} />
            <Route path="/history" element={<HistoryPage records={store.records} />} />
            <Route path="/settings" element={<Settings theme={store.theme} onThemeChange={handleThemeChange} onExport={handleExport} onBackup={handleBackup} onRestore={handleRestore} />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </Layout>
      </SwipeBackContext.Provider>
    </Router>
  );
}