import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import UpdateBanner from './components/UpdateBanner';
import SessionWarningModal from './components/SessionWarningModal';
import ProtectedRoute from './components/ProtectedRoute';
import { BUILD_VERSION } from './utils/versioning';
import { WebSocketProvider } from './context/WebSocketContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

// Lazy-loaded pages — each becomes a separate JS chunk
const DashboardPage       = lazy(() => import('./features/dashboard/DashboardPage'));
const StatusPage          = lazy(() => import('./features/status/StatusPage'));
const AlertsPage          = lazy(() => import('./features/alerts/AlertsPage'));
const LoginPage           = lazy(() => import('./features/auth/LoginPage'));
const UserManagementPage  = lazy(() => import('./features/admin/UserManagementPage'));
const DeviceFirmwareManager = lazy(() => import('./components/DeviceFirmwareManager'));
const FirmwareSftpUpload  = lazy(() => import('./components/FirmwareSftpUpload'));

// Minimal full-screen spinner shown while a chunk is loading
const PageLoader: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
    <div style={{ width: 40, height: 40, border: '3px solid #334155', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider defaultLanguage="en">
        <AuthProvider>
          <SessionWarningModal />
          <WebSocketProvider autoConnect={true}>
            <div className="App">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Login route - no AppShell */}
                  <Route path="/login" element={<LoginPage />} />

                  {/* Protected routes with AppShell */}
                  <Route path="/*" element={
                    <ProtectedRoute>
                      <AppShell>
                        <Routes>
                          <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/dashboard" element={<DashboardPage />} />
                          <Route path="/status" element={<StatusPage />} />
                          <Route path="/alerts" element={<AlertsPage />} />
                          <Route path="/devices" element={<DeviceFirmwareManager />} />
                          <Route path="/admin/users" element={<UserManagementPage />} />
                          <Route path="/firmware-sftp" element={
                            <div className="p-6">
                              <FirmwareSftpUpload />
                            </div>
                          } />
                          <Route path="/historical" element={
                            <div className="p-6 text-sm text-gray-600">
                              Historical module coming soon.
                            </div>
                          } />
                          <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                        <div style={{ position: 'fixed', top: 4, right: 8, fontSize: '10px', opacity: 0.6 }}>v{BUILD_VERSION}</div>
                      </AppShell>
                    </ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
              <UpdateBanner />
            </div>
          </WebSocketProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;

