import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';
import ConflictResolverModal from '../components/ConflictResolverModal';
import RcpAttendanceModal from '../components/RcpAttendanceModal';
import { ScheduleSlot } from '../types';
import { useAuth } from '../context/AuthContext';

const MonPlanning: React.FC = () => {
  const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
  const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);
  const [selectedConsultSlot, setSelectedConsultSlot] = useState<ScheduleSlot | null>(null);
  const [selectedRcpSlot, setSelectedRcpSlot] = useState<ScheduleSlot | null>(null);

  const {
    doctors, unavailabilities, manualOverrides, setManualOverrides,
  } = useContext(AppContext);

  const { profile } = useAuth();

  const handleConsultResolve = (slotId: string, newDoctorId: string) => {
    setManualOverrides({ ...manualOverrides, [slotId]: newDoctorId });
    setSelectedConsultSlot(null);
  };

  const handleConsultCloseSlot = (slotId: string) => {
    setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
    setSelectedConsultSlot(null);
  };

  const weekSlots: ScheduleSlot[] = [];

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      <div className="bg-surface rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-text-base tracking-tight">Mon planning</h1>
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
          <PersonalAgendaWeek
            weekOffset={agendaWeekOffset}
            onOffsetChange={setAgendaWeekOffset}
            onConsultClick={setSelectedConsultSlot}
            onRcpClick={setSelectedRcpSlot}
          />
        ) : (
          <PersonalAgendaMonth />
        )}
      </div>

      {selectedConsultSlot && (
        <ConflictResolverModal
          slot={selectedConsultSlot}
          doctors={doctors}
          slots={weekSlots}
          unavailabilities={unavailabilities}
          onClose={() => setSelectedConsultSlot(null)}
          onResolve={handleConsultResolve}
          onCloseSlot={handleConsultCloseSlot}
        />
      )}

      {selectedRcpSlot && profile?.doctor_id && (
        <RcpAttendanceModal
          slot={selectedRcpSlot}
          doctorId={profile.doctor_id}
          onClose={() => setSelectedRcpSlot(null)}
        />
      )}
    </div>
  );
};

export default MonPlanning;
