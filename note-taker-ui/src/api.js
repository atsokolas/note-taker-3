import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

// Create a new instance of axios
const api = axios.create({
  baseURL: BASE_URL,
});

// Add a response interceptor
api.interceptors.response.use(
  // If the response is successful, just return it
  (response) => response,
  // If the response has an error...
  (error) => {
    // Check if the error is a 401 (Unauthorized) or 403 (Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.log("Authentication error detected. Logging out.");
      
      // Remove the invalid token from storage
      localStorage.removeItem('token');
      if (window.chrome && window.chrome.storage) {
        window.chrome.storage.local.remove('token');
      }

      // Force a redirect to the login page
      // Using window.location.href ensures a full page reload, clearing all old state.
      window.location.href = '/login';
    }
    // For all other errors, just pass them along
    return Promise.reject(error);
  }
);

export default api;
