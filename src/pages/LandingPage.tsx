import { Link } from "react-router-dom";
import { getToken } from "../lib/auth";

export default function LandingPage() {
  const isLoggedIn = Boolean(getToken());

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-brand-50 dark:from-gray-950 dark:to-gray-900 px-4">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          CAD/BIM Web Viewer
        </h1>
        <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">
          View, manage, and share IFC and DXF files in your browser.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          {isLoggedIn ? (
            <Link
              to="/dashboard"
              className="rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-brand-700"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-brand-700"
            >
              Sign in with Google
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
