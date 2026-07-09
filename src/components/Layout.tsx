import { Link, Outlet, useNavigate } from "react-router-dom";
import { getStoredUser, removeToken } from "../lib/auth";

export default function Layout() {
  const user = getStoredUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    removeToken();
    navigate("/");
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-brand-600 dark:text-brand-400">
            CAD/BIM Viewer
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-600"
            >
              Dashboard
            </Link>
            {user?.is_admin && (
              <Link
                to="/admin"
                className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-600"
              >
                Admin
              </Link>
            )}
            <div className="flex items-center gap-2">
              {user?.picture && <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />}
              <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">
                {user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
