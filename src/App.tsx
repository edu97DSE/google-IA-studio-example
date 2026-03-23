/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday,
  parseISO
} from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  Dumbbell, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  LogOut, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Scale,
  Ruler,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { db, auth } from './firebase';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface GymSession {
  id: string;
  date: string;
  workoutType?: string;
  createdAt: string;
}

interface WeightEntry {
  id: string;
  date: string;
  weight: number;
  createdAt: string;
}

interface MeasurementEntry {
  id: string;
  date: string;
  chest?: number;
  waist?: number;
  hips?: number;
  biceps?: number;
  thighs?: number;
  createdAt: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementEntry[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'calendar' | 'progress'>('calendar');
  
  // Form states
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [showMeasurementForm, setShowMeasurementForm] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [newMeasurements, setNewMeasurements] = useState({
    chest: '',
    waist: '',
    hips: '',
    biceps: '',
    thighs: ''
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const sessionsQuery = query(collection(db, `users/${user.uid}/gym_sessions`), orderBy('date', 'desc'));
    const weightsQuery = query(collection(db, `users/${user.uid}/weight_entries`), orderBy('date', 'asc'));
    const measurementsQuery = query(collection(db, `users/${user.uid}/measurement_entries`), orderBy('date', 'asc'));

    const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GymSession)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/gym_sessions`));

    const unsubWeights = onSnapshot(weightsQuery, (snapshot) => {
      setWeights(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WeightEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/weight_entries`));

