import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAuthUrl } from "../lib/api";
import { getMe } from "../lib/api";
import { getStoredUser, saveToken } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("token=")) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("token");
      if (token) {
        saveToken(token);
        getMe()
          .then(() => navigate("/dashboard"))
          .catch((err) => setError(err.message));
      }
    }

    const queryError = searchParams.get("error");
    if (queryError) {
      setError(queryError);
    }
  }, [navigate, searchParams]);

  const handleLogin = async () => {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start login");
    }
  };

  if (getStoredUser()) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
          Welcome back
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Sign in with your Google account to continue.
        </p>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogin}
          className="mt-6 w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
