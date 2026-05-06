const hostname = window.location.hostname;

const isLocalhost =
  hostname === 'localhost' || hostname === '127.0.0.1';

const BASE_URL = isLocalhost
  ? 'http://localhost:3001'
  : import.meta.env.VITE_API_URL;

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toQuery(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!entries.length) return '';
  return '?' + new URLSearchParams(Object.fromEntries(entries)).toString();
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

async function requestBlob(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return res.blob();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const api = {
  export: {
    pdf: async ({ title, puzzles, withSolution = false, subtitlePrefix }) => {
      const blob = await requestBlob('POST', '/api/export/pdf', { title, puzzles, withSolution, subtitlePrefix });
      const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      triggerDownload(blob, filename);
    },
    docx: async ({ title, puzzles, withSolution = false, subtitlePrefix }) => {
      const blob = await requestBlob('POST', '/api/export/docx', { title, puzzles, withSolution, subtitlePrefix });
      const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.docx`;
      triggerDownload(blob, filename);
    },
  },
  tileSets: {
    list:   ()         => request('GET',    '/tile-sets'),
    create: (body)     => request('POST',   '/tile-sets', body),
    update: (id, body) => request('PATCH',  `/tile-sets/${id}`, body),
    delete: (id)       => request('DELETE', `/tile-sets/${id}`),
  },
  auth: {
    login: (body) => request('POST', '/auth/login', body),
    registerStudent: (body) => request('POST', '/auth/register/student', body),
    getProfile: () => request('GET', '/auth/profile'),
    logout: () => request('POST', '/auth/logout'),
    admin: {
      getStudents: (params = {}) =>
        request('GET', `/auth/admin/students${toQuery(params)}`),
      getPendingStudents: () =>
        request('GET', '/auth/admin/students/pending'),
      approveStudent: (id) =>
        request('PUT', `/auth/admin/students/${id}/approve`),
      rejectStudent: (id, reason) =>
        request('PUT', `/auth/admin/students/${id}/reject`, reason ? { reason } : undefined),
      updateStudent: (id, body) =>
        request('PATCH', `/auth/admin/students/${id}`, body),
        
    },
  },
  configTests: {
    getAll:    ()       => request('GET',    '/config-tests'),
    saveBatch: (results)=> request('POST',   '/config-tests/batch', { results }),
    clearAll:  ()       => request('DELETE', '/config-tests'),
  },
  assignments: {
    admin: {
      create: (body) => request('POST', '/assignments', body),
      getAll: (params = {}) =>
        request('GET', `/assignments${toQuery(params)}`),
      getAvailableStudents: () =>
        request('GET', '/assignments/available-students'),
      assign: (id, studentIds) =>
        request('POST', `/assignments/${id}/assign`, { studentIds }),
      getAssignment: (id) =>
        request('GET', `/assignments/${id}`),
      updateStudentStatus: (id, studentId, status) =>
        request('PATCH', `/assignments/${id}/students/${studentId}/status`, { status }),
    },
    student: {
      getAssignments: (studentId, params = {}) =>
        request('GET', `/assignments/students/${studentId}/assignments${toQuery(params)}`),
      getAssignment: (assignmentId, studentId) =>
        request('GET', `/assignments/students/${studentId}/assignments/${assignmentId}`),
      start: (id, studentId) =>
        request('PATCH', `/assignments/${id}/students/${studentId}/start`),
      submitAnswer: (id, studentId, body) =>
        request('POST', `/assignments/${id}/students/${studentId}/answers`, body),
      getCurrentSet: (id, studentId) =>
        request('GET', `/assignments/${id}/students/${studentId}/current-set`),
      setCurrentQuestion: (id, studentId, body) =>
        request('PATCH', `/assignments/${id}/students/${studentId}/current-question`, body),
      getAnswers: (id, studentId) =>
        request('GET', `/assignments/${id}/students/${studentId}/answers`),
    },
  },
};
