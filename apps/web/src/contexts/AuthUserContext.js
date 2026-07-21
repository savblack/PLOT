import { createContext, useContext } from 'react';

export const AuthUserContext = createContext(null);

export function useAuthenticatedUser() {
  return useContext(AuthUserContext);
}
