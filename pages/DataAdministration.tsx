
import React, { useContext } from 'react';
import { AppContext } from '../App';
import { GlobalBackupData } from '../types';
import { Download, Upload, Database, FileJson, AlertTriangle } from 'lucide-react';

const DataAdministration: React.FC = () => {
  const { 
      template, 
      doctors, 
      rcpTypes, 
      postes, 
      activityDefinitions,
      unavailabilities,
      shiftHistory,
      manualOverrides,
      rcpAttendance,
      rcpExceptions,
      importConfiguration
  } = useContext(AppContext);

  // --- EXPORT / IMPORT HANDLERS ---
  const handleExport = () => {
      const backup: GlobalBackupData = {
          metadata: {
              version: "1.0",
              appName: "RadioPlan AI",
              exportDate: new Date().toISOString()
          },
          data: {
              doctors,
              template,
              rcpTypes,
              postes,
              activityDefinitions,
              unavailabilities,
              shiftHistory,
              manualOverrides,
              rcpAttendance,
              rcpExceptions
          }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `radioplan_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              importConfiguration(data);
          } catch (err) {
              alert("Fichier JSON invalide.");
              console.error(err);
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
  }

  return (
    <div className="h-full flex flex-col space-y-4">
        {/* Header */}
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                <Database className="w-6 h-6 mr-3 text-slate-600" />
                Administration des Données
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                Sauvegardez l'intégralité de la configuration et des données de l'application ou restaurez une sauvegarde précédente.
            </p>
        </div>

        {/* --- DATA ADMINISTRATION (EXPORT/IMPORT) --- */}
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-8 shadow-sm max-w-4xl">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* EXPORT */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div className="flex items-center mb-4">
                        <div className="p-3 bg-blue-100 rounded-lg mr-4">
                            <Download className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-slate-800">Exporter la configuration</h4>
                            <p className="text-xs text-slate-500 mt-1">Sauvegardez l'état complet (Médecins, Plannings, Absences, Historique) dans un fichier JSON.</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleExport}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm flex items-center justify-center transition-colors shadow-sm"
                    >
                        <FileJson className="w-4 h-4 mr-2" />
                        Télécharger le Backup (.json)
                    </button>
                </div>

                {/* IMPORT */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative overflow-hidden">
                    <div className="flex items-center mb-4">
                        <div className="p-3 bg-orange-100 rounded-lg mr-4">
                            <Upload className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-slate-800">Restaurer / Migrer</h4>
                            <p className="text-xs text-slate-500 mt-1">Importez un fichier de configuration pour écraser les données actuelles.</p>
                        </div>
                    </div>
                    
                    <label className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-sm flex items-center justify-center transition-colors cursor-pointer shadow-sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Choisir un fichier...
                        <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                    </label>
                    
                    <div className="mt-4 flex items-start bg-orange-50 p-3 rounded-lg border border-orange-200">
                        <AlertTriangle className="w-4 h-4 text-orange-500 mr-2 mt-0.5" />
                        <p className="text-xs text-orange-800 leading-tight">
                            <strong>Attention :</strong> L'importation remplacera définitivement toutes les données actuelles de l'application. Assurez-vous d'avoir une sauvegarde si nécessaire.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    </div>
  );
};

export default DataAdministration;
