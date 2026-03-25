
import React, { useContext } from 'react';
import { AppContext } from '../App';
import { GlobalBackupData } from '../types';
import { Download, Upload, Database, FileJson, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '../src/components/ui';
import { Button } from '../src/components/ui/Button';

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
        <div className="sticky top-0 z-sticky bg-[#0F172A] px-4 py-3 -mx-4 -mt-4 mb-4 md:-mx-6 md:-mt-6 md:mb-6">
            <h1 className="text-base font-semibold text-white/60 uppercase tracking-widest">
                Administration des données
            </h1>
        </div>

        {/* --- DATA ADMINISTRATION (EXPORT/IMPORT) --- */}
        <Card className="p-8 max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* EXPORT */}
                <div className="bg-muted p-6 rounded-card border border-border">
                    <div className="flex items-center mb-4">
                        <div className="p-3 bg-primary/10 rounded-lg mr-4">
                            <Download className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-text-base">Exporter la configuration</h4>
                            <p className="text-xs text-text-muted mt-1">Sauvegardez l'état complet (Médecins, Plannings, Absences, Historique) dans un fichier JSON.</p>
                        </div>
                    </div>
                    <Button variant="primary" size="sm" onClick={handleExport} className="w-full">
                        <FileJson className="w-4 h-4 mr-2" />
                        Télécharger le Backup (.json)
                    </Button>
                </div>

                {/* IMPORT */}
                <div className="bg-muted p-6 rounded-card border border-border relative overflow-hidden">
                    <div className="flex items-center mb-4">
                        <div className="p-3 bg-warning/10 rounded-lg mr-4">
                            <Upload className="w-6 h-6 text-warning" />
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-text-base">Restaurer / Migrer</h4>
                            <p className="text-xs text-text-muted mt-1">Importez un fichier de configuration pour écraser les données actuelles.</p>
                        </div>
                    </div>

                    <label className="w-full py-3 bg-text-base hover:opacity-90 text-white rounded-btn font-bold text-sm flex items-center justify-center transition-colors cursor-pointer shadow-sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Choisir un fichier...
                        <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                    </label>

                    <div className="mt-4 flex items-start bg-warning/10 p-3 rounded-lg border border-warning/20">
                        <AlertTriangle className="w-4 h-4 text-warning mr-2 mt-0.5" />
                        <p className="text-xs text-warning-text leading-tight">
                            <strong>Attention :</strong> L'importation remplacera définitivement toutes les données actuelles de l'application. Assurez-vous d'avoir une sauvegarde si nécessaire.
                        </p>
                    </div>
                </div>

            </div>
        </Card>
    </div>
  );
};

export default DataAdministration;