    const unsubMeasurements = onSnapshot(measurementsQuery, (snapshot) => {
      setMeasurements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MeasurementEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/measurement_entries`));

    return () => {
      unsubSessions();
      unsubWeights();
      unsubMeasurements();
    };
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error", error);
    }
  };

  const logout = () => signOut(auth);

  const toggleGymDay = async (date: Date) => {
    if (!user) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = sessions.find(s => s.date === dateStr);

    if (existing) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/gym_sessions`, existing.id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/gym_sessions/${existing.id}`);
      }
    } else {
      try {
        await addDoc(collection(db, `users/${user.uid}/gym_sessions`), {
          date: dateStr,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/gym_sessions`);
      }
    }
  };

  const addWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newWeight) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/weight_entries`), {
        date: format(new Date(), 'yyyy-MM-dd'),
        weight: parseFloat(newWeight),
        createdAt: new Date().toISOString()
      });
      setNewWeight('');
      setShowWeightForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/weight_entries`);
    }
  };

  const addMeasurements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/measurement_entries`), {
        date: format(new Date(), 'yyyy-MM-dd'),
        chest: newMeasurements.chest ? parseFloat(newMeasurements.chest) : null,
        waist: newMeasurements.waist ? parseFloat(newMeasurements.waist) : null,
        hips: newMeasurements.hips ? parseFloat(newMeasurements.hips) : null,
        biceps: newMeasurements.biceps ? parseFloat(newMeasurements.biceps) : null,
        thighs: newMeasurements.thighs ? parseFloat(newMeasurements.thighs) : null,
        createdAt: new Date().toISOString()
      });
      setNewMeasurements({ chest: '', waist: '', hips: '', biceps: '', thighs: '' });
      setShowMeasurementForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/measurement_entries`);
    }
  };

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md"
        >
          <Dumbbell className="w-16 h-16 mx-auto mb-8 text-[#00FF00]" />
          <h1 className="text-5xl font-black mb-4 tracking-tighter uppercase italic">Gym Progress</h1>
          <p className="text-zinc-400 mb-12 text-lg">Track your consistency, weight, and body measurements in one place.</p>
          <button
            onClick={login}
            className="w-full bg-[#00FF00] text-black font-bold py-4 rounded-xl hover:bg-[#00CC00] transition-colors flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
          >
            Start Tracking with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-black font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-6 h-6" />
            <span className="font-black italic uppercase tracking-tighter">GymTrack</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-zinc-500 hidden sm:block">{user.email}</span>
            <button onClick={logout} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-200 p-1 rounded-xl mb-8">
          <button
            onClick={() => setActiveTab('calendar')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all",
              activeTab === 'calendar' ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <CalendarIcon className="w-4 h-4" />
            CALENDAR
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all",
              activeTab === 'progress' ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            PROGRESS
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'calendar' ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              {/* Calendar Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                  {format(currentMonth, 'MMMM yyyy')}
                </h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                  <div key={day} className="text-center text-[10px] font-black text-zinc-400 py-2">
                    {day}
                  </div>
                ))}
                {/* Empty slots for start of month */}
                {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {calendarDays.map(day => {
                  const isGymDay = sessions.some(s => s.date === format(day, 'yyyy-MM-dd'));
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => toggleGymDay(day)}
                      className={cn(
                        "aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative overflow-hidden group",
                        isGymDay 
                          ? "bg-black text-white" 
                          : "bg-white border border-zinc-200 hover:border-black",
                        isToday(day) && !isGymDay && "ring-2 ring-[#00FF00] ring-offset-2"
                      )}
                    >
                      <span className="text-sm font-bold z-10">{format(day, 'd')}</span>
                      {isGymDay && <CheckCircle2 className="w-3 h-3 text-[#00FF00] z-10" />}
                      {!isGymDay && (
                        <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-5 transition-opacity" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-zinc-200">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Sessions this month</p>
                  <p className="text-4xl font-black italic tracking-tighter">
                    {sessions.filter(s => s.date.startsWith(format(currentMonth, 'yyyy-MM'))).length}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-zinc-200">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Total sessions</p>
                  <p className="text-4xl font-black italic tracking-tighter">{sessions.length}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="progress"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Weight Chart */}
              <div className="bg-white p-6 rounded-2xl border border-zinc-200">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5" />
                    <h3 className="font-black italic uppercase tracking-tighter">Weight Progress</h3>
                  </div>
                  <button 
                    onClick={() => setShowWeightForm(true)}
                    className="p-2 bg-black text-white rounded-lg hover:bg-zinc-800"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weights}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelFormatter={(str) => format(parseISO(str as string), 'MMMM d, yyyy')}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#000" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#00FF00', strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Measurements Chart */}
              <div className="bg-white p-6 rounded-2xl border border-zinc-200">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Ruler className="w-5 h-5" />
                    <h3 className="font-black italic uppercase tracking-tighter">Body Measurements</h3>
                  </div>
                  <button 
                    onClick={() => setShowMeasurementForm(true)}
                    className="p-2 bg-black text-white rounded-lg hover:bg-zinc-800"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={measurements}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelFormatter={(str) => format(parseISO(str as string), 'MMMM d, yyyy')}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '20px' }} />
                      <Line type="monotone" dataKey="chest" stroke="#FF4D4D" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="waist" stroke="#4D79FF" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="hips" stroke="#FFB34D" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="biceps" stroke="#4DFF88" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showWeightForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWeightForm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 z-10 relative"
            >
              <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-6">Log Weight</h3>
              <form onSubmit={addWeight} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Current Weight (kg)</label>
                  <input 
                    autoFocus
                    type="number" 
                    step="0.1"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    className="w-full bg-zinc-100 border-none rounded-xl p-4 font-bold text-lg focus:ring-2 focus:ring-black transition-all"
                    placeholder="0.0"
                    required
                  />
                </div>
                <button type="submit" className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors uppercase tracking-widest text-xs">
                  Save Entry
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showMeasurementForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMeasurementForm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 z-10 relative overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-6">Log Measurements</h3>
              <form onSubmit={addMeasurements} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {['chest', 'waist', 'hips', 'biceps', 'thighs'].map(field => (
                    <div key={field}>
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2 capitalize">{field} (cm)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={(newMeasurements as any)[field]}
                        onChange={(e) => setNewMeasurements(prev => ({ ...prev, [field]: e.target.value }))}
                        className="w-full bg-zinc-100 border-none rounded-xl p-4 font-bold focus:ring-2 focus:ring-black transition-all"
                        placeholder="0.0"
                      />
                    </div>
                  ))}
                </div>
                <button type="submit" className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-zinc-800 transition-colors uppercase tracking-widest text-xs mt-4">
                  Save Measurements
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
