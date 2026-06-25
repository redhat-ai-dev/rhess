import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import SkillsPage from './pages/SkillsPage';
import SkillDetailPage from './pages/SkillDetailPage';
import AdminPage from './pages/AdminPage';
import { ThemeContext, useThemeProvider } from './hooks/useTheme';

const App: React.FC = () => {
  const theme = useThemeProvider();
  return (
    <ThemeContext.Provider value={theme}>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/skills" replace />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:id" element={<SkillDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </AppLayout>
    </ThemeContext.Provider>
  );
};

export default App;
