// One shared Axios instance for every API call.
// Pages never call axios directly - they use the files in this folder.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // Send the httpOnly auth cookie with every request
  withCredentials: true,
});

// Turn every failed request into a simple { code, message } error,
// matching the server's error format.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverError = error.response?.data?.error;
    return Promise.reject({
      status: error.response?.status,
      code: serverError?.code || 'NETWORK_ERROR',
      message: serverError?.message || 'Could not reach the server. Is it running?',
      details: serverError?.details,
    });
  },
);

export default api;
