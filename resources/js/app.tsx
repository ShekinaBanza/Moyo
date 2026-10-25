import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '../css/app.css';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { EmptyState, Spinner, ToastProvider } from '@/components/ui';
import AppLayout from '@/layouts/AppLayout';
import Landing from '@/pages/Landing';
import { Forgot, Login, Register } from '@/pages/AuthPages';
import Dashboard from '@/pages/Dashboard';
import Sleep from '@/pages/Sleep';
import Day from '@/pages/Day';
import Notifications from '@/pages/Notifications';
import NotificationSettings from '@/pages/NotificationSettings';
import Food from '@/pages/Food';
import Activity from '@/pages/Activity';
import Symptoms from '@/pages/Symptoms';
import Body from '@/pages/Body';
const Trends = lazy(() => import('@/pages/Trends')); // charts library is loaded only when needed
const Energy = lazy(() => import('@/pages/Energy'));
const EnergyHistory = lazy(() => import('@/pages/EnergyHistory'));
const MapPage = lazy(() => import('@/pages/MapPage')); // leaflet is loaded only on the map pages
const TracksHistory = lazy(() => import('@/pages/TracksHistory'));
const ExercisesHome = lazy(() => import('@/pages/ExercisesHome'));
const ExerciseList = lazy(() => import('@/pages/ExerciseList'));
const ExerciseDetail = lazy(() => import('@/pages/ExerciseDetail'));
const Programs = lazy(() => import('@/pages/Programs'));
const SessionRunner = lazy(() => import('@/pages/SessionRunner'));
const ExerciseProgress = lazy(() => import('@/pages/ExerciseProgress')); // charts only when opened
import Watch from '@/pages/Watch';
import Profile from '@/pages/Profile';

function Private({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <Spinner label="Chargement de votre espace…" />;
    return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function NotFound() {
    return <EmptyState image="/images/illustrations/unavailable.svg" title="Page introuvable" text="Cette page n'existe pas ou n'est pas disponible." />;
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/forgot" element={<Forgot />} />
                        <Route path="/app" element={<Private><AppLayout /></Private>}>
                            <Route index element={<Dashboard />} />
                            <Route path="sleep" element={<Sleep />} />
                            <Route path="food" element={<Food />} />
                            <Route path="activity" element={<Activity />} />
                            <Route path="symptoms" element={<Symptoms />} />
                            <Route path="body" element={<Body />} />
                            <Route path="trends" element={<Suspense fallback={<Spinner />}><Trends /></Suspense>} />
                            <Route path="energy" element={<Suspense fallback={<Spinner />}><Energy /></Suspense>} />
                            <Route path="energy/history" element={<Suspense fallback={<Spinner />}><EnergyHistory /></Suspense>} />
                            <Route path="exercises" element={<Suspense fallback={<Spinner />}><ExercisesHome /></Suspense>} />
                            <Route path="exercises/list" element={<Suspense fallback={<Spinner />}><ExerciseList /></Suspense>} />
                            <Route path="exercises/programs" element={<Suspense fallback={<Spinner />}><Programs /></Suspense>} />
                            <Route path="exercises/run" element={<Suspense fallback={<Spinner />}><SessionRunner /></Suspense>} />
                            <Route path="exercises/progress" element={<Suspense fallback={<Spinner />}><ExerciseProgress /></Suspense>} />
                            <Route path="exercises/:slug" element={<Suspense fallback={<Spinner />}><ExerciseDetail /></Suspense>} />
                            <Route path="day" element={<Day />} />
                            <Route path="map" element={<Suspense fallback={<Spinner />}><MapPage /></Suspense>} />
                            <Route path="map/history" element={<Suspense fallback={<Spinner />}><TracksHistory /></Suspense>} />
                            <Route path="notifications" element={<Notifications />} />
                            <Route path="notifications/settings" element={<NotificationSettings />} />
                            <Route path="watch" element={<Watch />} />
                            <Route path="devices" element={<Navigate to="/app/watch" replace />} />
                            <Route path="profile" element={<Profile />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/service-worker.js').catch(() => undefined));
}
