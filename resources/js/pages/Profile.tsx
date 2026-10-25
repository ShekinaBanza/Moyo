import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, LogOut } from 'lucide-react';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Alert, Button, Card, Input, Modal, PageHeader, Select, useToast } from '@/components/ui';


export default function Profile() {
    const { user, logout, refresh, afterAccountDeleted } = useAuth();
    const nav = useNavigate();
    const toast = useToast();
    const p = user!.profile;
    const [name, setName] = useState(user!.name);
    const [height, setHeight] = useState(p.height_cm?.toString() ?? '');
    const [birth, setBirth] = useState(p.birth_date?.slice(0, 10) ?? '');
    const [sex, setSex] = useState(p.sex ?? '');
    const [sleepGoal, setSleepGoal] = useState(p.sleep_goal_hours?.toString() ?? '');
    const [level, setLevel] = useState(p.activity_level ?? '');
    const [stepsGoal, setStepsGoal] = useState(p.steps_goal?.toString() ?? '');
    const [evaluated, setEvaluated] = useState(p.evaluated_by_professional === null ? '' : String(p.evaluated_by_professional));
    const [delOpen, setDelOpen] = useState(false);
    const [pwd, setPwd] = useState('');
    const [phrase, setPhrase] = useState('');
    const [delErr, setDelErr] = useState<string | null>(null);
    const [wearableConsent, setWearableConsent] = useState(false);

    useEffect(() => {
        get<{ data: { purpose: string; granted: boolean }[] }>('/api/v1/consents').then((r) => setWearableConsent(!!r.data.find((c) => c.purpose === 'wearable_sync')?.granted)).catch(() => undefined);
    }, []);

    async function save(e: FormEvent) {
        e.preventDefault();
        try {
            await patch('/api/v1/profile', {
                name,
                height_cm: height ? Number(height) : null,
                birth_date: birth || null,
                sex: sex || null,
                sleep_goal_hours: sleepGoal ? Number(sleepGoal) : null,
                steps_goal: stepsGoal ? Number(stepsGoal) : null,
                activity_level: level || null,
                evaluated_by_professional: evaluated === '' ? null : evaluated === 'true',
            });
            await refresh();
            toast('Profil enregistré.');
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'danger');
        }
    }

    async function exportData() {
        try {
            const data = await post('/api/v1/account/export');
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'moyo-export.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast('Export impossible pour le moment.', 'danger');
        }
    }

    async function deleteAccount() {
        setDelErr(null);
        try {
            await del('/api/v1/account', { password: pwd, confirmation: phrase });
            await afterAccountDeleted();
            nav('/');
        } catch (e) {
            setDelErr(e instanceof ApiError ? e.message : 'Suppression impossible.');
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Profil et paramètres" subtitle={user!.email} image="/images/illustrations/login.svg" />

            <Card aria-labelledby="prof">
                <h2 id="prof" className="mb-4 text-lg font-bold">Mon profil</h2>
                <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
                    <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
                    <Input label="Taille (cm)" type="number" min={50} max={250} value={height} onChange={(e) => setHeight(e.target.value)} />
                    <Input label="Date de naissance (facultatif)" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
                    <Select label="Sexe (facultatif)" value={sex} onChange={(e) => setSex(e.target.value)}><option value="">—</option><option value="female">Femme</option><option value="male">Homme</option><option value="other">Autre</option></Select>
                    <Input label="Objectif de sommeil (heures)" type="number" step="0.5" min={4} max={12} value={sleepGoal} onChange={(e) => setSleepGoal(e.target.value)} />
                    <Input label="Objectif de pas par jour" type="number" min={500} max={50000} value={stepsGoal} onChange={(e) => setStepsGoal(e.target.value)} hint="Choisissez un objectif raisonnable. Moyo ne l'augmente jamais automatiquement." />
                    <Select label="Niveau d'activité général (facultatif)" value={level} onChange={(e) => setLevel(e.target.value)} hint="Information seulement : il n'est PAS ajouté au bilan énergétique, pour éviter de compter deux fois l'activité.">
                        <option value="">—</option><option value="sedentary">Plutôt sédentaire</option><option value="light">Légèrement actif</option><option value="moderate">Modérément actif</option><option value="active">Très actif</option>
                    </Select>
                    <p className="self-end text-xs text-muted">Pour le bilan énergétique : sexe, date de naissance, taille et une pesée sont nécessaires. Sans ces données, aucun résultat personnalisé n'est calculé.</p>
                    <div className="sm:col-span-2">
                        <Select label="Ai-je été évalué(e) par un professionnel de santé pour mes symptômes ?" value={evaluated} onChange={(e) => setEvaluated(e.target.value)} hint="Aucun détail médical n'est demandé. Cette réponse sert uniquement aux messages de prudence sur l'activité.">
                            <option value="">Je ne souhaite pas répondre</option><option value="true">Oui</option><option value="false">Non, pas encore</option>
                        </Select>
                    </div>
                    <div className="sm:col-span-2 flex justify-end"><Button type="submit">Enregistrer</Button></div>
                </form>
            </Card>

            <Card aria-labelledby="rem">
                <h2 id="rem" className="mb-1 text-lg font-bold">Notifications et rappels</h2>
                <p className="mb-3 text-sm text-muted">Choisissez vos rappels (repas, sommeil, activités…), leurs horaires et, si vous le souhaitez, les notifications du navigateur.</p>
                <Link to="/app/notifications/settings" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Gérer mes notifications</Link>
            </Card>

            <Card aria-labelledby="priv">
                <h2 id="priv" className="mb-3 text-lg font-bold">Confidentialité et données</h2>
                <label className="mb-4 flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={wearableConsent} onChange={async (e) => { await post('/api/v1/consents', { purpose: 'wearable_sync', granted: e.target.checked }); setWearableConsent(e.target.checked); }} />
                    J'autorise la synchronisation des données d'une montre connectée (facultatif)
                </label>
                <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => void exportData()}><Download className="h-4 w-4" aria-hidden /> Exporter mes données (JSON)</Button>
                    <Link to="/app/watch" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-5 text-sm font-semibold text-brand-700">Ma montre (facultative)</Link>
                    <Button variant="secondary" onClick={async () => { const closed = await logout(); if (!closed) window.alert("Vous étiez hors ligne : les données locales ont été effacées, mais votre session sur le serveur n'a pas pu être fermée. Reconnectez-vous puis déconnectez-vous à nouveau dès que possible."); nav('/'); }}><LogOut className="h-4 w-4" aria-hidden /> Se déconnecter</Button>
                </div>
                <p className="mt-3 text-xs text-muted">Vos données sont protégées par votre compte et transmises en HTTPS. Elles ne sont pas chiffrées de bout en bout : l'hébergeur et l'administrateur technique du service pourraient techniquement y accéder.</p>
            </Card>

            <Card aria-labelledby="del" className="border border-red-200">
                <h2 id="del" className="mb-2 text-lg font-bold text-danger">Supprimer mon compte</h2>
                <p className="mb-3 text-sm text-muted">Supprime définitivement votre compte et toutes vos données de santé. Cette action est irréversible. Exportez vos données avant si vous le souhaitez.</p>
                <Button variant="danger" onClick={() => setDelOpen(true)}>Supprimer mon compte…</Button>
            </Card>

            <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Supprimer définitivement mon compte">
                <div className="space-y-4">
                    {delErr && <Alert tone="danger">{delErr}</Alert>}
                    <Input label="Mot de passe actuel" type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
                    <Input label="Tapez SUPPRIMER pour confirmer" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setDelOpen(false)}>Annuler</Button>
                        <Button variant="danger" disabled={phrase !== 'SUPPRIMER' || !pwd} onClick={() => void deleteAccount()}>Supprimer définitivement</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
