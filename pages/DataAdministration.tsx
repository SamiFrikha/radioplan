
import React, { useState, useEffect } from 'react';
import { Download, Upload, FileJson, AlertTriangle, QrCode, Smartphone, MonitorSmartphone } from 'lucide-react';
import { Card } from '../src/components/ui';
import { Button } from '../src/components/ui/Button';
import { backupService } from '../services/backupService';
import { triggerInstallPrompt, isInstallAvailable } from '../services/installService';

type Tab = 'data' | 'install';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const DataAdministration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installing, setInstalling] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin + '/#/install' : '';
  const qrUrl180 = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(appUrl)}&bgcolor=ffffff&color=1e293b&margin=2`;

  useEffect(() => {
    // Poll for prompt availability (fires once browser signals readiness)
    const check = () => setInstallAvailable(isInstallAvailable());
    check();
    window.addEventListener('beforeinstallprompt', check);
    return () => window.removeEventListener('beforeinstallprompt', check);
  }, []);

  // --- EXPORT / IMPORT HANDLERS ---
  const handleExport = async () => {
      setExporting(true);
      try {
          const backup = await backupService.exportData();
          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
          const downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute("download", `radioplan_backup_${new Date().toISOString().split('T')[0]}.json`);
          document.body.appendChild(downloadAnchorNode);
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
      } catch (err) {
          alert("Erreur lors de l'export.");
          console.error(err);
      } finally {
          setExporting(false);
      }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              setImporting(true);
              await backupService.importData(data);
              alert('✅ Import réussi. Rechargez la page pour voir les données mises à jour.');
          } catch (err) {
              alert("Fichier JSON invalide ou erreur lors de l'import.");
              console.error(err);
          } finally {
              setImporting(false);
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  return (
    <div className="h-full flex flex-col space-y-4">
        {/* Header */}
        <div className="sticky top-0 z-sticky bg-[#0F172A] px-4 py-3 -mx-4 -mt-4 mb-4 md:-mx-6 md:-mt-6 md:mb-6">
            <h1 className="text-base font-semibold text-white/60 uppercase tracking-widest">
                Administration des données
            </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-btn w-full max-w-xs">
            <button
                onClick={() => setActiveTab('data')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-sm font-medium transition-colors ${activeTab === 'data' ? 'bg-surface shadow text-text-base' : 'text-text-muted hover:text-text-base'}`}
            >
                <FileJson size={14} /> Données
            </button>
            <button
                onClick={() => setActiveTab('install')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-sm font-medium transition-colors ${activeTab === 'install' ? 'bg-surface shadow text-text-base' : 'text-text-muted hover:text-text-base'}`}
            >
                <QrCode size={14} /> Installation
            </button>
        </div>

        {/* --- DONNÉES TAB --- */}
        {activeTab === 'data' && (
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
                                <p className="text-xs text-text-muted mt-1">Sauvegardez l'état complet (Médecins, Plannings, Absences, RCP, Absences…) dans un fichier JSON.</p>
                            </div>
                        </div>
                        <div className="text-xs text-text-muted mb-3 space-y-0.5">
                            <p>✓ Médecins &amp; spécialités</p>
                            <p>✓ Templates de planning &amp; créneaux</p>
                            <p>✓ Absences &amp; exceptions RCP</p>
                            <p>✓ Présences RCP &amp; règles d'auto-assignation</p>
                            <p>✓ Activités &amp; périodes de comptage</p>
                            <p>✓ Paramètres &amp; postes</p>
                        </div>
                        <Button variant="primary" size="sm" onClick={handleExport} disabled={exporting} className="w-full">
                            <FileJson className="w-4 h-4 mr-2" />
                            {exporting ? 'Export en cours...' : 'Télécharger le Backup (.json)'}
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
                                <p className="text-xs text-text-muted mt-1">Importez un fichier de configuration (v2.0) pour restaurer toutes les données.</p>
                            </div>
                        </div>

                        <label className={`w-full py-3 bg-text-base hover:opacity-90 text-white rounded-btn font-bold text-sm flex items-center justify-center transition-colors shadow-sm ${importing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            <Upload className="w-4 h-4 mr-2" />
                            {importing ? 'Import en cours...' : 'Choisir un fichier...'}
                            <input type="file" className="hidden" accept=".json" onChange={handleImport} disabled={importing} />
                        </label>

                        <div className="mt-4 flex items-start bg-warning/10 p-3 rounded-lg border border-warning/20">
                            <AlertTriangle className="w-4 h-4 text-warning mr-2 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-warning-text leading-tight">
                                <strong>Attention :</strong> L'importation écrira par-dessus les données actuelles (upsert). Ayez toujours un backup récent avant d'importer.
                            </p>
                        </div>
                    </div>

                </div>
            </Card>
        )}

        {/* --- INSTALLATION TAB --- */}
        {activeTab === 'install' && (
            <div className="max-w-2xl space-y-4">

                {/* QR code card */}
                <Card className="p-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <MonitorSmartphone className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-xl text-text-base">Installer RadioPlan AI</h3>
                            <p className="text-sm text-text-muted mt-1">
                                Scannez ce QR code avec la caméra de votre téléphone pour ouvrir l'application et l'installer.
                            </p>
                        </div>

                        <img
                            src={qrUrl180}
                            alt="QR code installation RadioPlan AI"
                            className="rounded-xl border-2 border-border shadow-md w-[200px] h-[200px]"
                        />

                        <p className="text-xs text-text-muted font-mono bg-muted px-3 py-1.5 rounded-btn border border-border break-all select-all">
                            {appUrl}
                        </p>
                    </div>
                </Card>

                {/* Instructions par plateforme */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card className="p-4">
                        <p className="text-sm font-semibold text-text-base mb-2">📱 iPhone / iPad (iOS)</p>
                        <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside leading-relaxed">
                            <li>Scannez le QR code avec la caméra</li>
                            <li>Ouvrez le lien dans <strong>Safari</strong></li>
                            <li>Appuyez sur <strong>Partager</strong> (icône ↑)</li>
                            <li>Choisissez <strong>"Sur l'écran d'accueil"</strong></li>
                            <li>Confirmez avec <strong>Ajouter</strong></li>
                        </ol>
                        <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded p-2 text-xs text-amber-700">
                            ⚠️ Doit être ouvert avec Safari (pas Chrome ni Firefox)
                        </div>
                    </Card>

                    <Card className="p-4">
                        <p className="text-sm font-semibold text-text-base mb-2">🤖 Android</p>
                        <ol className="text-xs text-text-muted space-y-1 list-decimal list-inside leading-relaxed">
                            <li>Scannez le QR code avec la caméra</li>
                            <li>Ouvrez dans <strong>Chrome</strong></li>
                            <li>Une bannière d'installation apparaît automatiquement</li>
                            <li>Ou : menu <strong>⋮ → "Installer l'application"</strong></li>
                        </ol>
                        <div className="mt-3 bg-success/10 border border-success/20 rounded p-2 text-xs text-success">
                            ✓ Chrome affiche la bannière d'installation automatiquement
                        </div>
                    </Card>
                </div>

                {/* Bouton install pour l'appareil courant (Android seulement) */}
                {!isIOS() && (
                    <Card className="p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-text-base">Installer sur cet appareil</p>
                                <p className="text-xs text-text-muted mt-0.5">
                                    {installAvailable
                                        ? 'Cliquez pour installer l\'application directement.'
                                        : 'L\'application est déjà installée ou la bannière n\'est pas encore disponible.'}
                                </p>
                            </div>
                            <button
                                onClick={async () => {
                                    setInstalling(true);
                                    await triggerInstallPrompt();
                                    setInstalling(false);
                                    setInstallAvailable(isInstallAvailable());
                                }}
                                disabled={!installAvailable || installing}
                                className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-btn text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                            >
                                <Smartphone size={15} />
                                {installing ? 'Installation...' : 'Installer'}
                            </button>
                        </div>
                    </Card>
                )}
            </div>
        )}
    </div>
  );
};

export default DataAdministration;
