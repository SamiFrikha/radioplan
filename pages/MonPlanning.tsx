import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';

const MonPlanning: React.FC = () => {
  const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
  const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800 flex items-center">
            <LayoutGrid className="w-5 h-5 mr-2 text-blue-500" />
            Mon Planning
          </h1>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setAgendaView('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setAgendaView('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Mois
            </button>
          </div>
        </div>

        {agendaView === 'week' ? (
          <PersonalAgendaWeek weekOffset={agendaWeekOffset} onOffsetChange={setAgendaWeekOffset} />
        ) : (
          <PersonalAgendaMonth />
        )}
      </div>
    </div>
  );
};

export default MonPlanning;
