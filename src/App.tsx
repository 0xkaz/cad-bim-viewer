import { Route, Routes } from "react-router-dom";
import AdminGuard from "./components/AdminGuard";
import AuthGuard from "./components/AuthGuard";
import Layout from "./components/Layout";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SharePage from "./pages/SharePage";
import ViewerPage from "./pages/ViewerPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route element={<Layout />}>
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/viewer/:id"
          element={
            <AuthGuard>
              <ViewerPage />
            </AuthGuard>
          }
        />
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            </AuthGuard>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
