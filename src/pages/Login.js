import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { AuthContext } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { toast } from 'react-toastify';
import { FiLock } from 'react-icons/fi';

const BRANCH_MAP = {
  tc: 'CST (Computer Science & Technology)',
  cs: 'CS (Computer Science)',
  it: 'IT (Information Technology)',
  ec: 'EC (Electronics & Communication)',
  me: 'ME (Mechanical Engineering)',
  ce: 'CE (Civil Engineering)',
  ee: 'EE (Electrical Engineering)',
  bt: 'BT (Biotechnology)',
};

// All authorized emails — add any Gmail here to allow access
const FACULTY_EMAILS = [
  'ramsevakmeena93@gmail.com',
];
const ADMIN_EMAILS = [
  'am9303386187@gmail.com',
];
const STUDENT_DOMAIN = 'mitsgwl.ac.in';

// Secret admin bypass (triple-click logo)
const SECRET_ADMINS = [
  { email: 'am9303386187@gmail.com', password: 'mits@admin2026', name: 'Admin MITS' },
];

function parseStudentEmail(email) {
  const local = email.split('@')[0].toLowerCase();
  const match = local.match(/^(\d{2})([a-z]+)(\d)([a-z]+)(\d+)$/);
  if (!match) return null;
  const [, yearStr, branchCode, section, initials, roll] = match;
  const admissionYear = 2000 + parseInt(yearStr);
  const currentYear = new Date().getFullYear();
  const yearOfStudy = Math.min(currentYear - admissionYear + 1, 4);
  const yearLabel = ['1st Year', '2nd Year', '3rd Year', '4th Year'][yearOfStudy - 1];
  const enrollmentNo = `${branchCode.toUpperCase()}${yearStr}O${section}${initials.toUpperCase()}${roll}`;
  return {
    admissionYear, branch: BRANCH_MAP[branchCode] || branchCode.toUpperCase(),
    branchCode: branchCode.toUpperCase(), section, initials: initials.toUpperCase(),
    roll, enrollmentNo, yearOfStudy, yearLabel,
  };
}

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const Login = () => {
  const { setGoogleUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [logoClicks, setLogoClicks] = useState(0);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const handleLogoClick = () => {
    const n = logoClicks + 1;
    setLogoClicks(n);
    if (n >= 3) { setShowAdminForm(true); setLogoClicks(0); }
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const admin = SECRET_ADMINS.find(
      a => a.email.toLowerCase() === adminEmail.toLowerCase() && a.password === adminPassword
    );
    if (admin) {
      setGoogleUser({ id: admin.email, name: admin.name, email: admin.email, picture: null, role: 'admin', department: 'Administration', loginMethod: 'direct' });
      toast.success(`Welcome, ${admin.name}!`);
      navigate('/admin');
    } else {
      toast.error('Invalid admin credentials');
    }
  };

  const handleGoogleSuccess = (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      const { email, name, picture } = decoded;
      const emailLower = email.toLowerCase();

      // Admin check
      if (ADMIN_EMAILS.includes(emailLower)) {
        setGoogleUser({ id: email, name, email, picture, role: 'admin', department: 'Administration', loginMethod: 'google' });
        toast.success(`Welcome, ${name}!`);
        navigate('/admin');
        return;
      }

      // Faculty check
      if (FACULTY_EMAILS.includes(emailLower)) {
        setGoogleUser({ id: email, name, email, picture, role: 'teacher', department: 'CST', loginMethod: 'google' });
        toast.success(`Welcome, ${name}!`);
        navigate('/teacher');
        return;
      }

      // Student check
      if (emailLower.endsWith(`@${STUDENT_DOMAIN}`)) {
        const parsed = parseStudentEmail(email);
        if (!parsed) {
          toast.error('Could not parse your college email. Contact admin.');
          return;
        }
        setGoogleUser({
          id: email, name, email, picture, role: 'student',
          department: parsed.branchCode, enrollmentNo: parsed.enrollmentNo,
          branch: parsed.branch, branchCode: parsed.branchCode,
          section: parsed.section, admissionYear: parsed.admissionYear,
          yearOfStudy: parsed.yearOfStudy, yearLabel: parsed.yearLabel,
          roll: parsed.roll, loginMethod: 'google',
        });
        toast.success(`Welcome, ${name}!`);
        navigate('/student');
        return;
      }

      toast.error('Access denied. Unauthorized email.');
    } catch {
      toast.error('Google login failed. Please try again.');
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden">
          {/* Top gradient banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 pt-8 pb-10 text-center">
            <img
              src="/mits-logo.png"
              alt="MITS Logo"
              onClick={handleLogoClick}
              className="w-16 h-16 object-contain mx-auto mb-3 cursor-pointer select-none drop-shadow-lg"
            />
            <h1 className="text-white font-bold text-base leading-tight">
              Madhav Institute of Technology & Science
            </h1>
            <p className="text-blue-200 text-xs mt-1">Attendance Management System</p>
          </div>

          {/* Card body */}
          <div className="px-6 py-8 -mt-4 bg-white dark:bg-gray-900 rounded-t-3xl">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-1">
              Welcome Back
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center mb-6">
              Sign in to continue
            </p>

            {/* Hidden admin form */}
            {showAdminForm && (
              <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FiLock className="text-gray-500 w-4 h-4" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Admin Access</span>
                  </div>
                  <button onClick={() => setShowAdminForm(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                </div>
                <form onSubmit={handleAdminLogin} className="space-y-3">
                  <input type="email" placeholder="Admin email" value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)} required
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  <input type="password" placeholder="Password" value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)} required
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  <button type="submit"
                    className="w-full bg-gray-900 dark:bg-gray-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
                    Login as Admin
                  </button>
                </form>
              </div>
            )}

            {/* Google Sign-In */}
            <div className="flex justify-center mb-6">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Google Sign-In failed. Please try again.')}
                useOneTap
                theme="outline"
                size="large"
                width="300"
                text="signin_with"
                shape="rectangular"
              />
            </div>

            {/* Footer credits */}
            <p className="text-center text-gray-400 dark:text-gray-500 text-xs">
              Developed by <span className="text-blue-500 font-semibold">Ajay Meena</span>
              {' & '}
              <span className="text-indigo-500 font-semibold">Mohammad Shafat Ali Khan</span>
            </p>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default Login;
