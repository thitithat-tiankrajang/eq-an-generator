import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

const FIELDS = [
  { key: 'firstName',  label: 'First Name',    type: 'text',     placeholder: 'e.g. John',              required: true  },
  { key: 'lastName',   label: 'Last Name',     type: 'text',     placeholder: 'e.g. Doe',               required: true  },
  { key: 'nickname',   label: 'Nickname',      type: 'text',     placeholder: 'Optional',               required: false },
  { key: 'username',   label: 'Username',      type: 'text',     placeholder: 'Choose a username',      required: true  },
  { key: 'password',   label: 'Password',      type: 'password', placeholder: 'At least 6 characters',  required: true  },
  { key: 'school',     label: 'School',        type: 'text',     placeholder: 'e.g. St. John Academy',  required: true  },
  { key: 'purpose',    label: 'Purpose / Goal', type: 'text',    placeholder: 'e.g. Practice for ONET', required: true  },
];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', nickname: '',
    username: '', password: '', school: '', purpose: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await api.auth.registerStudent({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        nickname:  form.nickname.trim() || undefined,
        username:  form.username.trim(),
        password:  form.password,
        school:    form.school.trim(),
        purpose:   form.purpose.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-950 via-green-700 to-yellow-200 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Registration Submitted!</h2>
          <p className="text-stone-500 text-sm mb-6 leading-relaxed">
            Your account is pending approval by an administrator. You will be able to log in once approved.
          </p>
          <button
            onClick={() => navigate('/Login')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-green-950 via-green-700 to-yellow-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-linear-to-br from-yellow-500 to-green-700 rounded-xl flex items-center justify-center text-white text-2xl font-semibold mx-auto mb-3 shadow-md">
            DS
          </div>
          <h1 className="text-xl font-bold text-stone-900">Create Account</h1>
          <p className="text-stone-400 text-sm mt-1">DASC EQ Service — Student Registration</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.slice(0, 2).map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={f.type}
                  value={form[f.key]}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-shadow"
                />
              </div>
            ))}
          </div>

          {FIELDS.slice(2).map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                autoComplete={f.key === 'password' ? 'new-password' : f.key === 'username' ? 'username' : 'off'}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-shadow"
              />
            </div>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-2"
          >
            {loading ? 'Submitting…' : 'Register'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-stone-500">
          <ArrowLeft className="w-3.5 h-3.5" />
          <Link to="/Login" className="text-green-700 font-medium hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
