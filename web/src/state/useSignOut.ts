import { useNavigate } from 'react-router';
import { endSession } from './session.js';

/** Ends the session (demo or real, including the cloud sign-in) and goes back to the login page. */
export function useSignOut(): () => void {
  const navigate = useNavigate();
  return () => {
    endSession();
    void navigate('/login');
  };
}
