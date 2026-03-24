import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';

const MonPlanning: React.FC = () => {
  const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
  const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      <div className="bg-surface rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-text-base tracking-tight">Mon Planning</h1>
          <div className="flex rounded-btn-sm border border-border overflow-hidden">
            <button
              onClick={() => setAgendaView('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'week' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setAgendaView('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'month' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
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
