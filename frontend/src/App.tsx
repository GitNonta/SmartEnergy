import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import DashboardPage from './features/dashboard/DashboardPage';
import StatusPage from './features/status/StatusPage';
import AlertsPage from './features/alerts/AlertsPage';
import LoginPage from './features/auth/LoginPage';
import UserManagementPage from './features/admin/UserManagementPage';
import DeviceFirmwareManager from './components/DeviceFirmwareManager';
import FirmwareSftpUpload from './components/FirmwareSftpUpload';
import AppShell from './components/AppShell';
import UpdateBanner from './components/UpdateBanner';
import SessionWarningModal from './components/SessionWarningModal';
import ProtectedRoute from './components/ProtectedRoute';
import { BUILD_VERSION } from './utils/versioning';
import { WebSocketProvider } from './context/WebSocketContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider defaultLanguage="en">
        <AuthProvider>
          <SessionWarningModal />
          <WebSocketProvider autoConnect={true}>
            <div className="App">
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
              <UpdateBanner />
            </div>
          </WebSocketProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;

